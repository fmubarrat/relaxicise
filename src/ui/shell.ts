/**
 * The app shell: a sidebar (brand, navigation, full screen) and four sections.
 *   Today     - the plan and Start (no session), the focus dashboard (running), or the summary
 *   Exercises - mode toggles, exercise picture tiles, recovery tiles
 *   Insights  - today's rhythm and reps
 *   Settings  - grouped rows: breaks, sound, heart rate, recovery, privacy
 * On phones the sidebar navigation becomes a bottom tab bar.
 */
import { EXERCISES } from '../exercises/configs';
import type { ExerciseId } from '../exercises/types';
import { REST_ACTIVITIES, type RestId } from '../rest/activities';
import { PATTERNS, type BreathingPattern } from '../rest/breathing';
import { availableExercises, matchPreset, modeExclusion, NUMERIC, PRESETS, type NumericKey } from '../settings/schema';
import { planSession, summaryLine } from '../settings/summary';
import { parseAge, toDraft, validateDraft, type Draft, type Errors, type FieldKey } from '../settings/validate';
import { heartRate } from '../health/heartRate';
import { cautionBpm, lightRange } from '../health/zones';
import { music, TRACK_IDS, TRACKS, type MusicChoice } from '../audio/music';
import { unlockAudio } from './alerts';
import type { AppContext, Screen } from './context';
import type { SessionState } from '../session/machine';
import { brandLockup } from './brand';
import { createFullscreenButton } from './fullscreen';
import { applyTheme, createThemeToggle } from './theme';
import type { ThemeChoice } from '../settings/schema';
import { createFocusView, type View } from './focus';
import { createInsightsView, createSummaryView } from './summary';
import { h, setText, svg, uid } from './dom';
import { icon, type IconName } from './icons';
import { illustration } from './illustrations';

type BoolKey = 'workNoLimit' | 'warningEnabled' | 'snoozeEnabled' | 'chime' | 'officeMode' | 'quietMode' | 'verifyEyesClosed' | 'musicEnabled';
type TabId = 'today' | 'exercises' | 'insights' | 'settings';

const REST_ICONS: Record<RestId, IconName> = { eyeFocus: 'eye', eyesClosed: 'eyeClosed', breathing: 'wind', water: 'droplet' };
const REST_SHORT: Record<RestId, string> = { eyeFocus: 'Look far', eyesClosed: 'Eyes closed', breathing: 'Breathe', water: 'Water' };

const TAB_OF: Record<FieldKey, TabId> = {
  workHours: 'today',
  focusMinutes: 'today',
  breakMinutes: 'today',
  enabledExercises: 'exercises',
  enabledRest: 'exercises',
  repsPerExercise: 'settings',
  exercisesPerBreak: 'settings',
  warningSeconds: 'settings',
  age: 'settings',
};

/** Remembered while the page is open, so returning from a session lands on the same tab. */
let lastTab: TabId = 'today';

