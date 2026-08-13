// ─────────────────────────────────────────────────────────────────
//  Aligno.ai — voice.js
//  Full two-way voice system:
//    • Speech Synthesis  → coach talks to the user
//    • Speech Recognition → user talks to the coach
//
//  Usage (from app.js):
//    Voice.say("Great squat!")
//    Voice.enable() / Voice.disable()
//    Voice.setExercise("squat")
//    Voice.repCounted(n, quality)   // called on every rep
//    Voice.formFeedback(msgs)       // called every frame (throttled)
//    Voice.onCommand(cb)            // register voice command handler
// ─────────────────────────────────────────────────────────────────

const Voice = (() => {

  // ── State ─────────────────────────────────────────────────────────
  let enabled    = false;
  let voiceReady = false;
  let currentEx  = 'squat';

  // Throttle trackers
  let lastFormCue   = 0;    // timestamp of last form warning spoken
  let lastStateCue  = 0;    // timestamp of last state cue
  let lastFormText  = '';   // avoid repeating the exact same warning
  let badStreakCount = 0;   // consecutive bad-form frames

  const FORM_CUE_INTERVAL   = 5000;   // ms — min gap between form warnings
  const STATE_CUE_INTERVAL  = 3000;   // ms — min gap between state announcements
  const BAD_STREAK_THRESHOLD = 30;    // frames before speaking a warning

  // ── Speech Synthesis ──────────────────────────────────────────────
  const synth = window.speechSynthesis;
  let   voice = null;   // preferred voice (English)

  // Pick the best available English TTS voice
  function pickVoice() {
    const voices = synth.getVoices();
    // Prefer en-US Google or enhanced voices first
    const preferred = voices.find(v =>
      v.lang.startsWith('en') &&
      (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Alex') ||
       v.localService === false));
    voice = preferred || voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
  }

  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = pickVoice;
  }
  pickVoice();

  /**
   * Speak a string.
   * @param {string}  text
   * @param {object}  opts  { pitch, rate, volume, priority }
   *   priority: 'high' — interrupt current speech; default queues
   */
  function say(text, opts = {}) {
    if (!enabled || !text) return;
    if (!synth) return;

    const { pitch = 1, rate = 1, volume = 1, priority = 'normal' } = opts;

    // Non-blocking queue: drop non-critical feedback if already speaking
    if (synth.speaking && priority === 'low') {
      return;
    }

    // Immediately stop old audio when starting a new event
    synth.cancel();

    const utt  = new SpeechSynthesisUtterance(text);
    utt.pitch  = pitch;
    utt.rate   = rate;
    utt.volume = volume;
    if (voice) utt.voice = voice;

    synth.speak(utt);
  }

  // ── Exercise intro scripts ────────────────────────────────────────
  const EXERCISE_INTRO = {
    squat:         'Squat selected. Stand with feet shoulder-width apart. Drive your hips back and bend your knees to 90 degrees. Keep your chest tall.',
    pushup:        'Push-Up selected. Start in high plank with hands below shoulders. Lower your chest to the floor, then push back up. Keep your core tight.',
    plank:         'Plank selected. Hold a high plank or elbow plank. Keep your hips level — no sagging or piking. I will track your hold time.',
    shoulderpress: 'Shoulder Press selected. Start with elbows at 90 degrees at shoulder height. Press the weights directly overhead until your arms are fully extended.',
    lunge:         'Lunge selected. Step forward and lower your back knee toward the floor. Keep your front knee over your ankle and your torso upright.',
    bicepscurl:    'Bicep Curl selected. Keep your upper arms pinned to your sides. Curl the weights up to full flexion, then lower slowly. I will count each arm.',
  };

  // ── Rep milestone scripts ─────────────────────────────────────────
  function repMilestone(n) {
    if (n === 1)  return 'First rep. Great start!';
    if (n === 5)  return 'Five reps. Keep going!';
    if (n === 10) return 'Ten reps! Amazing work.';
    if (n === 15) return 'Fifteen reps! You\'re on fire!';
    if (n === 20) return 'Twenty reps! Outstanding!';
    if (n % 10 === 0) return `${n} reps! Keep it up!`;
    return null;  // no announcement
  }

  // ── Per-rep quality cues ──────────────────────────────────────────
  const GOOD_CUES  = ['Good rep!', 'Perfect!', 'Nice form!', 'Clean rep!', 'Excellent!', 'That\'s it!'];
  const BAD_CUES   = ['Check your form.', 'Watch your posture.', 'Slow down a little.'];
  let   goodCueIdx = 0;

  function repQualityCue(quality) {
    if (quality === 'good') {
      const msg = GOOD_CUES[goodCueIdx % GOOD_CUES.length];
      goodCueIdx++;
      return msg;
    }
    if (quality === 'bad' || quality === 'fair') {
      return BAD_CUES[Math.floor(Math.random() * BAD_CUES.length)];
    }
    return null;
  }

  // ── Speech Recognition & Voice Commands ───────────────────────────
  let commandListeners = [];
  let recognition = null;

  function onCommand(cb) {
    if (typeof cb === 'function') {
      commandListeners.push(cb);
    }
  }

  function parseVoiceCommand(text) {
    if (!text) return;
    const t = text.toLowerCase().trim();
    let cmd = null;

    if (t.includes('start') || t.includes('begin')) {
      cmd = { action: 'start' };
    } else if (t.includes('stop') || t.includes('pause') || t.includes('end')) {
      cmd = { action: 'stop' };
    } else if (t.includes('reset') || t.includes('clear')) {
      cmd = { action: 'reset' };
    } else if (t.includes('mute') || t.includes('quiet') || t.includes('silence')) {
      cmd = { action: 'mute' };
    } else if (t.includes('unmute') || t.includes('speak') || t.includes('voice on')) {
      cmd = { action: 'unmute' };
    } else if (t.includes('dashboard') || t.includes('stats')) {
      cmd = { action: 'dashboard' };
    } else if (t.includes('home') || t.includes('main page')) {
      cmd = { action: 'home' };
    } else if (t.includes('squat')) {
      cmd = { action: 'exercise', value: 'squat' };
    } else if (t.includes('push up') || t.includes('pushup')) {
      cmd = { action: 'exercise', value: 'pushup' };
    } else if (t.includes('plank')) {
      cmd = { action: 'exercise', value: 'plank' };
    } else if (t.includes('shoulder press') || t.includes('press')) {
      cmd = { action: 'exercise', value: 'shoulderpress' };
    } else if (t.includes('bicep') || t.includes('biceps') || t.includes('curl')) {
      cmd = { action: 'exercise', value: 'bicepscurl' };
    }

    if (cmd) {
      commandListeners.forEach(cb => {
        try { cb(cmd, text); } catch (e) { console.error('Voice command listener error:', e); }
      });
    }
  }

  // Initialize SpeechRecognition if available
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const lastIndex = event.results.length - 1;
        if (event.results[lastIndex] && event.results[lastIndex][0]) {
          const transcript = event.results[lastIndex][0].transcript;
          parseVoiceCommand(transcript);
        }
      };

      recognition.onerror = () => { /* Ignore speech errors */ };
      recognition.onend = () => {
        if (enabled && recognition) {
          try { recognition.start(); } catch (_) {}
        }
      };
    } catch (e) {
      console.warn('SpeechRecognition init failed:', e);
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────
  function updateVoiceBtn(on) {
    const btn  = document.getElementById('btn-voice');
    const icon = document.getElementById('voice-btn-icon');
    const lbl  = document.getElementById('voice-btn-label');
    if (!btn) return;
    btn.classList.toggle('active', on);
    if (icon) icon.textContent = on ? '🎙️' : '🔇';
    if (lbl)  lbl.textContent  = on ? 'Voice On' : 'Voice Off';
  }

  // ── Public API ────────────────────────────────────────────────────

  function enable() {
    enabled = true;
    updateVoiceBtn(true);
    say('Voice coach activated.', { priority: 'high' });
    if (recognition) {
      try { recognition.start(); } catch (_) {}
    }
  }

  function disable() {
    enabled = false;
    updateVoiceBtn(false);
    synth.cancel();
    if (recognition) {
      try { recognition.stop(); } catch (_) {}
    }
  }

  function toggle() {
    enabled ? disable() : enable();
  }

  function setExercise(key) {
    currentEx = key;
    badStreakCount = 0;
    lastFormText   = '';
    if (EXERCISE_INTRO[key]) {
      say(EXERCISE_INTRO[key], { rate: 0.95 });
    }
  }

  /**
   * Called by app.js whenever a rep is counted.
   * @param {number} n       — total reps so far
   * @param {string} quality — 'good' | 'fair' | 'bad'
   */
  function repCounted(n, quality, msgs = []) {
    if (!enabled) return;

    // Quality cue on every rep
    let qc = repQualityCue(quality);
    if (quality === 'bad' && msgs && msgs.length > 0) {
      qc = msgs[0].text.replace(/[^\x20-\x7E]/g, '').trim();
    }
    
    if (qc) say(qc, { rate: 1.05 });

    // Milestone announcement (slightly delayed so it doesn't clash)
    const mc = repMilestone(n);
    if (mc) setTimeout(() => say(mc, { pitch: 1.1, rate: 0.9 }), 800);
  }

  /**
   * Called every frame with the current form feedback messages.
   * Throttled heavily — speaks at most once per FORM_CUE_INTERVAL.
   * @param {Array} msgs  — [{ text, sev }, ...]
   */
  function formFeedback(msgs) {
    if (!enabled) return;

    const now      = Date.now();
    const errMsgs  = msgs.filter(m => m.sev === 'error');
    const warnMsgs = msgs.filter(m => m.sev === 'warning');
    const priority = errMsgs.length ? errMsgs : warnMsgs;

    if (priority.length === 0) {
      badStreakCount = 0;
      return;
    }

    badStreakCount++;
    if (badStreakCount < BAD_STREAK_THRESHOLD) return;   // wait for sustained bad form
    if (now - lastFormCue < FORM_CUE_INTERVAL)  return;  // respect cooldown
    if (priority[0].text === lastFormText)       return;  // don't repeat same cue

    lastFormText  = priority[0].text;
    lastFormCue   = now;
    badStreakCount = 0;

    // Strip emoji / symbols from TTS text
    const clean = priority[0].text.replace(/[^\x20-\x7E]/g, '').trim();
    say(clean, { pitch: 0.95, rate: 0.9, priority: 'low' });
  }

  /**
   * Announce a posture state change (e.g. "descent", "bottom", "top").
   * Throttled to avoid spam.
   */
  function stateAnnounce(label) {
    if (!enabled) return;
    const now = Date.now();
    if (now - lastStateCue < STATE_CUE_INTERVAL) return;
    lastStateCue = now;
    say(label, { rate: 1.1, priority: 'low' });
  }

  return {
    say,
    enable,
    disable,
    toggle,
    setExercise,
    repCounted,
    formFeedback,
    stateAnnounce,
    onCommand,
    parseVoiceCommand,
    get isEnabled() { return enabled; },
    get canSpeak()  { return !!synth;  },
  };
})();
