// ─────────────────────────────────────────────────────────────────
//  PostureAI — app.js
//  TensorFlow.js MoveNet + FSM-based rep counting
//  Algorithms inspired by yakupzengin/fitness-trainer-pose-estimation
// ─────────────────────────────────────────────────────────────────

// ─── MoveNet keypoint indices (mirrors MediaPipe landmark order) ─
const KP = {
  NOSE: 0, LEFT_EYE: 1, RIGHT_EYE: 2,
  LEFT_EAR: 3, RIGHT_EAR: 4,
  LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7, RIGHT_ELBOW: 8,
  LEFT_WRIST: 9, RIGHT_WRIST: 10,
  LEFT_HIP: 11, RIGHT_HIP: 12,
  LEFT_KNEE: 13, RIGHT_KNEE: 14,
  LEFT_ANKLE: 15, RIGHT_ANKLE: 16,
};

// ─── Skeleton connections for full-body drawing ──────────────────
const SKELETON = [
  [KP.LEFT_SHOULDER,  KP.RIGHT_SHOULDER],
  [KP.LEFT_SHOULDER,  KP.LEFT_ELBOW],
  [KP.LEFT_ELBOW,     KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
  [KP.RIGHT_ELBOW,    KP.RIGHT_WRIST],
  [KP.LEFT_SHOULDER,  KP.LEFT_HIP],
  [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
  [KP.LEFT_HIP,       KP.RIGHT_HIP],
  [KP.LEFT_HIP,       KP.LEFT_KNEE],
  [KP.LEFT_KNEE,      KP.LEFT_ANKLE],
  [KP.RIGHT_HIP,      KP.RIGHT_KNEE],
  [KP.RIGHT_KNEE,     KP.RIGHT_ANKLE],
  [KP.NOSE,           KP.LEFT_EYE],
  [KP.NOSE,           KP.RIGHT_EYE],
  [KP.LEFT_EYE,       KP.LEFT_EAR],
  [KP.RIGHT_EYE,      KP.RIGHT_EAR],
];

// ─── Geometry helpers ────────────────────────────────────────────

/** Angle at point B in the triplet A–B–C, in degrees (0–180). */
function angleDeg(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot  = ba.x * bc.x + ba.y * bc.y;
  const magA = Math.hypot(ba.x, ba.y);
  const magC = Math.hypot(bc.x, bc.y);
  if (magA === 0 || magC === 0) return 180;
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / (magA * magC)))) * (180 / Math.PI));
}

/** Safely get a keypoint above a confidence threshold. */
function kp(keypoints, idx, minConf = 0.25) {
  const p = keypoints[idx];
  return (p && p.score >= minConf) ? p : null;
}

// ─── Angle Smoothing Buffer ───────────────────────────────────────
class AngleSmoother {
  constructor(window = 3) {
    this.window = window;
    this.buffers = {};
  }
  smooth(key, value) {
    if (value === undefined || value === null) return value;
    if (!this.buffers[key]) this.buffers[key] = [];
    this.buffers[key].push(value);
    if (this.buffers[key].length > this.window) this.buffers[key].shift();
    const sum = this.buffers[key].reduce((a, b) => a + b, 0);
    return Math.round(sum / this.buffers[key].length);
  }
  reset() { this.buffers = {}; }
}

// ─── FSM-based Rep Counter ────────────────────────────────────────
// Mirrors base_exercise.py update_counter() / update_state() logic
class RepCounter {
  constructor(states, triggerState, fromState, minRepMs = 800) {
    this.states      = states;       // ordered list [{name, test(angles)}, ...]
    this.triggerState = triggerState; // state that increments counter
    this.fromState    = fromState;    // must come FROM this state
    this.minRepMs    = minRepMs;
    this.current     = 'start';
    this.prev        = null;
    this.count       = 0;
    this.lastRepTime = 0;
  }

  update(angles) {
    // Evaluate FSM: first matching state wins
    for (const s of this.states) {
      if (s.test(angles)) {
        if (s.name !== this.current) {
          this.prev    = this.current;
          this.current = s.name;
        }
        break;
      }
    }

    let counted = false;
    if (
      this.current === this.triggerState &&
      this.prev    === this.fromState &&
      (Date.now() - this.lastRepTime) >= this.minRepMs
    ) {
      this.count++;
      this.lastRepTime = Date.now();
      counted = true;
      this.prev = null; // prevent double count
    }
    return counted;
  }

  reset() {
    this.current = 'start';
    this.prev    = null;
    this.count   = 0;
    this.lastRepTime = 0;
  }
}

// Bilateral rep counter (left + right arms counted independently)
class BilateralRepCounter {
  constructor(states, triggerState, fromState, minRepMs = 800) {
    this.left  = new RepCounter(states, triggerState, fromState, minRepMs);
    this.right = new RepCounter(states, triggerState, fromState, minRepMs);
    this.count = 0;
  }
  update(leftAngle, rightAngle) {
    const angles = { angle: leftAngle };
    const lCounted = this.left.update(angles);
    angles.angle = rightAngle;
    const rCounted = this.right.update(angles);
    if (lCounted) this.count++;
    if (rCounted) this.count++;
    return lCounted || rCounted;
  }
  reset() { this.left.reset(); this.right.reset(); this.count = 0; }
  get current() { return this.left.current; }
}

// ─── Exercise Definitions ─────────────────────────────────────────
// Thresholds & FSM states derived from the reference YAML definitions
// (squat.yaml, push_up.yaml, bicep_curl.yaml, lunge.yaml, plank.yaml, etc.)

