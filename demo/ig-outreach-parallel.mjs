#!/usr/bin/env node
/**
 * Parallel Instagram outreach — Protein Quest
 * Session: protein-quest-outreach
 */
import fs from 'fs';

const SESSION = 'protein-quest-outreach';
const BRIDGE = 'http://127.0.0.1:10086/command';
const LOG_PATH = new URL('./ig-dm-log.json', import.meta.url).pathname;
const MESSAGE = 'paid promo?';
const MIN_ENG = 5000;
const MAX_ENG = 100000;
const TARGET = 100;

const CONTACTED = new Set();
const QUEUE = [];
let inProgress = { tab2: null, tab3: null };

function loadLog() {
  const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  for (const x of [...log.sent, ...log.skipped]) CONTACTED.add(x.username);
  return log;
}

function saveLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

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

async function findTab(url) {
  return bridge('find_tab', { url, active: false });
}

let firstNav = true;
async function nav(url, newTab = false) {
  const args = { url };
  if (newTab) args.newTab = true;
  if (firstNav) { args.group_title = 'Protein Quest outreach'; firstNav = false; }
  return bridge('navigate', args);
}

async function evalOn(code) {
  const r = await bridge('evaluate', { code });
  return r.value;
}

const REPOST_PATTERNS = [
  /repost/i, /edit(s|ing)?/i, /archive/i, /fan\s*page/i, /motivation\s*daily/i,
  /follow\s*for\s*more/i, /credit\s*to/i, /not\s*my\s*content/i, /dm\s*for\s*removal/i,
  /gym\s*tok/i, /best\s*of\s*gym/i, /clips/i, /highlights?\s*only/i,
];

const CREATOR_PATTERNS = [
  /\bcoach\b/i, /\btrainer\b/i, /\bathlete\b/i, /\bnutrition/i, /\bmy\b/i, /\bi\b/i,
  /\bjourney\b/i, /\bonline\b/i, /\bhelp\s*you\b/i, /\bmeal\s*prep\b/i, /\bworkout\b/i,
  /\bprotein\b/i, /\bfitness\b/i, /\brun(ning)?\b/i, /\bgym\b/i,
];

async function discoverCandidates() {
  const code = `(async () => {
    const queries = ['fitness coach','personal trainer','calisthenics','meal prep fitness','running coach','sports nutrition','hyrox athlete','crossfit coach','protein recipes','gym lifestyle','strength coach','bodybuilding coach','yoga instructor','pilates coach','boxing coach'];
    const tags = ['fitness','gym','protein','bodybuilding','crossfit','running','sportsnutrition','calisthenics','mealprep','hyrox','powerlifting','strongman'];
    const users = new Set();
    for (const q of queries) {
      try {
        const r = await fetch('/web/search/topsearch/?query=' + encodeURIComponent(q), {credentials:'include'});
        const d = await r.json();
        (d.users||[]).forEach(u => u.user?.username && users.add(u.user.username));
      } catch(e) {}
      await new Promise(r => setTimeout(r, 150));
    }
    for (const tag of tags) {
      try {
        const r = await fetch('/api/v1/tags/web_info/?tag_name=' + tag, {credentials:'include', headers:{'x-ig-app-id':'936619743392459'}});
        const d = await r.json();
        const edges = d.data?.recent?.sections?.flatMap(s => s.layout_content?.medias?.map(m => m.media?.user?.username) || []) || [];
        edges.forEach(u => u && users.add(u));
      } catch(e) {}
      await new Promise(r => setTimeout(r, 150));
    }
    return JSON.stringify([...users]);
  })()`;
  const raw = await evalOn(code);
  return JSON.parse(raw);
}

