import { describe, expect, it } from 'vitest';
import { EXERCISES, getExercise, makeSignal, targetReps, turnTriangle } from '../src/exercises/configs';
import { LM } from '../src/exercises/landmarks';
import { ExerciseTracker, missingParts, visibilityMessage } from '../src/exercises/tracker';
import type { ExerciseId, Landmark } from '../src/exercises/types';
import { standing, transform, withPoints } from './fixtures';

const sig = (id: ExerciseId, pose: Landmark[]) => makeSignal(getExercise(id))(pose)!;
const th = (id: ExerciseId) => getExercise(id).thresholds;

const SQUAT_BOTTOM = () =>
  withPoints(standing(), {
    [LM.leftHip]: { y: 0.62, z: 0.1 }, [LM.rightHip]: { y: 0.62, z: 0.1 },
    [LM.leftKnee]: { y: 0.68, z: -0.12 }, [LM.rightKnee]: { y: 0.68, z: -0.12 },
  });

/** Asserts the rest pose is on the rest side and the active pose on the active side of the band. */
function expectRestAndActive(id: ExerciseId, rest: Landmark[], active: Landmark[]) {
  const cfg = getExercise(id);
  const r = sig(id, rest);
  const a = sig(id, active);
  if (cfg.direction === 'down') {
    expect(r, `${id} rest`).toBeGreaterThanOrEqual(cfg.thresholds.high);
    expect(a, `${id} active`).toBeLessThanOrEqual(cfg.thresholds.low);
  } else {
    expect(r, `${id} rest`).toBeLessThanOrEqual(cfg.thresholds.low);
    expect(a, `${id} active`).toBeGreaterThanOrEqual(cfg.thresholds.high);
  }
}

describe('exercise library', () => {
  it('has 12 exercises with valid thresholds and a signal', () => {
    expect(EXERCISES).toHaveLength(12);
    for (const e of EXERCISES) {
      expect(e.thresholds.low, e.id).toBeLessThan(e.thresholds.high);
      expect(Boolean(e.signal) || Boolean(e.createSignal), e.id).toBe(true);
      expect(e.required.length, e.id).toBeGreaterThan(0);
    }
  });

  it('uses 5 reps (per side) for arm circles and lunges by default', () => {
    expect(targetReps(getExercise('armCircles'), 10)).toBe(5);
    expect(targetReps(getExercise('lunges'), 10)).toBe(5);
    expect(targetReps(getExercise('squats'), 10)).toBe(10);
    expect(targetReps(getExercise('lunges'), 1)).toBe(1);
  });
});

