# Product Requirements Document: Recess

| | |
|---|---|
| **Working title** | Recess |
| **Version** | 0.1 Draft |
| **Companion** | BRD.md |
| **Audience** | Claude Code / developers building v1 |

Priorities use MoSCoW. Every requirement has acceptance criteria (AC). Numbers marked *proposed* are tunable defaults.

---

## 1. Product overview

Recess runs timed work sessions in the browser. When a focus interval ends, a blocking overlay requires camera-verified exercises (MediaPipe pose tracking), followed by a short rest activity. Everything runs client-side. No backend, no accounts, no video leaves the device.

## 2. Tech stack and architecture

- Vite + TypeScript, vanilla (no UI framework unless strongly justified)
- `@mediapipe/tasks-vision`: PoseLandmarker (lite model), GPU delegate with CPU fallback, VIDEO mode via `requestAnimationFrame`. FaceLandmarker lazy-loaded only if eyes-closed verification is enabled.
- Vitest for unit tests
- Timers use timestamp deltas (`Date.now` / `performance.now`), never tick counting
- Session state persisted to localStorage (start time, phase, phase end time) so a refresh resumes correctly

Suggested modules (propose the final file structure before building):

```
src/
  session/     state machine, timers, persistence, snooze/postpone
  pose/        landmarker loader, camera, frame loop
  exercises/   shared rep counter, exercise configs, thresholds config
  rest/        rest activities (eye focus, eyes closed, breathing, water)
  ui/          screens: setup, focus, warning, break overlay, rest, summary
  settings/    schema, defaults, validation, storage
  debug/       ?debug=1 tools
tests/
```

## 3. Timing model

| Setting | Default | Range | Meaning |
|---|---|---|---|
| Work time | 4 h | 15 min to 12 h, or No limit | Total session length. When it elapses the session ends with a summary; a break in progress is allowed to finish |
| Focus time | 30 min | 5 to 120 min | Work between breaks |
| Break time | 3 min | 0 to 30 min | Total length of each break |

Break structure: **exercise phase** (camera on, reps counted) then **rest phase** (camera off) filling the remaining break time. If exercises overrun the break time there is no rest phase. Break time of 0 means exercise only.

Presets (one-click chips): Classic 25/5, Deep work 50/10, Light 20/3, Custom. Editing any field switches to Custom.

Other settings: reps per exercise (default 10), exercises per break (1 to 3, default 2), pre-break warning (default 30 s, optional), snooze (2 min, once per break, can be disabled), meeting postpone (up to 15 min, max 2 per session), Office mode, Quiet mode, enabled exercises, enabled rest activities.

## 4. Functional requirements

### FR-1 Session setup (Must)
- FR-1.1 Start screen shows the three timing fields with unit labels, preset chips, number inputs with steppers (not sliders), exercise and rest selection, mode toggles.
  AC: all settings editable; invalid values show inline errors and are never silently clamped.
- FR-1.2 A derived summary line updates live, e.g. "8 focus blocks, about 8 breaks, ends around 6:40 PM".
  AC: updates on every change; correct for No-limit (shows "no end time").
- FR-1.3 Settings persist in localStorage and reload on next visit.
- FR-1.4 Start screen states plainly that all processing is local and no video leaves the browser, and shows a "not medical advice, stop if you feel pain" notice.
- FR-1.5 Notification permission is requested when the session starts, not at break time.
  AC: app works fully if permission is denied.

### FR-2 Focus state (Must)
- FR-2.1 Shows time left in the current focus block, total work time left, breaks completed today, and an "End session" link. Camera is off.
  AC: countdown stays accurate after the tab is backgrounded for 10 minutes (timestamp-based).
- FR-2.2 Session state survives a page refresh.
  AC: refreshing during focus, break or rest resumes in the correct phase with correct remaining time.

### FR-3 Break trigger (Must)
- FR-3.1 Optional pre-break warning: notification plus subtle banner before the break (default 30 s).
- FR-3.2 At focus end: soft chime, browser Notification (if permitted), `document.title` changes (e.g. "Time to move"), full-screen overlay blocks the UI.
  AC: overlay is reachable by keyboard only inside its own controls; title restores after the break.
- FR-3.3 Overlay blocks interaction with the work UI until the break completes (or snooze/postpone is used).

### FR-4 Exercise phase (Must)
- FR-4.1 Camera is requested at break start (not earlier), with a plain explanation first.
- FR-4.2 "Get in position" check: required body parts visible, held for 2 s, before counting starts.
- FR-4.3 Exercises run in sequence with a live count ("4 / 10") and a linear progress bar. Camera shows mirrored in a plain bordered frame beside the counter.
- FR-4.4 If required landmarks are not visible, show a specific message ("Step back so your hips and knees are in frame") and do not count.
- FR-4.5 Camera stream is released immediately when the exercise phase ends.
  AC: no active camera indicator after the phase ends.