const EXERCISES = {

  // ── Squat ──────────────────────────────────────────────────────
  // primary angle: shoulder–hip–knee (body-leg angle)
  // states: start > 165 | descent 90–165 | ascent (bottom) ≤ 90
  // counter: trigger=ascent from=descent
  squat: {
    name: 'Squat', icon: '🏋️',
    description: 'Lower body compound. Targets quads, glutes, hamstrings.',
    steps: [
      'Stand feet shoulder-width apart, toes slightly out',
      'Keep chest up and spine neutral throughout',
      'Descend by pushing hips back, bending knees',
      'Lower until thighs are parallel (~90° knee angle)',
      'Drive through heels back to standing',
    ],
    type: 'standard',
    makeCounter() {
      return new RepCounter([
        { name: 'ascent',  test: a => a.primary <= 90  },
        { name: 'descent', test: a => a.primary > 90 && a.primary <= 165 },
        { name: 'start',   test: a => a.primary > 165  },
      ], 'ascent', 'descent', 800);
    },
    compute(kps, smooth) {
      const ls = kp(kps, KP.LEFT_SHOULDER), lh = kp(kps, KP.LEFT_HIP),  lk = kp(kps, KP.LEFT_KNEE);
      const rs = kp(kps, KP.RIGHT_SHOULDER),rh = kp(kps, KP.RIGHT_HIP), rk = kp(kps, KP.RIGHT_KNEE);
      const la = kp(kps, KP.LEFT_ANKLE),    ra = kp(kps, KP.RIGHT_ANKLE);
      const primary   = (ls && lh && lk) ? smooth.smooth('sq_L', angleDeg(ls, lh, lk)) : undefined;
      const rightSide = (rs && rh && rk) ? smooth.smooth('sq_R', angleDeg(rs, rh, rk)) : undefined;
      const lKnee  = (lh && lk && la)   ? smooth.smooth('sq_lKnee', angleDeg(lh, lk, la)) : undefined;
      const rKnee  = (rh && rk && ra)   ? smooth.smooth('sq_rKnee', angleDeg(rh, rk, ra)) : undefined;
      return { primary, rightSide, lKnee, rKnee };
    },
    feedback(angles, kps) {
      const msgs = [];
      if (angles.lKnee !== undefined && angles.rKnee !== undefined) {
        if (Math.abs(angles.lKnee - angles.rKnee) > 20) msgs.push({ text: 'Keep knees balanced — bend both legs evenly', sev: 'warning' });
      }
      if (angles.primary !== undefined && angles.primary < 50) msgs.push({ text: 'Chest up — keep posture upright!', sev: 'error' });
      return msgs;
    },
    angleDisplay() {
      return [
        { label: 'Body Angle (L)', key: 'primary',   good: [70, 110], warn: [55, 140] },
        { label: 'Body Angle (R)', key: 'rightSide', good: [70, 110], warn: [55, 140] },
        { label: 'Knee (L)',       key: 'lKnee',     good: [70, 110], warn: [55, 140] },
        { label: 'Knee (R)',       key: 'rKnee',     good: [70, 110], warn: [55, 140] },
      ];
    },
    highlightKPs: [KP.LEFT_SHOULDER, KP.LEFT_HIP, KP.LEFT_KNEE, KP.RIGHT_SHOULDER, KP.RIGHT_HIP, KP.RIGHT_KNEE],
  },

  // ── Push-Up ────────────────────────────────────────────────────
  // primary angle: shoulder–elbow–wrist
  // states: start > 150 | descent 70–150 | ascent (bottom) ≤ 70
  // counter: trigger=ascent from=descent
  pushup: {
    name: 'Push-Up', icon: '💪',
    description: 'Upper body push. Targets chest, triceps, shoulders.',
    steps: [
      'Start in high plank — hands just outside shoulders',
      'Keep body in a straight line from head to heels',
      'Lower chest toward floor, elbows at ~45° from body',
      'Push back up until arms fully extended',
      'Maintain tight core — no sagging hips',
    ],
    type: 'standard',
    makeCounter() {
      return new RepCounter([
        { name: 'ascent',  test: a => a.primary <= 70  },
        { name: 'descent', test: a => a.primary > 70 && a.primary <= 150 },
        { name: 'start',   test: a => a.primary > 150 },
      ], 'ascent', 'descent', 1000);
    },
    compute(kps, smooth) {
      const ls = kp(kps, KP.LEFT_SHOULDER), le = kp(kps, KP.LEFT_ELBOW),  lw = kp(kps, KP.LEFT_WRIST);
      const rs = kp(kps, KP.RIGHT_SHOULDER),re = kp(kps, KP.RIGHT_ELBOW), rw = kp(kps, KP.RIGHT_WRIST);
      const lh = kp(kps, KP.LEFT_HIP),      rh = kp(kps, KP.RIGHT_HIP);
      const lk = kp(kps, KP.LEFT_KNEE),     rk = kp(kps, KP.RIGHT_KNEE);
      const primary  = (ls && le && lw) ? smooth.smooth('pu_L', angleDeg(ls, le, lw)) : undefined;
      const rightArm = (rs && re && rw) ? smooth.smooth('pu_R', angleDeg(rs, re, rw)) : undefined;
      const lBody = (ls && lh && lk) ? smooth.smooth('pu_lBody', angleDeg(ls, lh, lk)) : undefined;
      const rBody = (rs && rh && rk) ? smooth.smooth('pu_rBody', angleDeg(rs, rh, rk)) : undefined;
      return { primary, rightArm, lBody, rBody };
    },
    feedback(angles) {
      const msgs = [];
      if (angles.lBody !== undefined && angles.lBody < 140) msgs.push({ text: 'Hips sagging — tighten your core!', sev: 'error' });
      if (angles.rBody !== undefined && angles.rBody < 140) msgs.push({ text: 'Hips sagging — tighten your core!', sev: 'error' });
      if (angles.primary !== undefined && angles.rightArm !== undefined) {
        if (Math.abs(angles.primary - angles.rightArm) > 25) msgs.push({ text: 'Push evenly — keep both arms level', sev: 'warning' });
      }
      return msgs;
    },
    angleDisplay() {
      return [
        { label: 'Elbow (L)', key: 'primary',  good: [60, 100], warn: [40, 130] },
        { label: 'Elbow (R)', key: 'rightArm', good: [60, 100], warn: [40, 130] },
        { label: 'Body (L)',  key: 'lBody',    good: [160, 180], warn: [145, 180] },
        { label: 'Body (R)',  key: 'rBody',    good: [160, 180], warn: [145, 180] },
      ];
    },
    highlightKPs: [KP.LEFT_SHOULDER, KP.LEFT_ELBOW, KP.LEFT_WRIST, KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  },

  // ── Plank ─────────────────────────────────────────────────────
  // type: duration — count time in 'hold' state
  // body_line: shoulder–hip–ankle ≥ 165 = holding
  plank: {
    name: 'Plank', icon: '🧘',
    description: 'Isometric core hold. Hold for time with perfect body line.',
    steps: [
      'Forearms flat, elbows directly under shoulders',
      'Extend legs back — weight on toes',
      'Straight line from head to heels (body_line ≥ 165°)',
      'Engage core & glutes; do NOT let hips rise or drop',
      'Keep neck neutral, gaze down toward floor',
    ],
    type: 'duration',
    holdStart: null,
    holdSeconds: 0,
    compute(kps, smooth) {
      const ls = kp(kps, KP.LEFT_SHOULDER), lh = kp(kps, KP.LEFT_HIP), la = kp(kps, KP.RIGHT_ANKLE);
      const rs = kp(kps, KP.RIGHT_SHOULDER),rh = kp(kps, KP.RIGHT_HIP),ra = kp(kps, KP.RIGHT_ANKLE);
      const lk = kp(kps, KP.LEFT_KNEE), rk = kp(kps, KP.RIGHT_KNEE);
      const bodyLine  = (ls && lh && la) ? smooth.smooth('pl_body', angleDeg(ls, lh, la)) : undefined;
      const rBodyLine = (rs && rh && ra) ? smooth.smooth('pl_rbody', angleDeg(rs, rh, ra)) : undefined;
      return { bodyLine, rBodyLine };
    },
    feedback(angles) {
      const msgs = [];
      const bl = angles.bodyLine;
      if (bl === undefined) return msgs;
      if (bl >= 170 && bl <= 185) msgs.push({ text: '✓ Perfect plank — hold it!', sev: 'good' });
      else if (bl > 185)          msgs.push({ text: 'Hips too high — lower them down', sev: 'warning' });
      else if (bl < 165)          msgs.push({ text: 'Hips drooping — squeeze your core!', sev: 'error' });
      return msgs;
    },
    getState(angles) {
      const bl = angles.bodyLine;
      if (bl === undefined) return 'rest';
      if (bl >= 165) return 'hold';
      if (bl >= 140) return 'setup';
      return 'rest';
    },
    angleDisplay() {
      return [
        { label: 'Body Line (L)', key: 'bodyLine',  good: [165, 185], warn: [145, 190] },
        { label: 'Body Line (R)', key: 'rBodyLine', good: [165, 185], warn: [145, 190] },
      ];
    },
    highlightKPs: [KP.LEFT_SHOULDER, KP.LEFT_HIP, KP.LEFT_ANKLE, KP.RIGHT_SHOULDER, KP.RIGHT_HIP, KP.RIGHT_ANKLE],
  },

  // ── Shoulder Press ─────────────────────────────────────────────
  // primary: hip–shoulder–elbow (shoulder angle when pressing)
  // states: start (arms at shoulder) ≤ 110 | press 110–155 | top ≥ 155
  shoulderpress: {
    name: 'Shoulder Press', icon: '🏆',
    description: 'Overhead press. Targets deltoids and triceps.',
    steps: [
      'Hold dumbbells at shoulder height, palms forward',
      'Keep core tight — avoid arching lower back',
      'Press directly overhead until arms are extended',
      'Lower with control back to shoulder level',
      'Elbows slightly in front of body at the start',
    ],
    type: 'standard',
    makeCounter() {
      return new RepCounter([
        { name: 'top',     test: a => a.primary >= 155 },
        { name: 'press',   test: a => a.primary >= 110 && a.primary < 155 },
        { name: 'start',   test: a => a.primary < 110  },
      ], 'top', 'press', 800);
    },
    compute(kps, smooth) {
      const ls = kp(kps, KP.LEFT_SHOULDER), le = kp(kps, KP.LEFT_ELBOW), lw = kp(kps, KP.LEFT_WRIST);
      const rs = kp(kps, KP.RIGHT_SHOULDER),re = kp(kps, KP.RIGHT_ELBOW),rw = kp(kps, KP.RIGHT_WRIST);
      const lh = kp(kps, KP.LEFT_HIP),      rh = kp(kps, KP.RIGHT_HIP);
      const primary  = (ls && le && lw) ? smooth.smooth('sp_L', angleDeg(ls, le, lw)) : undefined;
      const rightArm = (rs && re && rw) ? smooth.smooth('sp_R', angleDeg(rs, re, rw)) : undefined;
      const lShoulder = (lh && ls && le) ? smooth.smooth('sp_lSh', angleDeg(lh, ls, le)) : undefined;
      const rShoulder = (rh && rs && re) ? smooth.smooth('sp_rSh', angleDeg(rh, rs, re)) : undefined;
      return { primary, rightArm, lShoulder, rShoulder };
    },
    feedback(angles) {
      const msgs = [];
      if (angles.primary !== undefined && angles.rightArm !== undefined) {
        if (Math.abs(angles.primary - angles.rightArm) > 25) msgs.push({ text: 'Press evenly — lift both arms together', sev: 'warning' });
      }
      return msgs;
    },
    angleDisplay() {
      return [
        { label: 'Elbow (L)',    key: 'primary',    good: [150, 180], warn: [120, 180] },
        { label: 'Elbow (R)',    key: 'rightArm',   good: [150, 180], warn: [120, 180] },
        { label: 'Shoulder (L)', key: 'lShoulder',  good: [80, 130],  warn: [60, 150]  },
        { label: 'Shoulder (R)', key: 'rShoulder',  good: [80, 130],  warn: [60, 150]  },
      ];
    },
    highlightKPs: [KP.LEFT_SHOULDER, KP.LEFT_ELBOW, KP.LEFT_WRIST, KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  },

  // ── Bicep Curl (bilateral) ─────────────────────────────────────
  // primary: shoulder–elbow–wrist
  // states: down > 150 | curl 50–150 | flex ≤ 50
  // counter: trigger=flex from=curl   (bilateral — each arm counted)
  bicepscurl: {
    name: 'Bicep Curl', icon: '💥',
    description: 'Isolation curl. Targets biceps. Each arm counted separately.',
    steps: [
      'Stand upright, dumbbells at sides, palms forward',
      'Pin upper arms to sides — do NOT swing elbows',
      'Curl up, squeezing bicep at the top (≤ 50°)',
      'Lower slowly to full extension (≥ 150°)',
      'Avoid swinging torso to generate momentum',
    ],
    type: 'bilateral',
    makeCounter() {
      const states = [
        { name: 'flex', test: a => a.angle <= 50  },
        { name: 'curl', test: a => a.angle > 50 && a.angle <= 150 },
        { name: 'down', test: a => a.angle > 150  },
      ];
      return new BilateralRepCounter(states, 'flex', 'curl', 800);
    },
    compute(kps, smooth) {
      const ls = kp(kps, KP.LEFT_SHOULDER),  le = kp(kps, KP.LEFT_ELBOW),  lw = kp(kps, KP.LEFT_WRIST);
      const rs = kp(kps, KP.RIGHT_SHOULDER), re = kp(kps, KP.RIGHT_ELBOW), rw = kp(kps, KP.RIGHT_WRIST);
      const lh = kp(kps, KP.LEFT_HIP), rh = kp(kps, KP.RIGHT_HIP);
      const leftAngle  = (ls && le && lw) ? smooth.smooth('bc_L', angleDeg(ls, le, lw)) : undefined;
      const rightAngle = (rs && re && rw) ? smooth.smooth('bc_R', angleDeg(rs, re, rw)) : undefined;
      const lShoulder = (lh && ls && le) ? smooth.smooth('bc_lsh', angleDeg(lh, ls, le)) : undefined;
      const rShoulder = (rh && rs && re) ? smooth.smooth('bc_rsh', angleDeg(rh, rs, re)) : undefined;
      return { leftAngle, rightAngle, primary: leftAngle, lShoulder, rShoulder }; // primary for FSM compat
    },
    feedback(angles) {
      const msgs = [];
      if (angles.leftAngle !== undefined && angles.rightAngle !== undefined) {
        if (Math.abs(angles.leftAngle - angles.rightAngle) > 20) msgs.push({ text: 'Curl both arms evenly to the same height', sev: 'warning' });
      }
      if (angles.lShoulder !== undefined && angles.lShoulder > 30) msgs.push({ text: 'Keep left elbow tucked close to your body', sev: 'error' });
      if (angles.rShoulder !== undefined && angles.rShoulder > 30) msgs.push({ text: 'Keep right elbow tucked close to your body', sev: 'error' });
      return msgs;
    },
    angleDisplay() {
      return [
        { label: 'Elbow (L)', key: 'leftAngle',  good: [30, 60],  warn: [20, 80] },
        { label: 'Elbow (R)', key: 'rightAngle', good: [30, 60],  warn: [20, 80] },
        { label: 'Shldr (L)', key: 'lShoulder', good: [0, 20], warn: [20, 30] },
        { label: 'Shldr (R)', key: 'rShoulder', good: [0, 20], warn: [20, 30] },
      ];
    },
    highlightKPs: [KP.LEFT_SHOULDER, KP.LEFT_ELBOW, KP.LEFT_WRIST, KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  },
};

// ─── Determine joint color from angle + exercise definition ──────
function jointColor(exerciseKey, angleKey, value) {
  const ex = EXERCISES[exerciseKey];
  const def = ex.angleDisplay().find(d => d.key === angleKey);
  if (!def || value === undefined) return '#6366f1';
  const [gl, gh] = def.good;
  const [wl, wh] = def.warn;
  if (value >= gl && value <= gh) return '#22c55e';
  if (value >= wl && value <= wh) return '#eab308';
  return '#ef4444';
}

function angleScore(exerciseKey, angleKey, value) {
  const ex = EXERCISES[exerciseKey];
  const def = ex.angleDisplay().find(d => d.key === angleKey);
  if (!def || value === undefined) return 'neutral';
  const [gl, gh] = def.good;
  const [wl, wh] = def.warn;
  if (value >= gl && value <= gh) return 'good';
  if (value >= wl && value <= wh) return 'warn';
  return 'bad';
}

// ─── App State ───────────────────────────────────────────────────
const state = {
  detector:   null,
  running:    false,
  currentEx:  'squat',
  counter:    null,     // RepCounter or BilateralRepCounter
  smoother:   new AngleSmoother(3),
  reps: 0, goodReps: 0, badReps: 0,
  badRepImages: [],
  repHistory: [],
  currentFormScores: [],
  animFrame: null,
  plankHoldStart: null, // for duration exercises
  plankHoldSecs: 0,
  sessionStart: null,   // timestamp when camera started
};

// ─── Session Persistence ─────────────────────────────────────────
async function saveSession() {
  if (state.reps === 0 && state.plankHoldSecs === 0) return; // nothing to save

  const total   = state.goodReps + state.badReps;
  const formPct = total > 0 ? Math.round((state.goodReps / total) * 100) : 0;
  const session = {
    id:           Date.now().toString(),
    date:         new Date().toISOString(),
    exercise:     state.currentEx,
    exerciseName: EXERCISES[state.currentEx].name,
    reps:         state.reps,
    goodReps:     state.goodReps,
    badReps:      state.badReps,
    formScore:    formPct,
    repHistory:   [...state.repHistory],
    durationSecs: state.sessionStart ? Math.round((Date.now() - state.sessionStart) / 1000) : 0,
    plankHoldSecs: state.plankHoldSecs,
  };

  // Try backend first, fall back to localStorage
  if (window.API_ONLINE) {
    try {
      await SessionsAPI.save(session);
      return; // saved to server — done
    } catch (e) {
      console.warn('Failed to save session to backend, using localStorage:', e);
    }
  }

  // localStorage fallback
  const user    = JSON.parse(localStorage.getItem('aligno_current') || 'null');
  const userId  = user ? user.id : 'guest';
  const key     = `aligno_sessions_${userId}`;
  const sessions = JSON.parse(localStorage.getItem(key) || '[]');
  sessions.push(session);
  localStorage.setItem(key, JSON.stringify(sessions));
}

// ─── DOM refs ────────────────────────────────────────────────────
const video          = document.getElementById('video');
const canvas         = document.getElementById('canvas');
const ctx            = canvas.getContext('2d');
const btnStart       = document.getElementById('btn-start');
const btnReset       = document.getElementById('btn-reset');
const noCamMsg       = document.getElementById('no-camera-msg');
const feedbackMain   = document.getElementById('feedback-main');
const feedbackAngles = document.getElementById('feedback-angles');
const repFlash       = document.getElementById('rep-flash');
const statReps       = document.getElementById('stat-reps');
const statScore      = document.getElementById('stat-score');
const statGood       = document.getElementById('stat-good');
const statBad        = document.getElementById('stat-bad');
const repHistoryEl   = document.getElementById('rep-history');
const angleBars      = document.getElementById('angle-bars');
const guideSteps     = document.getElementById('guide-steps');
const exNameEl       = document.getElementById('current-exercise-name');

// ─── Load TF MoveNet model ───────────────────────────────────────
async function loadModel() {
  feedbackMain.className = 'warn';
  feedbackMain.textContent = '⏳ Loading AI model…';
  try {
    state.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER, // THUNDER = more accurate
        enableSmoothing: true,
        minPoseScore: 0.25,
      }
    );
    feedbackMain.textContent = '';
    feedbackMain.className   = '';
  } catch (e) {
    feedbackMain.className   = 'error';
    feedbackMain.textContent = '❌ Model load failed: ' + e.message;
    throw e;
  }
}

// ─── Camera ──────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise(r => { video.onloadeddata = r; });
    video.style.display = 'block';
    noCamMsg.style.display = 'none';
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    return true;
  } catch (e) {
    feedbackMain.className   = 'error';
    feedbackMain.textContent = '❌ Camera denied: ' + e.message;
    return false;
  }
}

function stopCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  video.style.display    = 'none';
  noCamMsg.style.display = 'flex';
  if (state.animFrame) cancelAnimationFrame(state.animFrame);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ─── Detection Loop ──────────────────────────────────────────────
async function detectLoop() {
  if (!state.running) return;

  if (video.readyState >= 2 && state.detector) {
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      const poses = await state.detector.estimatePoses(video);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (poses && poses.length > 0) {
        processFrame(poses[0].keypoints);
      } else {
        feedbackMain.className   = 'warn';
        feedbackMain.textContent = '👤 No person detected — step into frame';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } catch (_) { /* skip bad frame */ }
  }

  state.animFrame = requestAnimationFrame(detectLoop);
}

// ─── Per-frame Processing ─────────────────────────────────────────
function processFrame(keypoints) {
  const ex      = EXERCISES[state.currentEx];
  const angles  = ex.compute(keypoints, state.smoother);
  const fbMsgs  = ex.feedback(angles, keypoints);

  // ── Draw skeleton + highlighted joints ──
  drawSkeleton(keypoints, ex, angles);

  // ── Rep counting (FSM) ──
  if (ex.type === 'standard' || ex.type === 'bilateral') {
    let counted = false;
    if (ex.type === 'bilateral') {
      counted = state.counter.update(angles.leftAngle, angles.rightAngle);
    } else {
      counted = state.counter.update(angles);
    }

    if (counted) {
      const repScore = fbMsgs.length === 0 ? 'good' : fbMsgs.some(m => m.sev === 'error' || m.sev === 'warning') ? 'bad' : 'fair';
      state.reps++;
      state.repHistory.push(repScore);
      if (repScore === 'good') {
        state.goodReps++;
      } else {
        state.badReps++;
        const cvs = document.getElementById('canvas');
        const vid = document.getElementById('video');
        if (cvs && vid) {
           const tempCvs = document.createElement('canvas');
           tempCvs.width = cvs.width;
           tempCvs.height = cvs.height;
           const tCtx = tempCvs.getContext('2d');
           tCtx.drawImage(vid, 0, 0, tempCvs.width, tempCvs.height);
           tCtx.drawImage(cvs, 0, 0);
           const dataUrl = tempCvs.toDataURL('image/jpeg', 0.6);
           state.badRepImages.push({ rep: state.reps, img: dataUrl, msgs: fbMsgs.map(m=>m.text).join(', ') });
        }
      }
      flashRep(state.reps);
      updateStats();
      if (typeof Voice !== 'undefined') Voice.repCounted(state.reps, repScore, fbMsgs);
    }

    updateFeedbackDisplay(fbMsgs, state.counter);

  } else if (ex.type === 'duration') {
    // Plank hold timer
    const plankState = ex.getState(angles);
    if (plankState === 'hold') {
      if (!state.plankHoldStart) state.plankHoldStart = Date.now();
      state.plankHoldSecs = Math.round((Date.now() - state.plankHoldStart) / 1000);
    } else {
      state.plankHoldStart = null;
      state.plankHoldSecs  = 0;
    }
    const durMsg = plankState === 'hold'
      ? [{ text: `🧘 Holding: ${state.plankHoldSecs}s`, sev: 'good' }]
      : [{ text: 'Get into plank position', sev: 'warn' }];
    updateFeedbackDisplay([...fbMsgs.filter(m => m.sev !== 'good'), ...durMsg], null);
  }

  updateAngleBars(ex, angles);
  showAngleText(ex, angles);
  if (typeof Voice !== 'undefined') Voice.formFeedback(fbMsgs);
}

