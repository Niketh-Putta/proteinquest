#!/usr/bin/env node
import fs from 'fs';

const SESSION = 'protein-quest-outreach';
const BRIDGE = 'http://127.0.0.1:10086/command';
const LOG = JSON.parse(fs.readFileSync(new URL('./ig-dm-log.json', import.meta.url).pathname, 'utf8'));
const CONTACTED = new Set([...LOG.sent, ...LOG.skipped].map((x) => x.username));
const MSG = 'paid promo?';
const MIN = 5000, MAX = 100000, TARGET = 100;

const CANDIDATES = [
  'start_calisthenics','andry_strong','jonah_calisthenics','calisthenics.bypaulina','littletfitness',
  'bradtherunningdad','lamarclements_','boxingcoachonline','nutrition.coach_','ah_nutritioncoach','sarahfit',
  'martin.running_','zonegym','protein_rebel','loadaballs','cf_tyneside','crossfitteesside',
  'gym_arkiv','doctor.running','martin.running_','runningwiththebrothers',
];

const REPOST = /repost|gym\s*edit|archive|fan\s*page|follow\s*for\s*more|credit\s*to|not\s*my\s*content|clips\s*only/i;

async function bridge(action, args = {}, ms = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = () => fs.writeFileSync(new URL('./ig-dm-log.json', import.meta.url).pathname, JSON.stringify(LOG, null, 2));

async function evalCode(code) {
  const r = await bridge('evaluate', { code });
  return typeof r.value === 'string' && r.value.startsWith('{') ? JSON.parse(r.value) : r.value;
}

async function vetUser(username) {
  await bridge('navigate', { url: `https://www.instagram.com/${username}/` });
  await sleep(2500);
  return evalCode(`(() => {
    const t = document.body.innerText;
    const bio = t.split('\\n').slice(0,15).join(' ');
    const posts = [...new Set([...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]')].map(a=>a.getAttribute('href')).filter(Boolean))].slice(0,3);
    const hasMsg = [...document.querySelectorAll('div[role="button"],button,a')].some(el=>(el.textContent||'').trim()==='Message');
    const followers = t.match(/([\\d,.]+[KkMm]?)\\s*followers?/i);
    return JSON.stringify({bio,posts,hasMsg,followers:followers?.[1]||null});
  })()`);
}

async function postEngagement(path) {
  const url = path.startsWith('http') ? path : `https://www.instagram.com${path}`;
  await bridge('navigate', { url });
  await sleep(2000);
  return evalCode(`(() => {
    const p = (s) => { if(!s)return 0; s=String(s).replace(/,/g,'').toLowerCase(); if(s.endsWith('k'))return parseFloat(s)*1000; if(s.endsWith('m'))return parseFloat(s)*1e6; return parseInt(s)||0; };
    const t = document.body.innerText;
    const likes = t.match(/([\\d,.]+[KkMm]?)\\s*likes?/i);
    const views = t.match(/([\\d,.]+[KkMm]?)\\s*views?/i);
    const eng = Math.max(likes?p(likes[1]):0, views?p(views[1]):0);
    const personal = /(I |my |coach|trainer|recipe|workout|tip:|today)/i.test(t);
    const repost = /(credit|repost|follow for|via @|source:)/i.test(t);
    const original = /original audio/i.test(t);
    return JSON.stringify({eng,personal,repost,original});
  })()`);
}

async function sendDM(username) {
  await bridge('navigate', { url: `https://www.instagram.com/${username}/` });
  await sleep(2000);
  await bridge('evaluate', { code: `(() => { const b=[...document.querySelectorAll('div[role="button"],button,a')].find(el=>(el.textContent||'').trim()==='Message'); if(b)b.click(); return b?'ok':'no'; })()` });
  await sleep(2500);
  const fill = await bridge('fill', { selector: 'div[contenteditable=true][role="textbox"]', value: MSG });
  if (!fill.success) return false;
  await sleep(400);
  const r = await bridge('evaluate', { code: `(() => { const s=[...document.querySelectorAll('div[role="button"],button,svg[aria-label]')].find(el=>((el.getAttribute('aria-label')||el.textContent||'').toLowerCase()).includes('send')); if(s){(s.closest('div[role="button"]')||s).click();return true;} return false; })()` });
  return r.value === true;
}

async function discover() {
  const raw = await bridge('evaluate', { code: `(async()=>{const q=['fitness coach','personal trainer','calisthenics','meal prep','running coach','nutrition coach','crossfit coach','hyrox','strength coach','boxing coach','yoga instructor','pilates'];const u=new Set();for(const x of q){try{const r=await fetch('/web/search/topsearch/?query='+encodeURIComponent(x),{credentials:'include'});const d=await r.json();(d.users||[]).forEach(x=>x.user?.username&&u.add(x.user.username));}catch(e){}await new Promise(r=>setTimeout(r,100));}return JSON.stringify([...u]);})()` }, 60000);
  return JSON.parse(raw.value);
}

async function process(username) {
  if (CONTACTED.has(username) || username === 'niketh_putta') return;
  console.log(`→ @${username}`);
  try {
    const profile = await vetUser(username);
    if (REPOST.test(profile.bio)) { LOG.skipped.push({username,reason:'repost/edit account',dm_sent:false}); CONTACTED.add(username); save(); return; }
    if (!profile.hasMsg) { LOG.skipped.push({username,reason:'no DM/private',dm_sent:false}); CONTACTED.add(username); save(); return; }
    if (!profile.posts?.length) { LOG.skipped.push({username,reason:'no posts visible',dm_sent:false}); CONTACTED.add(username); save(); return; }

    const post = await postEngagement(profile.posts[0]);
    let creatorScore = (post.personal?1:0) + (post.original?1:0) - (post.repost?2:0);
    if (creatorScore < 0) { LOG.skipped.push({username,engagement:post.eng,reason:'repost signals',dm_sent:false}); CONTACTED.add(username); save(); return; }
    if (post.eng < MIN) { LOG.skipped.push({username,engagement:post.eng,reason:'below 5k',dm_sent:false}); CONTACTED.add(username); save(); return; }
    if (post.eng > MAX) { LOG.skipped.push({username,engagement:post.eng,reason:'above 100k',dm_sent:false}); CONTACTED.add(username); save(); return; }

    const ok = await sendDM(username);
    if (ok) {
      const type = profile.bio.match(/coach|trainer|nutrition|run|crossfit|calisthenics|boxing|yoga|pilates/i)?.[0] || 'fitness creator';
      LOG.sent.push({username,engagement:post.eng,type,dm_sent:true});
      CONTACTED.add(username);
      console.log(`✓ SENT @${username} (${post.eng}) — ${LOG.sent.length}/${TARGET}`);
    } else {
      LOG.failed.push({username,engagement:post.eng,reason:'send failed',dm_sent:false});
      console.log(`✗ FAIL @${username}`);
    }
  } catch (e) {
    LOG.failed.push({username,reason:String(e.message),dm_sent:false});
    console.log(`✗ ERROR @${username}: ${e.message}`);
  }
  save();
  await sleep(1000);
}

async function main() {
  console.log(`Start: ${LOG.sent.length} sent`);
  const discovered = await discover();
  const queue = [...new Set([...CANDIDATES, ...discovered])];
  for (const u of queue) {
    if (LOG.sent.length >= TARGET) break;
    await process(u);
    const block = await evalCode(`(() => { const t=document.body.innerText.toLowerCase(); return t.includes('try again later')||t.includes('action blocked')?'block':'ok'; })()`);
    if (block === 'block') { LOG.blockers.push({type:'rate_limit',time:new Date().toISOString()}); save(); break; }
  }
  console.log('DONE', LOG.sent.length, 'sent');
}

main();