describe('signals on fixtures', () => {
  it('squats: knee angle, independent of camera distance', () => {
    const rest = standing();
    // Front camera: hips drop and move back (+z), knees come toward the lens (-z).
    const bottom = SQUAT_BOTTOM();
    expectRestAndActive('squats', rest, bottom);
    // Knees splaying outward also reads as a bend in 2D alone.
    const splayed = withPoints(standing(), {
      [LM.leftHip]: [0.55, 0.68], [LM.rightHip]: [0.45, 0.68],
      [LM.leftKnee]: [0.62, 0.72], [LM.rightKnee]: [0.38, 0.72],
    });
    expect(sig('squats', splayed)).toBeLessThanOrEqual(th('squats').low);
    expect(sig('squats', transform(bottom, 0.6, 0.1))).toBeCloseTo(sig('squats', bottom), 5);
  });

  it('overhead arm raises', () => {
    const up = withPoints(standing(), {
      [LM.leftElbow]: [0.6, 0.15], [LM.rightElbow]: [0.4, 0.15],
      [LM.leftWrist]: [0.6, 0.05], [LM.rightWrist]: [0.4, 0.05],
    });
    expectRestAndActive('armRaises', standing(), up);
    // One arm up only does not count.
    const oneArm = withPoints(standing(), { [LM.leftWrist]: [0.6, 0.05] });
    expect(sig('armRaises', oneArm)).toBeLessThan(th('armRaises').high);
  });

  it('jumping jacks need arms up AND feet apart', () => {
    const armsUp = { [LM.leftWrist]: [0.66, 0.05] as [number, number], [LM.rightWrist]: [0.34, 0.05] as [number, number] };
    const feetApart = { [LM.leftAnkle]: [0.68, 0.85] as [number, number], [LM.rightAnkle]: [0.32, 0.85] as [number, number] };
    const jack = withPoints(standing(), { ...armsUp, ...feetApart });
    expectRestAndActive('jumpingJacks', standing(), jack);
    expect(sig('jumpingJacks', withPoints(standing(), armsUp))).toBeLessThan(th('jumpingJacks').high);
    expect(sig('jumpingJacks', withPoints(standing(), feetApart))).toBeLessThan(th('jumpingJacks').high);
  });

  it('high knees: either knee counts', () => {
    const leftUp = withPoints(standing(), { [LM.leftKnee]: [0.57, 0.48], [LM.leftAnkle]: [0.55, 0.66] });
    const rightUp = withPoints(standing(), { [LM.rightKnee]: [0.43, 0.48], [LM.rightAnkle]: [0.45, 0.66] });
    expectRestAndActive('highKnees', standing(), leftUp);
    expectRestAndActive('highKnees', standing(), rightUp);
  });

  it('alternating lunges: either front knee', () => {
    const lunge = withPoints(standing(), {
      [LM.leftHip]: { y: 0.6 }, [LM.rightHip]: { y: 0.6 },
      [LM.leftKnee]: { x: 0.57, y: 0.68, z: -0.2 }, [LM.leftAnkle]: { x: 0.57, y: 0.85, z: -0.12 },
    });
    expectRestAndActive('lunges', standing(), lunge);
  });

  it('side bends: shoulder tilt either way', () => {
    const left = withPoints(standing(), { [LM.leftShoulder]: [0.575, 0.29], [LM.rightShoulder]: [0.425, 0.22] });
    const right = withPoints(standing(), { [LM.leftShoulder]: [0.575, 0.22], [LM.rightShoulder]: [0.425, 0.29] });
    expectRestAndActive('sideBends', standing(), left);
    expectRestAndActive('sideBends', standing(), right);
  });

  it('torso twists: apparent shoulder width shrinks relative to the neutral baseline', () => {
    const neutral = sig('torsoTwists', standing());
    const twisted = withPoints(standing(), {
      [LM.leftShoulder]: { x: 0.54, z: -0.05 },
      [LM.rightShoulder]: { x: 0.46, z: 0.05 },
    });
    const ratio = sig('torsoTwists', twisted) / neutral;
    expect(ratio).toBeLessThanOrEqual(th('torsoTwists').low);
    expect(sig('torsoTwists', transform(standing(), 0.7)) / neutral).toBeCloseTo(1, 5);
  });

  it('shoulder shrugs: ear-to-shoulder gap drops relative to baseline', () => {
    const neutral = sig('shrugs', standing());
    const shrug = withPoints(standing(), { [LM.leftShoulder]: [0.58, 0.22], [LM.rightShoulder]: [0.42, 0.22] });
    expect(sig('shrugs', shrug) / neutral).toBeLessThanOrEqual(th('shrugs').low);
    expect(sig('shrugs', transform(standing(), 1.3)) / neutral).toBeCloseTo(1, 5);
  });

  it('arm circles: one full wrist rotation around the shoulder is one cycle', () => {
    const fn = makeSignal(getExercise('armCircles'));
    const values: number[] = [];
    const r = 0.15;
    for (let deg = 0; deg <= 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      values.push(
        fn(withPoints(standing(), {
          [LM.leftWrist]: [0.58 + r * Math.cos(a), 0.25 + r * Math.sin(a)],
          [LM.rightWrist]: [0.42 - r * Math.cos(a), 0.25 + r * Math.sin(a)],
        }))!,
      );
    }
    expect(values[0]).toBeCloseTo(0, 5);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(th('armCircles').high);
    expect(values[values.length - 1]).toBeLessThanOrEqual(th('armCircles').low);
    expect(turnTriangle(720)).toBeCloseTo(0);
    expect(turnTriangle(-180)).toBeCloseTo(180);
  });

  it('cross-body knee to elbow', () => {
    const crunch = withPoints(standing(), { [LM.leftElbow]: [0.48, 0.45], [LM.rightKnee]: [0.47, 0.5] });
    expectRestAndActive('kneeToElbow', standing(), crunch);
  });

  it('chair stand-ups: seated is rest, standing is active', () => {
    const seated = withPoints(standing(), {
      [LM.leftShoulder]: [0.58, 0.4], [LM.rightShoulder]: [0.42, 0.4],
      [LM.leftHip]: [0.55, 0.62], [LM.rightHip]: [0.45, 0.62],
      [LM.leftKnee]: [0.56, 0.64], [LM.rightKnee]: [0.44, 0.64],
      [LM.leftAnkle]: [0.56, 0.85], [LM.rightAnkle]: [0.44, 0.85],
    });
    // Seated from the front, the 2D knee angle can look straight: the hip term must dominate.
    expectRestAndActive('chairStands', seated, standing());
  });

  it('forward fold', () => {
    const fold = withPoints(standing(), {
      [LM.leftShoulder]: [0.56, 0.52], [LM.rightShoulder]: [0.44, 0.52],
      [LM.leftWrist]: [0.56, 0.72], [LM.rightWrist]: [0.44, 0.72],
      [LM.leftHip]: [0.58, 0.44], [LM.rightHip]: [0.42, 0.44],
    });
    // Shoulders forward of the hips (toward the camera) show up as x offset in a 2D projection.
    const folded = withPoints(fold, { [LM.leftShoulder]: [0.75, 0.5], [LM.rightShoulder]: [0.61, 0.5] });
    expectRestAndActive('forwardFold', standing(), folded);
  });
});

