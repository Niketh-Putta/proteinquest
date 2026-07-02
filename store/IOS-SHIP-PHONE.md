# ProteinQuest iOS — phone checklist (Account Holder)

Use **Safari** on iPhone. Sign in as **babup.kishore@gmail.com** (Kishore Putta).

**App Store (live):** https://apps.apple.com/us/app/proteinquest/id6781790996

---

## After CI uploads a build (TestFlight)

1. Open **App Store Connect** → **Apps** → **ProteinQuest**
2. Tap **TestFlight** → wait until build shows **Ready to Test** (not “Processing”)
3. Optional: install via TestFlight and smoke-test paywall + meal scan

---

## Release update to the App Store (v1.0.4+)

Automation (`node scripts/submit-ios-app-store-version.mjs --wait-build`) handles most steps. On phone, verify or finish only if something is red:

### A. App Store tab → version (e.g. 1.0.4)

1. **App Store Connect** → **ProteinQuest** → **App Store** (left) → **iOS App**
2. Open version **1.0.4**
3. Confirm **Build** is selected (build **21** or latest)
4. Confirm **What’s New** text is filled
5. Confirm **Screenshots** show for **6.7" iPhone** and **iPad** (inherited from prior version is OK)

### B. Submit for Review (if not already submitted)

1. Scroll to top → tap **Add for Review** or **Submit for Review**
2. **Export compliance:** No (uses standard encryption only)
3. **Advertising identifier:** No
4. Confirm contact info → **Submit**

### C. After approval → go live

1. When status is **Pending Developer Release**, open the version
2. Tap **Release this Version** (or it auto-releases if set to automatic)

---

## If review rejects

1. Read **Resolution Center** message in App Store Connect
2. Fix in code → push to `main` (CI rebuilds + uploads)
3. Re-run submit script or repeat steps above with new build

---

## Quick links

| Item | URL |
|------|-----|
| App Store Connect | https://appstoreconnect.apple.com |
| TestFlight builds | App → TestFlight |
| EAS builds (nikethputta1) | https://expo.dev/accounts/nikethputta1/projects/proteinquest/builds |
| GitHub iOS CI | https://github.com/Niketh-Putta/proteinquest/actions/workflows/build-ios.yml |

---

## CLI (Mac — no secrets in chat)

```bash
cd ~/proteinlens
export ASC_KEY_ID=U5KW7AP443
export ASC_KEY_PATH=./store/AuthKey_U5KW7AP443.p8
export ASC_ISSUER_ID=75ae36fa-911c-462c-818e-f1bcc4222c24

node scripts/check-ios-ship-status.mjs
node scripts/submit-ios-app-store-version.mjs --wait-build
```