async function vetAndMaybeSend(username, log, tabLabel) {
  inProgress[tabLabel] = username;
  try {
    await nav(`https://www.instagram.com/${username}/`);
    await sleep(2000);

    const profileRaw = await evalOn(`(() => {
      const parseCount = (s) => {
        if (!s) return 0;
        s = String(s).replace(/,/g,'').trim().toLowerCase();
        if (s.endsWith('k')) return parseFloat(s)*1000;
        if (s.endsWith('m')) return parseFloat(s)*1000000;
        return parseInt(s)||0;
      };
      const text = document.body.innerText;
      const lines = text.split('\\n').slice(0, 30);
      const bio = lines.slice(3, 12).join(' ');
      const posts = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')]
        .map(a => a.getAttribute('href')).filter(Boolean);
      const uniquePosts = [...new Set(posts)].slice(0, 4);
      const hasMessage = [...document.querySelectorAll('div[role="button"],button,a')]
        .some(el => (el.textContent||'').trim() === 'Message');
      const followers = text.match(/([\\d,.]+[KkMm]?)\\s*followers?/i);
      return JSON.stringify({bio, posts: uniquePosts, hasMessage, followers: followers?.[1]||null, snippet: text.slice(0,900)});
    })()`);
    const profile = JSON.parse(profileRaw);

    const isRepost = REPOST_PATTERNS.some((p) => p.test(profile.bio) || p.test(profile.snippet.slice(0, 400)));
    const hasCreatorSignal = CREATOR_PATTERNS.some((p) => p.test(profile.bio));
    if (isRepost && !hasCreatorSignal) {
      log.skipped.push({ username, reason: 'likely repost/edit account', dm_sent: false });
      return;
    }
    if (!profile.hasMessage) {
      log.skipped.push({ username, reason: 'no DM / private', dm_sent: false });
      return;
    }
    if (!profile.posts.length) {
      log.skipped.push({ username, reason: 'no posts', dm_sent: false });
      return;
    }

    let bestEng = 0;
    let creatorSignals = 0;
    for (const postPath of profile.posts.slice(0, 2)) {
      const url = postPath.startsWith('http') ? postPath : `https://www.instagram.com${postPath}`;
      await nav(url);
      await sleep(1500);
      const postRaw = await evalOn(`(() => {
        const parseCount = (s) => {
          if (!s) return 0;
          s = String(s).replace(/,/g,'').trim().toLowerCase();
          if (s.endsWith('k')) return parseFloat(s)*1000;
          if (s.endsWith('m')) return parseFloat(s)*1000000;
          return parseInt(s)||0;
        };
        const t = document.body.innerText;
        const likes = t.match(/([\\d,.]+[KkMm]?)\\s*likes?/i);
        const views = t.match(/([\\d,.]+[KkMm]?)\\s*views?/i);
        const eng = Math.max(likes?parseCount(likes[1]):0, views?parseCount(views[1]):0);
        const hasOriginalAudio = /original audio/i.test(t);
        const repostFlags = /(credit|repost|follow for|not mine|via @|source:)/i.test(t);
        const personalCaption = /(I |my |today I|here's how|tip:|recipe|workout|training)/i.test(t);
        return JSON.stringify({eng, hasOriginalAudio, repostFlags, personalCaption, snippet: t.slice(0,500)});
      })()`);
      const postData = JSON.parse(postRaw);
      bestEng = Math.max(bestEng, postData.eng);
      if (postData.hasOriginalAudio) creatorSignals++;
      if (postData.personalCaption) creatorSignals++;
      if (postData.repostFlags) creatorSignals -= 2;
    }

    if (creatorSignals < 0) {
      log.skipped.push({ username, engagement: bestEng, reason: 'repost/edit signals on posts', dm_sent: false });
      return;
    }
    if (bestEng < MIN_ENG) {
      log.skipped.push({ username, engagement: bestEng, reason: 'below 5k engagement', dm_sent: false });
      return;
    }
    if (bestEng > MAX_ENG) {
      log.skipped.push({ username, engagement: bestEng, reason: 'above 100k engagement', dm_sent: false });
      return;
    }

    // Send DM
    await nav(`https://www.instagram.com/${username}/`);
    await sleep(2000);
    await evalOn(`(() => {
      const btn = [...document.querySelectorAll('div[role="button"],button,a')]
        .find(el => (el.textContent||'').trim() === 'Message');
      if (btn) btn.click();
      return btn ? 'ok' : 'no-btn';
    })()`);
    await sleep(2500);
    const fill = await bridge('fill', { selector: 'div[contenteditable=true][role="textbox"]', value: MESSAGE });
    if (!fill.success) {
      log.failed.push({ username, engagement: bestEng, reason: 'fill failed', dm_sent: false });
      return;
    }
    await sleep(400);
    const sent = await evalOn(`(() => {
      const sendBtn = [...document.querySelectorAll('div[role="button"],button,svg[aria-label]')]
        .find(el => ((el.getAttribute('aria-label')||el.textContent||'').toLowerCase()).includes('send'));
      if (sendBtn) { (sendBtn.closest('div[role="button"]')||sendBtn).click(); return 'sent'; }
      return 'no-send';
    })()`);
    if (sent === 'sent') {
      const type = profile.bio.match(/coach|trainer|nutrition|run|crossfit|calisthenics|bodybuilding/i)?.[0] || 'fitness creator';
      log.sent.push({ username, engagement: bestEng, type, dm_sent: true });
      CONTACTED.add(username);
      console.log(`✓ SENT @${username} (${bestEng.toLocaleString()} eng, ${type}) — ${log.sent.length}/${TARGET}`);
    } else {
      log.failed.push({ username, engagement: bestEng, reason: sent, dm_sent: false });
    }
  } catch (e) {
    log.failed.push({ username, reason: String(e.message || e), dm_sent: false });
    console.log(`✗ ERROR @${username}: ${e.message}`);
  } finally {
    inProgress[tabLabel] = null;
    saveLog(log);
  }
}

