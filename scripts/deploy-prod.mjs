#!/usr/bin/env node
import { execSync } from 'node:child_process';

const PRODUCTION_DOMAIN = 'proteinquest.vercel.app';

function run(command, options = {}) {
  console.log(`\n> ${command}`);
  return execSync(command, { stdio: options.inherit ? 'inherit' : 'pipe', encoding: 'utf8' });
}

run('npx expo export --platform web', { inherit: true });
run('node scripts/prepare-web-export.mjs', { inherit: true });

const deployOutput = run('vercel deploy --prod --yes');
const deploymentUrl =
  deployOutput.match(/https:\/\/[^\s]+\.vercel\.app/g)?.pop()?.replace(/[)\],]$/, '') ?? null;

if (!deploymentUrl) {
  console.error('Could not parse deployment URL from vercel output.');
  process.exit(1);
}

run(`vercel alias set ${deploymentUrl} ${PRODUCTION_DOMAIN}`, { inherit: true });
console.log(`\nProduction: https://${PRODUCTION_DOMAIN}`);
