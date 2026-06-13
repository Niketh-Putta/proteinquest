#!/usr/bin/env node
/**
 * Batch Instagram DM sender via Kimi WebBridge
 * Message text: exactly "paid promo?"
 */
import fs from 'fs';

const SESSION = 'proteinquest-dm';
const BRIDGE = 'http://127.0.0.1:10086/command';
const LOG_PATH = new URL('./ig-dm-log.json', import.meta.url).pathname;
const MESSAGE = 'paid promo?';
const MIN_ENGAGEMENT = 5000;
const MAX_ENGAGEMENT = 100000;
const TARGET = 100;
const DELAY_MS = 2500;

const SEARCH_QUERIES = [
  'fitness coach', 'personal trainer', 'gym motivation', 'calisthenics',
  'bodybuilding', 'crossfit athlete', 'running coach', 'sports nutrition',
  'protein recipes', 'weightlifting', 'powerlifting', 'hyrox',
  'marathon training', 'triathlon', 'cycling fitness', 'yoga fitness',
  'pilates instructor', 'boxing training', 'mma fighter', 'soccer fitness',
  'basketball training', 'swim coach', 'track athlete', 'strongman',
  'functional fitness', 'home workout', 'meal prep fitness', 'supplement review',
  'fitness influencer', 'gym lifestyle', 'athlete mindset', 'sports performance',
  'endurance training', 'strength coach', 'fitness model', 'gym tips',
  'workout routine', 'muscle building', 'fat loss coach', 'online coach fitness',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function bridge(action, args = {}) {
  const res = await fetch(BRIDGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args, session: SESSION }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message || JSON.stringify(data));
  return data.data;
}

function loadLog() {
  return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
}

function saveLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

function contactedSet(log) {
  const s = new Set();
  for (const x of [...log.sent, ...log.skipped, ...log.failed]) s.add(x.username);
  return s;
}

async function searchUsers(query) {
  const code = `(async () => {
    const r = await fetch('/web/search/topsearch/?query=${encodeURIComponent(query)}', {credentials:'include'});
    const d = await r.json();
    const users = (d.users||[]).map(u => u.user?.username).filter(Boolean);
    const hashtags = (d.hashtags||[]).map(h => h.hashtag?.name).filter(Boolean);
    return JSON.stringify({users, hashtags});
  })()`;
  const raw = await bridge('evaluate', { code });
  return JSON.parse(raw.value);
}

async function getProfilePosts(username) {
  await bridge('navigate', { url: `https://www.instagram.com/${username}/` });
  await sleep(3000);
  const code = `(() => {
    const posts = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')]
      .map(a => a.getAttribute('href'))
      .filter(h => h && (h.includes('/p/') || h.includes('/reel/')));
    const unique = [...new Set(posts)].slice(0, 4);
    const text = document.body.innerText;
    const followers = text.match(/([\\d,.]+[KkMm]?)\\s*followers?/i);
    const bio = text.split('\\n').slice(0, 15).join(' ');
    const hasMessage = [...document.querySelectorAll('div[role="button"], button, a')]
      .some(el => (el.textContent||'').trim() === 'Message');
    return JSON.stringify({posts: unique, followers: followers?.[1]||null, bio, hasMessage});
  })()`;
  const raw = await bridge('evaluate', { code });
  return JSON.parse(raw.value);
}

async function checkPostEngagement(postPath) {
  const url = postPath.startsWith('http') ? postPath : `https://www.instagram.com${postPath}`;
  await bridge('navigate', { url });
  await sleep(2500);
  const code = `(() => {
    const parseCount = (s) => {
      if (!s) return 0;
      s = String(s).replace(/,/g, '').trim().toLowerCase();
      if (s.endsWith('k')) return parseFloat(s) * 1000;
      if (s.endsWith('m')) return parseFloat(s) * 1000000;
      return parseInt(s) || 0;
    };
    const t = document.body.innerText;
    const likes = t.match(/([\\d,.]+[KkMm]?)\\s*likes?/i);
    const views = t.match(/([\\d,.]+[KkMm]?)\\s*views?/i);
    const hashtags = (t.match(/#\\w+/g) || []).slice(0, 8);
    return JSON.stringify({
      likes: likes ? parseCount(likes[1]) : 0,
      views: views ? parseCount(views[1]) : 0,
      engagement: Math.max(likes ? parseCount(likes[1]) : 0, views ? parseCount(views[1]) : 0),
      hashtags,
    });
  })()`;
  const raw = await bridge('evaluate', { code });
  return JSON.parse(raw.value);
}

async function sendDM(username) {
  await bridge('navigate', { url: `https://www.instagram.com/${username}/` });
  await sleep(3000);
  await bridge('evaluate', {
    code: `(() => {
      const btn = [...document.querySelectorAll('div[role="button"], button, a')]
        .find(el => (el.textContent||'').trim() === 'Message');
      if (btn) { btn.click(); return 'clicked'; }
      return 'no message btn';
    })()`,
  });
  await sleep(3000);
  const fillResult = await bridge('fill', {
    selector: 'div[contenteditable=true][role="textbox"]',
    value: MESSAGE,
  });
  if (!fillResult.success) return { ok: false, reason: 'fill failed' };
  await sleep(500);
  const sendResult = await bridge('evaluate', {
    code: `(() => {
      const sendBtn = [...document.querySelectorAll('div[role="button"], button, svg[aria-label]')]
        .find(el => {
          const label = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
          return label === 'send' || label.includes('send');
        });
      if (sendBtn) { (sendBtn.closest('div[role="button"]') || sendBtn).click(); return 'sent'; }
      const input = document.querySelector('div[contenteditable=true][role="textbox"]');
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        return 'enter';
      }
      return 'no send';
    })()`,
  });
  await sleep(1500);
  return { ok: sendResult.value === 'sent' || sendResult.value === 'enter', method: sendResult.value };
}

