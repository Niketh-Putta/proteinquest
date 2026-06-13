#!/usr/bin/env node
/**
 * Protein Quest outreach v3 — STRICT solo creator targeting
 * Followers: 5k-100k | Reel views: 5k-100k (check 3 recent reels)
 */
import fs from 'fs';

const SESSION = 'protein-quest-outreach';
const BRIDGE = 'http://127.0.0.1:10086/command';
const LOG_PATH = new URL('./ig-dm-log.json', import.meta.url).pathname;
const MSG = 'paid promo?';
const MIN_FOLLOWERS = 5000;
const MAX_FOLLOWERS = 100000;
const MIN_VIEWS = 5000;
const MAX_VIEWS = 100000;
const TARGET = 100;
const REELS_TO_CHECK = 3;

const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
const contacted = new Set([...log.sent, ...log.skipped, ...(log.failed || [])].map((x) => x.username));

const REPOST = /repost|gym\s*edit|archive|fan\s*page|follow\s*for\s*more|credit\s*to|best\s*of\s*gym|gym\s*tok|clips\s*page|motivation\s*daily/i;
const BUSINESS = /\b(official|headquarters|shop now|order now|we are|our gym|our studio|nutrition brand|supplement|store|team\b|fc\b|academy\b|global brand|franchise|wholesale|distributor)\b/i;
const BUSINESS_USER = /^(hyrox|crossfit|gymshark|myprotein|optimumnutrition|prozis|nike|adidas|underarmour|roguefitness|fitnessfirst|puregym|planetfitness)/i;
const SOLO = /\b(coach|trainer|athlete|influencer|creator|my journey|i am|i'm |helping you|help you|meal prep|sharing my|founder|personal trainer|online coach|content creator)\b/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = () => fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));

function parseCount(s) {
  if (!s) return 0;
  s = String(s).replace(/,/g, '').trim().toLowerCase();
  if (s.endsWith('k')) return parseFloat(s) * 1000;
  if (s.endsWith('m')) return parseFloat(s) * 1000000;
  return parseInt(s, 10) || 0;
}

async function bridge(action, args = {}, timeout = 55000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BRIDGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args, session: SESSION }),
      signal: ctrl.signal,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error?.message || JSON.stringify(data));
    return data.data;
  } finally {
    clearTimeout(t);
  }
}