// ─── Drawing ─────────────────────────────────────────────────────
function drawSkeleton(keypoints, ex, angles) {
  // Build a color map for highlighted keypoints
  const colorMap = {};
  ex.angleDisplay().forEach(ad => {
    const v = angles[ad.key];
    const color = v !== undefined ? jointColorFromDef(ad, v) : '#6366f1';
    // Map angle keys to KP indices
    const kpIdxMap = getKPsForAngleKey(ad.key, ex);
    kpIdxMap.forEach(idx => { colorMap[idx] = color; });
  });

  // Draw bones
  SKELETON.forEach(([i, j]) => {
    const a = kp(keypoints, i, 0.25);
    const b = kp(keypoints, j, 0.25);
    if (!a || !b) return;

    // Highlight exercise-specific bones
    const isHL = ex.highlightKPs.includes(i) && ex.highlightKPs.includes(j);
    const cA = colorMap[i] || (isHL ? '#6366f1' : 'rgba(99,102,241,0.35)');
    const cB = colorMap[j] || (isHL ? '#6366f1' : 'rgba(99,102,241,0.35)');

    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, cA);
    grad.addColorStop(1, cB);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth   = isHL ? 4 : 2;
    ctx.lineCap     = 'round';
    ctx.stroke();
  });

  // Draw joints
  keypoints.forEach((p, idx) => {
    if (!p || p.score < 0.25) return;
    const isHL  = ex.highlightKPs.includes(idx);
    const color = colorMap[idx] || (isHL ? '#6366f1' : 'rgba(99,102,241,0.4)');
    const r     = isHL ? 6 : 4;

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth   = isHL ? 2 : 1;
    ctx.stroke();
  });

  // Draw angle values on canvas near key joints
  drawAngleLabels(keypoints, ex, angles);
}

