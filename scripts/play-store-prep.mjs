#!/usr/bin/env node
/**
 * Prepare and trigger a Google Play Store release build (AAB).
 * Usage: npm run build:android
 */
import { execSync } from 'node:child_process';

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit' });
}

console.log('ProteinQuest — Google Play release build');
console.log('Package: com.proteinquest.app');
console.log('Output: Android App Bundle (AAB)\n');

run('eas build --platform android --profile production');