- FR-4.6 Errors (permission denied, no camera, model load failure) show a clear message and a retry button. Offer a manual-confirm fallback only if enabled by decision Q-4 in the BRD.
- FR-4.7 Each exercise shows instructions and a flat SVG line illustration (start and end positions) before it begins.

### FR-5 Exercise engine (Must)
Do not hardcode squats. Adding an exercise must mean adding one config object.

Each config defines: `id`, display name, instruction text, `signal(landmarks)` returning ONE normalised number per frame (an angle, or a distance normalised by torso length so it is independent of camera distance), low/high thresholds with hysteresis, rep direction, minimum rep duration, required landmarks and visibility threshold, flags `needsFullBody`, `seatedSafe`, `noJump`, `alternating` (each side = 1 rep).

All exercises share ONE rep-counter state machine: EMA-smoothed signal, crosses low threshold, crosses high threshold, rep counted. A minimum rep duration (~0.8 s default) prevents bouncing from counting. Thresholds live in one config file.

| # | Exercise | Signal | Notes |
|---|---|---|---|
| 1 | Squats | Hip-knee-ankle angle, average of both legs (standing > ~160°, bottom < ~100°) | Full body |
| 2 | Overhead arm raises | Wrists above nose, then below shoulders | Upper body, seated-safe |
| 3 | Jumping jacks | Wrists above head AND ankle distance > ~1.5x shoulder width, then together | Full body, jump |
| 4 | High knees | Knee y rises above hip y, alternating | Full body, jump |
| 5 | Alternating lunges | Front knee angle < ~100°, alternating | Full body |
| 6 | Side bends | Shoulder-line tilt or nose x-offset from hip midpoint, normalised, alternating | Upper body, seated-safe |
| 7 | Standing torso twists | Shoulder-to-shoulder horizontal distance shrinks plus shoulder z-depth difference, alternating | Weak from front camera |
| 8 | Shoulder shrugs | Normalised ear-to-shoulder distance drops, then returns | Upper body, seated-safe |
| 9 | Arm circles | Accumulated wrist angle around shoulder; 1 rep = 360° | Upper body, seated-safe |
| 10 | Cross-body knee-to-elbow | Elbow to opposite knee distance (normalised) below threshold, alternating | Full body |
| 11 | Chair stand-ups | Hip y relative to knee y plus knee angle | Seated-safe alternative to squats |
| 12 | Forward fold / toe touch | Wrists drop below knee level while shoulder-hip-knee angle closes | Full body |

Optional extras: calf raises, seated leg extensions (side view), seated neck rolls.

AC (engine): the shared counter, fed synthetic signals, counts exactly one rep per full cycle, ignores jitter inside the hysteresis band, and ignores cycles shorter than the minimum rep duration.

### FR-6 Break composition and rest phase (Must / Should)
- FR-6.1 Each break picks N exercises (setting) at random from the enabled set, never the same exercise twice in a row. Default 10 reps; 5 for arm circles and lunges (per side).
- FR-6.2 Office mode = seated-safe exercises only. Quiet mode = no jumping exercises.
- FR-6.3 After exercises, remaining break time is filled with ONE rest activity from the enabled list (or rotate). Timer shows remaining break time throughout.
  - Eye focus (20-20-20): "Look at something far away", 20 s. Camera off.
  - Eyes closed (Should): 20-30 s; optional verification via FaceLandmarker blendshapes (`eyeBlinkLeft/Right` above ~0.5 sustained), lazy-loaded; if eyes open early, pause the countdown with a gentle prompt, never punish; skippable if the camera is unavailable.
  - Breathing: box 4-4-4-4 or 5 in / 5 out; flat single-colour circle or line synced to pace, phase word as text ("In", "Hold", "Out"); with reduced motion show text and a numeric count only. Camera off.
  - Water: one line, "Done" button, no tracking.
- FR-6.4 A rest activity is skippable once per break.
- FR-6.5 No health claims in any copy.
  AC: break with break time 3 min and exercises taking 1 min shows a rest phase of the remaining 2 min; exercises taking longer than 3 min show no rest phase.

### FR-7 Snooze and postpone (Must)
- FR-7.1 "Snooze 2 min": once per break, visible count; can be disabled in settings.
- FR-7.2 "I'm in a meeting" postpone: up to 15 min, max 2 per session.
- FR-7.3 Snooze and postpone usage appears in the summary.
  AC: snooze button is disabled after use in the same break; postpone is refused after 2 uses with a clear message.

