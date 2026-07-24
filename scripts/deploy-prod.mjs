#!/usr/bin/env node
/**
 * Production ship:
 *  - Expo web app → proteinquest.vercel.app + proteinlens.vercel.app
 *  - Marketing landing → proteinquest.app + www.proteinquest.app
 *
 * Both ship through the linked `proteinquest` Vercel project; aliases keep
 * app and marketing on separate deployments.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_DOMAINS = ['proteinquest.vercel.app', 'proteinlens.vercel.app'];
const MARKETING_DOMAINS = ['proteinquest.app', 'www.proteinquest.app'];
const VERCEL_SCOPE = process.env.VERCEL_SCOPE?.trim() || '';
const REPO_ROOT = process.cwd();

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
      if (url) return url.startsWith('http') ? url : `https://${url}`;
    } catch {
      /* try next line */
    }
  }

  const match = trimmed.match(/https:\/\/[^\s"'`]+\.vercel\.app/g)?.pop()?.replace(/[)\],]$/, '');
  return match ?? null;
}

function vercelArgs(base) {
  const token = vercelToken();
  const args = [...base];
  if (token && process.env.VERCEL_TOKEN?.trim()) {
    args.push('--token', token);
  }
  if (VERCEL_SCOPE) args.push('--scope', VERCEL_SCOPE);
  return args;
}

function ensureVercelAuth() {
  const token = vercelToken();
  if (!token && !process.env.VERCEL_TOKEN?.trim()) {
    // Linked project + local `vercel login` is enough.
  } else if (!token) {
    console.error('No Vercel token found. Run `vercel login` or set VERCEL_TOKEN.');
    process.exit(1);
  }
}

function vercelDeployCommand(args) {
  const result = spawnSync('vercel', vercelArgs(args), {
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

function aliasDomains(deploymentUrl, domains) {
  for (const domain of domains) {
    const aliasArgs = vercelArgs(['alias', 'set', deploymentUrl, domain]);
    const result = spawnSync('vercel', aliasArgs, { encoding: 'utf8', stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
  for (const domain of domains) {
    console.log(`Production: https://${domain}`);
  }
}

ensureVercelAuth();

const appOnly = process.argv.includes('--app-only');
const marketingOnly = process.argv.includes('--marketing-only');

if (!marketingOnly) {
  run('npx expo export --platform web', { inherit: true });
  run('node scripts/prepare-web-export.mjs', { inherit: true });
  // Force dist/ to use the proteinquest project (never the accidental `dist` project).
  const rootProject = JSON.parse(readFileSync(join(REPO_ROOT, '.vercel/project.json'), 'utf8'));
  rmSync(join(REPO_ROOT, 'dist/.vercel'), { recursive: true, force: true });
  mkdirSync(join(REPO_ROOT, 'dist/.vercel'), { recursive: true });
  writeFileSync(
    join(REPO_ROOT, 'dist/.vercel/project.json'),
    `${JSON.stringify({
      projectId: rootProject.projectId,
      orgId: rootProject.orgId,
      projectName: rootProject.projectName,
    })}\n`,
  );
  // Do NOT use --prod for the app: project production domains include proteinquest.app,
  // and --prod would steal the marketing apex onto the Expo build.
  const appUrl = vercelDeployCommand(['deploy', 'dist', '--yes', '--json']);
  aliasDomains(appUrl, APP_DOMAINS);
}

if (!appOnly) {
  run('node scripts/prepare-vercel-output.mjs', { inherit: true });
  // Marketing owns proteinquest.app / www via explicit aliases (and --prod).
  const marketingUrl = vercelDeployCommand(['deploy', '--prod', '--yes', '--prebuilt', '--json']);
  aliasDomains(marketingUrl, MARKETING_DOMAINS);
  try {
    run('node scripts/refresh-og-cache.mjs', { inherit: true });
  } catch {
    console.log('OG refresh checks reported an issue; deployment is still live.');
  }
}