describe('visibility', () => {
  it('reports missing body parts in head-to-toe order with a specific message', () => {
    const pose = withPoints(standing(), { [LM.leftKnee]: { visibility: 0.1 }, [LM.rightAnkle]: { y: 1.2 }, [LM.leftHip]: { visibility: 0.2 } });
    const missing = missingParts(pose, getExercise('squats').required, 0.5);
    expect(missing).toEqual(['hips', 'knees', 'ankles']);
    expect(visibilityMessage(missing, false)).toBe('Step back so your hips, knees and ankles are in frame');
    expect(visibilityMessage(['wrists'], false)).toBe('Move so your wrists are in frame');
    expect(visibilityMessage([], true)).toMatch(/Step into the frame/);
  });
});

describe('off-frame hands and position grace', () => {
  it('arm raises: hands above the top of the frame still count as in position', () => {
    const raised = withPoints(standing(), { [LM.leftWrist]: { x: 0.6, y: -0.08, visibility: 0.2 }, [LM.rightWrist]: { x: 0.4, y: -0.08, visibility: 0.2 } });
    const cfg = getExercise('armRaises');
    expect(missingParts(raised, cfg.required, 0.5, cfg.offFrameOk)).toEqual([]);
    // Squats has no such allowance: an off-frame ankle is still missing.
    const sq = getExercise('squats');
    expect(missingParts(withPoints(standing(), { [LM.leftAnkle]: { y: 1.2 } }), sq.required, 0.5, sq.offFrameOk)).toEqual(['ankles']);
  });

  it('brief visibility drop-outs do not restart the 2 s hold; a sustained loss does', () => {
    const tr = new ExerciseTracker(getExercise('squats'), 3);
    const gone = withPoints(standing(), { [LM.leftAnkle]: { visibility: 0 } });
    let t = 0;
    for (; t < 1000; t += 50) tr.update(standing(), t);
    for (let i = 0; i < 6; i++, t += 50) tr.update(gone, t); // 300 ms drop-out
    for (; t < 2200; t += 50) tr.update(standing(), t);
    expect(tr.stage).toBe('counting');

    const tr2 = new ExerciseTracker(getExercise('squats'), 3);
    t = 0;
    for (; t < 1000; t += 50) tr2.update(standing(), t);
    for (let i = 0; i < 20; i++, t += 50) tr2.update(gone, t); // 1 s loss
    for (let i = 0; i < 10; i++, t += 50) tr2.update(standing(), t);
    expect(tr2.stage).toBe('position');
  });
});

describe('ExerciseTracker', () => {
  const squatBottom = SQUAT_BOTTOM();

  it('requires a 2 s hold in position, then counts reps to the target', () => {
    const tr = new ExerciseTracker(getExercise('squats'), 2);
    let t = 0;
    for (; t < 1900; t += 50) expect(tr.update(standing(), t).stage).toBe('position');
    // A sustained loss of visibility (longer than the grace period) resets the hold.
    let f = tr.update(null, t);
    for (let i = 0; i < 15; i++) f = tr.update(null, (t += 50));
    expect(f.holdProgress).toBe(0);
    for (let i = 0; i <= 40; i++, t += 50) tr.update(standing(), t);
    expect(tr.stage).toBe('counting');
    for (let i = 0; i < 5; i++, t += 50) tr.update(standing(), t);

    const rep = () => {
      for (let i = 0; i < 20; i++, t += 50) tr.update(squatBottom, t);
      for (let i = 0; i < 20; i++, t += 50) tr.update(standing(), t);
    };
    rep();
    expect(tr.reps).toBe(1);
    rep();
    expect(tr.reps).toBe(2);
    expect(tr.stage).toBe('done');
  });

  it('does not count while required landmarks are hidden', () => {
    const tr = new ExerciseTracker(getExercise('squats'), 5, 0);
    let t = 0;
    tr.update(standing(), t);
    const hidden = withPoints(squatBottom, { [LM.leftAnkle]: { visibility: 0 } });
    for (let i = 0; i < 12; i++, t += 50) {
      const f = tr.update(hidden, t);
      expect(f.message).toMatch(/ankles/);
    }
    for (let i = 0; i < 12; i++, t += 50) tr.update(standing(), t);
    expect(tr.reps).toBe(0);
  });

  it('simulated reps (debug) work without a camera', () => {
    const tr = new ExerciseTracker(getExercise('armRaises'), 2);
    tr.simulateRep();
    tr.simulateRep();
    tr.simulateRep();
    expect(tr.reps).toBe(2);
    expect(tr.stage).toBe('done');
  });
});