async function evalJson(code) {
  const r = await bridge('evaluate', { code });
  const v = r.value;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

async function ensureExtension() {
  const res = await fetch('http://127.0.0.1:10086/status');
  const s = await res.json();
  if (!s.extension_connected) throw new Error('WebBridge extension not connected — open browser with Kimi WebBridge extension');
}

function skip(username, reason, extra = {}) {
  log.skipped.push({ username, reason, dm_sent: false, ...extra });
  contacted.add(username);
  save();
  console.log(`SKIP @${username}: ${reason}`);
}

async function vetProfile(username) {
  await bridge('navigate', { url: `https://www.instagram.com/${username}/` });
  await sleep(2800);
  return evalJson(`(() => {
    const t = document.body.innerText;
    const lines = t.split('\\n');
    const bio = lines.slice(0, 16).join(' ');
    const followersM = t.match(/([\\d,.]+[KkMm]?)\\s*followers?/i);
    const reels = [...new Set([...document.querySelectorAll('a[href*="/reel/"]')]
      .map(a => a.getAttribute('href'))
      .filter(h => h && h.includes('${username}')))].slice(0, ${REELS_TO_CHECK});
    const hasMsg = [...document.querySelectorAll('div[role="button"],button,a')]
      .some(el => (el.textContent || '').trim() === 'Message');
    const name = (lines[0] || '').trim();
    return JSON.stringify({ username: '${username}', name, bio, followersRaw: followersM ? followersM[1] : null, reels, hasMsg });
  })()`);
}

async function getReelViews(path) {
  const url = path.startsWith('http') ? path : `https://www.instagram.com${path}`;
  await bridge('navigate', { url });
  await sleep(3000);
  return evalJson(`(() => {
    const html = document.documentElement.innerHTML;
    const plays = (html.match(/"play_count":(\\d+)/g) || []).map(s => parseInt(s.match(/\\d+/)[0]));
    const views = (html.match(/"view_count":(\\d+)/g) || []).map(s => parseInt(s.match(/\\d+/)[0]));
    const likes = (html.match(/"like_count":(\\d+)/g) || []).map(s => parseInt(s.match(/\\d+/)[0]));
    const maxPlays = plays.length ? Math.max(...plays) : 0;
    const maxViews = views.length ? Math.max(...views) : 0;
    const maxLikes = likes.length ? Math.max(...likes) : 0;
    const viewsCount = Math.max(maxPlays, maxViews, maxLikes);
    const t = document.body.innerText.slice(0, 600);
    const talkingHead = /original audio/i.test(document.body.innerText) || /(I |my |tip|coach|workout|recipe|today)/i.test(t);
    const repost = /(credit|repost|follow for|via @|source:)/i.test(t);
    return JSON.stringify({ views: viewsCount, talkingHead, repost });
  })()`);
}

function isSoloCreator(username, profile) {
  if (BUSINESS_USER.test(username)) return { ok: false, reason: 'brand username' };
  if (REPOST.test(profile.bio)) return { ok: false, reason: 'repost/edit account' };
  if (BUSINESS.test(profile.bio) && !SOLO.test(profile.bio)) return { ok: false, reason: 'business/brand account' };
  if (!SOLO.test(profile.bio) && !profile.bio.match(/\\b(I |my )/i)) return { ok: false, reason: 'not solo personal creator' };
  return { ok: true };
}

async function sendDM(username) {
  await bridge('navigate', { url: `https://www.instagram.com/${username}/` });
  await sleep(2200);
  await bridge('evaluate', {
    code: `(() => { const b=[...document.querySelectorAll('div[role="button"],button,a')].find(el=>(el.textContent||'').trim()==='Message'); if(b)b.click(); return 'ok'; })()`,
  });
  await sleep(3000);
  let fill = null;
  for (let i = 0; i < 4; i++) {
    try {
      fill = await bridge('fill', { selector: 'div[contenteditable=true][role="textbox"]', value: MSG });
      if (fill?.success) break;
    } catch (_) {}
    await sleep(1200);
  }
  if (!fill?.success) return { ok: false, reason: 'DM input not found' };
  await sleep(400);
  const sent = await bridge('evaluate', {
    code: `(() => { const s=[...document.querySelectorAll('div[role="button"],button,svg[aria-label]')].find(el=>((el.getAttribute('aria-label')||el.textContent||'').toLowerCase()).includes('send')); if(s){(s.closest('div[role="button"]')||s).click();return true;} return false; })()`,
  });
  return { ok: sent.value === true };
}

async function processUser(username) {
  if (contacted.has(username) || username === 'niketh_putta') return;

  console.log(`→ vetting @${username}`);
  const profile = await vetProfile(username);
  const followers = parseCount(profile.followersRaw);

  if (!profile.hasMsg) return skip(username, 'private/no DM');
  if (followers > 0 && followers < MIN_FOLLOWERS) return skip(username, 'under 5k followers', { followers });
  if (followers > MAX_FOLLOWERS) return skip(username, 'over 100k followers', { followers });

  const solo = isSoloCreator(username, profile);
  if (!solo.ok) return skip(username, solo.reason, { followers });

  if (!profile.reels?.length) return skip(username, 'no reels', { followers });

  const viewCounts = [];
  let repostHits = 0;
  for (const reel of profile.reels.slice(0, REELS_TO_CHECK)) {
    const data = await getReelViews(reel);
    viewCounts.push(data.views);
    if (data.repost) repostHits++;
    await sleep(500);
  }

  if (repostHits >= 2) return skip(username, 'repost signals on reels', { followers, views: viewCounts });

  const inRange = viewCounts.filter((v) => v >= MIN_VIEWS && v <= MAX_VIEWS);
  const avgViews = viewCounts.length ? Math.round(viewCounts.reduce((a, b) => a + b, 0) / viewCounts.length) : 0;

  if (inRange.length < 2) {
    return skip(username, `reel views inconsistent (${viewCounts.join(', ')})`, { followers, avgViews });
  }

  const result = await sendDM(username);
  if (result.ok) {
    const type = profile.bio.match(/coach|trainer|nutrition|run|calisthenics|fitness|meal/i)?.[0] || 'solo fitness creator';
    log.sent.push({ username, followers, avgViews, views: viewCounts, type, dm_sent: true });
    contacted.add(username);
    save();
    console.log(`✓ SENT @${username} (${followers.toLocaleString()} followers, ~${avgViews.toLocaleString()} views) — ${log.sent.length}/${TARGET}`);
    return;
  }
  log.failed.push({ username, followers, avgViews, reason: result.reason || 'send failed', dm_sent: false });
  save();
  console.log(`✗ FAIL @${username}: ${result.reason}`);
}

async function collectContentLinks(pageUrl) {
  await bridge('navigate', { url: pageUrl });
  await sleep(3000);
  const links = await evalJson(`(() => {
    const all = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(Boolean);
    return JSON.stringify([...new Set(all.filter(h => /\\/(p|reel)\\//.test(h)))].slice(0, 20));
  })()`);
  return Array.isArray(links) ? links : [];
}

async function extractUsernameFromContent(path) {
  const url = path.startsWith('http') ? path : `https://www.instagram.com${path}`;
  await bridge('navigate', { url });
  await sleep(2200);
  return evalJson(`(() => {
    const skip = new Set(['instagram','explore','reels','direct','accounts','p','reel','popular','about','legal']);
    const lines = document.body.innerText.split('\\n').map(s => s.trim()).filter(Boolean);
    const head = lines.find(l => l.match(/^[a-zA-Z0-9._]{2,30}$/) && !skip.has(l.toLowerCase()));
    return JSON.stringify({ username: head || null });
  })()`);
}

async function discoverUsers() {
  const queries = [
    'fitness influencer', 'personal trainer', 'nutrition coach', 'meal prep creator',
    'running influencer', 'calisthenics athlete', 'gym content creator', 'protein recipes',
    'yoga instructor', 'pilates creator', 'strength coach', 'macro coach',
    'bodybuilding coach', 'home workout', 'fitness mom', 'gym girl', 'workout tips',
    'sports nutrition', 'online coach', 'fitness reels', 'hyrox athlete',
  ];
  const users = new Set();
  for (const q of queries) {
    try {
      const raw = await bridge('evaluate', {
        code: `(async()=>{const r=await fetch('/web/search/topsearch/?query='+encodeURIComponent('${q}'),{credentials:'include'});const d=await r.json();return JSON.stringify((d.users||[]).map(u=>u.user?.username).filter(Boolean));})()`,
      }, 20000);
      JSON.parse(raw.value).forEach((u) => {
        if (!contacted.has(u) && !BUSINESS_USER.test(u)) users.add(u);
      });
    } catch (_) {}
    await sleep(150);
  }

  const pages = [
    ...queries.map((q) => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(q)}`),
    'https://www.instagram.com/explore/',
    'https://www.instagram.com/reels/',
    'https://www.instagram.com/explore/search/keyword/?q=%23fitness',
    'https://www.instagram.com/explore/search/keyword/?q=%23mealprep',
    'https://www.instagram.com/explore/search/keyword/?q=%23calisthenics',
    'https://www.instagram.com/explore/search/keyword/?q=%23personaltrainer',
    'https://www.instagram.com/explore/search/keyword/?q=%23protein',
  ];

  const contentPaths = new Set();
  for (const pageUrl of pages) {
    try {
      const links = await collectContentLinks(pageUrl);
      links.forEach((p) => contentPaths.add(p));
      console.log(`Discovery ${pageUrl.split('q=').pop() || 'explore'}: ${links.length} links`);
    } catch (e) {
      console.log(`Discovery error: ${e.message}`);
    }
    await sleep(400);
  }

  console.log(`Extracting usernames from ${contentPaths.size} posts/reels...`);
  for (const path of [...contentPaths].slice(0, 80)) {
    try {
      const data = await extractUsernameFromContent(path);
      const u = data?.username;
      if (!u || contacted.has(u) || u === 'niketh_putta') continue;
      if (BUSINESS_USER.test(u) || /hyrox/i.test(u)) continue;
      users.add(u);
    } catch (_) {}
    await sleep(250);
  }

  return [...users];
}

async function main() {
  await ensureExtension();
  console.log(`Resume: ${log.sent.length}/${TARGET} sent, ${TARGET - log.sent.length} remaining`);

  let queue = (await discoverUsers()).filter((u) => !contacted.has(u));
  console.log(`Queue: ${queue.length} new candidates`);

  while (queue.length && log.sent.length < TARGET) {
    const username = queue.shift();
    if (!username || contacted.has(username)) continue;
    try {
      await processUser(username);
    } catch (e) {
      console.log(`ERROR @${username}: ${e.message}`);
      if (e.message.includes('rate') || e.message.includes('blocked')) {
        log.blockers.push({ type: 'rate_limit', time: new Date().toISOString() });
        save();
        break;
      }
    }
    const block = await evalJson(`(() => { const t=document.body?.innerText?.toLowerCase()||''; return t.includes('try again later')||t.includes('action blocked')?'block':'ok'; })()`);
    if (block === 'block') {
      log.blockers.push({ type: 'rate_limit', time: new Date().toISOString() });
      save();
      break;
    }
    if (queue.length < 15 && log.sent.length < TARGET) {
      const more = (await discoverUsers()).filter((u) => !contacted.has(u) && !queue.includes(u));
      queue.push(...more);
      console.log(`Refilled queue: +${more.length} (${queue.length} total)`);
    }
    await sleep(900);
  }

  console.log('DONE', { sent: log.sent.length, skipped: log.skipped.length, failed: log.failed.length });
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
