# Demo video

```sh
npm run dev            # in one terminal
npm run demo:video     # in another: writes demo/relaxicise-demo.mp4 (1280x720, narrated)
```

The recorder (`scripts/demo/record.mjs`) produces a narrated 1280x720 video:
1. An animated intro about the problem: long screen days, stiff shoulders and tired eyes, break reminders dismissed with a click.
2. A captioned tour of the real app: plan, exercises, settings, the focus ring, a movement break, recovery, dark mode and the summary.
3. An end card.

It needs FFmpeg (`winget install --id Gyan.FFmpeg -e`).

**Voice-over:** narration is generated locally with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), an open-source (Apache-2.0) voice model. It downloads about 90 MB the first time, then runs offline.
- Lines are cached in `demo/.voice-cache/`, so only changed lines are regenerated.
- Edit the wording in `SCRIPT` at the top of `record.mjs`.
- Pick a voice with `--voice am_michael` (others: `af_heart`, the default; `bf_emma`; `am_adam`), or use `--no-voice` for a silent video.
- Each scene lasts as long as its line.

**Background music:** an original track is generated for each video, so there is nothing to license.
- It plays soft chords under the problem intro, then the beat drops at "Meet relaxicise".
- It ducks automatically under the voice and fades out on the end card.
- Use `--no-music` to leave it out.
- To add or redo music on an existing video: `node scripts/demo/music.mjs in.mp4 out.mp4 --drop 15 --level 0.55` (`--level` sets the music volume between lines).

**A browser window opens while it records.** That is deliberate: it lets pose tracking use your graphics card, so the skeleton follows in real time (about 30 fps; software rendering only manages a few). Don't click inside it. The default 1280x720 size fits a 1600x900 screen; use `--width` and `--height` for bigger screens.

## With an AI character, so tracking is real

Put a clip of a person exercising at `demo/character.mp4`, then run `npm run demo:video`. Chrome then uses that clip as its webcam, so the app tracks the person and counts reps for real. If the person can't be detected, the recorder says so and simulates the remaining reps so the video still finishes.

Options: `--clip <file>`, `--exercise <id>` (default `armRaises`), `--out <file>`, `--theme dark`.

### Generating the clip

Use any AI video tool (for example Runway, Kling, Google Veo or Sora). What tracks reliably:

- **Front-facing and static**, like a webcam on a desk. Whole upper body in frame; whole body for standing exercises.
- **Plain background, even light**, fitted clothing.
- **Slow, smooth movement.** One or two clean reps are enough: the recorder's camera feed **loops the clip**, so the rep count builds up on its own.
- **Easiest exercises**: `armRaises` (overhead arm raises), `shrugs`, `sideBends`.

**Prompting tips.** Video models describe motion well but handle numbers and timings badly: "six times" or "10 seconds" in the prompt tends to freeze or warp limbs. So:

- Describe the motion and its pace in words ("slowly", "steady rhythm"). Don't give counts.
- Set the length with the tool's **duration setting** (5–10 s), not in the prompt.
- If the tool supports image-to-video, a still of the person in the start pose (arms at their sides) helps keep the body consistent.

Prompt template (arm raises):

> Static front-facing webcam view of an office worker standing in a plain, softly lit room, upper body and hips fully in frame. In a slow, steady rhythm they raise both arms straight up overhead, then lower them back down to their sides. Relaxed expression, realistic, natural light, fixed camera, no camera movement, no cuts.

Variations:

> …in a slow, steady rhythm they lift both shoulders up toward their ears, then let them drop. *(use `--exercise shrugs`)*

> …in a slow, steady rhythm they lean their upper body to one side, return to centre, then lean to the other side. *(use `--exercise sideBends`)*

Negative prompt, if the tool has one: *camera movement, zoom, cuts, extra limbs, distorted hands, cropped head, blurry*.

Then: `npm run demo:video -- --clip demo/character.mp4 --exercise armRaises`

### Before publishing

- Check the AI tool's terms for commercial use, and label the person as AI-generated.
- Add music in any editor (browser audio is not captured). The in-app tracks are generated live, so screen-recording the app with sound (Win + Shift + R, or OBS) is another option.
