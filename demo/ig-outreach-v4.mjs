#!/usr/bin/env node
/**
 * Protein Quest outreach v4 — parallel tabs, strict solo creators
 * Followers: 5k-100k | Reel views: 5k-100k (check 2-3 recent reels)
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
const PARALLEL_TABS = 3;

const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
const contacted = new Set([
  ...log.sent,
  ...log.skipped,
  ...log.failed,
].map((x) => x.username));

const REPOST = /repost|gym\s*edit|archive|fan\s*page|follow\s*for\s*more|credit\s*to|best\s*of\s*gym|gym\s*tok|clips\s*page|motivation\s*daily|dm\s*for\s*removal/i;
const COMPANY_USER = /^(hyrox|crossfit|gymshark|myprotein|optimumnutrition|prozis|nike|adidas|underarmour|roguefitness|fitnessfirst|puregym|planetfitness|goldsgym|equinox|f45|orangetheory|barrys|lululemon|whoop|garmin|peloton|gym_|gym\.|studio|brand|official)/i;
const COMPANY_BIO = /\b(official|headquarters|shop now|order now|we are|our gym|our studio|nutrition brand|supplement brand|global brand|franchise|wholesale|distributor|team account|sponsored by|partnership inquiries|media team|press team|corporate|head office|worldwide|global community|join our team)\b/i;
const COMPANY_NAME = /\b(hyrox|crossfit|gymshark|myprotein|planet fitness|gold'?s gym|equinox|f45|orangetheory|barry'?s|lululemon)\b/i;
const SOLO = /\b(coach|trainer|athlete|influencer|creator|my journey|i am|i'm |helping you|help you|meal prep|sharing my|founder|personal trainer|online coach|content creator|certified|nutritionist|dietitian)\b/i;

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

async function evalJson(code, tabUrl = null) {
  if (tabUrl) await bridge('find_tab', { url: tabUrl });
  const r = await bridge('evaluate', { code });
  const v = r.value;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

async function ensureExtension() {
  const res = await fetch('http://127.0.0.1:10086/status');
  const s = await res.json();
  if (!s.extension_connected) {
    throw new Error('WebBridge extension not connected — open Chrome and click Kimi WebBridge extension');
  }
}

function skip(username, reason, extra = {}) {
  if (contacted.has(username)) return;
  log.skipped.push({ username, reason, dm_sent: false, ...extra });
  contacted.add(username);
  save();
  console.log(`SKIP @${username}: ${reason}`);
}

function isCompany(username, profile) {
  if (COMPANY_USER.test(username)) return 'company/brand username';
  if (/hyrox/i.test(username)) return 'hyrox org';
  if (/\.(fc|gym|studio|official|brand|shop|store)$/i.test(username)) return 'business username pattern';
  if (COMPANY_BIO.test(profile.bio)) return 'company/brand bio';
  if (COMPANY_NAME.test(profile.name) && !SOLO.test(profile.bio)) return 'company name';
  if (profile.bio.match(/\b(we|our)\s+(gym|studio|team|brand|community)\b/i) && !SOLO.test(profile.bio)) {
    return 'organization account';
  }
  return null;
}

function isSoloCreator(username, profile) {
  const company = isCompany(username, profile);
  if (company) return { ok: false, reason: company };
  if (REPOST.test(profile.bio)) return { ok: false, reason: 'repost/edit account' };
  if (!SOLO.test(profile.bio) && !/\b(I |my )/i.test(profile.bio)) {
    return { ok: false, reason: 'not solo personal creator' };
  }
  return { ok: true };
}

let firstNav = true;
async function nav(url, newTab = false) {
  const args = { url };
  if (newTab) args.newTab = true;
  if (firstNav) {
    args.group_title = 'Protein Quest outreach';
    firstNav = false;
  }
  return bridge('navigate', args);
}

async function vetProfile(username, tabUrl) {
  await bridge('find_tab', { url: tabUrl });
  await nav(`https://www.instagram.com/${username}/`);
  await sleep(2500);
  return evalJson(
    `(() => {
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
    return JSON.stringify({ username: '${username}', name, bio, followersRaw: followersM ? followersM[1] : null, reels: Array.isArray(reels) ? reels : [], hasMsg });
  })()`,
    tabUrl,
  );
}

async function getReelViews(path, tabUrl) {
  const url = path.startsWith('http') ? path : `https://www.instagram.com${path}`;
  await bridge('find_tab', { url: tabUrl });
  await nav(url);
  await sleep(2800);
  return evalJson(
    `(() => {
    const html = document.documentElement.innerHTML;
    const plays = (html.match(/"play_count":(\\d+)/g) || []).map(s => parseInt(s.match(/\\d+/)[0]));
    const views = (html.match(/"view_count":(\\d+)/g) || []).map(s => parseInt(s.match(/\\d+/)[0]));
    const likes = (html.match(/"like_count":(\\d+)/g) || []).map(s => parseInt(s.match(/\\d+/)[0]));
    const maxPlays = plays.length ? Math.max(...plays) : 0;
    const maxViews = views.length ? Math.max(...views) : 0;
    const maxLikes = likes.length ? Math.max(...likes) : 0;
    const viewsCount = Math.max(maxPlays, maxViews, maxLikes);
    const t = document.body.innerText.slice(0, 600);
    const repost = /(credit|repost|follow for|via @|source:)/i.test(t);
    return JSON.stringify({ views: viewsCount, repost });
  })()`,
    tabUrl,
  );
}

async function sendDM(username, tabUrl) {
  await bridge('find_tab', { url: tabUrl });
  await nav(`https://www.instagram.com/${username}/`);
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

async function processUser(username, tabUrl) {
  if (contacted.has(username) || username === 'niketh_putta') return null;

  console.log(`→ vetting @${username}`);
  const profile = await vetProfile(username, tabUrl);
  const followers = parseCount(profile.followersRaw);

  if (!profile.hasMsg) {
    skip(username, 'private/no DM', { followers });
    return null;
  }
  if (followers > 0 && followers < MIN_FOLLOWERS) {
    skip(username, 'under 5k followers', { followers });
    return null;
  }
  if (followers > MAX_FOLLOWERS) {
    skip(username, 'over 100k followers', { followers });
    return null;
  }

  const solo = isSoloCreator(username, profile);
  if (!solo.ok) {
    skip(username, solo.reason, { followers });
    return null;
  }

  const reels = Array.isArray(profile.reels) ? profile.reels : [];
  if (!reels.length) {
    skip(username, 'no reels', { followers });
    return null;
  }

  const viewCounts = [];
  let repostHits = 0;
  for (const reel of reels.slice(0, REELS_TO_CHECK)) {
    const data = await getReelViews(reel, tabUrl);
    viewCounts.push(data.views || 0);
    if (data.repost) repostHits++;
    await sleep(400);
  }

  if (repostHits >= 2) {
    skip(username, 'repost signals on reels', { followers, views: viewCounts });
    return null;
  }

  const inRange = viewCounts.filter((v) => v >= MIN_VIEWS && v <= MAX_VIEWS);
  const avgViews = viewCounts.length
    ? Math.round(viewCounts.reduce((a, b) => a + b, 0) / viewCounts.length)
    : 0;

  if (inRange.length < 2) {
    skip(username, `reel views out of range (${viewCounts.join(', ')})`, { followers, avgViews });
    return null;
  }

  const result = await sendDM(username, tabUrl);
  if (result.ok) {
    const type = profile.bio.match(/coach|trainer|nutrition|run|calisthenics|fitness|meal/i)?.[0] || 'solo fitness creator';
    log.sent.push({ username, followers, avgViews, views: viewCounts, type, dm_sent: true });
    contacted.add(username);
    save();
    console.log(`✓ SENT @${username} (${followers.toLocaleString()} followers, ~${avgViews.toLocaleString()} views) — ${log.sent.length}/${TARGET}`);
    return username;
  }
  log.failed.push({ username, followers, avgViews, reason: result.reason || 'send failed', dm_sent: false });
  contacted.add(username);
  save();
  console.log(`✗ FAIL @${username}: ${result.reason}`);
  return null;
}

async function checkBlocker(tabUrl) {
  const block = await evalJson(
    `(() => { const t=document.body?.innerText?.toLowerCase()||''; return t.includes('try again later')||t.includes('action blocked')?'block':'ok'; })()`,
    tabUrl,
  );
  return block === 'block';
}

async function extractUsernameFromContent(path, tabUrl) {
  const url = path.startsWith('http') ? path : `https://www.instagram.com${path}`;
  await bridge('find_tab', { url: tabUrl });
  await nav(url);
  await sleep(2200);
  const data = await evalJson(
    `(() => {
      const skip = new Set(['instagram','explore','reels','direct','accounts','p','reel','popular','about','legal']);
      const lines = document.body.innerText.split('\\n').map(s => s.trim()).filter(Boolean);
      const head = lines.find(l => l.match(/^[a-zA-Z0-9._]{2,30}$/) && !skip.has(l.toLowerCase()));
      const html = document.documentElement.innerHTML;
      const plays = (html.match(/"play_count":(\\d+)/g) || []).map(s => parseInt(s.match(/\\d+/)[0]));
      const likes = (html.match(/"like_count":(\\d+)/g) || []).map(s => parseInt(s.match(/\\d+/)[0]));
      return JSON.stringify({
        username: head || null,
        views: plays.length ? Math.max(...plays) : 0,
        likes: likes.length ? Math.max(...likes) : 0,
      });
    })()`,
    tabUrl,
  );
  return data;
}

async function collectContentLinks(tabUrl, pageUrl) {
  await bridge('find_tab', { url: tabUrl });
  await nav(pageUrl);
  await sleep(3000);
  const links = await evalJson(
    `(() => {
      const all = [...document.querySelectorAll('a[href]')]
        .map(a => a.getAttribute('href'))
        .filter(Boolean);
      const content = [...new Set(all.filter(h => /\\/(p|reel)\\//.test(h)))];
      return JSON.stringify(content.slice(0, 20));
    })()`,
    tabUrl,
  );
  return Array.isArray(links) ? links : [];
}

async function discoverUsers(discoveryTabUrl) {
  const users = new Set();

  const queries = [
    'fitness influencer', 'personal trainer', 'nutrition coach', 'meal prep creator',
    'running influencer', 'calisthenics athlete', 'gym content creator', 'protein recipes',
    'yoga instructor', 'strength coach', 'macro coach', 'bodybuilding coach',
    'home workout', 'fitness mom', 'gym girl', 'sports nutrition', 'workout tips',
  ];
  const pages = [
    ...queries.map((q) => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(q)}`),
    'https://www.instagram.com/explore/',
    'https://www.instagram.com/reels/',
    'https://www.instagram.com/explore/search/keyword/?q=%23fitness',
    'https://www.instagram.com/explore/search/keyword/?q=%23mealprep',
    'https://www.instagram.com/explore/search/keyword/?q=%23calisthenics',
  ];

  const contentPaths = new Set();
  for (const pageUrl of pages) {
    try {
      const links = await collectContentLinks(discoveryTabUrl, pageUrl);
      links.forEach((p) => contentPaths.add(p));
      console.log(`Discovery page ${pageUrl.split('q=').pop() || 'explore'}: ${links.length} links`);
    } catch (e) {
      console.log(`Discovery page error: ${e.message}`);
    }
    await sleep(400);
  }

  console.log(`Extracting usernames from ${contentPaths.size} posts/reels...`);
  for (const path of [...contentPaths].slice(0, 60)) {
    try {
      const data = await extractUsernameFromContent(path, discoveryTabUrl);
      const u = data?.username;
      if (!u || contacted.has(u) || u === 'niketh_putta') continue;
      if (COMPANY_USER.test(u) || /hyrox/i.test(u)) continue;
      users.add(u);
    } catch (_) {}
    await sleep(250);
  }

  return [...users];
}

async function setupTabs() {
  const tabs = [];
  await nav('https://www.instagram.com/', true);
  tabs.push((await bridge('list_tabs')).tabs?.find((t) => t.active)?.url || 'https://www.instagram.com/');

  for (let i = 1; i < PARALLEL_TABS; i++) {
    await nav('https://www.instagram.com/explore/', true);
    await sleep(500);
  }

  const allTabs = (await bridge('list_tabs')).tabs || [];
  const igTabs = allTabs.filter((t) => t.url.includes('instagram.com')).map((t) => t.url);
  return igTabs.length ? igTabs : tabs;
}

async function main() {
  await ensureExtension();
  console.log(`Resume: ${log.sent.length}/${TARGET} sent, ${TARGET - log.sent.length} remaining`);

  const tabUrls = await setupTabs();
  console.log(`Tabs: ${tabUrls.length} — ${tabUrls.join(' | ')}`);

  const discoveryTab = tabUrls[0];
  const workTabs = tabUrls.slice(0, PARALLEL_TABS);

  let queue = (await discoverUsers(discoveryTab)).filter((u) => !contacted.has(u));
  console.log(`Queue: ${queue.length} new candidates`);

  let tabIdx = 0;
  const sessionSent = [];

  while (queue.length && log.sent.length < TARGET) {
    const results = [];
    for (let i = 0; i < workTabs.length && queue.length; i++) {
      const username = queue.shift();
      if (!username || contacted.has(username)) continue;
      const tabUrl = workTabs[(tabIdx + i) % workTabs.length];
      results.push(await processUser(username, tabUrl));
    }
    tabIdx = (tabIdx + 1) % workTabs.length;

    for (const r of results) {
      if (r) sessionSent.push(r);
    }

    for (const tabUrl of workTabs) {
      if (await checkBlocker(tabUrl)) {
        log.blockers.push({ type: 'rate_limit', time: new Date().toISOString() });
        save();
        console.log('BLOCKER: rate limit');
        console.log('SESSION SENT:', sessionSent);
        console.log('DONE', { sent: log.sent.length, skipped: log.skipped.length, failed: log.failed.length });
        return;
      }
    }

    if (queue.length < 15 && log.sent.length < TARGET) {
      const more = (await discoverUsers(discoveryTab)).filter((u) => !contacted.has(u) && !queue.includes(u));
      queue.push(...more);
      console.log(`Refilled queue: +${more.length} (${queue.length} total)`);
    }

    await sleep(800);
  }

  console.log('SESSION SENT:', sessionSent);
  console.log('DONE', { sent: log.sent.length, skipped: log.skipped.length, failed: log.failed.length });
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  if (!log.blockers.some((b) => b.type === 'extension_disconnected')) {
    log.blockers.push({ type: 'extension_disconnected', time: new Date().toISOString(), message: e.message });
    save();
  }
  process.exit(1);
});
