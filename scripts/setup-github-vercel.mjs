#!/usr/bin/env node
import { execSync } from 'node:child_process';

const PRODUCTION_DOMAIN = 'proteinquest.app';
const GITHUB_REPO = 'Niketh-Putta/proteinquest';

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

function ensureGitHubRepo() {
  try {
    run(`gh repo view ${GITHUB_REPO}`);
    console.log(`GitHub repo exists: https://github.com/${GITHUB_REPO}`);
  } catch {
    console.log(`Creating GitHub repo ${GITHUB_REPO}…`);
    run('gh repo create proteinquest --private --source=. --remote=origin --push', {
      inherit: true,
    });
    return;
  }

  try {
    run('git remote get-url origin');
  } catch {
    run(`git remote add origin https://github.com/${GITHUB_REPO}.git`);
  }

  run('git push -u origin main', { inherit: true });
}

function syncGitHubSecrets() {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    console.log('\nSkipping GitHub secret sync (set VERCEL_TOKEN to enable CI deploys).');
    return;
  }

  execSync('gh secret set VERCEL_TOKEN', { input: token, stdio: ['pipe', 'inherit', 'inherit'] });

  for (const key of [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_KEY',
    'EXPO_PUBLIC_STRIPE_ENABLED',
    'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
  ]) {
    const value = process.env[key]?.trim();
    if (value) {
      execSync(`gh secret set ${key}`, { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
    }
  }
}

function deployProduction() {
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
      throw error;
    }
  }

  if (!deploymentUrl) {
    console.error('Could not parse deployment URL from Vercel output.');
    process.exit(1);
  }

  run(`vercel alias set ${deploymentUrl} ${PRODUCTION_DOMAIN}`, { inherit: true });
  console.log(`\nProduction: https://${PRODUCTION_DOMAIN}`);
}

try {
  run('gh auth status');
} catch {
  console.error('GitHub CLI is not authenticated. Run: gh auth login -h github.com');
  process.exit(1);
}

try {
  run('vercel whoami', { inherit: true });
} catch {
  console.error('Vercel CLI is not authenticated. Run: vercel login');
  process.exit(1);
}

ensureGitHubRepo();
syncGitHubSecrets();
deployProduction();

try {
  run('vercel git connect --yes', { inherit: true });
} catch {
  console.log('\nOptional: connect Git in the Vercel dashboard for automatic deploys on push.');
}

console.log('\nDone. Open https://proteinquest.vercel.app in an incognito window to see the new intro.');
