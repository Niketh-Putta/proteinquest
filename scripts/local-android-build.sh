#!/usr/bin/env bash
set -euo pipefail
export ANDROID_HOME=/opt/android-sdk
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
export EXPO_TOKEN="${EXPO_TOKEN:?EXPO_TOKEN required}"
export EAS_BUILD_NO_EXPO_GO_WARNING=true

mkdir -p store
cd /workspace

if [ ! -d "$ANDROID_HOME/cmdline-tools/latest" ]; then
  echo "Installing Android SDK..."
  sudo mkdir -p "$ANDROID_HOME/cmdline-tools"
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/cmdline-tools.zip" https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  sudo unzip -qo "$tmp/cmdline-tools.zip" -d "$tmp/extract"
  sudo mv "$tmp/extract/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi

yes | sdkmanager --licenses >/dev/null
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006"

npx eas-cli build --platform android --profile production --local --non-interactive --output store/proteinquest.aab
echo "Local AAB: store/proteinquest.aab"
