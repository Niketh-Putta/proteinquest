#!/usr/bin/env node
/**
 * Seed named leaderboard players with random XP (0–260).
 * Requires SUPABASE_SERVICE_ROLE_KEY + EXPO_PUBLIC_SUPABASE_URL in .env
 */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomInt } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const NAMES = [
  'Nik',
  'Kevin M',
  'madssss',
  'Jules',
  'remy_lifts',
  'Ash',
  'TazTheTank',
  'lo',
  'Rae',
  'dexterbeans',
  'Pip',
  'nox_nox_nox',
  'zee',
  'Cal',
  'emilyk',
  'Sarah Okonkwo',
  'Ren',
  'KitKatButProtein',
  'Sol',
  'Ari',
  'bo',
  'luxx',
  'Jaxson',
  'faye_faye',
  'oz',
  'Cleo',
  'theodore',
  'Mimi',
  'Gus',
  'ivy_w',
  'Len',
  'skydoesntsleep',
  'Raff',
  'niko99',
  'Bea',
  'Cole',
  'sasha_pls',
  'Finn',
  'Lulu',
  'Marco',
  'Priya',
  'omarr',
  'Elsie',
  'Raj',
  'tessa_t',
  'Hugo',
  'Nina',
  'leo',
  'Zara',
  'milo_milo',
  'Anya',
  'diegooo',
  'Rosa',
  'Sami',
  'ines',
  'Arjun',
  'Mae',
  'Luca',
  'hana_h',
  'Ezra',
  'Noor',
  'tate',
  'Clea',
  'Ravi',
  'Juno',
  'ellis',
  'Kira',
  'benji_b',
  'Suki',
  'Arlo',
  'mika',
  'Reuben',
  'Tali',
  'Wes',
  'Amara',
  'Naveen',
  'clemmie',
  'Rohan',
];

function seedId(name) {
  const hex = createHash('sha256').update(`pq-leaderboard-v1:${name}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join('-');
}

function seedEmail(name) {
  const slug = createHash('md5').update(name).digest('hex').slice(0, 12);
  return `leaderboard+${slug}@proteinquest.invalid`;
}

loadEnv();

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let created = 0;
let updated = 0;
const rows = [];

for (const displayName of NAMES) {
  const id = seedId(displayName);
  const xp = randomInt(0, 261);
  const email = seedEmail(displayName);

  const { data: existingUser } = await supabase.auth.admin.getUserById(id);

  if (!existingUser?.user) {
    const { error: createError } = await supabase.auth.admin.createUser({
      id,
      email,
      email_confirm: true,
      app_metadata: { leaderboard_seed: true, provider: 'email' },
      user_metadata: { display_name: displayName },
    });
    if (createError) {
      console.error(`Create failed (${displayName}):`, createError.message);
      process.exit(1);
    }
    created += 1;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      xp,
      onboarded: true,
      intro_completed: true,
    })
    .eq('id', id);

  if (profileError) {
    console.error(`Profile update failed (${displayName}):`, profileError.message);
    process.exit(1);
  }
  updated += 1;
  rows.push({ displayName, xp });
}

rows.sort((a, b) => b.xp - a.xp);
console.log(`Done: ${created} created, ${updated} profiles updated (${NAMES.length} total).`);
console.log('Top 5:');
for (const r of rows.slice(0, 5)) {
  console.log(`  ${r.xp.toString().padStart(3)} XP  ${r.displayName}`);
}
