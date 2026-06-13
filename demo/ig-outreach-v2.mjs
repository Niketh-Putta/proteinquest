#!/usr/bin/env node
import fs from 'fs';

const SESSION = 'protein-quest-outreach';
const BRIDGE = 'http://127.0.0.1:10086/command';
const LOG_PATH = new URL('./ig-dm-log.json', import.meta.url).pathname;
const MSG = 'paid promo?';
const MIN = 5000, MAX = 100000, TARGET = 100;

const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
const contacted = new Set([...log.sent, ...log.skipped].map((x) => x.username));

const REPOST = /repost|gym\s*edit|archive|fan\s*page|follow\s*for\s*more|credit\s*to|best\s*of\s*gym|gym\s*tok|clips\s*page/i;
const BRAND = /^(hyrox|crossfit|gymshark|nike|adidas|myprotein|prozis|optimumnutrition)/i;
const BRAND_BIO = /\b(official|headquarters|global brand|shop now|order now|we are hyrox|we are crossfit)\b/i;
const CREATOR = /coach|trainer|athlete|nutrition|my\s|i\s|journey|meal\s*prep|workout|protein|running|fitness|help\s*you|sharing my|founder/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = () => fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));

async function bridge(action, args = {}, timeout = 50000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BRIDGE, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args, session: SESSION }),
      signal: ctrl.signal,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error?.message || JSON.stringify(data));
    return data.data;
  } finally { clearTimeout(t); }
}

