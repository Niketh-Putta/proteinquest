# ProteinQuest Demo Script (~75 seconds)

Read this narration while screen-recording, or use as captions when editing `proteinquest-demo.webm`.

---

## 0:00 — Open app
**On screen:** Intro carousel or Today home  
**Say:** "ProteinQuest turns protein tracking into a game."

## 0:05 — Skip intro (if shown)
**On screen:** Tap *Skip intro* or advance through 2–3 slides  
**Say:** "Snap meals, hit your daily goal, and grow your dragon."

## 0:12 — Onboarding: pick dragon
**On screen:** Choose Ember, Frost, or Moss → Continue  
**Say:** "Pick your starter dragon — three elements, five evolutions each."

## 0:20 — Set protein goal
**On screen:** Enter stats → see calculated goal → Start tracking  
**Say:** "Set your protein target once. The app does the math."

## 0:28 — Daily dragon pick
**On screen:** "Who are you growing today?" → Lock in for today  
**Say:** "Every morning, lock in one dragon for the day. All XP goes to them."

## 0:36 — Today screen
**On screen:** Progress ring, dragon portrait, streak/XP  
**Say:** "Your dragon lives on Today — progress, streak, and level at a glance."

## 0:42 — Scan a meal
**On screen:** Open Scan → camera frame → capture or upload  
**Say:** "Point your camera at any meal."

## 0:50 — AI analysis
**On screen:** Analyzing animation → protein breakdown  
**Say:** "AI counts the protein in seconds — adjust if needed, then log it."

## 0:58 — Hit goal / celebration
**On screen:** Celebration modal — morph or level-up, +XP, streak  
**Say:** "Hit your goal and your dragon levels up. Five forms unlock as you evolve."

## 1:08 — Back to Today
**On screen:** Updated ring, fed dragon, today's logs  
**Say:** "Come back tomorrow, pick again, and keep the streak alive."

## 1:12 — Trends
**On screen:** Weekly protein chart, streak history  
**Say:** "Trends show your consistency over time."

## 1:18 — End card
**On screen:** `demo/end-card.html` or final frame  
**Say:** "Track protein. Grow your dragon. ProteinQuest."

---

## Automated recording

```bash
# Production (default)
node demo/record-demo.mjs

# Local dev server
APP_URL=http://localhost:8081 node demo/record-demo.mjs
```

Output: `demo/proteinquest-demo.webm` (Playwright viewport recording, ~390×844 mobile).

## Manual recording tips

- Record in portrait (9:16) at 390×844 or iPhone simulator size.
- Keep mouse movement slow; pause 2–3s on key screens.
- If AI scan fails on prod, use library upload with a clear food photo.
- Trim dead time in post; target **60–90 seconds** total.

## Share

- **WebM:** upload to Slack, Discord, X, or convert with `ffmpeg -i demo/proteinquest-demo.webm demo/proteinquest-demo.mp4`
- **Screenshots:** `demo/step-*.png` from the automated run work as a carousel
