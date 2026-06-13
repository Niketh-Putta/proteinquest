#!/usr/bin/env node
/** Fast outreach: explore posts → vet author → DM. Goal 150. */
import { vetAndMaybeSend } from './ig-quality-helper.mjs';

const SESSION = 'protein-quest-quality';
const BRIDGE = 'http://127.0.0.1:10086/command';
const GOAL = 150;
const BATCH = 50;

const SEARCH_PAGES = [
  'https://www.instagram.com/explore/search/keyword/?q=fitness%20influencer',
  'https://www.instagram.com/explore/search/keyword/?q=meal%20prep%20creator',
  'https://www.instagram.com/explore/search/keyword/?q=protein%20recipes',
  'https://www.instagram.com/explore/search/keyword/?q=lifestyle%20vlog',
  'https://www.instagram.com/explore/search/keyword/?q=wellness%20creator',
  'https://www.instagram.com/explore/search/keyword/?q=day%20in%20my%20life',
  'https://www.instagram.com/explore/search/keyword/?q=nutrition%20coach',
  'https://www.instagram.com/explore/search/keyword/?q=home%20workout%20coach',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function evalJson(code) {
  const r = await bridge('evaluate', { code });
  try { return JSON.parse(r.value); } catch { return r.value; }
}

async function getPostLinks(pageUrl) {
  await bridge('navigate', { url: pageUrl });
  await sleep(3500);
  return evalJson(`(() => {
    const paths = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')]
      .map(a => a.getAttribute('href'))
      .filter(h => h && (h.includes('/p/') || h.includes('/reel/')));
    return JSON.stringify([...new Set(paths)].slice(0, 12));
  })()`);
}

async function getAuthor(postPath) {
  const url = postPath.startsWith('http') ? postPath : `https://www.instagram.com${postPath}`;
  await bridge('navigate', { url });
  await sleep(2500);
  return evalJson(`(() => {
    const skip = new Set(['p','reel','explore','reels','direct','accounts','popular','niketh_putta']);
    const users = [...document.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => h && h.match(/^\\/[a-zA-Z0-9._]+\\/?$/) && !skip.has(h.replace(/\\//g,'')))
      .map(h => h.replace(/\\//g,''));
    const author = users.find(u => u !== 'niketh_putta') || users[0] || null;
    const text = document.body.innerText.slice(0, 300);
    const fitness = /#(gym|fitness|protein|workout|mealprep|calisthenics|nutrition|lifestyle|wellness|health|vlog|grwm|ootd|whatieatinaday|dayinmylife)/i.test(text);
    return JSON.stringify({ author, fitness, text: text.slice(0, 120) });
  })()`);
}

async function searchUsers(query) {
  return evalJson(`(async()=>{
    const r=await fetch('/web/search/topsearch/?query='+encodeURIComponent('${query.replace(/'/g, "\\'")}'),{credentials:'include'});
    const d=await r.json();
    return JSON.stringify((d.users||[]).map(u=>u.user?.username).filter(Boolean));
  })()`);
}

import fs from 'fs';
const log = JSON.parse(fs.readFileSync(new URL('./ig-dm-log.json', import.meta.url).pathname, 'utf8'));
const contacted = new Set([...log.sent, ...log.skipped, ...(log.failed || [])].map((x) => x.username));

async function main() {
  console.log(`FAST RUN | ${log.sent.length}/${GOAL} sent`);
  const queue = new Set();

  await bridge('navigate', { url: 'https://www.instagram.com/', group_title: 'Protein Quest 150' });
  await sleep(2000);

  const queries = [
    'fitness creator', 'meal prep creator', 'protein recipes', 'gym influencer', 'calisthenics athlete',
    'home workout coach', 'nutrition coach', 'macro coach', 'fitness reel creator', 'gym content creator',
    'workout motivation', 'fitness tips', 'gym lifestyle', 'what i eat in a day', 'high protein meals',
    'fitness journey', 'online fitness coach', 'personal trainer', 'gym vlog', 'fitness model',
    'weight loss journey', 'muscle building', 'bulking tips', 'leg day workout', 'push pull legs',
    'lifestyle vlog', 'day in my life', 'wellness creator', 'morning routine', 'grwm', 'healthy habits',
  ];
  for (const q of queries) {
    try {
      const users = await searchUsers(q);
      for (const u of users || []) if (!contacted.has(u)) queue.add(u);
      console.log(`search ${q}: +${(users||[]).length}`);
    } catch (e) { console.log(`search err ${q}: ${e.message}`); }
    await sleep(200);
  }

  for (const page of SEARCH_PAGES) {
    try {
      const posts = await getPostLinks(page);
      for (const path of posts || []) {
        try {
          const { author, fitness } = await getAuthor(path);
          if (author && !contacted.has(author) && fitness) queue.add(author);
        } catch (_) {}
        await sleep(300);
      }
      console.log(`page ${page.split('q=').pop()}: posts ${(posts||[]).length}, queue ${queue.size}`);
    } catch (e) { console.log(`page err: ${e.message}`); }
  }

  console.log(`\nVetting ${queue.size} candidates...\n`);
  let sent = 0;
  const list = [...queue].slice(0, BATCH);
  for (const username of list) {
    if (log.sent.length >= GOAL) break;
    console.log(`--- @${username} ---`);
    try {
      const r = await vetAndMaybeSend(username);
      if (r.verdict === 'pass' && r.dm?.ok) sent++;
    } catch (e) {
      if (String(e.message).includes('DAILY_LIMIT')) {
        console.log('DAILY LIMIT — pausing 30 min');
        await sleep(30 * 60 * 1000);
      } else {
        console.log(`err: ${e.message}`);
      }
    }
    await sleep(1000);
  }
  console.log(`\nDONE: +${sent} this run | total ${log.sent.length}/${GOAL}`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
