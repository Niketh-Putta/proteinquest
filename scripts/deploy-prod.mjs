#!/usr/bin/env node
import { execSync } from 'node:child_process';

const PRODUCTION_DOMAIN = 'proteinquest.vercel.app';

function run(command, options = {}) {
  console.log(`\n> ${command}`);
  return execSync(command, {
    stdio: options.inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
}

function parseDeployUrl(output) {
  const trimmed = output.trim();
  if (!trimmed) return null;

  try {
    const jsonLine = trimmed.split('\n').find((line) => line.startsWith('{')) ?? trimmed;
    const parsed = JSON.parse(jsonLine);
    return parsed.url ?? parsed.preview?.url ?? null;
  } catch {
    return (
      trimmed.match(/https:\/\/[^\s"'`]+\.vercel\.app/g)?.pop()?.replace(/[)\],]$/, '') ?? null
    );
  }
}

run('npx expo export --platform web', { inherit: true });
run('node scripts/prepare-web-export.mjs', { inherit: true });

let deploymentUrl = null;
try {
  const deployOutput = run('vercel deploy dist --prod --yes --json');
  deploymentUrl = parseDeployUrl(deployOutput);
} catch (error) {
  if (error.stdout) {
    deploymentUrl = parseDeployUrl(String(error.stdout));
  }
  if (!deploymentUrl) {
    console.error('\nVercel deploy failed. Full output:');
    if (error.stdout) console.error(error.stdout);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
}

if (!deploymentUrl) {
  console.error('Could not parse deployment URL from Vercel output.');
  process.exit(1);
}

run(`vercel alias set ${deploymentUrl} ${PRODUCTION_DOMAIN}`, { inherit: true });
console.log(`\nProduction: https://${PRODUCTION_DOMAIN}`);
