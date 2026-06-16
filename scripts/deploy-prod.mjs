#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PRODUCTION_DOMAINS = ['proteinquest.vercel.app', 'proteinlens.vercel.app'];
const VERCEL_SCOPE = 'niketh-puttas-projects';

function run(command, options = {}) {
  console.log(`\n> ${command}`);
  return execFileSync('/bin/bash', ['-lc', command], {
    stdio: options.inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
}

function vercelToken() {
  if (process.env.VERCEL_TOKEN?.trim()) return process.env.VERCEL_TOKEN.trim();
  try {
    const authPath = join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json');
    return JSON.parse(readFileSync(authPath, 'utf8')).token;
  } catch {
    return null;
  }
}

function parseDeployUrl(output) {
  const trimmed = output.trim();
  if (!trimmed) return null;

  const jsonLines = trimmed.split('\n').filter((line) => line.trim().startsWith('{'));
  for (let i = jsonLines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(jsonLines[i]);
      const url =
        parsed.deployment?.url ??
        parsed.url ??
        parsed.preview?.url ??
        null;
      if (url) return url;
    } catch {
      /* try next line */
    }
  }

  return (
    trimmed.match(/https:\/\/[^\s"'`]+\.vercel\.app/g)?.pop()?.replace(/[)\],]$/, '') ?? null
  );
}

function vercelDeploy(distDir) {
  const token = vercelToken();
  if (!token) {
    console.error('No Vercel token found. Run `vercel login` or set VERCEL_TOKEN.');
    process.exit(1);
  }

  const args = [
    'deploy',
    '--prod',
    '--yes',
    '--prebuilt',
    '--json',
    '--token',
    token,
    '--scope',
    VERCEL_SCOPE,
  ];

  const result = spawnSync('vercel', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });

  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (combined) console.log(combined);

  if (result.status !== 0) {
    console.error(`\nvercel deploy exited with code ${result.status ?? 'unknown'}`);
    process.exit(result.status || 1);
  }

  const deploymentUrl = parseDeployUrl(combined);
  if (!deploymentUrl) {
    console.error('Could not parse deployment URL from Vercel output.');
    process.exit(1);
  }

  return deploymentUrl;
}

const deployOnly = process.argv.includes('--deploy-only');
if (!deployOnly) {
  run('node scripts/prepare-vercel-output.mjs', { inherit: true });
}

const deploymentUrl = vercelDeploy('dist');
const token = vercelToken();
for (const domain of PRODUCTION_DOMAINS) {
  run(
    `vercel alias set ${deploymentUrl} ${domain} --token "${token}" --scope ${VERCEL_SCOPE}`,
    { inherit: true },
  );
}
for (const domain of PRODUCTION_DOMAINS) {
  console.log(`Production: https://${domain}`);
}