function greeting(d = new Date()): string {
  const hr = d.getHours();
  return hr < 5 ? 'Working late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

export function createShellScreen(ctx: AppContext): Screen {
  const draft: Draft = toDraft(ctx.settingsStore.load());
  const errorEls = new Map<FieldKey, HTMLElement>();
  const inputs = new Map<FieldKey, HTMLInputElement>();
  const refreshers: Array<() => void> = [];
  const cleanups: Array<() => void> = [];
  let errors: Errors = {};

  const changed = () => {
    const r = validateDraft(draft);
    errors = r.errors;
    if (r.settings) ctx.settingsStore.save(r.settings);
    refresh();
  };

  // ---- Controls ---------------------------------------------------------------------------
  function stepper(key: NumericKey) {
    const spec = NUMERIC[key];
    const id = uid(key);
    const err = h('p', { class: 'field-error', id: `${id}-err` });
    errorEls.set(key, err);
    const input = h('input', {
      id,
      type: 'number',
      inputmode: spec.integer ? 'numeric' : 'decimal',
      min: spec.min,
      max: spec.max,
      step: spec.step,
      value: draft[key],
      'aria-label': spec.label,
      'aria-describedby': `${id}-err`,
      oninput: () => {
        draft[key] = input.value;
        changed();
      },
    });
    inputs.set(key, input);
    const stepBy = (dir: 1 | -1) => {
      const cur = Number(input.value);
      // From an invalid value a stepper starts at the nearest bound; it never clamps silently.
      let next = Number.isFinite(cur) && input.value.trim() !== '' ? cur + dir * spec.step : dir > 0 ? spec.min : spec.max;
      next = Math.round(next / spec.step) * spec.step;
      if (next < spec.min || next > spec.max) return;
      input.value = String(Number(next.toFixed(2)));
      draft[key] = input.value;
      changed();
    };
    const minus = h('button', { type: 'button', class: 'stepper', 'aria-label': `Decrease ${spec.label.toLowerCase()}`, onclick: () => stepBy(-1) }, icon('minus', 18));
    const plus = h('button', { type: 'button', class: 'stepper', 'aria-label': `Increase ${spec.label.toLowerCase()}`, onclick: () => stepBy(1) }, icon('plus', 18));
    refreshers.push(() => {
      if (input.value !== draft[key]) input.value = draft[key];
      const disabled = (key === 'workHours' && draft.workNoLimit) || (key === 'warningSeconds' && !draft.warningEnabled);
      input.disabled = disabled;
      const n = Number(input.value);
      minus.disabled = disabled || (Number.isFinite(n) && n - spec.step < spec.min - 1e-9);
      plus.disabled = disabled || (Number.isFinite(n) && n + spec.step > spec.max + 1e-9);
      input.setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
    });
    const control = h('div', { class: 'number-row' }, h('div', { class: 'number-input' }, minus, input, plus), spec.unit ? h('span', { class: 'unit', 'aria-hidden': 'true' }, spec.unit) : null);
    return { id, control, err };
  }

  function dial(key: NumericKey, iconName: IconName, label: string, extra?: HTMLElement) {
    const s = stepper(key);
    return h('div', { class: 'dial' }, h('label', { for: s.id, class: 'field-label' }, icon(iconName, 18), label), s.control, extra, s.err);
  }

  function checkbox(key: BoolKey, label: string) {
    const input = h('input', {
      type: 'checkbox',
      checked: draft[key],
      onchange: () => {
        draft[key] = input.checked;
        changed();
      },
    });
    refreshers.push(() => (input.checked = draft[key]));
    return h('label', { class: 'check' }, input, h('span', { class: 'check-label' }, label));
  }

  function switchInput(key: BoolKey, labelId: string, onToggle?: (on: boolean) => void) {
    const input = h('input', {
      type: 'checkbox',
      role: 'switch',
      class: 'switch',
      'aria-labelledby': labelId,
      checked: draft[key],
      onchange: () => {
        draft[key] = input.checked;
        changed();
        onToggle?.(input.checked);
      },
    });
    refreshers.push(() => (input.checked = draft[key]));
    return input;
  }

  /** A settings row: icon + title (+ subtitle) on the left, a control on the right. */
  function row(iconName: IconName, title: string, sub: string | HTMLElement | null, control: HTMLElement | null, opts: { labelFor?: string; titleId?: string; after?: HTMLElement } = {}) {
    const titleEl = opts.labelFor ? h('label', { for: opts.labelFor, class: 'row-title', id: opts.titleId }, title) : h('span', { class: 'row-title', id: opts.titleId }, title);
    return h(
      'div',
      { class: 'row' },
      h('span', { class: 'row-icon' }, icon(iconName, 18)),
      h('div', { class: 'row-text' }, titleEl, sub ? (typeof sub === 'string' ? h('span', { class: 'row-sub' }, sub) : sub) : null, opts.after),
      control ? h('div', { class: 'row-control' }, control) : null,
    );
  }

  function stepperRow(key: NumericKey, iconName: IconName, sub: string | null) {
    const s = stepper(key);
    return row(iconName, NUMERIC[key].label, sub, s.control, { labelFor: s.id, after: s.err });
  }

  function switchRow(key: BoolKey, iconName: IconName, title: string, sub: string | null, onToggle?: (on: boolean) => void) {
    const id = uid('sw');
    return row(iconName, title, sub, switchInput(key, id, onToggle), { titleId: id });
  }

  function modeTile(key: 'officeMode' | 'quietMode', iconName: IconName, title: string, sub: string) {
    const b = h(
      'button',
      {
        type: 'button',
        class: 'mode-tile',
        onclick: () => {
          draft[key] = !draft[key];
          changed();
        },
      },
      icon(iconName, 22),
      h('span', null, h('span', { class: 'tile-title' }, title), h('span', { class: 'tile-sub' }, sub)),
    );
    refreshers.push(() => b.setAttribute('aria-pressed', String(draft[key])));
    return b;
  }

  // ---- Navigation -------------------------------------------------------------------------
  const NAV: Array<{ id: TabId; label: string; icon: IconName }> = [
    { id: 'today', label: 'Today', icon: 'timer' },
    { id: 'exercises', label: 'Exercises', icon: 'grid' },
    { id: 'insights', label: 'Insights', icon: 'chart' },
    { id: 'settings', label: 'Settings', icon: 'gear' },
  ];
  const panels = new Map<TabId, HTMLElement>();
  const navButtons = NAV.map((t) =>
    h('button', { type: 'button', class: 'nav-item', 'data-tab': t.id, onclick: () => selectTab(t.id) }, icon(t.icon, 20), h('span', null, t.label)),
  );
  let insights: View | null = null;
  function selectTab(id: TabId) {
    lastTab = id;
    for (const b of navButtons) {
      if (b.dataset.tab === id) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    for (const [pid, p] of panels) p.hidden = pid !== id;
    if (id === 'insights' && !insights) {
      insights = createInsightsView(ctx);
      insightsHost.replaceChildren(insights.el);
    } else if (id !== 'insights' && insights) {
      insights.destroy();
      insights = null;
      insightsHost.replaceChildren();
    }
    window.scrollTo({ top: 0 });
  }
  const insightsHost = h('div', { class: 'host' });

  // ---- Session tab -------------------------------------------------------------------------
  const presetButtons = [
    ...PRESETS.map((p) =>
      h(
        'button',
        {
          type: 'button',
          class: 'seg',
          'data-preset': p.id,
          onclick: () => {
            draft.focusMinutes = String(p.focusMinutes);
            draft.breakMinutes = String(p.breakMinutes);
            changed();
          },
        },
        p.label,
      ),
    ),
    h('button', { type: 'button', class: 'seg', 'data-preset': 'custom', onclick: () => inputs.get('focusMinutes')?.focus() }, 'Custom'),
  ];
  refreshers.push(() => {
    const active = matchPreset(Number(draft.focusMinutes), Number(draft.breakMinutes));
    for (const b of presetButtons) b.setAttribute('aria-pressed', String(b.dataset.preset === active));
  });

  const heroFocus = h('span', { class: 'hero-num' });
  const heroBreak = h('span', { class: 'hero-num' });
  const heroWork = h('span', { class: 'hero-num' });
  const heroBlocks = h('span', { class: 'hero-num' });
  const heroLine = h('p', { class: 'hero-line', 'aria-live': 'polite' });
  refreshers.push(() => {
    const r = validateDraft({ ...draft, enabledExercises: ['armRaises'], officeMode: false, quietMode: false, enabledRest: ['water'], age: '' });
    const s = r.settings;
    setText(heroFocus, s ? `${s.focusMinutes}m` : '–');
    setText(heroBreak, s ? `${s.breakMinutes}m` : '–');
    setText(heroWork, s ? (s.workNoLimit ? '∞' : `${s.workHours}h`) : '–');
    setText(heroBlocks, s ? (s.workNoLimit ? '∞' : String(planSession(s.workHours * 60, s.focusMinutes, s.breakMinutes).breaks)) : '–');
    setText(heroLine, s ? summaryLine(s, new Date()) : 'Fix the highlighted value to see your plan');
  });

  const startError = h('p', { class: 'field-error hero-error', role: 'alert' });
  const start = h('button', { type: 'button', class: 'btn btn-coral btn-xl', onclick: () => onStart() }, icon('play', 20), 'Start session');

  const heroStat = (num: HTMLElement, label: string) => h('div', { class: 'hero-stat' }, num, h('span', { class: 'hero-label' }, label));
  const hero = h(
    'section',
    { class: 'hero', 'aria-labelledby': 'hero-title' },
    h('p', { class: 'hero-eyebrow' }, `${greeting()} \u00b7 ${new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}`),
    h('h1', { id: 'hero-title', class: 'hero-title' }, 'Work with focus. Move with intention.'),
    h('div', { class: 'hero-stats' }, heroStat(heroFocus, 'Focus'), heroStat(heroBreak, 'Break'), heroStat(heroWork, 'Session'), heroStat(heroBlocks, 'Breaks')),
    heroLine,
    h('div', { class: 'hero-actions' }, start, startError),
  );

  const timing = h(
    'section',
    { class: 'card', 'aria-labelledby': 'h-timing' },
    h('div', { class: 'card-head' }, h('h2', { id: 'h-timing' }, 'Timing'), h('div', { class: 'segmented', role: 'group', 'aria-label': 'Presets' }, presetButtons)),
    h(
      'div',
      { class: 'dials' },
      dial('workHours', 'briefcase', 'Work', checkbox('workNoLimit', 'No limit')),
      dial('focusMinutes', 'target', 'Focus'),
      dial('breakMinutes', 'coffee', 'Break'),
    ),
  );

  const exSub = h('span', { class: 'row-sub' });
  refreshers.push(() => {
    const modes = [draft.officeMode ? 'Office mode' : null, draft.quietMode ? 'Quiet mode' : null].filter(Boolean).join(', ');
    setText(exSub, `${availableExercises(draft).length} of ${EXERCISES.length} in use${modes ? ` · ${modes}` : ''}`);
  });
  const hrSub = h('span', { class: 'row-sub' });
  const musicSwitchId = uid('sw');
  const quick = h(
    'section',
    { class: 'list-card', 'aria-label': 'Session options' },
    h('button', { type: 'button', class: 'row row-link', onclick: () => selectTab('exercises') }, h('span', { class: 'row-icon' }, icon('grid', 18)), h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, 'Exercises'), exSub), icon('chevronDown', 18)),
    row('music', 'Relaxing music in breaks', null, switchInput('musicEnabled', musicSwitchId), { titleId: musicSwitchId }),
    h('button', { type: 'button', class: 'row row-link', onclick: () => selectTab('settings') }, h('span', { class: 'row-icon' }, icon('heartPulse', 18)), h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, 'Heart rate'), hrSub), icon('chevronDown', 18)),
  );

  // ---- Exercises tab -----------------------------------------------------------------------
  const exCount = h('span', { class: 'section-count' });
  refreshers.push(() => setText(exCount, `${availableExercises(draft).length} of ${EXERCISES.length} in use`));
  const exerciseTiles = EXERCISES.map((cfg) => {
    const note = h('span', { class: 'tile-note' });
    const tile = h(
      'button',
      {
        type: 'button',
        class: 'ex-tile',
        onclick: () => {
          draft.enabledExercises = toggle(draft.enabledExercises, cfg.id, !draft.enabledExercises.includes(cfg.id));
          changed();
        },
      },
      h('span', { class: 'tile-check' }, icon('check', 14)),
      svg(illustration(cfg.id, cfg.name).end),
      h('span', { class: 'tile-title' }, cfg.name),
      h('span', { class: 'tile-tags' }, cfg.seatedSafe ? icon('chair', 14) : null, cfg.cardio ? icon('heartPulse', 14) : null),
      note,
    );
    refreshers.push(() => {
      const on = draft.enabledExercises.includes(cfg.id);
      const why = modeExclusion(cfg.id, draft);
      tile.setAttribute('aria-pressed', String(on));
      tile.classList.toggle('is-excluded', Boolean(why));
      setText(note, why ? why.replace('Off in ', 'Off: ') : '');
      tile.setAttribute('aria-label', `${cfg.name}${cfg.seatedSafe ? ', seated' : ''}${cfg.cardio ? ', cardio' : ''}${why ? `, ${why.toLowerCase()}` : ''}`);
    });
    return tile;
  });
  const restTiles = REST_ACTIVITIES.map((r) => {
    const tile = h(
      'button',
      {
        type: 'button',
        class: 'rest-tile',
        title: r.description,
        onclick: () => {
          draft.enabledRest = toggle(draft.enabledRest, r.id, !draft.enabledRest.includes(r.id));
          changed();
        },
      },
      h('span', { class: 'tile-check' }, icon('check', 14)),
      icon(REST_ICONS[r.id], 28),
      h('span', { class: 'tile-title' }, REST_SHORT[r.id]),
    );
    refreshers.push(() => tile.setAttribute('aria-pressed', String(draft.enabledRest.includes(r.id))));
    return tile;
  });
  const errorFor = (key: FieldKey) => {
    const el = h('p', { class: 'field-error', role: 'alert' });
    errorEls.set(key, el);
    return el;
  };

  // ---- Settings tab ------------------------------------------------------------------------
  const ageId = uid('age');
  const ageErr = h('p', { class: 'field-error', id: `${ageId}-err` });
  errorEls.set('age', ageErr);
  const ageInput = h('input', {
    id: ageId,
    type: 'number',
    inputmode: 'numeric',
    class: 'plain-input',
    placeholder: 'Optional',
    min: 10,
    max: 100,
    value: draft.age,
    'aria-describedby': `${ageId}-err`,
    oninput: () => {
      draft.age = ageInput.value;
      changed();
    },
  });
  inputs.set('age', ageInput);
  const hrRange = h('span', { class: 'row-sub' });
  refreshers.push(() => {
    const a = parseAge(draft.age);
    const age = typeof a === 'number' ? a : null;
    const [lo, hi] = lightRange(age);
    setText(hrRange, `Light ${lo}–${hi} bpm · caution above ${cautionBpm(age)} bpm${age ? '' : ' (add your age for a personal range)'}`);
  });

  const hrStatus = h('span', { class: 'row-sub' });
  const hrButton = h('button', { type: 'button', class: 'btn btn-small' });
  const hrError = h('p', { class: 'field-error' });
  hrButton.addEventListener('click', () => {
    if (heartRate.status === 'connected') heartRate.disconnect();
    else void heartRate.connect();
  });
  const renderHr = () => {
    const st = heartRate.status;
    hrButton.hidden = st === 'unsupported';
    hrButton.disabled = st === 'connecting';
    hrButton.replaceChildren(icon('bluetooth', 16), st === 'connected' ? 'Disconnect' : st === 'connecting' ? 'Connecting…' : 'Connect');
    const bpm = heartRate.current();
    const text =
      st === 'unsupported'
        ? 'This browser cannot use Bluetooth. Use Chrome or Edge on desktop or Android.'
        : st === 'connected'
          ? `${heartRate.deviceName}${bpm ? ` · ${bpm} bpm` : ''}`
          : 'Chest straps and watches that broadcast heart rate';
    setText(hrStatus, text);
    setText(hrSub, st === 'connected' ? `Connected${bpm ? ` · ${bpm} bpm` : ''}` : 'Not connected · caution tips on');
    setText(hrError, heartRate.error ?? '');
  };
  cleanups.push(heartRate.on(renderHr));

  const breathName = uid('breath');
  const breathing = h(
    'div',
    { class: 'segmented small', role: 'radiogroup', 'aria-label': 'Breathing pattern' },
    (Object.keys(PATTERNS) as BreathingPattern[]).map((p) => {
      const input = h('input', {
        type: 'radio',
        name: breathName,
        value: p,
        class: 'visually-hidden',
        checked: draft.breathingPattern === p,
        onchange: () => {
          draft.breathingPattern = p;
          changed();
        },
      });
      const lbl = h('label', { class: 'seg' }, input, p === 'box' ? 'Box 4-4-4-4' : '5 in, 5 out');
      refreshers.push(() => lbl.classList.toggle('is-on', draft.breathingPattern === p));
      return lbl;
    }),
  );

  let previewing = false;
  const preview = h('button', { type: 'button', class: 'btn btn-small' });
  const renderPreview = () => preview.replaceChildren(icon(previewing ? 'stop' : 'play', 16), previewing ? 'Stop' : 'Preview');
  // Track picker: Calm, Rain, Ocean, Piano, Lo-fi, or a random track each break.
  const trackGroup = h(
    'div',
    { class: 'track-picker', role: 'radiogroup', 'aria-label': 'Break music' },
    ([...TRACK_IDS, 'shuffle'] as MusicChoice[]).map((id) => {
      const btn = h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: 'track',
          onclick: () => {
            draft.musicTrack = id;
            changed();
            music.setChoice(id);
            if (!previewing) preview.click();
          },
        },
        icon(id === 'shuffle' ? 'shuffle' : 'music', 16),
        id === 'shuffle' ? 'Shuffle' : TRACKS[id].name,
      );
      refreshers.push(() => btn.setAttribute('aria-checked', String(draft.musicTrack === id)));
      return btn;
    }),
  );

  preview.addEventListener('click', () => {
    unlockAudio();
    previewing = !previewing;
    music.setChoice(draft.musicTrack);
    if (previewing) music.start();
    else music.stop();
    renderPreview();
  });
  renderPreview();
  cleanups.push(() => {
    if (previewing) music.stop();
  });

  // Appearance: System / Light / Dark.
  const themeSeg = h(
    'div',
    { class: 'segmented small', role: 'radiogroup', 'aria-label': 'Appearance' },
    (['system', 'light', 'dark'] as ThemeChoice[]).map((t) => {
      const b = h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: 'seg',
          onclick: () => {
            draft.theme = t;
            changed();
            applyTheme(t);
          },
        },
        icon(t === 'system' ? 'gear' : t === 'light' ? 'sun' : 'moon', 14),
        t === 'system' ? ' System' : t === 'light' ? ' Light' : ' Dark',
      );
      refreshers.push(() => {
        b.setAttribute('aria-checked', String(draft.theme === t));
        b.classList.toggle('is-on', draft.theme === t);
      });
      return b;
    }),
  );
  // The sidebar toggle saves settings directly; keep this form in step.
  const onTheme = () => {
    draft.theme = ctx.settingsStore.load().theme;
    refresh();
  };
  document.addEventListener('theme-change', onTheme);
  cleanups.push(() => document.removeEventListener('theme-change', onTheme));

  const group = (title: string, ...rows: HTMLElement[]) => h('section', { class: 'group' }, h('h2', { class: 'group-title' }, title), h('div', { class: 'list-card' }, rows));

  const settingsPanel = [
    group('Appearance', row('moon', 'Theme', 'Follow your system, or choose one', themeSeg)),
    group(
      'Breaks',
      stepperRow('repsPerExercise', 'repeat', 'Arm circles and lunges use half, per side'),
      stepperRow('exercisesPerBreak', 'grid', null),
      (() => {
        const id = uid('sw');
        const s = stepper('warningSeconds');
        return row('bell', 'Warn before a break', null, h('div', { class: 'row-pair' }, s.control, switchInput('warningEnabled', id)), { titleId: id, after: s.err });
      })(),
      switchRow('snoozeEnabled', 'alarm', 'Allow snooze', 'One 2 minute snooze per break'),
    ),
    group(
      'Sound',
      (() => {
        const id = uid('sw');
        return row('music', 'Relaxing music in breaks', 'Generated on this device, no downloads', h('div', { class: 'row-pair' }, preview, switchInput('musicEnabled', id, (on) => !on && previewing && preview.click())), { titleId: id });
      })(),
      h('div', { class: 'row track-row' }, trackGroup),
      switchRow('chime', 'bell', 'Sound when focus ends', 'A bell when a break starts and when the session ends. Rings on time even from another tab.'),
    ),
    group(
      'Heart rate',
      row('bluetooth', 'Heart-rate monitor', hrStatus, hrButton, { after: hrError }),
      row('heartPulse', 'Your age', hrRange, ageInput, { labelFor: ageId, after: ageErr }),
      h(
        'div',
        { class: 'row note-row' },
        h('span', { class: 'row-icon' }, icon('alert', 18)),
        h('p', { class: 'row-sub' }, 'Keep breaks light: you should be able to talk. Stop if you feel dizzy, short of breath or have chest discomfort. Ranges are general estimates, not medical advice.'),
      ),
    ),
    group('Recovery', row('wind', 'Breathing pattern', null, breathing), switchRow('verifyEyesClosed', 'eyeClosed', 'Check eyes are closed', 'Uses the camera during the eyes-closed rest')),
    group(
      'Privacy and safety',
      row('lock', 'Video never leaves this device', 'Reps are counted in the browser. Nothing is recorded or sent.', null),
      row('heart', 'Not medical advice', 'Move gently and skip anything that does not suit you.', null),
      row('info', 'Runs on trust', 'relaxicise covers this tab at break time. It cannot lock your computer.', null),
    ),
  ];

  // ---- Assemble ---------------------------------------------------------------------------
  const mk = (id: TabId, ...children: Array<HTMLElement | HTMLElement[]>) => {
    const p = h('div', { class: 'panel-body', id: `panel-${id}` }, children);
    panels.set(id, p);
    return p;
  };

  const plan = h('div', { class: 'plan' }, hero, timing, quick);
  const todayHost = h('div', { class: 'host' }, plan);
  let todayView: View | null = null;
  let todayKind: 'plan' | 'focus' | 'summary' = 'plan';

  const el = h(
    'div',
    { class: 'shell' },
    h(
      'aside',
      { class: 'sidebar' },
      h('div', { class: 'side-brand' }, brandLockup(30), h('span', { class: 'mobile-theme' }, createThemeToggle(ctx.settingsStore, true))),
      h('nav', { class: 'nav', 'aria-label': 'Sections' }, navButtons),
      h('div', { class: 'side-foot' }, h('p', { class: 'side-note' }, icon('lock', 14), 'Video stays on this device'), createThemeToggle(ctx.settingsStore), createFullscreenButton()),
    ),
    h(
      'main',
      { class: 'main', id: 'main' },
      mk('today', todayHost),
      mk(
        'exercises',
        h('header', { class: 'view-head' }, h('div', null, h('h1', null, 'Exercises'), h('p', { class: 'view-sub' }, exCount))),
        h('div', { class: 'mode-row' }, modeTile('officeMode', 'chair', 'Office mode', 'Seated only'), modeTile('quietMode', 'quiet', 'Quiet mode', 'No jumping')),
        h('div', { class: 'ex-grid', role: 'group', 'aria-label': 'Exercises to include' }, exerciseTiles),
        errorFor('enabledExercises'),
        h('h2', { class: 'section-title' }, 'Recovery after exercises'),
        h('div', { class: 'rest-grid', role: 'group', 'aria-label': 'Recovery activities to include' }, restTiles),
        errorFor('enabledRest'),
      ),
      mk('insights', insightsHost),
      mk('settings', h('header', { class: 'view-head' }, h('div', null, h('h1', null, 'Settings'), h('p', { class: 'view-sub' }, 'Changes apply to your next session'))), h('div', { class: 'settings-cols' }, settingsPanel)),
    ),
  );

  /** Today shows the plan, the live focus dashboard, or the summary, depending on the session. */
  function syncToday(s: SessionState | null) {
    const kind = !s ? 'plan' : s.phase === 'SUMMARY' ? 'summary' : s.phase === 'FOCUS' || s.phase === 'WARNING' ? 'focus' : todayKind;
    if (kind === todayKind && (kind === 'plan' || todayView)) {
      todayView?.update(s);
      return;
    }
    todayView?.destroy();
    todayView = kind === 'focus' ? createFocusView(ctx) : kind === 'summary' ? createSummaryView(ctx) : null;
    todayKind = kind;
    todayHost.replaceChildren(todayView ? todayView.el : plan);
    if (kind !== 'plan') selectTab('today');
  }

  function onStart() {
    const r = validateDraft(draft);
    if (!r.settings) {
      errors = r.errors;
      refresh();
      const first = Object.keys(r.errors)[0] as FieldKey;
      setText(startError, 'Check the highlighted settings first');
      if (first) {
        selectTab(TAB_OF[first]);
        inputs.get(first)?.focus();
      }
      return;
    }
    if (previewing) preview.click();
    ctx.startSession(r.settings);
  }

  function refresh() {
    for (const r of refreshers) r();
    for (const [key, e] of errorEls) setText(e, errors[key] ?? '');
    if (Object.keys(errors).length === 0) setText(startError, '');
    renderHr();
  }

  changed();
  syncToday(ctx.controller.current);
  // With a session running, always open on Today.
  selectTab(ctx.controller.current ? 'today' : lastTab);
  // Refresh the "ends around" time as the clock moves.
  const clockTimer = setInterval(refresh, 30_000);

  return {
    el,
    update: (st: SessionState | null) => syncToday(st),
    destroy() {
      clearInterval(clockTimer);
      todayView?.destroy();
      insights?.destroy();
      for (const c of cleanups) c();
    },
  };
}

function toggle<T extends ExerciseId | RestId>(list: T[], id: T, on: boolean): T[] {
  const without = list.filter((x) => x !== id);
  return on ? [...without, id] : without;
}