function drawAngleLabels(keypoints, ex, angles) {
  const labelMap = {
    primary:    [KP.LEFT_KNEE,  KP.LEFT_ELBOW,  KP.LEFT_HIP,   KP.LEFT_ELBOW],
    rightSide:  [KP.RIGHT_KNEE, KP.RIGHT_ELBOW, KP.RIGHT_HIP,  KP.RIGHT_ELBOW],
    lKnee:      [KP.LEFT_KNEE],
    rKnee:      [KP.RIGHT_KNEE],
    rightArm:   [KP.RIGHT_ELBOW],
    leftAngle:  [KP.LEFT_ELBOW],
    rightAngle: [KP.RIGHT_ELBOW],
    lBody:      [KP.LEFT_HIP],
    rBody:      [KP.RIGHT_HIP],
    bodyLine:   [KP.LEFT_HIP],
    backLeg:    [KP.RIGHT_KNEE],
    torso:      [KP.LEFT_HIP],
    lShoulder:  [KP.LEFT_SHOULDER],
    rShoulder:  [KP.RIGHT_SHOULDER],
  };

  ex.angleDisplay().forEach(ad => {
    const v = angles[ad.key];
    if (v === undefined) return;
    const idxArr = labelMap[ad.key] || [];
    if (!idxArr.length) return;
    const joint = kp(keypoints, idxArr[0], 0.25);
    if (!joint) return;
    const color = jointColorFromDef(ad, v);
    ctx.font      = 'bold 13px monospace';
    ctx.fillStyle = color;
    ctx.strokeStyle = 'black';
    ctx.lineWidth   = 3;
    ctx.strokeText(`${v}°`, joint.x + 8, joint.y - 8);
    ctx.fillText  (`${v}°`, joint.x + 8, joint.y - 8);
  });
}