async function evalJson(code) {
  const r = await bridge('evaluate', { code });
  const v = r.value;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

async function getLikeCountFromPost(path) {
  const url = path.startsWith('http') ? path : `https://www.instagram.com${path}`;
  await bridge('navigate', { url });
  await sleep(3500);
  return evalJson(`(() => {
    const html = document.documentElement.innerHTML;
    const counts = (html.match(/"like_count":(\\d+)/g) || []).map(s => parseInt(s.match(/\\d+/)[0]));
    const plays = (html.match(/"play_count":(\\d+)/g) || []).map(s => parseInt(s.match(/\\d+/)[0]));
    const maxLikes = counts.length ? Math.max(...counts) : 0;
    const maxPlays = plays.length ? Math.max(...plays) : 0;
    const t = document.body.innerText;
    const user = (t.split('\\n')[0] || '').trim();
    const personal = /(I |my |coach|trainer|recipe|workout|tip:|today|journey)/i.test(t.slice(0,800));
    const repost = /(credit|repost|follow for|via @|source:|not mine)/i.test(t.slice(0,800));
    return JSON.stringify({ user, maxLikes, maxPlays, eng: Math.max(maxLikes, maxPlays), personal, repost });
  })()`);
}

async function sendDM(username) {
  await bridge('navigate', { url: `https://www.instagram.com/${username}/` });
  await sleep(2200);
  const profile = await evalJson(`(() => {
    const t = document.body.innerText;
    const bio = t.split('\\n').slice(0, 14).join(' ');
    const hasMsg = [...document.querySelectorAll('div[role="button"],button,a')].some(el => (el.textContent||'').trim() === 'Message');
    const repost = ${REPOST}.test(bio);
    const creator = ${CREATOR}.test(bio);
    return JSON.stringify({ hasMsg, repost, creator, bio });
  })()`);
  if (!profile.hasMsg || profile.repost) return { ok: false, reason: profile.repost ? 'repost account' : 'no message' };
  if (BRAND.test(username) || BRAND_BIO.test(profile.bio)) return { ok: false, reason: 'brand account' };
  if (!profile.creator) return { ok: false, reason: 'not personal creator' };

  await bridge('evaluate', { code: `(() => { const b=[...document.querySelectorAll('div[role="button"],button,a')].find(el=>(el.textContent||'').trim()==='Message'); if(b)b.click(); return 'ok'; })()` });
  await sleep(3000);
  let fill = null;
  for (let i = 0; i < 3; i++) {
    try {
      fill = await bridge('fill', { selector: 'div[contenteditable=true][role="textbox"]', value: MSG });
      if (fill.success) break;
    } catch (_) {}
    await sleep(1500);
  }
  if (!fill.success) return { ok: false, reason: 'fill failed' };
  await sleep(400);
  const sent = await bridge('evaluate', { code: `(() => { const s=[...document.querySelectorAll('div[role="button"],button,svg[aria-label]')].find(el=>((el.getAttribute('aria-label')||el.textContent||'').toLowerCase()).includes('send')); if(s){(s.closest('div[role="button"]')||s).click();return true;} return false; })()` });
  return { ok: sent.value === true };
}

async function discoverFromExplore() {
  await bridge('navigate', { url: 'https://www.instagram.com/explore/' });
  await sleep(3000);
  const posts = await evalJson(`(() => {
    return JSON.stringify([...new Set([...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]')].map(a=>a.getAttribute('href')).filter(Boolean))].slice(0, 30));
  })()`);
  return posts;
}

async function discoverFromSearch() {
  const queries = ['fitness coach', 'personal trainer', 'calisthenics', 'nutrition coach', 'running coach', 'meal prep fitness', 'crossfit coach', 'hyrox', 'strength coach', 'boxing coach'];
  const users = new Set();
  for (const q of queries) {
    try {
      const raw = await bridge('evaluate', { code: `(async()=>{const r=await fetch('/web/search/topsearch/?query='+encodeURIComponent('${q}'),{credentials:'include'});const d=await r.json();return JSON.stringify((d.users||[]).map(u=>u.user?.username).filter(Boolean));})()` }, 20000);
      JSON.parse(raw.value).forEach((u) => users.add(u));
    } catch (_) {}
    await sleep(200);
  }
  return [...users];
}

async function getProfilePosts(username) {
  await bridge('navigate', { url: `https://www.instagram.com/${username}/` });
  await sleep(2500);
  return evalJson(`(() => {
    const posts = [...new Set([...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]')].map(a=>a.getAttribute('href')).filter(h=>h&&h.includes('${username}')))].slice(0,4);
    const t = document.body.innerText;
    const bio = t.split('\\n').slice(0,14).join(' ');
    return JSON.stringify({ posts, bio });
  })()`);
}

async function processPost(path) {
  const data = await getLikeCountFromPost(path);
  const username = data.user;
  if (!username || contacted.has(username) || username === 'niketh_putta') return null;
  if (data.repost) { log.skipped.push({ username, engagement: data.eng, reason: 'repost signals', dm_sent: false }); contacted.add(username); save(); return null; }
  if (data.eng < MIN) { log.skipped.push({ username, engagement: data.eng, reason: 'below 5k', dm_sent: false }); contacted.add(username); save(); return null; }
  if (data.eng > MAX) { log.skipped.push({ username, engagement: data.eng, reason: 'above 100k', dm_sent: false }); contacted.add(username); save(); return null; }

  const result = await sendDM(username);
  if (result.ok) {
    const type = data.personal ? 'personal fitness creator' : 'fitness creator';
    log.sent.push({ username, engagement: data.eng, type, dm_sent: true });
    contacted.add(username);
    save();
    console.log(`✓ SENT @${username} (${data.eng.toLocaleString()}) — ${log.sent.length}/${TARGET}`);
    return username;
  }
  log.failed.push({ username, engagement: data.eng, reason: result.reason || 'send failed', dm_sent: false });
  save();
  return null;
}

async function processUser(username) {
  if (contacted.has(username)) return;
  const profile = await getProfilePosts(username);
  if (REPOST.test(profile.bio)) { log.skipped.push({ username, reason: 'repost/edit account', dm_sent: false }); contacted.add(username); save(); return; }
  for (const post of profile.posts.slice(0, 2)) {
    const data = await getLikeCountFromPost(post);
    if (data.eng >= MIN && data.eng <= MAX && !data.repost) {
      const result = await sendDM(username);
      if (result.ok) {
        log.sent.push({ username, engagement: data.eng, type: 'fitness creator', dm_sent: true });
        contacted.add(username);
        save();
        console.log(`✓ SENT @${username} (${data.eng.toLocaleString()}) — ${log.sent.length}/${TARGET}`);
        return;
      }
    }
    if (data.eng > MAX) break;
  }
  log.skipped.push({ username, reason: 'engagement out of range', dm_sent: false });
  contacted.add(username);
  save();
}

async function main() {
  console.log(`Resume: ${log.sent.length} sent, need ${TARGET - log.sent.length} more`);

  const searchUsers = await discoverFromSearch();
  const explorePosts = await discoverFromExplore();
  console.log(`Discovery: ${searchUsers.length} search users, ${explorePosts.length} explore posts`);

  for (const path of explorePosts) {
    if (log.sent.length >= TARGET) break;
    try { await processPost(path); } catch (e) { console.log('post error:', e.message); }
    await sleep(800);
  }

  for (const username of searchUsers) {
    if (log.sent.length >= TARGET) break;
    try { await processUser(username); } catch (e) { console.log(`user error @${username}:`, e.message); }
    await sleep(800);
  }

  // Scroll explore for more
  const tags = ['fitness', 'gym', 'protein', 'calisthenics', 'crossfit', 'running', 'mealprep', 'hyrox'];
  for (const tag of tags) {
    if (log.sent.length >= TARGET) break;
    await bridge('navigate', { url: `https://www.instagram.com/explore/search/keyword/?q=%23${tag}` });
    await sleep(3000);
    try {
      const postsRaw = await evalJson(`(() => { const p=[...new Set([...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]')].map(a=>a.getAttribute('href')).filter(Boolean))].slice(0,15); return JSON.stringify(p); })()`);
      const posts = Array.isArray(postsRaw) ? postsRaw : [];
      for (const path of posts) {
        if (log.sent.length >= TARGET) break;
        await processPost(path);
        await sleep(600);
      }
    } catch (e) { console.log(`tag #${tag} error:`, e.message); }
  }

  console.log('DONE', { sent: log.sent.length, skipped: log.skipped.length, failed: log.failed.length });
}

main().catch((e) => { console.error(e); process.exit(1); });
