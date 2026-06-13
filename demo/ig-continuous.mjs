#!/usr/bin/env node
/** Simple continuous outreach — search → vet → DM. No heavy page crawl. */
import fs from 'fs';
import { vetAndMaybeSend, searchTop } from './ig-quality-helper.mjs';

const GOAL = 150;
const BRIDGE = 'http://127.0.0.1:10086/command';
const SESSION = 'protein-quest-quality';
const logPath = new URL('./ig-dm-log.json', import.meta.url).pathname;
const sentCount = () => JSON.parse(fs.readFileSync(logPath, 'utf8')).sent.length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const QUERIES = [
  'day in my life vlog', 'daily vlog', 'lifestyle vlog', 'fitness vlog', 'gym vlog',
  'wellness creator', 'fitness creator', 'meal prep creator', 'protein recipes',
  'morning routine', 'grwm', 'what i eat in a day', 'content creator', 'micro influencer',
  'fitness influencer', 'health creator', 'student vlog', 'college vlog', 'productivity vlog',
  'home workout', 'nutrition coach', 'macro coach', 'fitness journey', 'gym content creator',
  'calisthenics', 'yoga vlog', 'running vlog', 'high protein meals', 'healthy habits',
  'app review creator', 'tech lifestyle', 'entrepreneur vlog', 'self care routine',
];

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

async function authorFromPost(path) {
  const url = path.startsWith('http') ? path : `https://www.instagram.com${path}`;
  await bridge('navigate', { url });
  await sleep(2500);
  const r = await bridge('evaluate', {
    code: `(() => {
      const skip = new Set(['p','reel','explore','reels','direct','niketh_putta','popular']);
      const users = [...document.querySelectorAll('a[href]')]
        .map(a => a.getAttribute('href'))
        .filter(h => h && h.match(/^\\/[a-zA-Z0-9._]+\\/?$/) && !skip.has(h.replace(/\\//g,'')))
        .map(h => h.replace(/\\//g,''));
      return users.find(u => u !== 'niketh_putta') || '';
    })()`,
  });
  return r.value;
}

async function postsFromSearch(keyword) {
  await bridge('navigate', {
    url: `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(keyword)}`,
    group_title: 'Protein Quest — sending DMs',
  });
  await sleep(3500);
  const r = await bridge('evaluate', {
    code: `(() => JSON.stringify([...new Set([...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]')].map(a=>a.getAttribute('href')))].slice(0,8)))()`,
  });
  try { return JSON.parse(r.value); } catch { return []; }
}

let qi = 0;
while (sentCount() < GOAL) {
  const q = QUERIES[qi % QUERIES.length];
  qi++;
  console.log(`\n=== ${sentCount()}/${GOAL} | query: ${q} ===`);

  await bridge('navigate', { url: 'https://www.instagram.com/', group_title: 'Protein Quest — sending DMs' });
  await sleep(1500);

  // Post-based discovery first (fresh creators from content)
  try {
    const posts = await postsFromSearch(q);
    for (const path of posts || []) {
      if (sentCount() >= GOAL) break;
      try {
        const author = await authorFromPost(path);
        if (!author) continue;
        console.log(`--- post @${author} ---`);
        const r = await vetAndMaybeSend(author);
        if (r.verdict === 'pass' && r.dm?.ok) console.log(`✓ SENT @${author}`);
      } catch (e) { console.log(`err: ${e.message}`); }
      await sleep(1200);
    }
  } catch (e) { console.log(`explore err: ${e.message}`); }

  const fromSearch = await searchTop(q);
  for (const u of (fromSearch || []).slice(0, 4)) {
    if (sentCount() >= GOAL) break;
    const username = typeof u === 'string' ? u : u?.username;
    if (!username) continue;
    console.log(`--- search @${username} ---`);
    try {
      const r = await vetAndMaybeSend(username);
      if (r.verdict === 'skip') console.log(`SKIP @${username}: ${r.reason}`);
      if (r.verdict === 'pass' && r.dm?.ok) console.log(`✓ SENT @${username}`);
    } catch (e) { console.log(`err: ${e.message}`); }
    await sleep(1200);
  }

  await sleep(1500);
}
console.log(`DONE ${sentCount()}/${GOAL}`);