async function processUser(username, log) {
  try {
    const profile = await getProfilePosts(username);
    if (!profile.hasMessage) {
      log.skipped.push({ username, reason: 'no message button (private/restricted)', dm_sent: false });
      return;
    }
    if (!profile.posts.length) {
      log.skipped.push({ username, reason: 'no posts', dm_sent: false });
      return;
    }

    let bestEngagement = 0;
    let checked = 0;
    for (const post of profile.posts.slice(0, 3)) {
      const eng = await checkPostEngagement(post);
      bestEngagement = Math.max(bestEngagement, eng.engagement);
      checked++;
      if (eng.engagement >= MIN_ENGAGEMENT && eng.engagement <= MAX_ENGAGEMENT) break;
      if (eng.engagement > MAX_ENGAGEMENT) break;
    }

    if (bestEngagement < MIN_ENGAGEMENT) {
      log.skipped.push({ username, engagement: bestEngagement, reason: 'below 5k', dm_sent: false });
      return;
    }
    if (bestEngagement > MAX_ENGAGEMENT) {
      log.skipped.push({ username, engagement: bestEngagement, reason: 'above 100k', dm_sent: false });
      return;
    }

    const result = await sendDM(username);
    if (result.ok) {
      log.sent.push({ username, engagement: bestEngagement, dm_sent: true });
      console.log(`SENT @${username} (${bestEngagement} engagement) — total ${log.sent.length}`);
    } else {
      log.failed.push({ username, engagement: bestEngagement, reason: result.reason || result.method, dm_sent: false });
      console.log(`FAILED @${username}: ${result.reason || result.method}`);
    }
  } catch (e) {
    log.failed.push({ username, reason: String(e.message || e), dm_sent: false });
    console.log(`ERROR @${username}: ${e.message}`);
  }
  saveLog(log);
  await sleep(DELAY_MS);
}

async function main() {
  const log = loadLog();
  const contacted = contactedSet(log);
  const candidates = new Set();

  for (const q of SEARCH_QUERIES) {
    if (log.sent.length >= TARGET) break;
    try {
      const { users } = await searchUsers(q);
      for (const u of users) {
        if (!contacted.has(u) && u !== 'niketh_putta') candidates.add(u);
      }
      console.log(`Query "${q}": +${users.length} users, pool=${candidates.size}`);
      await sleep(800);
    } catch (e) {
      console.log(`Search error for "${q}": ${e.message}`);
    }
  }

  // Also pull from hashtag recent media API
  const hashtagCode = `(async () => {
    const tags = ['fitness','gym','protein','bodybuilding','crossfit','running','sportsnutrition','calisthenics','powerlifting','hyrox'];
    const out = [];
    for (const tag of tags) {
      try {
        const r = await fetch('/api/v1/tags/web_info/?tag_name=' + tag, {credentials:'include', headers:{'x-ig-app-id':'936619743392459'}});
        const d = await r.json();
        const edges = d.data?.recent?.sections?.flatMap(s => s.layout_content?.medias?.map(m => m.media?.user?.username) || []) || [];
        out.push(...edges.filter(Boolean));
      } catch(e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    return JSON.stringify([...new Set(out)]);
  })()`;
  try {
    const raw = await bridge('evaluate', { code: hashtagCode });
    const hashtagUsers = JSON.parse(raw.value);
    for (const u of hashtagUsers) {
      if (!contacted.has(u) && u !== 'niketh_putta') candidates.add(u);
    }
    console.log(`Hashtag pool added, total candidates=${candidates.size}`);
  } catch (e) {
    console.log('Hashtag fetch error:', e.message);
  }

  const queue = [...candidates];
  console.log(`Processing ${queue.length} candidates, target ${TARGET}, already sent ${log.sent.length}`);

  for (const username of queue) {
    if (log.sent.length >= TARGET) break;
    if (contacted.has(username)) continue;
    contacted.add(username);
    await processUser(username, log);

    // Check for rate limit blockers in page text
    const blockerCheck = await bridge('evaluate', {
      code: `(() => {
        const t = document.body.innerText.toLowerCase();
        if (t.includes('try again later') || t.includes('action blocked') || t.includes('we restrict')) return 'rate_limited';
        if (t.includes('captcha') || t.includes('confirm you')) return 'captcha';
        return 'ok';
      })()`,
    });
    if (blockerCheck.value === 'rate_limited') {
      log.blockers.push({ type: 'rate_limit', at: username, time: new Date().toISOString() });
      saveLog(log);
      console.log('RATE LIMIT detected — stopping');
      break;
    }
    if (blockerCheck.value === 'captcha') {
      log.blockers.push({ type: 'captcha', at: username, time: new Date().toISOString() });
      saveLog(log);
      console.log('CAPTCHA detected — stopping');
      break;
    }
  }

  console.log('DONE', JSON.stringify({ sent: log.sent.length, skipped: log.skipped.length, failed: log.failed.length }));
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