function jointColorFromDef(def, value) {
  const [gl, gh] = def.good;
  const [wl, wh] = def.warn;
  if (value >= gl && value <= gh) return '#22c55e';
  if (value >= wl && value <= wh) return '#eab308';
  return '#ef4444';
}

// Maps angle key names to relevant keypoint indices
function getKPsForAngleKey(key) {
  return ({
    primary:    [KP.LEFT_KNEE,  KP.LEFT_ELBOW,  KP.LEFT_HIP],
    rightSide:  [KP.RIGHT_KNEE, KP.RIGHT_HIP],
    lKnee:      [KP.LEFT_KNEE],
    rKnee:      [KP.RIGHT_KNEE],
    rightArm:   [KP.RIGHT_ELBOW],
    leftAngle:  [KP.LEFT_ELBOW],
    rightAngle: [KP.RIGHT_ELBOW],
    lBody:      [KP.LEFT_HIP, KP.LEFT_SHOULDER],
    rBody:      [KP.RIGHT_HIP, KP.RIGHT_SHOULDER],
    bodyLine:   [KP.LEFT_HIP, KP.LEFT_SHOULDER, KP.LEFT_ANKLE],
    rBodyLine:  [KP.RIGHT_HIP, KP.RIGHT_SHOULDER],
    backLeg:    [KP.RIGHT_KNEE],
    torso:      [KP.LEFT_HIP, KP.LEFT_SHOULDER],
    lShoulder:  [KP.LEFT_SHOULDER],
    rShoulder:  [KP.RIGHT_SHOULDER],
  })[key] || [];
}

// ─── Feedback Display ─────────────────────────────────────────────
function updateFeedbackDisplay(msgs, counter) {
  const stateLabels = {
    start: '🔵 Ready — begin your rep',
    descent: '🔽 Descending…',
    ascent:  '✅ Bottom reached — drive up!',
    bottom:  '✅ Bottom position',
    press:   '🔼 Pressing up…',
    top:     '✅ Fully extended!',
    curl:    '🔼 Curling up…',
    flex:    '✅ Top position — squeeze!',
    down:    '🔵 Lowering down…',
    hold:    '🧘 Holding…',
    setup:   '🔵 Getting into position…',
    rest:    '🔵 Rest position',
  };

  const errMsgs  = msgs.filter(m => m.sev === 'error');
  const warnMsgs = msgs.filter(m => m.sev === 'warning');
  const goodMsgs = msgs.filter(m => m.sev === 'good');

  if (errMsgs.length) {
    feedbackMain.className   = 'error';
    feedbackMain.textContent = '⚠ ' + errMsgs[0].text;
  } else if (warnMsgs.length) {
    feedbackMain.className   = 'warn';
    feedbackMain.textContent = '⚠ ' + warnMsgs[0].text;
  } else if (goodMsgs.length) {
    feedbackMain.className   = 'good';
    feedbackMain.textContent = goodMsgs[0].text;
  } else if (counter) {
    const s = counter instanceof BilateralRepCounter ? counter.current : counter.current;
    feedbackMain.className   = 'good';
    feedbackMain.textContent = stateLabels[s] || '✓ Good form!';
  }
}

// ─── Angle Bars ───────────────────────────────────────────────────
function showAngleText(ex, angles) {
  const parts = ex.angleDisplay()
    .filter(ad => angles[ad.key] !== undefined)
    .map(ad => `${ad.label}: ${angles[ad.key]}°`);
  feedbackAngles.textContent = parts.join('  |  ');
}

