# relaxicise

*Relaxation meets exercise. Work with focus. Move with intention. Return refreshed.*

relaxicise runs timed work sessions in the browser. When a focus block ends, it covers the tab with a break screen. To get past it you do a few exercises, which the camera checks with MediaPipe pose tracking, and then a short rest activity fills the rest of the break.

Everything runs in the browser. There is no backend and no account, and no video leaves the device.

```sh
npm install      # also copies the MediaPipe WASM runtime and downloads the models into public/mediapipe
npm run dev      # http://localhost:5173
npm run dev:lan  # https://<this-pc-ip>:5174 for other devices on the same Wi-Fi (self-signed cert: click through the warning once)
npm test         # unit tests (Vitest)
npm run build    # typecheck + production build in dist/
```

The camera needs HTTPS or `localhost`. If the model download failed during install (for example while offline), run `npm run assets` again.

## How it works

1. **Setup.** You choose work time (the whole session), focus time (work between breaks) and break time (exercises plus rest). Presets are Classic 25/5, Deep work 50/10 and Light 20/3. A summary line under the fields updates as you type. Out-of-range values show an inline error and are never clamped. Settings are saved in `localStorage`.
2. **Focus.** Shows a progress ring and a countdown to the next break. All timing uses absolute timestamps, so a backgrounded tab or a page refresh resumes in the right phase with the right time left. An optional warning banner appears before the break. **Break now** starts a break immediately, which is useful for testing. Focus time can be as short as 1 minute.
3. **Break, exercise phase.** A chime plays, a notification is sent (if you allowed them), the tab title changes and a full-screen overlay appears. The camera is only requested after a plain explanation and a click. For each exercise the overlay shows instructions and a start/end illustration. The camera view always shows the tracked body: the joints the current exercise needs are solid green, and joints that are missing or out of frame show as dashed orange rings. A status pill over the video says what's wrong. Counting begins once the required body parts have been visible for 2 s. If parts go out of frame, a message names them ("Step back so your knees and ankles are in frame") and counting pauses. The camera is released as soon as the last exercise finishes.
4. **Break, rest phase.** Any break time left after the exercises goes to one rest activity: eye focus (20-20-20), eyes closed, breathing, or water. Activities take turns from break to break. If the exercises run past the break time, there is no rest phase.
5. **Summary.** Shows focus time, breaks, reps per exercise, skips, swaps, snoozes and postpones. Every figure is computed from the session's event log.

Enforcement is firm but limited:
- **Snooze:** 2 minutes, once per break. It can be turned off in settings.
- **"I'm in a meeting":** postpones the break by up to 15 minutes, at most twice per session.
- **Skip or swap:** you can always skip or swap an exercise, for accessibility.

All of these show up in the summary.

### Code layout

```
src/session/    pure state machine (machine.ts), config, log-derived summary, persistence, controller
src/exercises/  shared rep counter, 12 exercise configs, thresholds.ts, tracker (position check + counting), picker
src/pose/       camera, MediaPipe loaders (pose + lazy face), frame loop
src/rest/       rest activities, breathing pacer, eyes-closed timer
src/settings/   schema/defaults/presets, validation, summary line, storage
src/ui/         screens (setup, focus, break overlay, rest, summary), illustrations, alerts
src/debug/      ?debug=1 panel
src/config/features.ts   open BRD decisions (e.g. Q-4 manual-confirm fallback, off)
tests/          state machine (fake clock), rep counter, signals on landmark fixtures, rest, settings
```

### Adding an exercise

Adding an exercise takes three small additions:
1. Add its id to `EXERCISE_IDS` in `src/exercises/types.ts`.
2. Add its thresholds to `src/exercises/thresholds.ts`.
3. Add one config object to `src/exercises/configs.ts`. The config holds the name, instructions, `signal(landmarks)` returning one number, direction, required landmarks and the `seatedSafe` / `noJump` / `alternating` / `needsFullBody` flags.

Then add start/end poses in `src/ui/illustrations.ts`. Nothing else in the code is specific to one exercise.

## Music, heart rate and mobile

- **Music:** five tracks are generated live in the browser with Web Audio: Calm, Rain, Ocean, Piano and Lo-fi, plus Shuffle. There are no audio files and no network requests. Music plays during breaks and fades in and out.
  - Break screens have a speaker button (on/off) and a next-track button.
  - **Settings → Sound** has the track picker and a Preview.
- **Sounds:** a bell rings when focus ends, and a different phrase plays when the session finishes. You can switch them off under Settings → Sound. The focus-over bell is scheduled ahead on the audio clock, which background tabs don't throttle, so it rings on time even when you are in another tab. Browsers only allow sound after you've interacted with the page once; starting a session counts.
- **Heart rate:** under **Settings → Heart rate**, **Connect** pairs a Bluetooth heart-rate monitor using the standard Heart Rate Service. This needs Chrome or Edge on desktop or Android; Safari, iOS and Firefox don't support Web Bluetooth.
  - Works with most chest straps (Polar, Garmin, Wahoo) and with watches that can *broadcast heart rate*, such as many Garmin and Polar models.
  - Apple Watch and most Wear OS watches don't broadcast it.
  - Live BPM shows on break screens, with a zone: Resting, Light, Moderate or High.
  - At 85% of your estimated max (220 − age, or 180 if no age is set), a caution appears: slow down, and stop if dizzy, short of breath or with chest discomfort.
  - Peak and average per break appear in the summary.
  - Cardio exercises always show a "keep it light, you should still be able to talk" note, even without a monitor.
  - These are general estimates, not medical advice. Age is optional and stays in this browser.
