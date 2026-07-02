#!/usr/bin/env node
/**
 * Non-interactive iOS credential bootstrap for EAS CI.
 * - Registers ASC API key on the Expo account (from env)
 * - Connects App Store Connect app integration
 * - Creates distribution certificate + provisioning profile when missing
 *
 * Required env:
 *   EXPO_TOKEN
 *   APPLE_ASC_API_KEY_P8 (or EXPO_ASC_API_KEY_PATH)
 *   EXPO_ASC_KEY_ID (default JZ3C87NKB9)
 *   EXPO_ASC_ISSUER_ID (default 75ae36fa-911c-462c-818e-f1bcc4222c24)
 *   EXPO_APPLE_TEAM_ID (default JU9C3N64F8)
 *   EXPO_APPLE_TEAM_TYPE (default COMPANY_OR_ORGANIZATION)
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const PROJECT_ID = '246d88eb-db0c-4937-a681-653a2b7c53fa';
const ACCOUNT_NAME = 'nikethputta1';
const PROJECT_NAME = 'proteinquest';
const BUNDLE_ID = 'com.proteinquest.app';
const ASC_APP_ID = '6781790996';

const KEY_ID = process.env.EXPO_ASC_KEY_ID || process.env.APPLE_ASC_KEY_ID || 'JZ3C87NKB9';
const ISSUER_ID = process.env.EXPO_ASC_ISSUER_ID || '75ae36fa-911c-462c-818e-f1bcc4222c24';
const TEAM_ID = process.env.EXPO_APPLE_TEAM_ID || 'JU9C3N64F8';
const TEAM_TYPE = process.env.EXPO_APPLE_TEAM_TYPE || 'COMPANY_OR_ORGANIZATION';

const { createGraphqlClient } = require('eas-cli/build/commandUtils/context/contextUtils/createGraphqlClient');
const { getOwnerAccountForProjectIdAsync } = require('eas-cli/build/project/projectUtils');
const AppStoreConnectApiKeyQuery = require('eas-cli/build/credentials/ios/api/graphql/queries/AppStoreConnectApiKeyQuery');
const AppStoreConnectApiKeyMutation = require('eas-cli/build/credentials/ios/api/graphql/mutations/AppStoreConnectApiKeyMutation');
const IosGraphql = require('eas-cli/build/credentials/ios/api/GraphqlClient');
const AppStoreApi = require('eas-cli/build/credentials/ios/appstore/AppStoreApi').default;
const { authenticateAsync } = require('eas-cli/build/credentials/ios/appstore/authenticate');
const { AuthenticationMode } = require('eas-cli/build/credentials/ios/appstore/authenticateTypes');
const { createDistributionCertificateAsync: createDistCertOnApple } = require('eas-cli/build/credentials/ios/appstore/distributionCertificate');
const { createProvisioningProfileAsync: createProfileOnApple } = require('eas-cli/build/credentials/ios/appstore/provisioningProfile');
const { ApplePlatform } = require('eas-cli/build/credentials/ios/appstore/constants');
const { IosDistributionType } = require('eas-cli/build/graphql/generated');

function log(step, detail = '') {
  console.log(detail ? `[ios-setup] ${step}: ${detail}` : `[ios-setup] ${step}`);
}

function fail(message) {
  console.error(`[ios-setup] ERROR: ${message}`);
  process.exit(1);
}

function readKeyP8() {
  if (process.env.APPLE_ASC_API_KEY_P8?.trim()) {
    return process.env.APPLE_ASC_API_KEY_P8.trim();
  }
  const keyPath = process.env.EXPO_ASC_API_KEY_PATH;
  if (keyPath && fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8');
  }
  fail('Missing APPLE_ASC_API_KEY_P8 or EXPO_ASC_API_KEY_PATH');
}

async function ensureAscKeyOnExpoAccount(graphqlClient, account, keyP8) {
  const keys = await AppStoreConnectApiKeyQuery.AppStoreConnectApiKeyQuery.getAllForAccountAsync(
    graphqlClient,
    account.name,
  );
  const existing = keys.find((k) => k.keyIdentifier === KEY_ID);
  if (existing) {
    log('ASC key already on Expo account', `${KEY_ID} (${existing.id})`);
    return existing;
  }

  log('Uploading ASC API key to Expo account', KEY_ID);
  const created = await AppStoreConnectApiKeyMutation.AppStoreConnectApiKeyMutation.createAppStoreConnectApiKeyAsync(
    graphqlClient,
    {
      issuerIdentifier: ISSUER_ID,
      keyIdentifier: KEY_ID,
      keyP8,
      name: `CI ${KEY_ID}`,
      roles: null,
      appleTeamId: null,
    },
    account.id,
  );
  log('ASC key uploaded', created.id);
  return created;
}

async function ensureAscAppConnected(expoAscKeyId) {
  try {
    execFileSync(
      'npx',
      [
        'eas-cli',
        'integrations:asc:connect',
        '--non-interactive',
        '--api-key-id',
        KEY_ID,
        '--asc-app-id',
        ASC_APP_ID,
        '--bundle-id',
        BUNDLE_ID,
      ],
      { cwd: ROOT, stdio: 'pipe', env: process.env },
    );
    log('ASC app connected via eas-cli', ASC_APP_ID);
  } catch (err) {
    const out = `${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}${err.message ?? ''}`;
    if (/already connected/i.test(out)) {
      log('ASC app already connected', ASC_APP_ID);
      return;
    }
    log('warning', `ASC app connect skipped (${out.slice(0, 200) || 'unknown error'})`);
  }
}

async function getAppleAuthCtx(keyP8) {
  process.env.EXPO_ASC_API_KEY_PATH = process.env.EXPO_ASC_API_KEY_PATH || path.join(ROOT, 'store', `AuthKey_${KEY_ID}.p8`);
  process.env.EXPO_ASC_KEY_ID = KEY_ID;
  process.env.EXPO_ASC_ISSUER_ID = ISSUER_ID;
  process.env.EXPO_APPLE_TEAM_ID = TEAM_ID;
  process.env.EXPO_APPLE_TEAM_TYPE = TEAM_TYPE;

  if (!fs.existsSync(process.env.EXPO_ASC_API_KEY_PATH)) {
    fs.mkdirSync(path.dirname(process.env.EXPO_ASC_API_KEY_PATH), { recursive: true });
    fs.writeFileSync(process.env.EXPO_ASC_API_KEY_PATH, keyP8);
  }

  return authenticateAsync({
    mode: AuthenticationMode.API_KEY,
    ascApiKey: { keyP8, keyId: KEY_ID, issuerId: ISSUER_ID },
    teamId: TEAM_ID,
    teamType: TEAM_TYPE,
  });
}

async function ensureBuildCredentials(graphqlClient, account, keyP8) {
  const appLookup = {
    account,
    projectName: PROJECT_NAME,
    bundleIdentifier: BUNDLE_ID,
  };

  const existing = await IosGraphql.getIosAppCredentialsWithBuildCredentialsAsync(graphqlClient, appLookup, {
    iosDistributionType: IosDistributionType.AppStore,
  });

  const buildCreds = existing?.iosAppBuildCredentialsList?.[0];
  if (buildCreds?.distributionCertificate && buildCreds?.provisioningProfile) {
    log('iOS build credentials already configured');
    return;
  }

  log('Setting up iOS distribution certificate and provisioning profile');
  const authCtx = await getAppleAuthCtx(keyP8);
  const appleTeam = await IosGraphql.createOrGetExistingAppleTeamAndUpdateNameIfChangedAsync(
    graphqlClient,
    account.id,
    { appleTeamIdentifier: TEAM_ID, appleTeamName: authCtx.team.name },
  );

  let distCertRecord = buildCreds?.distributionCertificate ?? null;
  let distCertForApple = null;

  if (!distCertRecord) {
    const onEas = await IosGraphql.getDistributionCertificatesForAccountAsync(graphqlClient, account);
    distCertRecord = onEas.find((c) => c.appleTeam?.appleTeamIdentifier === TEAM_ID) ?? null;

    if (!distCertRecord) {
      log('Creating distribution certificate on Apple Developer Portal');
      distCertForApple = await createDistCertOnApple(authCtx);
      distCertRecord = await IosGraphql.createDistributionCertificateAsync(graphqlClient, account, {
        certP12: distCertForApple.certP12,
        certPassword: distCertForApple.certPassword,
        certPrivateSigningKey: distCertForApple.certPrivateSigningKey,
        certId: distCertForApple.certId,
        teamId: distCertForApple.teamId,
        teamName: distCertForApple.teamName,
      });
      log('Distribution certificate saved to EAS', distCertRecord.id);
    } else {
      log('Reusing existing EAS distribution certificate', distCertRecord.serialNumber);
    }
  }

  if (!distCertForApple) {
    distCertForApple = {
      certId: distCertRecord.developerPortalIdentifier,
      certP12: distCertRecord.certificateP12,
      certPassword: distCertRecord.certificatePassword,
      distCertSerialNumber: distCertRecord.serialNumber,
      teamId: TEAM_ID,
      teamName: authCtx.team.name,
    };
  }

  let profileRecord = buildCreds?.provisioningProfile ?? null;
  if (!profileRecord) {
    log('Creating App Store provisioning profile on Apple Developer Portal');
    const profileName = `*[expo] ${BUNDLE_ID} AppStore ${new Date().toISOString()}`;
    const appleProfile = await createProfileOnApple(
      authCtx,
      BUNDLE_ID,
      distCertForApple,
      profileName,
      ApplePlatform.IOS,
    );

    const appleAppIdentifier = await IosGraphql.createOrGetExistingAppleAppIdentifierAsync(
      graphqlClient,
      appLookup,
      appleTeam,
    );

    profileRecord = await IosGraphql.createProvisioningProfileAsync(
      graphqlClient,
      { account },
      appleAppIdentifier,
      {
        appleProvisioningProfile: appleProfile.provisioningProfile,
        developerPortalIdentifier: appleProfile.provisioningProfileId,
      },
    );
    log('Provisioning profile saved to EAS', profileRecord.id);
  }

  const appleAppIdentifier = await IosGraphql.createOrGetExistingAppleAppIdentifierAsync(
    graphqlClient,
    appLookup,
    appleTeam,
  );

  await IosGraphql.createOrUpdateIosAppBuildCredentialsAsync(graphqlClient, appLookup, {
    appleTeam,
    appleAppIdentifierId: appleAppIdentifier.id,
    iosDistributionType: IosDistributionType.AppStore,
    appleDistributionCertificateId: distCertRecord.id,
    appleProvisioningProfileId: profileRecord.id,
  });

  log('iOS App Store build credentials assigned');
}

async function main() {
  if (!process.env.EXPO_TOKEN?.trim()) {
    fail('EXPO_TOKEN is required');
  }

  const keyP8 = readKeyP8();
  const graphqlClient = createGraphqlClient({ accessToken: process.env.EXPO_TOKEN.trim() });
  const account = await getOwnerAccountForProjectIdAsync(graphqlClient, PROJECT_ID);

  if (account.name !== ACCOUNT_NAME) {
    log('warning', `Expected account ${ACCOUNT_NAME}, got ${account.name}`);
  }

  const ascKey = await ensureAscKeyOnExpoAccount(graphqlClient, account, keyP8);
  await ensureAscAppConnected(ascKey.id);
  await ensureBuildCredentials(graphqlClient, account, keyP8);

  log('Done — iOS credentials ready for non-interactive EAS build');
}

main().catch((err) => {
  console.error('[ios-setup] Failed:', err?.message || err);
  if (err?.graphQLErrors) {
    console.error(JSON.stringify(err.graphQLErrors, null, 2));
  }
  process.exit(1);
});
