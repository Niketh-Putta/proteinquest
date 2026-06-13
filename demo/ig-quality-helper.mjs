#!/usr/bin/env node
/** Quality outreach helper — single tab, deliberate vetting */
import fs from 'fs';

const SESSION = 'protein-quest-quality';
const BRIDGE = 'http://127.0.0.1:10086/command';
const LOG_PATH = new URL('./ig-dm-log.json', import.meta.url).pathname;
const MSG = 'paid promo?';
const MIN_FOLLOWERS = 5000;
const MAX_FOLLOWERS = 100000;
const MIN_VIEWS = 5000;
const MAX_VIEWS = 100000;
const REELS_TO_CHECK = 3;

const CONTACTED = new Set([
  'gym_arkiv', 'andry_strong', 'jonah_calisthenics', 'sarahfit', 'hyroxworld', 'hyroxger', 'niketh_putta',
]);

const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
for (const x of [...log.sent, ...log.skipped, ...(log.failed || [])]) CONTACTED.add(x.username);

const REPOST = /repost|gym\s*edit|archive|fan\s*page|follow\s*for\s*more|credit\s*to|best\s*of\s*gym|gym\s*tok|clips\s*page|motivation\s*daily|dm\s*for\s*removal/i;
const COMPANY = /\b(official|headquarters|shop now|order now|we are|our gym|our studio|nutrition brand|supplement|global brand|franchise|wholesale|distributor|team account|media team|press team|corporate|head office|worldwide|join our team|college essay|consulting|agency|university guide)\b/i;
const COMPANY_USER = /^(hyrox|crossfit|gymshark|myprotein|optimumnutrition|prozis|nike|adidas|underarmour|roguefitness|fitnessfirst|puregym|planetfitness|goldsgym|equinox|f45|orangetheory|barrys|lululemon|ultimateivyleague|gym_|gym\.|studio|brand|official)/i;
const SOLO = /\b(coach|trainer|athlete|influencer|creator|vlog|vlogger|content|my journey|i am|i'm |helping you|help you|meal prep|sharing my|founder|personal|online coach|nutritionist|dietitian|fitness|workout|protein|macro|gym|lifestyle|wellness|health|day in my life|daily|routine|grwm|storytime|talking|podcast|youtube|tiktok|blog|dairy|life|mom|dad|student|entrepreneur)\b/i;
const CONTENT = /\b(fitness|workout|gym|protein|nutrition|meal prep|lifestyle|wellness|health|vlog|vlogger|creator|influencer|content|day in my life|daily vlog|morning routine|grwm|routine|what i eat|self care|motivation|mindset|food|recipes|cooking|entrepreneur|productivity|story|minivlog|life|journey|transformation|app|tech|student|college|mom|dad|family)\b/i;
const VLOG_USER = /vlog|daily|life|creator|influencer|grwm|routine|story|talks|diaries/i;
const HEAVY_SPONSOR = /\b(brand ambassador|official partner|sponsored by|use code|discount code|affiliate|managed by|talent agency|booking agent|pr@|media kit)\b/i;

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

export async function searchTop(query) {
  const raw = await bridge('evaluate', {
    code: `(async()=>{const r=await fetch('/web/search/topsearch/?query='+encodeURIComponent('${query.replace(/'/g, "\\'")}'),{credentials:'include'});const d=await r.json();return JSON.stringify((d.users||[]).map(u=>({username:u.user?.username,full_name:u.user?.full_name,is_verified:u.user?.is_verified})).filter(x=>x.username));})()`,
  }, 20000);
  try { return JSON.parse(raw.value); } catch { return []; }
}

export async function extractUsernamesFromPage(pageUrl) {
  await bridge('navigate', { url: pageUrl });
  await sleep(3000);
  return evalJson(`(() => {
    const skip = new Set(['instagram','explore','reels','direct','accounts','p','reel','popular','about','legal','niketh_putta']);
    const profiles = [...document.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => h && h.match(/^\\/[a-zA-Z0-9._]+\\/?$/) && !skip.has(h.replace(/\\//g,'')))
      .map(h => h.replace(/\\//g, ''));
    const content = [...document.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => h && /\\/(p|reel)\\//.test(h));
    return JSON.stringify({ profiles: [...new Set(profiles)].slice(0, 25), content: [...new Set(content)].slice(0, 15) });
  })()`);
}

export async function usernameFromReel(path) {
  const url = path.startsWith('http') ? path : `https://www.instagram.com${path}`;
  await bridge('navigate', { url });
  await sleep(2500);
  const data = await evalJson(`(() => {
    const skip = new Set(['instagram','explore','reels','direct','accounts','p','reel','popular']);
    const lines = document.body.innerText.split('\\n').map(s => s.trim()).filter(Boolean);
    const head = lines.find(l => l.match(/^[a-zA-Z0-9._]{2,30}$/) && !skip.has(l.toLowerCase()));
    return JSON.stringify({ username: head || null });
  })()`);
  return data?.username || null;
}

export async function discoverCandidates() {
  await bridge('navigate', { url: 'https://www.instagram.com/', group_title: 'Protein Quest — quality outreach' });
  await sleep(2000);

  const queries = [
    'personal trainer', 'calisthenics athlete', 'meal prep creator', 'gym influencer',
    'nutrition coach', 'fitness creator', 'macro coach', 'protein recipes',
    'home workout coach', 'strength coach', 'yoga instructor', 'running coach',
    'bodybuilding coach', 'online fitness coach', 'hyrox athlete',
    'protein tracking', 'macro tracking', 'fitness reel creator', 'gym content creator',
    'meal prep fitness', 'high protein meals', 'workout tips', 'gym lifestyle',
    'fitness journey', 'bulking tips', 'cutting diet', 'supplement free fitness',
    'fitness tips', 'gym motivation', 'workout routine', 'fitness model', 'gym girl',
    'gym guy', 'fitness mom', 'fit dad', 'online coach', 'fitness vlog',
    'what i eat', 'full day of eating', 'leg day', 'push day', 'pull day',
    'gym humor', 'fitness comedy', 'transformation', 'weight loss journey',
    'muscle gain', 'lean bulk', 'powerlifting', 'crossfit athlete', 'hyrox training',
    'lifestyle vlog', 'day in my life', 'morning routine', 'wellness creator', 'health creator',
    'grwm', 'aesthetic lifestyle', 'healthy habits', 'self care routine', 'productivity lifestyle',
  ];
  const hashtags = ['fitness', 'gymtok', 'mealprep', 'protein', 'calisthenics', 'personaltrainer', 'fitnessreels', 'gymreels', 'highprotein', 'macrotracking'];
  const candidates = new Map();

  for (const q of queries) {
    try {
      const users = await searchTop(q);
      for (const u of users) {
        if (!CONTACTED.has(u.username) && !COMPANY_USER.test(u.username) && !/hyrox/i.test(u.username)) {
          candidates.set(u.username, { source: `search:${q}`, ...u });
        }
      }
      console.log(`search "${q}": ${users.length} results`);
    } catch (e) { console.log(`search "${q}" error: ${e.message}`); }
    await sleep(300);
  }

  // Fast path: reels tab only (hashtag pages are slow and often return 0)
  const fastPages = ['https://www.instagram.com/reels/'];
  for (const pageUrl of fastPages) {
    try {
      const { profiles, content } = await extractUsernamesFromPage(pageUrl);
      for (const u of profiles || []) {
        if (!CONTACTED.has(u) && !COMPANY_USER.test(u) && !/hyrox/i.test(u)) {
          candidates.set(u, { source: `page:reels`, username: u });
        }
      }
      for (const path of (content || []).slice(0, 12)) {
        const u = await usernameFromReel(path);
        if (u && !CONTACTED.has(u) && !COMPANY_USER.test(u) && !/hyrox/i.test(u)) {
          candidates.set(u, { source: `reel:${path}`, username: u });
        }
        await sleep(200);
      }
      console.log(`page reels: +${profiles?.length || 0} profiles, ${(content||[]).length} posts`);
    } catch (e) { console.log(`page error: ${e.message}`); }
  }

  // Suggested from known good solo creators
  for (const seed of ['andry_strong', 'jonah_calisthenics', 'protein.hacks', 'teo_tdz', 'bergenlifts', 'eith_sw', 'summers.coach', 'realbodynessah', 'justinpf951', 'stachaczoliwier']) {
    try {
      await bridge('navigate', { url: `https://www.instagram.com/${seed}/` });
      await sleep(2500);
      const similar = await evalJson(`(() => {
        const links = [...document.querySelectorAll('a[href]')]
          .map(a => a.getAttribute('href'))
          .filter(h => h && h.match(/^\\/[a-zA-Z0-9._]+\\/?$/) && !h.includes('${seed}'))
          .map(h => h.replace(/\\//g, ''));
        return JSON.stringify([...new Set(links)].slice(0, 15));
      })()`);
      for (const u of similar || []) {
        if (!CONTACTED.has(u) && !COMPANY_USER.test(u) && !/hyrox/i.test(u)) {
          candidates.set(u, { source: `similar:${seed}`, username: u });
        }
      }
    } catch (_) {}
  }

  return [...candidates.values()];
}

export async function vetAndMaybeSend(username) {
  const r = await vetProfile(username);
  if (r.verdict === 'pass') {
    const sent = await sendDM(r.username, r.why, { followers: r.followers, avgViews: r.avgViews, views: r.views, source: 'targeted_discovery' });
    return { ...r, dm: sent };
  }
  return r;
}

async function checkDailyLimit() {
  const block = await evalJson(`(() => {
    const t = document.body?.innerText || '';
    return t.includes("You've reached your daily limit") || t.includes('been on Instagram for');
  })()`);
  return block === true;
}

export async function vetProfile(username) {
  if (CONTACTED.has(username)) return { verdict: 'skip', reason: 'already contacted' };
  if (COMPANY_USER.test(username) || /hyrox/i.test(username)) return { verdict: 'skip', reason: 'brand/company username' };

  await bridge('navigate', { url: `https://www.instagram.com/${username}/` });
  await sleep(2800);

  if (await checkDailyLimit()) {
    log.blockers.push({ type: 'instagram_daily_limit', time: new Date().toISOString(), note: 'Daily time limit overlay — dismiss in Instagram settings to continue' });
    save();
    throw new Error('Instagram daily time limit reached — cannot vet profiles until dismissed');
  }

  const profile = await evalJson(`(() => {
    const t = document.body.innerText;
    const lines = t.split('\\n');
    const bio = lines.slice(0, 18).join(' ');
    const followersM = t.match(/([\\d,.]+[KkMm]?)\\s*followers?/i);
    const verified = !!document.querySelector('[aria-label="Verified"], svg[aria-label="Verified"]');
    const reels = [...new Set([...document.querySelectorAll('a[href*="/reel/"]')]
      .map(a => a.getAttribute('href'))
      .filter(h => h && h.includes('${username}')))].slice(0, ${REELS_TO_CHECK});
    const hasMsg = [...document.querySelectorAll('div[role="button"],button,a')]
      .some(el => (el.textContent || '').trim() === 'Message');
    const name = (lines[0] || '').trim();
    return JSON.stringify({ username: '${username}', name, bio, followersRaw: followersM ? followersM[1] : null, reels, hasMsg, verified });
  })()`);

  if (/daily limit/i.test(profile.name || '') || /daily limit/i.test(profile.bio || '')) {
    throw new Error('INSTAGRAM_DAILY_LIMIT');
  }

  const followers = parseCount(profile.followersRaw);
  const checks = [];

  if (!profile.hasMsg) return logSkip(username, 'private/no DM', { followers, profile });
  const isPersonalCreator =
    SOLO.test(profile.bio) ||
    CONTENT.test(profile.bio) ||
    CONTENT.test(profile.name) ||
    VLOG_USER.test(username) ||
    /\b(I |my |me |@)/i.test(profile.bio);

  if (!isPersonalCreator && !profile.reels?.length) {
    return logSkip(username, 'not a vlogger/creator fit for app promo', { followers, profile });
  }
  if (REPOST.test(profile.bio)) return logSkip(username, 'repost/edit account', { followers, profile });
  if (COMPANY.test(profile.bio) && !isPersonalCreator) return logSkip(username, 'company/brand bio', { followers, profile });
  if (profile.verified && COMPANY.test(profile.bio)) return logSkip(username, 'verified brand account', { followers, profile });
  if (followers > 0 && followers < MIN_FOLLOWERS) return logSkip(username, 'under 5k followers', { followers, profile });
  if (followers > MAX_FOLLOWERS) return logSkip(username, 'over 100k followers', { followers, profile });
  if (HEAVY_SPONSOR.test(profile.bio) && followers > 80000) return logSkip(username, 'heavily sponsored — unlikely to reply', { followers, profile });
  const brandMentions = (profile.bio.match(/@\w+/g) || []).length;
  if (brandMentions >= 4 && followers > 100000) return logSkip(username, 'too many brand partnerships', { followers, profile });
  if (!profile.reels?.length) return logSkip(username, 'no reels', { followers, profile });

  const viewCounts = [];
  let repostHits = 0;
  for (const reel of profile.reels.slice(0, REELS_TO_CHECK)) {
    const url = reel.startsWith('http') ? reel : `https://www.instagram.com${reel}`;
    await bridge('navigate', { url });
    await sleep(2800);
    const data = await evalJson(`(() => {
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
    })()`);
    viewCounts.push(data.views || 0);
    if (data.repost) repostHits++;
    await sleep(400);
  }

  if (repostHits >= 2) return logSkip(username, 'repost signals on reels', { followers, views: viewCounts, profile });

  const inRange = viewCounts.filter((v) => v >= MIN_VIEWS && v <= MAX_VIEWS);
  const avgViews = viewCounts.length ? Math.round(viewCounts.reduce((a, b) => a + b, 0) / viewCounts.length) : 0;

  const hasMinViews = viewCounts.some((v) => v >= MIN_VIEWS && v <= MAX_VIEWS);
  if (!hasMinViews) {
    return logSkip(username, `reel views below 5k (${viewCounts.join(', ')})`, { followers, avgViews, profile });
  }

  checks.push(`vlogger/creator fit for Protein Quest, ${followers.toLocaleString()} followers, reel views ${viewCounts.join('/')}, avg ~${avgViews.toLocaleString()}`);

  return {
    verdict: 'pass',
    username,
    followers,
    avgViews,
    views: viewCounts,
    why: checks.join('; '),
    profile,
  };
}

function logSkip(username, reason, extra = {}) {
  if (!CONTACTED.has(username)) {
    log.skipped.push({ username, reason, dm_sent: false, ...extra });
    CONTACTED.add(username);
    save();
  }
  console.log(`SKIP @${username}: ${reason}`);
  return { verdict: 'skip', reason, username };
}

export async function sendDM(username, why, meta = {}) {
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
  if (!fill?.success) {
    log.failed.push({ username, reason: 'DM input not found', dm_sent: false, ...meta });
    save();
    return { ok: false, reason: 'DM input not found' };
  }
  await sleep(400);
  const sent = await bridge('evaluate', {
    code: `(() => { const s=[...document.querySelectorAll('div[role="button"],button,svg[aria-label]')].find(el=>((el.getAttribute('aria-label')||el.textContent||'').toLowerCase()).includes('send')); if(s){(s.closest('div[role="button"]')||s).click();return true;} return false; })()`,
  });
  if (sent.value === true) {
    log.sent.push({ username, dm_sent: true, why, ...meta });
    CONTACTED.add(username);
    save();
    const notifyLine = `${new Date().toISOString()} | @${username} | ${log.sent.length}/150 | ${why}\n`;
    fs.appendFileSync(new URL('./ig-dm-notify.log', import.meta.url).pathname, notifyLine);
    console.log(`✓ SENT @${username} — ${log.sent.length} total | ${why}`);
    return { ok: true };
  }
  log.failed.push({ username, reason: 'send click failed', dm_sent: false, ...meta });
  save();
  return { ok: false, reason: 'send click failed' };
}

export async function backToFeed() {
  await bridge('navigate', { url: 'https://www.instagram.com/' });
  await sleep(2000);
}

// CLI: node ig-quality-helper.mjs vet|discover|run|send
const cmd = process.argv[2];
const arg = process.argv[3];
if (cmd === 'vet' && arg) {
  vetProfile(arg).then(async (r) => {
    console.log(JSON.stringify(r, null, 2));
    if (r.verdict === 'pass') {
      const sent = await sendDM(r.username, r.why, { followers: r.followers, avgViews: r.avgViews, views: r.views });
      console.log('DM result:', sent);
    }
  });
} else if (cmd === 'discover') {
  discoverCandidates().then((c) => {
    console.log(`\n=== ${c.length} candidates ===`);
    c.slice(0, 40).forEach((x) => console.log(`@${x.username} (${x.source})`));
  });
} else if (cmd === 'run') {
  const limit = parseInt(arg || '8', 10);
  const minGoal = parseInt(process.argv[4] || '0', 10);
  discoverCandidates().then(async (c) => {
    console.log(`\nVetting up to ${limit} of ${c.length} candidates...\n`);
    let sent = 0;
    for (const cand of c.slice(0, limit)) {
      if (minGoal > 0 && log.sent.length >= minGoal) break;
      console.log(`\n--- @${cand.username} (${cand.source}) ---`);
      const r = await vetAndMaybeSend(cand.username);
      if (r.verdict === 'pass' && r.dm?.ok) sent++;
      await sleep(1200);
    }
    console.log(`\nSession done: ${sent} new DMs, total ${log.sent.length} sent`);
  });
} else if (cmd === 'overnight') {
  const batchSize = parseInt(arg || '30', 10);
  const GOAL = parseInt(process.argv[4] || '150', 10);
  const waitLimit = 30 * 60 * 1000;
  const waitRate = 45 * 60 * 1000;

  process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.message || e));
  process.on('uncaughtException', (e) => console.error('uncaughtException:', e?.message || e));

  async function checkBlockers() {
    return evalJson(`(() => {
      const t = (document.body?.innerText || '').toLowerCase();
      if (t.includes("you've reached your daily limit") || t.includes('been on instagram for')) return 'daily_limit';
      if (t.includes('try again later') || t.includes('action blocked') || t.includes('we restrict')) return 'rate_limit';
      return 'ok';
    })()`);
  }

  async function overnightLoop() {
    let round = 0;
    console.log(`GOAL: ${GOAL} DMs to qualifying solo creators | currently ${log.sent.length}`);
    while (log.sent.length < GOAL) {
      round++;
      const ts = new Date().toISOString();
      console.log(`\n========== ROUND ${round} | ${log.sent.length}/${GOAL} sent | ${ts} ==========\n`);
      try {
        const candidates = await discoverCandidates();
        console.log(`Pool: ${candidates.length} candidates`);
        let sentRound = 0;
        for (const cand of candidates.slice(0, batchSize)) {
          if (log.sent.length >= GOAL) break;
          try {
            const blocker = await checkBlockers();
            if (blocker === 'daily_limit') throw new Error('INSTAGRAM_DAILY_LIMIT');
            if (blocker === 'rate_limit') throw new Error('INSTAGRAM_RATE_LIMIT');

            console.log(`\n--- @${cand.username} (${cand.source}) ---`);
            const r = await vetAndMaybeSend(cand.username);
            if (r.verdict === 'pass' && r.dm?.ok) sentRound++;

            const after = await checkBlockers();
            if (after === 'rate_limit') throw new Error('INSTAGRAM_RATE_LIMIT');
          } catch (e) {
            const msg = e.message || String(e);
            if (msg.includes('DAILY_LIMIT') || msg.includes('daily limit')) {
              log.blockers.push({ type: 'instagram_daily_limit', time: new Date().toISOString(), round });
              save();
              console.log('DAILY LIMIT — waiting 30 min then retrying...');
              await sleep(waitLimit);
              break;
            }
            if (msg.includes('RATE_LIMIT') || msg.includes('rate')) {
              log.blockers.push({ type: 'rate_limit', time: new Date().toISOString(), round });
              save();
              console.log('RATE LIMIT — waiting 45 min then retrying...');
              await sleep(waitRate);
              break;
            }
            console.log(`Error @${cand.username}: ${msg}`);
          }
          await sleep(1500);
        }
        console.log(`Round ${round} done: +${sentRound} DMs | total ${log.sent.length}/${GOAL}`);
        if (log.sent.length >= GOAL) break;
        await sleep(candidates.length < 8 ? 10 * 60 * 1000 : 3 * 60 * 1000);
      } catch (e) {
        console.log(`Round ${round} fatal: ${e.message}`);
        await sleep(15 * 60 * 1000);
      }
    }
    console.log(`\n*** GOAL REACHED: ${log.sent.length}/${GOAL} DMs sent ***\n`);
  }
  overnightLoop();
} else if (cmd === 'send' && arg) {
  sendDM(arg, process.argv[4] || 'manual send');
}