function updateAngleBars(ex, angles) {
  angleBars.innerHTML = '';
  ex.angleDisplay().forEach(ad => {
    const v = angles[ad.key];
    if (v === undefined) return;
    const color = jointColorFromDef(ad, v);
    const cssClass = color === '#22c55e' ? 'good' : color === '#eab308' ? 'warn' : 'bad';
    const pct = Math.min(100, Math.round((v / 180) * 100));

    const row = document.createElement('div');
    row.className = 'angle-bar-row';
    row.innerHTML = `
      <div class="angle-bar-label">${ad.label}</div>
      <div class="angle-bar-track">
        <div class="angle-bar-fill ${cssClass}" style="width:${pct}%"></div>
      </div>
      <div class="angle-bar-val">${v}°</div>
    `;
    angleBars.appendChild(row);
  });
}

// ─── Rep Flash ────────────────────────────────────────────────────
function flashRep(n) {
  repFlash.textContent = n;
  repFlash.classList.remove('visible');
  void repFlash.offsetWidth;
  repFlash.classList.add('visible');
  setTimeout(() => repFlash.classList.remove('visible'), 700);
}

// ─── Stats ────────────────────────────────────────────────────────
function updateStats() {
  statReps.textContent = state.reps;
  statGood.textContent = state.goodReps;
  statBad.textContent  = state.badReps;

  const total = state.goodReps + state.badReps;
  if (total > 0) {
    const pct = Math.round((state.goodReps / total) * 100);
    statScore.textContent = pct + '%';
    statScore.style.color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
  }

  // History dots
  repHistoryEl.innerHTML = '';
  state.repHistory.forEach(s => {
    const dot = document.createElement('span');
    dot.className = 'rep-dot ' + (s === 'good' ? 'good' : s === 'fair' ? 'fair' : 'bad');
    dot.title     = s;
    repHistoryEl.appendChild(dot);
  });
}

// ─── Guide Panel ─────────────────────────────────────────────────
function renderGuide(exKey) {
  const ex = EXERCISES[exKey];
  exNameEl.textContent = ex.name;
  guideSteps.innerHTML = '';
  ex.steps.forEach(s => {
    const d = document.createElement('div');
    d.className   = 'guide-step';
    d.textContent = s;
    guideSteps.appendChild(d);
  });
  // Blank angle bars placeholder
  angleBars.innerHTML = ex.angleDisplay().map(ad => `
    <div class="angle-bar-row">
      <div class="angle-bar-label">${ad.label}</div>
      <div class="angle-bar-track"><div class="angle-bar-fill" style="width:0%"></div></div>
      <div class="angle-bar-val">—</div>
    </div>`).join('');
}

// ─── Reset Session ────────────────────────────────────────────────
function resetSession() {
  state.reps = 0; state.goodReps = 0; state.badReps = 0;
  state.repHistory = [];
  state.badRepImages = [];
  state.plankHoldStart = null;
  state.plankHoldSecs  = 0;
  state.smoother.reset();
  if (state.counter) state.counter.reset();
  statReps.textContent  = '0';
  statScore.textContent = '—';
  statScore.style.color = '';
  statGood.textContent  = '0';
  statBad.textContent   = '0';
  repHistoryEl.innerHTML   = '';
  feedbackMain.textContent = '';
  feedbackMain.className   = '';
  feedbackAngles.textContent = '';
  renderGuide(state.currentEx);
}

// ─── Event Listeners ─────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
  if (state.running) {
    state.running = false;
    stopCamera();
    saveSession(); // persist session before clearing
    btnStart.textContent = 'Start Camera';
    btnStart.classList.remove('running');
    feedbackMain.textContent   = '';
    feedbackMain.className     = '';
    feedbackAngles.textContent = '';
    // Show session-end overlay with redirect to dashboard
    if (state.reps > 0 || state.plankHoldSecs > 0) {
      showSessionEndOverlay();
    }
  } else {
    btnStart.textContent = 'Starting…';
    btnStart.disabled    = true;
    if (!state.detector) {
      try { await loadModel(); }
      catch (_) { btnStart.textContent = 'Start Camera'; btnStart.disabled = false; return; }
    }
    const ok = await startCamera();
    if (!ok) { btnStart.textContent = 'Start Camera'; btnStart.disabled = false; return; }
    state.running     = true;
    state.sessionStart = Date.now();
    btnStart.textContent = 'Stop Camera';
    btnStart.classList.add('running');
    btnStart.disabled = false;
    detectLoop();
  }
});

btnReset.addEventListener('click', resetSession);

document.querySelectorAll('.exercise-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.exercise-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentEx = btn.dataset.exercise;
    // Rebuild counter for new exercise
    const ex = EXERCISES[state.currentEx];
    state.counter = ex.type !== 'duration' ? ex.makeCounter() : null;
    resetSession();
    if (typeof Voice !== 'undefined') Voice.setExercise(state.currentEx);
  });
});

// ─── Voice Toggle ─────────────────────────────────────────────────
const btnVoice = document.getElementById('btn-voice');
if (btnVoice && typeof Voice !== 'undefined') {
  btnVoice.addEventListener('click', () => {
    Voice.toggle();
  });

  // Voice command handler
  Voice.onCommand((cmd, text) => {
    if (cmd.action === 'exercise') {
      const btn = document.querySelector(`.exercise-btn[data-exercise="${cmd.value}"]`);
      if (btn) btn.click();
    } else if (cmd.action === 'start') {
      if (!state.running) btnStart.click();
    } else if (cmd.action === 'stop') {
      if (state.running) btnStart.click();
    } else if (cmd.action === 'reset') {
      btnReset.click();
    } else if (cmd.action === 'mute') {
      Voice.disable();
    } else if (cmd.action === 'unmute') {
      Voice.enable();
    } else if (cmd.action === 'dashboard') {
      window.location.href = 'dashboard.html';
    } else if (cmd.action === 'home') {
      window.location.href = 'landing.html';
    }
  });
}