### FR-8 Session summary (Must)
- Shown when work time elapses (after any in-progress break) or the user ends the session: total focus time, breaks taken, exercises and reps done, snoozes and postpones used.
  AC: figures match the logged session events exactly.

### FR-9 Debug mode (Must)
`?debug=1`: skeleton overlay, live signal value and state, exercise dropdown to force one exercise, key to simulate a rep, and a "fast timers" toggle (focus time in seconds) so a full session can be tested quickly.

## 5. Non-functional requirements

**NFR-P Privacy and security:** no video stored or transmitted; no network calls at runtime except loading the app and its own assets; camera released immediately after exercises; no personal data collected.

**NFR-F Performance (proposed):** pose inference at 15 fps or higher on a typical laptop; rep feedback visible within 200 ms of the movement completing; model load under 5 s on broadband **[TO VERIFY]**.

**NFR-R Reliability:** timer drift under 1 s per hour including backgrounded tabs; refresh resume; graceful handling of camera and model failures.

**NFR-A Accessibility:** WCAG 2.1 AA target; full keyboard operation; visible focus states; sufficient contrast; `prefers-reduced-motion` respected; a way to skip or substitute an exercise a user cannot perform (counted in the summary, never hidden).

**NFR-C Compatibility:** current Chromium browsers, Safari and Firefox; HTTPS or localhost for camera.

**NFR-M Maintainability:** exercises are config-driven; thresholds in one file; session logic, pose logic and UI in separate modules.

## 6. Design requirements

Must NOT look AI-generated or "vibe coded". Avoid: neon colours, glowing outlines or shadows, gradient backgrounds, glassmorphism, emoji as icons, purple/cyan palettes, pill-heavy UI, hacker-style dark mode.

Aim for calm, editorial, utilitarian, like a well-made productivity tool or clinic signage:
- Warm off-white background (`#F5F3EE`), near-black text (`#1C1C1A`), ONE muted accent (deep green or terracotta) used sparingly
- Flat surfaces, 1px neutral borders, 4 to 6 px radius, no decorative shadows
- Inter or system UI stack; tabular numerals for timers and counters; large confident numbers; generous whitespace; left-aligned layouts
- Settings screen: clean form with labelled number inputs and steppers (not sliders), unit labels, derived summary line
- Break overlay: big rep counter on one side, mirrored camera in a plain bordered frame on the other, thin linear progress bar; no confetti; a subtle fade between states only
- `prefers-color-scheme` with a considered dark variant (not inverted colours); `prefers-reduced-motion` respected
- Illustrations: flat SVG line drawings in the accent colour; no emoji

## 7. Session state machine

```
IDLE -> FOCUS -> [WARNING] -> BREAK_EXERCISE -> BREAK_REST -> FOCUS ... -> SUMMARY
                      |             |
                   SNOOZE        POSTPONE  (both return to FOCUS for the delay, then re-trigger)
```

Transitions to cover in tests: focus to warning to exercise to rest to focus; snooze (once per break); postpone (max 2); work-time expiry mid-focus (end session) and mid-break (finish break first); refresh resume in every phase.

## 8. Testing requirements

- Session state machine: all transitions above, using a fake clock
- Shared rep counter: synthetic signals (clean cycle, jitter, too-fast bounce, partial cycle)
- Each exercise's `signal()` on hand-built landmark fixtures
- Rest activity picker and eyes-closed pause logic
- Settings validation (ranges, inline errors, derived summary line)

## 9. Deliverables

- Runs with `npm install && npm run dev`
- Modules separated as in section 2; thresholds in one config file
- README: how it works, how to tune thresholds, known limitations (lighting, camera angle, loose clothing, cannot truly lock the computer)
- Final step: run the app in debug mode with fast timers, verify one full session cycle and rep counting, and report anything that could not be verified

## 10. Build order (suggested for Claude Code)

1. Project scaffold, settings schema and start screen with validation and derived summary
2. Session state machine with fake-clock tests; focus screen and persistence
3. Camera + PoseLandmarker pipeline with debug overlay
4. Shared rep counter and squat config; test with simulated signals
5. Break overlay, get-in-position check, progress UI
6. Remaining 11 exercises, one at a time, each with fixtures
7. Rest phase activities and settings
8. Snooze, postpone, summary
9. Visual design pass, dark variant, reduced motion, accessibility audit
10. README and final verification run

## 11. Out of scope for v1

Desktop wrapper, browser extension, accounts, cloud sync, team features, mobile app, any health claims. See BRD section 4.