- **Exercise demo:** during an exercise, an animated stick figure loops through the movement next to the camera. It alternates sides for side-to-side moves. With reduced motion it switches between the two still poses instead.
- **Mobile:** every screen has a phone layout, and setup has a bottom tab bar. The screen stays awake during breaks (Wake Lock). It can be added to the home screen (web app manifest). For other devices on your Wi-Fi, run `npm run dev:lan` and open the HTTPS address it prints.

## Demo video

`npm run demo:video` (with `npm run dev` running) records a captioned 45-second product tour to `demo/relaxicise-demo.mp4`. If you add an AI-generated clip of a person exercising at `demo/character.mp4`, the recorder uses it as the webcam, so pose tracking and rep counting are real. See `demo/README.md` for clip prompts and tips.

## Deploying (Vercel)

It's a static site, so no server is needed. `vercel.json` is included.

1. Push the project to a Git repository (GitHub, GitLab or Bitbucket).
2. On vercel.com, choose **Add New → Project**, import the repo, and keep the detected settings (framework Vite, build `npm run build`, output `dist`).
3. Deploy. Vercel serves it over HTTPS, which the camera requires.

During the build, `npm install` copies the MediaPipe runtime and downloads the two models (about 9 MB) from Google's model storage. `npm run build` stops with an error if they are missing, so a broken build is never deployed.

Before inviting real users, also see **Before a public launch** below.

## Before a public launch

- Add a short privacy page. It should state that no video or personal data leaves the device and that settings live in browser storage.
- Confirm the MediaPipe model licence terms (the model cards list Apache 2.0) and the trademark/domain for "relaxicise".
- Tune rep detection with real people (see below).
- There are no accounts, so history stays in one browser, and nothing is measured (BRD Q-5).

## Tuning thresholds

All rep-detection numbers are in **`src/exercises/thresholds.ts`**.

Each exercise turns a frame into one number, called the signal. Examples are the knee angle, or wrist height relative to the shoulders and nose. Signals are normalised by torso length or shoulder width, so they don't depend on camera distance. The shared counter smooths the signal with an EMA and counts one rep for each full cycle through a hysteresis band:

- `direction: 'down'` (squats, lunges, shrugs, twists, knee-to-elbow): you rest at or above `high`, dip to `low` or below, then come back.
- `direction: 'up'` (everything else): you rest at or below `low`, rise to `high` or above, then come back.
- Values inside the band never change state, so jitter cannot double count. A cycle shorter than `minRepMs` is treated as a bounce and ignored.
- Shrugs and torso twists use a **baseline**: their signal is divided by your own neutral value, captured during the 2 s position hold, so their thresholds are ratios (1.0 = neutral).

To tune an exercise:
1. Open `http://localhost:5173/?debug=1`.
2. Use **Force exercise** to pick the exercise.
3. Start a break and turn on the camera.
4. Watch `signal` and `counter` in the debug panel while you move, then put `low` and `high` comfortably inside the range you actually reach.

Debug mode (`?debug=1`) also offers:
- a skeleton overlay on the camera
- **fast timers**, where minutes run as seconds and hours as minutes, applied to the next session
- **Start break now**
- **Simulate rep** (or press `R`)
- **Continue without camera**, for testing on a machine with no webcam

## Privacy

- The camera is requested only when you click "Turn on camera" during a break. Frames are passed to MediaPipe in memory and are never recorded, stored or transmitted. The stream is stopped as soon as the exercise phase ends, or when you snooze or postpone.
- The MediaPipe runtime and models are served from this app (`public/mediapipe`), so at runtime nothing loads from a third-party host.
- Settings, the current session and a "breaks today" count are stored in `localStorage` only. No personal data is collected.
- **Anonymous visit counting (BRD Q-5, decided: opt-out, privacy-first):** the deployed site uses Vercel Web Analytics.
  - It counts page visits by country, device and referrer.
  - It sets no cookies, stores no IP addresses, and never sends video, reps or session data.
  - It is sent to the site's own domain (`/_vercel/insights`), so there are still no third-party requests.
  - It runs only in production. Users can turn it off under **Settings → Privacy and safety → Anonymous visit count**.
  - To see the numbers: Vercel → project → **Analytics** (enable it there once).

## Known limitations

- **A web page cannot lock your computer.** The break is a full-screen overlay on this tab. Closing the tab or switching windows gets around it, so relaxicise relies on your own commitment.
- **Rep accuracy depends on conditions.** Lighting, camera angle, loose clothing and the distance from the camera all affect it.
  - Squats and lunges use 3D knee angles that include MediaPipe's estimated depth, which is noisier than x and y.
  - Torso twists and chair stand-ups are the weakest exercises from a front camera.
  - Full-body exercises need you to step back far enough for hips, knees and ankles to be in frame.
- Squats and jumping exercises can be awkward in an open office. Use Office mode (seated-safe exercises only) or Quiet mode (no jumping).
- Managed work laptops may block the camera or notifications. Notifications are optional. When the camera is blocked, the overlay explains why and offers a retry, and you can skip the exercise (the skip is logged). A manual "I did the reps" fallback exists behind `FEATURES.manualConfirmFallback`, pending BRD decision Q-4.
- Browsers throttle timers in background tabs. Because timing is timestamp-based, phases change at the correct time, but the overlay and chime only appear once the browser runs the tab again (usually within about a second).
- relaxicise is not medical advice. Move gently, and stop if you feel pain.

## Open items from the BRD/PRD

- **Q-1:** final name.
- **Q-3:** desktop wrapper.
- **Q-4:** manual-confirm fallback. The flag exists and is off.
- **Q-5:** opt-in analytics. There are none.
- **Q-6:** domain.
- **[TO VERIFY]:** the licence terms of the MediaPipe models before external launch. The model cards list Apache 2.0.
- **[TO VERIFY]:** NFR-F performance (15 fps or more, model load under 5 s) on real laptops.