// ─── Session End Overlay ─────────────────────────────────────────
function showSessionEndOverlay() {
  const total   = state.goodReps + state.badReps;
  const formPct = total > 0 ? Math.round((state.goodReps / total) * 100) : 0;
  const scoreColor = formPct >= 80 ? '#22c55e' : formPct >= 50 ? '#eab308' : '#ef4444';
  const emoji = formPct >= 80 ? '🏆' : formPct >= 50 ? '💪' : '🔄';

  const overlay = document.createElement('div');
  overlay.id = 'session-end-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);
    z-index:999;display:flex;align-items:center;justify-content:center;
    animation:fadeIn 0.3s ease;
  `;
  overlay.innerHTML = `
    <style>@keyframes fadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}</style>
    <div style="background:#18181f;border:1px solid #2e2e3a;border-radius:20px;padding:40px 44px;
                text-align:center;max-width:420px;width:90%;box-shadow:0 32px 80px rgba(0,0,0,0.6)">
      <div style="font-size:56px;margin-bottom:12px">${emoji}</div>
      <h2 style="font-size:22px;font-weight:800;margin-bottom:6px;color:#e8e8f2">Session Complete!</h2>
      <p style="color:#888899;font-size:14px;margin-bottom:28px">Here's your summary for <strong style="color:#818cf8">${EXERCISES[state.currentEx].name}</strong></p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:28px">
        <div style="background:#22222d;border:1px solid #2e2e3a;border-radius:12px;padding:14px">
          <div style="font-size:28px;font-weight:800;color:#818cf8">${state.reps}</div>
          <div style="font-size:11px;color:#888899;text-transform:uppercase;letter-spacing:.5px">Reps</div>
        </div>
        <div style="background:#22222d;border:1px solid #2e2e3a;border-radius:12px;padding:14px">
          <div style="font-size:18px;font-weight:800;color:${scoreColor};margin-top:7px;margin-bottom:3px">${Math.max(0, formPct - 5)}% - ${Math.min(100, formPct + 5)}%</div>
          <div style="font-size:11px;color:#888899;text-transform:uppercase;letter-spacing:.5px">Form</div>
        </div>
        <div style="background:#22222d;border:1px solid #2e2e3a;border-radius:12px;padding:14px">
          <div style="font-size:28px;font-weight:800;color:#22c55e">${state.goodReps}</div>
          <div style="font-size:11px;color:#888899;text-transform:uppercase;letter-spacing:.5px">Good Reps</div>
        </div>
      </div>
      
      ${state.badRepImages && state.badRepImages.length > 0 ? `
      <div style="text-align:left; margin-bottom:24px;">
        <h3 style="font-size:14px; margin-bottom:12px; color:#e8e8f2;">Form Corrections</h3>
        <div style="display:flex; gap:12px; overflow-x:auto; padding-bottom:8px;">
          ${state.badRepImages.map(imgData => `
            <div style="min-width:140px; background:#22222d; border:1px solid #2e2e3a; border-radius:8px; overflow:hidden;">
               <img src="${imgData.img}" style="width:100%; height:100px; object-fit:cover; display:block;" />
               <div style="padding:8px; font-size:11px; color:#888899;">Rep ${imgData.rep}: ${imgData.msgs || 'Needs work'}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <button onclick="window.location.href='dashboard.html'"
        style="width:100%;background:#6366f1;color:white;border:none;border-radius:10px;
               padding:13px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px">
        📊 View Full Dashboard
      </button>
      <button onclick="document.getElementById('session-end-overlay').remove()"
        style="width:100%;background:transparent;color:#888899;border:1px solid #2e2e3a;
               border-radius:10px;padding:11px;font-size:14px;cursor:pointer">
        Keep Training
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ─── Init ─────────────────────────────────────────────────────────
(function init() {
  const ex = EXERCISES[state.currentEx];
  state.counter = ex.makeCounter();
  renderGuide(state.currentEx);
})();

// ─── Demo Video Logic ─────────────────────────────────────────────
const DEMO_LOCAL_VIDEOS = {
  squat: 'assets/squat.mp4',
  pushup: 'assets/pushup.mp4',
  plank: 'assets/plank.mp4',
  shoulderpress: 'assets/shoulderpress.mp4',
  bicepscurl: 'assets/bicepscurl.mp4'
};

const btnDemo = document.getElementById('btn-demo');
const demoModal = document.getElementById('demo-modal');
const btnCloseDemo = document.getElementById('btn-close-demo');
const btnCloseDemoX = document.getElementById('btn-close-demo-x');
const demoVideo = document.getElementById('demo-video');
const demoFallback = document.getElementById('demo-fallback');
const fallbackTitle = document.getElementById('fallback-title');
const fallbackDesc = document.getElementById('fallback-desc');
const fallbackSteps = document.getElementById('fallback-steps');
const demoModalTitle = document.getElementById('demo-modal-title');

function closeDemoModal() {
  if (demoModal) demoModal.style.display = 'none';
  if (demoVideo) {
    demoVideo.pause();
    demoVideo.src = '';
  }
}

if (btnDemo) {
  btnDemo.addEventListener('click', () => {
    const exId = state.currentEx;
    const ex = EXERCISES[exId];
    if (demoModalTitle) demoModalTitle.textContent = ex.name + ' Form Guide';
    
    // Reset display states
    if (demoVideo) demoVideo.style.display = 'block';
    if (demoFallback) demoFallback.style.display = 'none';

    if (demoVideo) {
      demoVideo.onerror = () => {
        // Show fallback form guide if video file missing
        demoVideo.style.display = 'none';
        if (demoFallback) {
          demoFallback.style.display = 'block';
          if (fallbackTitle) fallbackTitle.textContent = ex.name + ' Technique Guide';
          if (fallbackDesc) fallbackDesc.textContent = ex.description || 'Proper form ensures max activation & zero injury.';
          if (fallbackSteps && ex.cues) {
            fallbackSteps.innerHTML = '<strong style="color:#6366f1;display:block;margin-bottom:8px;">Form Instructions:</strong>' +
              '<ul style="padding-left:18px;margin:0;">' +
              ex.cues.map(cue => `<li style="margin-bottom:6px;">${cue}</li>`).join('') +
              '</ul>';
          }
        }
      };

      demoVideo.src = DEMO_LOCAL_VIDEOS[exId] || 'assets/squat.mp4';
      demoModal.style.display = 'flex';
      demoVideo.play().catch(_ => {
        // Autoplay blocked or video missing trigger error handler
      });
    } else {
      demoModal.style.display = 'flex';
    }
  });
}

if (btnCloseDemo) btnCloseDemo.addEventListener('click', closeDemoModal);
if (btnCloseDemoX) btnCloseDemoX.addEventListener('click', closeDemoModal);