async function main() {
  const log = loadLog();
  console.log(`Resuming: ${log.sent.length} sent, ${CONTACTED.size} contacted`);

  // Use existing tabs or open discovery tab
  let tabs = (await bridge('list_tabs')).tabs || [];
  if (!tabs.length) {
    try { await nav('https://www.instagram.com/explore/tags/fitness/', true); } catch (_) {}
    tabs = (await bridge('list_tabs')).tabs || [];
  }
  console.log('Tabs:', tabs.map((t) => `${t.tabId}:${t.url}`).join(' | '));

  const candidates = await discoverCandidates();
  for (const u of candidates) {
    if (!CONTACTED.has(u) && u !== 'niketh_putta') QUEUE.push(u);
  }
  console.log(`Queue: ${QUEUE.length} candidates`);

  // Pipeline: alternate tab2/tab3 via find_tab on instagram home tabs
  const vetTabs = tabs.filter((t) => t.url.includes('instagram.com')).slice(-2);
  let tabIdx = 0;

  while (QUEUE.length && log.sent.length < TARGET) {
    const username = QUEUE.shift();
    if (CONTACTED.has(username)) continue;

    const tab = vetTabs[tabIdx % vetTabs.length];
    if (tab?.url) await findTab(tab.url);
    tabIdx++;

    await vetAndMaybeSend(username, log, tabIdx % 2 === 0 ? 'tab2' : 'tab3');

    const blocker = await evalOn(`(() => {
      const t = document.body.innerText.toLowerCase();
      if (t.includes('try again later') || t.includes('action blocked')) return 'rate_limit';
      if (t.includes('captcha')) return 'captcha';
      return 'ok';
    })()`);
    if (blocker !== 'ok') {
      log.blockers.push({ type: blocker, time: new Date().toISOString() });
      saveLog(log);
      console.log(`BLOCKER: ${blocker}`);
      break;
    }

    // Refill queue if low
    if (QUEUE.length < 10 && log.sent.length < TARGET) {
      const more = await discoverCandidates();
      for (const u of more) {
        if (!CONTACTED.has(u) && !QUEUE.includes(u)) QUEUE.push(u);
      }
    }
    await sleep(1200);
  }

  console.log('DONE', { sent: log.sent.length, skipped: log.skipped.length, failed: log.failed.length });
}

main().catch((e) => { console.error(e); process.exit(1); });
