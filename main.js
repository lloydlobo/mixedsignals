"use strict";

/**
 * Mixed Signals
 * @fileoverview I want to share with you the joy of playing this fun little
 * game — originally made for Ludum Dare 59.
 * Heavily vibed with le' AI. Hope you enjoy playing it!
 * @version 0.5.0
 */

/**
 * @typedef {"sine"|"square"|"sawtooth"|"triangle"|"pwm"|"am"} Waveform
 * @typedef {Object} Signal
 * @property {Waveform} type
 * @property {number} freq   Hz
 * @property {number} amp    linear gain
 * @property {number} phase  degrees
 * @property {number} dc     DC offset
 * @property {number} harm   harmonic amount (See also https://scienceworld.wolfram.com/physics/HarmonicWaves.html)
 * @property {number} noise  0–1
 *
 * @typedef {Object} Level
 * @property {number}     rounds
 * @property {number}     time
 * @property {Waveform[]} types
 * @property {boolean}    phase
 * @property {boolean}    dc
 * @property {boolean}    harm
 * @property {boolean}    noise
 * @property {boolean}    [grace] round 1 never triggers gameOver on timeout — advances instead
 * @property {boolean}    [freeplay] round 1 preceded by untimed free-play warmup
 *
 * @typedef {Object} SaveData
 * @property {number}   highestLevel  0-indexed
 * @property {number[]} bestScores    per level
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

/** @readonly */
const CONFIG = {
    FIXED_STEPS_PRECISION: 2,
    TIME_BONUS_RATE: 0.8,
    BASE_REWARD: 100,
    COST_HINT: 25,
    COST_SKIP: 130,
    WIN_PERCENTAGE: 95,
    CLOSE_PERCENTAGE: 75,
    // Noise widens the win threshold: noisy targets are easier to "lock in".
    // noise=0 → no change. noise=6 (max) → threshold drops by 10 points.
    NOISE_TOLERANCE_PER_UNIT: 1.8, // points of threshold reduction per noise unit
}; // TODO: Tweak NOISE_TOLERANCE_PER_UNIT (last level seems too easy)

// TODO: POLISH: If grace, use grace like colors
const WAVE_COLORS = {
    target: "rgba(200,190,170,0.35)",
    yours: "#f5efe0",
};

/** @readonly @type {Level[]} */
const LEVELS = [
    // LV1 — freeplay warmup so players understand controls before the clock starts
    { rounds: 5, time: 35, types: ["sine", "square"], phase: false, dc: false, harm: false, noise: false, freeplay: true },
    { rounds: 5, time: 32, types: ["sine", "square", "sawtooth", "triangle"], phase: false, dc: false, harm: false, noise: false },
    // LV3 — grace: phase is new, give players one round to discover it
    { rounds: 5, time: 30, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: false, harm: false, noise: false, grace: true },
    // LV4 — grace: DC offset is new
    { rounds: 5, time: 28, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: true, harm: false, noise: false, grace: true },
    // LV5 — grace: PWM and AM are new
    { rounds: 5, time: 26, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: false, noise: false, grace: true },
    // LV6 — grace + freeplay: harmonics need exploration time most of all
    { rounds: 5, time: 36, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: false, grace: true, freeplay: true },
    // LV7 — noise as atmosphere (tolerance band), not a slider to match
    { rounds: 5, time: 32, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: true, grace: true },
];

// ─── GAME STATE ───────────────────────────────────────────────────────────────

/** @type {Signal} */ let targetSignal = {};
/** @type {Signal} */ let yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };

let score = 0, levelStartScore = 0, level = 0, roundNo = 0,
    timeLeft = 0, timerInterval = null, animRaf = null, won = false,
    _lockAnimStart = 0;

let freePlayActive = false; // true during untimed free-play warmup round

let tutorialStep = 0, tutorialActive = false;

// - See also https://scienceworld.wolfram.com/physics/Frequency.html
// - See also https://scienceworld.wolfram.com/physics/Amplitude.html
// - See also https://scienceworld.wolfram.com/physics/PhaseAngle.html
// - See also https://scienceworld.wolfram.com/physics/Harmonic.html
// - DC offset is a signal bias / baseline shift (constant DC component),
//   not usually considered a fundamental wave property in classical wave physics.
const TUTORIAL_TASKS = [
    { text: "TUTORIAL: Select TRI waveform", check: () => yoursSignal.type === "triangle" },
    { text: "TUTORIAL: Set frequency to 5 Hz", check: () => yoursSignal.freq === 5 },
    { text: "TUTORIAL: Set amplitude around 0.80", check: () => Math.abs(yoursSignal.amp - 8) < 0.5 },
    { text: "TUTORIAL: Set phase around 360°", check: () => Math.abs(yoursSignal.phase - 360) <= 2 },
    { text: "TUTORIAL: Set dc offset around 0.3", check: () => Math.abs(yoursSignal.dc - 3) <= 0.5 },
    { text: `TUTORIAL: Now match the target (${CONFIG.WIN_PERCENTAGE}%+)`, check: () => matchScore() >= CONFIG.WIN_PERCENTAGE * 0.01 },
];

// tutorial step → DOM id to glow
const TUTORIAL_CONTROLS = ["type-btns", "ctrl-freq", "ctrl-amp", "ctrl-phase", "ctrl-dc", "meter-row"];

// ─── SCREEN MANAGEMENT ───────────────────────────────────────────────────────
// Single source of truth: data-screen on #game.
// CSS does all the show/hide — JS only sets one attribute.
// Add a screen: one <div id="screen-foo">, one CSS rule. Nothing else to touch.

/**
 * @param {"start"|"dead"|"levelup"|"levelselect"|"game"} screen
 */
function showScreen(screen) {
    UI.game.dataset.screen = screen;
}

function currentScreen() {
    return UI.game.dataset.screen ?? "start";
}

// ─── UI (data-oriented DOM access) ───────────────────────────────────────────

const UI = {};

function initUI() {
    UI.labels = {};
    UI.labels.freq = document.getElementById("lbl-freq");
    UI.labels.amp = document.getElementById("lbl-amp");
    UI.labels.phase = document.getElementById("lbl-phase");
    UI.labels.dc = document.getElementById("lbl-dc");
    UI.labels.harm = document.getElementById("lbl-harm");
    UI.labels.noise = document.getElementById("lbl-noise");
    UI.labels.level = document.getElementById("lbl-level");

    UI.sliders = {};
    UI.sliders.freq = document.getElementById("sl-freq");
    UI.sliders.amp = document.getElementById("sl-amp");
    UI.sliders.phase = document.getElementById("sl-phase");
    UI.sliders.dc = document.getElementById("sl-dc");
    UI.sliders.harm = document.getElementById("sl-harm");
    UI.sliders.noise = document.getElementById("sl-noise");

    UI.buttons = {};
    UI.buttons.am             = document.getElementById("btn-am");
    UI.buttons.continue       = document.getElementById("btn-continue");
    UI.buttons.continueLevel  = document.getElementById("btn-continue-level");
    UI.buttons.deadLevelSelect = document.getElementById("btn-dead-level-select");
    UI.buttons.freeplayReady  = document.getElementById("btn-freeplay-ready");
    UI.buttons.hint           = document.getElementById("btn-hint");
    UI.buttons.levelBack      = document.getElementById("btn-level-back");
    UI.buttons.menu           = document.getElementById("menu-btn");
    UI.buttons.mute           = document.getElementById("mute-btn");
    UI.buttons.newGame        = document.getElementById("btn-new-game");
    UI.buttons.pwm            = document.getElementById("btn-pwm");
    UI.buttons.retry          = document.getElementById("btn-retry");
    UI.buttons.selectLevel    = document.getElementById("btn-select-level");
    UI.buttons.skip           = document.getElementById("btn-skip");
    UI.buttons.skipTut        = document.getElementById("skip-tut");
    UI.buttons.startOver      = document.getElementById("btn-start-over");
    UI.buttons.tutorial       = document.getElementById("btn-tutorial");

    UI.playback = {};
    UI.playback.target = document.getElementById("pb-target");
    UI.playback.yours = document.getElementById("pb-yours");
    UI.playback.ab = document.getElementById("pb-ab");

    UI.displays = {};
    UI.displays.score = document.getElementById("score");
    UI.displays.pct = document.getElementById("pct");
    UI.displays.feedback = document.getElementById("feedback");
    UI.displays.timer = document.getElementById("timer");
    UI.displays.roundNo = document.getElementById("round-no");
    UI.displays.roundTotal = document.getElementById("round-total");
    UI.displays.fill = document.getElementById("fill");
    UI.displays.flash = document.getElementById("flash");
    UI.displays.deadMsg = document.getElementById("dead-msg");
    UI.displays.luTitle = document.getElementById("lu-title");
    UI.displays.luMsg = document.getElementById("lu-msg");
    UI.displays.unlockMsg = document.getElementById("unlock-msg");
    UI.displays.screenDead = document.getElementById("screen-dead");

    UI.controls = {};
    UI.controls.phase = document.getElementById("ctrl-phase");
    UI.controls.dc = document.getElementById("ctrl-dc");
    UI.controls.harm = document.getElementById("ctrl-harm");
    UI.controls.noise = document.getElementById("ctrl-noise");

    UI.canvas = document.getElementById("c-overlay");
    UI.audio = document.getElementById("bgm-audio");
    UI.stampLayer = document.getElementById("stamp-layer");
    UI.gameInner = document.getElementById("game-inner");
    UI.timerRingFill = document.getElementById("timer-ring-fill");
    UI.meterRow = document.getElementById("meter-row");
    UI.game = document.getElementById("game");
    UI.levelSelectGrid = document.getElementById("level-select-grid");
    UI.typeButtons = document.getElementById("type-btns");
    UI.sliderContainer = document.querySelector(".param-list");
}

// ─── EVENT BINDING ────────────────────────────────────────────────────────────

function initEvents() {
    // Screen-transition buttons
    UI.buttons.continue?.addEventListener("click", continueSave);
    UI.buttons.newGame?.addEventListener("click", restartGame);
    UI.buttons.selectLevel?.addEventListener("click", showLevelSelect);
    UI.buttons.tutorial?.addEventListener("click", startTutorial);
    UI.buttons.retry?.addEventListener("click", startGame);
    UI.buttons.deadLevelSelect?.addEventListener("click", showLevelSelect);
    UI.buttons.startOver?.addEventListener("click", restartGame);
    UI.buttons.continueLevel?.addEventListener("click", continueLevel);
    UI.buttons.levelBack?.addEventListener("click", () => { renderStartScreen(); showScreen("start"); });

    // Action buttons
    UI.buttons.hint?.addEventListener("click", useHint);
    UI.buttons.skip?.addEventListener("click", skipRound);
    UI.buttons.menu?.addEventListener("click", goToMenu);
    UI.buttons.skipTut?.addEventListener("click", skipTutorial);
    UI.buttons.freeplayReady?.addEventListener("click", endFreePlay);
    UI.buttons.mute?.addEventListener("click", toggleMute);

    // Delegated type button listener (handles all 6 waveform buttons)
    UI.typeButtons?.addEventListener("click", (e) => {
        const btn = e.target.closest(".type-btn");
        if (btn) setType(btn);
    });

    // Delegated slider listener
    UI.sliderContainer?.addEventListener("input", recompute);

    // Playback toggle buttons
    (["target", "yours", "ab"]).forEach(mode => {
        UI.playback[mode]?.addEventListener("click",
            () => setPlaybackMode(_pbMode === mode ? "off" : mode));
    });

    // Pointer gate for beating audio — touch/hold scope to hear the mix
    const overlay = UI.canvas;
    if (overlay) {
        overlay.addEventListener("pointerdown", () => {
            if (!_pointerGate) return;
            const ac = actx();
            _pointerGate.gain.cancelScheduledValues(ac.currentTime);
            _pointerGate.gain.setValueAtTime(_pointerGate.gain.value, ac.currentTime);
            _pointerGate.gain.linearRampToValueAtTime(PB.BEAT_VOL, ac.currentTime + PB.GATE_ATTACK);
        });
        const closeGate = () => {
            if (!_pointerGate) return;
            const ac = actx();
            _pointerGate.gain.cancelScheduledValues(ac.currentTime);
            _pointerGate.gain.setValueAtTime(_pointerGate.gain.value, ac.currentTime);
            _pointerGate.gain.linearRampToValueAtTime(0, ac.currentTime + PB.GATE_RELEASE);
        };
        overlay.addEventListener("pointerup", closeGate);
        overlay.addEventListener("pointerleave", closeGate);
    }

    document.addEventListener("click", () => { if (!muted) startMusic(); }, { once: true });
    window.addEventListener('blur', () => { _lastTime = 0; _elapsedTime = 0; });
}

// ─── LOCALSTORAGE (Safari-safe) ───────────────────────────────────────────────

function lsGet(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private / quota — ignore */ }
}

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────

const SAVE_KEY = "mixedSignalsSave";

function freshSave() { return { highestLevel: 0, bestScores: new Array(LEVELS.length).fill(0) }; }

/** @returns {SaveData} */
function loadSave() {
    try {
        const raw = lsGet(SAVE_KEY);
        if (!raw) return freshSave();
        const d = JSON.parse(raw);
        if (typeof d.highestLevel !== "number" || !Array.isArray(d.bestScores)) return freshSave();
        while (d.bestScores.length < LEVELS.length) d.bestScores.push(0);
        return d;
    } catch { return freshSave(); }
}

/** @param {SaveData} data */
function writeSave(data) { lsSet(SAVE_KEY, JSON.stringify(data)); }

/**
 * @param {number} completedLevel 0-indexed
 * @param {number} runScore
 */
function recordLevelComplete(completedLevel, runScore) {
    const save = loadSave();
    save.highestLevel = Math.max(save.highestLevel, completedLevel + 1);
    save.bestScores[completedLevel] = Math.max(save.bestScores[completedLevel], runScore);
    writeSave(save);
}

// ─── START SCREEN ────────────────────────────────────────────────────────────

function renderStartScreen() {
    const save = loadSave();

    const continueBtn = UI.buttons.continue;
    if (continueBtn) {
        const hasProgress = save.highestLevel > 0 || save.bestScores[0] > 0;
        continueBtn.style.display = hasProgress ? "inline-block" : "none";
        if (hasProgress) continueBtn.textContent = `CONTINUE (LV ${save.highestLevel + 1})`;
    }

    const unlockMsg = UI.displays.unlockMsg;
    if (unlockMsg) {
        const unlocked = Math.min(save.highestLevel + 1, LEVELS.length);
        unlockMsg.textContent = unlocked < LEVELS.length
            ? `${unlocked}/${LEVELS.length} levels unlocked`
            : "All levels unlocked";
    }
}

function continueSave() {
    const save = loadSave();
    level = save.highestLevel; levelStartScore = 0; score = 0; roundNo = 0;
    startGame();
}

// ─── LEVEL SELECT ─────────────────────────────────────────────────────────────

function showLevelSelect() {
    const save = loadSave();
    const grid = UI.levelSelectGrid;
    grid.innerHTML = "";

    LEVELS.forEach((lv, i) => {
        const unlocked = i <= save.highestLevel;
        const best = save.bestScores[i];

        const btn = document.createElement("button");
        btn.className = ["level-select-btn", unlocked ? "unlocked" : "locked",
            i === save.highestLevel ? "current" : ""].join(" ").trim();
        btn.disabled = !unlocked;

        const num = document.createElement("span"); num.className = "ls-num"; num.textContent = `LV ${i + 1}`;
        const sc = document.createElement("span"); sc.className = "ls-score"; sc.textContent = best > 0 ? `${best} pts` : (unlocked ? "not played" : "locked");
        const tags = document.createElement("span"); tags.className = "ls-tags";
        const active = ["phase", "dc", "harm", "noise"].filter(k => lv[k]);
        tags.textContent = active.length ? active.join(" · ") : "basic";

        btn.append(num, sc, tags);
        if (unlocked) btn.addEventListener("click", () => startLevelFromSelect(i));
        grid.appendChild(btn);
    });

    showScreen("levelselect");
}

/** @param {number} selectedLevel 0-indexed */
function startLevelFromSelect(selectedLevel) {
    level = selectedLevel; levelStartScore = 0; score = 0; roundNo = 0;
    startGame();
}

// ─── PRNG (Xorshift32) ───────────────────────────────────────────────────────

const rand = (() => {
    let s = 1831565813 >>> 0;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
})();

function makeRand(seed = 1831565813) {
    let s = seed >>> 0;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
    };
}

function rng(lo, hi) {
    if (lo > hi) { const t = lo; lo = hi; hi = t; }
    return lo + (rand() * (hi - lo + 1)) | 0;
}

// ─── BGM ─────────────────────────────────────────────────────────────────────

const BGM_TRACKS = [
    "resources/music/musinova-idm-electronic-science-technology-drumless-ambient-loop-483365.mp3",
    "resources/music/slimeyfox-after-hours-arcade-487277.mp3",
    "resources/music/pietix-art-pop-exp-2-510302.mp3",
];
let currentTrackIndex = -1;

function pickNextTrack() {
    let next;
    do { next = Math.floor(Math.random() * BGM_TRACKS.length); }
    while (BGM_TRACKS.length > 1 && next === currentTrackIndex);
    currentTrackIndex = next;
    return BGM_TRACKS[next];
}

let muted = lsGet("bgmMuted") === "true";
let volume = parseFloat(lsGet("bgmVolume") ?? "0.4");

function initAudio() {
    const audio = UI.audio, btn = UI.buttons.mute;
    audio.muted = muted; audio.volume = volume;
    btn.textContent = muted ? "🔇" : "🎵";
    btn.style.color = muted ? "var(--text-dim)" : "";
    audio.addEventListener("ended", () => {
        if (!muted) { audio.src = pickNextTrack(); audio.play(); }
    });
}

function startMusic() {
    const audio = UI.audio;
    if (muted || !audio.paused) return;
    if (!audio.src || audio.ended) audio.src = pickNextTrack();
    audio.play();
}

function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    UI.audio.volume = volume;
    lsSet("bgmVolume", String(volume));
}

function toggleMute() {
    muted = !muted;
    const audio = UI.audio, btn = UI.buttons.mute;
    audio.muted = muted;
    lsSet("bgmMuted", String(muted));
    btn.textContent = muted ? "🔇" : "🎵";
    btn.style.color = muted ? "var(--text-dim)" : "";
    if (muted) {
        if (!audio.paused) audio.pause();
        // Silence channels but keep graphs alive — unmute restores mode
        _setVol(_chTarget, 0);
        _setVol(_chYours, 0);
    } else {
        if (currentScreen() === "game") startMusic();
        if (_playbackActive) setPlaybackMode(_pbMode);
    }
}

// ─── SFX ─────────────────────────────────────────────────────────────────────

/**
 * A singleton factory for the AudioContext.
 * 
 * Manages a persistent AudioContext instance, ensuring it is lazily initialized
 * and resumed if it was suspended by the browser's autoplay policy.
 * 
 * Fallback for cross-browser AudioContext support.
 * 
 * @returns {AudioContext} The active AudioContext instance.
 */
// const AudioCtx = window.AudioContext || window.webkitAudioContext;
const AudioCtx = (() => {
    try {
        const audioCtx = (window.AudioContext || window.webkitAudioContext);
        // ... rest of audio setup
        return audioCtx;
    } catch (err) {
        console.warn(`Audio context unavailable (private browsing?):`, err);
        // no bgm-toggle element — warn is sufficient
        return null;
    }
})()

/**
 * Internal singleton instance of the AudioContext.
 * @type {AudioContext|null}
 * @private
 */
let _actx = null;

/**
 * Returns a global AudioContext instance, initializing it if necessary.
 * 
 * This function implements the Singleton pattern to ensure only one context 
 * is created. It also attempts to resume the context if it is in a 'suspended' 
 * state, which is a common requirement for bypassing browser autoplay restrictions.
 * 
 * @returns {AudioContext} The initialized and active AudioContext.
 */
function actx() {
    if (!_actx) _actx = new AudioCtx(); // Lazy initialization
    if (_actx.state === "suspended") _actx.resume(); // Check for suspended state (common in Chrome/Safari until a user gesture occurs)
    return _actx;
}

let _lastSliderSfx = 0, _lastUrgentSfx = 0, _wasCloseSfx = false;

// ── SFX helpers ───────────────────────────────────────────────────────────────

/**
 * Play a warm triangle note with a soft attack and a detuned twin for thickness.
 * The twin oscillator slightly above the fundamental gives a gentle chorus warmth.
 * @param {AudioContext} ac
 * @param {number} freq      Fundamental frequency in Hz
 * @param {number} startTime AudioContext time to begin
 * @param {number} gain      Peak gain (before envelope)
 * @param {number} duration  Total note duration in seconds
 * @param {number} [detune=4] Detune amount for the twin oscillator in Hz
 */

function _warmNote(ac, freq, startTime, gain, duration, detune = 4) {
    const t = startTime;
    // const attack = 0.012;
    const attack = 0.008; // 8ms soft attack — removes the click of instant-on oscillators

    const filterOpen = 1800;   // Hz — where the filter "opens" to
    const filterClosed = 400;  // Hz — dark starting point

    function moogOsc(f, peakGain) {
        const osc = ac.createOscillator();
        const filter = ac.createBiquadFilter();
        const env = ac.createGain();

        osc.type = "sawtooth";
        osc.frequency.value = f;

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(filterClosed, t);
        filter.frequency.linearRampToValueAtTime(filterOpen, t + attack * 3);
        filter.frequency.exponentialRampToValueAtTime(filterClosed + 200, t + duration * 0.7);
        filter.Q.value = 10;

        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(peakGain, t + attack);
        env.gain.exponentialRampToValueAtTime(0.001, t + duration);

        osc.connect(filter);
        filter.connect(env);
        env.connect(ac.destination);
        osc.start(t);
        osc.stop(t + duration + 0.02);
    }

    moogOsc(freq, gain);
    moogOsc(freq + detune, gain * 0.5);   // detuned second osc, slightly quieter
}

// ── Lock variations ───────────────────────────────────────────────────────────
// Five distinct melodic personalities, all warm triangle + detuned twin.
// Picked randomly on each win so 35 locks/playthrough don't feel repetitive.

// [[523, 0], [659, 0.07], [784, 0.14], [1047, 0.21]]
const _LOCK_VARIANTS = [

    // A: "happy bounce" — ascending C chord, quick and cheerful
    (ac) => {
        [[523, 0], [659, 0.07], [784, 0.14], [1047, 0.21]].forEach(([f, t]) =>
            _warmNote(ac, f, ac.currentTime + t, 0.13, 0.22 + rng(0, 3)));
    },

    // B: "smug little nod" — 3 notes, last one wobbles like it's pleased with itself
    (ac) => {
        [[440, 0], [554, 0.08], [659, 0.16]].forEach(([f, t]) =>
            _warmNote(ac, f, ac.currentTime + t, 0.12, 0.26));
        // wobble on the last note
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "triangle"; o.frequency.value = 659;
        o.frequency.linearRampToValueAtTime(698, ac.currentTime + 0.28);
        o.frequency.linearRampToValueAtTime(659, ac.currentTime + 0.36);
        g.gain.setValueAtTime(0, ac.currentTime + 0.16);
        g.gain.linearRampToValueAtTime(0.05, ac.currentTime + 0.18);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.40);
        o.connect(g); g.connect(ac.destination);
        o.start(ac.currentTime + 0.16); o.stop(ac.currentTime + 0.42);
    },

    // C: "lil fanfare" — 5 notes, bounces back to middle, feels playful
    (ac) => {
        [[392, 0], [523, 0.07], [659, 0.14], [523, 0.20], [784, 0.28]].forEach(([f, t]) =>
            _warmNote(ac, f, ac.currentTime + t, 0.11, 0.20));
    },

    // D: "soft bloop" — just 2 notes, understated, like a quiet thumbs up
    (ac) => {
        [[440, 0], [659, 0.10]].forEach(([f, t]) =>
            _warmNote(ac, f, ac.currentTime + t, 0.14, 0.28, 6));
    },

    // E: "wobbly high five" — 3 notes climbing, last one slides up a bit, triumphant but goofy
    (ac) => {
        [[523, 0], [784, 0.09], [1047, 0.18]].forEach(([f, t]) =>
            _warmNote(ac, f, ac.currentTime + t, 0.10, 0.20));
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "triangle"; o.frequency.value = 1047;
        o.frequency.linearRampToValueAtTime(1175, ac.currentTime + 0.32);
        g.gain.setValueAtTime(0, ac.currentTime + 0.18);
        g.gain.linearRampToValueAtTime(0.08, ac.currentTime + 0.20);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.38);
        o.connect(g); g.connect(ac.destination);
        o.start(ac.currentTime + 0.18); o.stop(ac.currentTime + 0.40);
    },
];

const SFX = {
    tick: (pitch = 880) => {
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = pitch;
        g.gain.setValueAtTime(0.12, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.06);
    },

    slider: () => {
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 440 + yoursSignal.freq * 40;
        g.gain.setValueAtTime(0.06, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.04);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.05);
    },

    // Randomly picks one of five warm melodic variations so wins don't sound identical
    lock: () => {
        if (muted) return;
        const ac = actx();
        _LOCK_VARIANTS[Math.floor(rand() * _LOCK_VARIANTS.length)](ac);
    },

    // Warm descending triangle cascade — losing but not brutal
    fail: () => {
        if (muted) return;
        const ac = actx();
        [[220, 0], [175, 0.11], [130, 0.24]].forEach(([f, t]) =>
            _warmNote(ac, f, ac.currentTime + t, 0.11, 0.22, 3));
    },

    // Tired shrug — single triangle note gliding down, short and dismissive. "bwop"
    skip: () => {
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "triangle"; o.frequency.value = 330;
        o.frequency.linearRampToValueAtTime(200, ac.currentTime + 0.12);
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(0.12, ac.currentTime + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.20);
    },

    // Broke-skip: sawtooth like fail but shorter, quieter, single note — a dull thud, not a cascade.
    // "You tried to skip but the machine shrugged."
    skipBroke: () => {
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sawtooth"; o.frequency.value = 180;
        g.gain.setValueAtTime(0.08, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.14);
    },

    // Sine sweep up — helpful, bright, curious
    hint: () => {
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 660;
        o.frequency.linearRampToValueAtTime(880, ac.currentTime + 0.12);
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(0.10, ac.currentTime + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.20);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.22);
    },

    // Deflated balloon — sine goes up then immediately flops down. Cute, not mean. "bwip"
    hintBroke: () => {
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 660;
        o.frequency.linearRampToValueAtTime(720, ac.currentTime + 0.04);
        o.frequency.linearRampToValueAtTime(380, ac.currentTime + 0.12);
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(0.08, ac.currentTime + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.16);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.18);
    },

    levelUp: () => {
        if (muted) return;
        const ac = actx();
        [[330, 0], [392, 0.1], [494, 0.2], [659, 0.32], [880, 0.44]].forEach(([f, t]) =>
            _warmNote(ac, f, ac.currentTime + t, 0.12, 0.28));
    },

    urgent: () => {
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "square"; o.frequency.value = 330;
        g.gain.setValueAtTime(0.07, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.09);
    },

    close: () => {
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 330;
        o.frequency.linearRampToValueAtTime(440, ac.currentTime + 0.15);
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(0.05, ac.currentTime + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.22);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.24);
    },
};

// ─── STAMP SYSTEM ─────────────────────────────────────────────────────────────
// Tactile rubber-stamp feedback. One stamp at a time, DOM-based, no canvas.
// Inspired by Threes / WarioWare micro-feedback — restrained, not juice-spam.

const STAMP_WORDS = {
    hint: ["BLIP", "PING", "TRACE", "WARMER"],
    hint_broke: ["NO SIGNAL", "FLAT BROKE", "INSUFFICIENT", "LOW FUNDS"], /* can't afford now */
    skip: ["ZONK", "STATIC", "DRIFT", "NOPE"],
    skip_broke: ["NOPE", "NO CREDIT", "HELD", "LOCKED OUT"], /* can't afford now */
    fail: ["DESYNC", "FZZZT", "LOST LOCK", "OVERLOAD"],
    success: ["LOCKED", "CLEAN", "DIALED", "SMOOTH"],
};

let _activeStamp = null;

/**
 * Spawns a transient rubber-stamp label in the game screen.
 * @param {"hint"|"skip"|"fail"|"success"|"hint_broke"|"skip_broke"} type
 */
function spawnStamp(type) {
    const layer = UI.stampLayer;
    if (!layer) return;

    // Only one stamp at a time — remove previous immediately
    if (_activeStamp) {
        _activeStamp.remove();
        _activeStamp = null;
    }

    const words = STAMP_WORDS[type];
    if (!words) return;
    const word = words[Math.floor(rand() * words.length)];

    const el = document.createElement("div");
    el.className = `stamp stamp-${type}`;
    el.textContent = word;

    // Random position within safe inner zone (avoid edges)
    const px = 15 + rand() * 55; // 15–70% from left
    const py = 15 + rand() * 55; // 15–70% from top
    el.style.left = `${px}%`;
    el.style.top = `${py}%`;

    // Slight random rotation: −8° to +8°
    const deg = (rand() * 16 - 8).toFixed(1);
    el.style.setProperty("--stamp-rot", `rotate(${deg}deg)`);

    layer.appendChild(el);
    _activeStamp = el;

    // Self-remove after animation completes
    el.addEventListener("animationend", () => {
        el.remove();
        if (_activeStamp === el) _activeStamp = null;
    }, { once: true });
}

// ─── SIGNAL PLAYBACK ─────────────────────────────────────────────────────────
//
// Simple Web Audio native-node graph. Zero JS sample loops.
//
// Graph (standard):
//   OscillatorNode → GainNode(amp) → GainNode(master) → destination
//
// Graph (AM):
//   carrier Osc ─→ carGain ←─ modGain ←─ modOsc
//                     ↓
//                  GainNode(amp) → GainNode(master) → destination
//
// FREQUENCY: gameplay 1–6 maps exponentially to 110–880 Hz (A2–A5, 3 octaves).
//   f=1→110Hz  f=2→175Hz  f=3→277Hz  f=4→440Hz  f=5→698Hz  f=6→880Hz
//   Each step is a recognisable musical interval — trains pitch/frequency intuition.
//
// PARAM UPDATES: setTargetAtTime(v, now, 0.02) on all AudioParams.
//   20 ms time constant kills slider zipper noise without perceptible lag.
//   Type changes require a full rebuild (OscillatorNode.type is not an AudioParam).
//
// MODES: ▶TARGET  ▶YOURS  ⇄A/B
//   Both graphs stay running; master gain switches which is audible.

/** @typedef {"off"|"target"|"yours"|"ab"} PlaybackMode */
/** @type {PlaybackMode} */
let _pbMode = "ab";
let _playbackActive = false;

const PB = {
    TARGET_VOL: 0.25 * 0.5,
    YOURS_VOL: 0.28 * 0.5,
    FADE: 0.04,
    TC: 0.02,
    BEAT_VOL: 0.15,
    GATE_ATTACK: 0.05,
    GATE_RELEASE: 0.3,
};

// ─── WAVEFORM LOUDNESS NORMALISATION ────────────────────────────────────────
// Different waveform shapes have different RMS energy at the same peak amplitude.
// Without compensation, switching from sine → square feels like a volume jump.
//
// Reference: sine RMS = peak × 0.7071
// Each coefficient = sine_RMS / waveform_RMS, so all types output equal loudness.
//
//   sine:     RMS = 0.7071  → coeff = 1.000  (reference)
//   square:   RMS = 1.0000  → coeff = 0.707  (loudest raw — needs most attenuation)
//   sawtooth: RMS = 0.5774  → coeff = 1.225
//   triangle: RMS = 0.5774  → coeff = 1.225
//   pwm:      RMS ≈ 0.8062  → coeff = 0.877  (65% duty cycle)
//   am:       RMS ≈ 0.5303  → coeff = 1.334  (carrier × (1 + 0.5 mod) / 2)
//
// Applied at ampGain so the compensation is transparent to the sig.amp control.
// The limiter below catches any residual peaks from harmonics or AM modulation.

/**
 * The compensation table normalizes each waveform to sine's RMS so switching
 * types stays at equal perceived loudness.
 */
const WAVEFORM_GAIN = Object.freeze({
    sine: 1.000,
    square: 0.707,
    sawtooth: 1.225,
    triangle: 1.225,
    pwm: 0.877,
    am: 1.334,
});

// Shared DynamicsCompressorNode — one instance, both channels feed into it.
// Acts as a brickwall safety net: catches transients from type switches,
// AM modulation peaks, and any gain overshoot during parameter changes.
// Settings are transparent at normal levels — only engages on peaks.
let _limiter = null;
let _beatingMix = null;
let _pointerGate = null;

function initBeatingBus() {
    if (_beatingMix) return;
    const ac = actx();
    _beatingMix = ac.createGain();
    _beatingMix.gain.value = 1;
    _pointerGate = ac.createGain();
    _pointerGate.gain.value = 0;
    _beatingMix.connect(_pointerGate);
    _pointerGate.connect(getLimiter());
}

function getLimiter() {
    if (_limiter) return _limiter;
    const ac = actx();
    const c = ac.createDynamicsCompressor();
    c.threshold.value = -3; // dB - engages just below 0 dBFS
    c.knee.value = 2; // dB - soft knee, barely audible
    c.ratio.value = 20; // effectively a brickwall above threshold
    c.attack.value = 0.001; // 1 ms - fast enough to catch transients
    c.release.value = 0.1; // 100 ms - recover quickly after peak
    c.connect(ac.destination);
    _limiter = c;
    return _limiter;
}

let freqToHz;

const enableMusicalTuning = true;
if (enableMusicalTuning) {
    // ======================================================
    // MUSICAL OCTAVE TUNING
    // 1 → 8 spans exactly one octave
    // A2 → A3
    // ======================================================
    // Step, Frequency (Hz), Note
    // 1,    110.00 Hz,      Starting Pitch (A2)
    // 2,    121.45 Hz,
    // 3,    134.09 Hz,
    // 4,    148.05 Hz,
    // 5,    163.46 Hz,
    // 6,    180.47 Hz,
    // 7,    199.26 Hz,
    // 8,    220.00 Hz,      Octave Peak (A3)
    const AUDIO_MIN_HZ = 110;
    const AUDIO_MAX_HZ = 220;

    const FREQ_MIN = 1;
    const FREQ_MAX = 8;

    // ------------------------------------------------------
    // Precomputed constants
    // ------------------------------------------------------

    const INV_FREQ_RANGE =
        1 / (FREQ_MAX - FREQ_MIN);

    const AUDIO_EXP_FACTOR =
        Math.log(AUDIO_MAX_HZ / AUDIO_MIN_HZ);

    // ------------------------------------------------------
    // Gameplay freq → musical Hz
    // ------------------------------------------------------

    // Equal logarithmic spacing
    // Meaning each step multiplies by the same ratio.
    // That ratio is:
    //      (220/110) ^ (1/7) => 1.10409
    // So every slider movement increases frequency by ~10.4%.
    // 
    // That’s why it feels smooth and consistent.
    //
    // Even though values are discrete.
    //
    // Because:
    //
    // - logarithmic spacing mimics physical/audio perception
    // - each step feels proportional
    // - no giant jumps
    // - no dead tiny differences
    //
    // This is far better than linear Hz stepping
    const _freqToHz = (freq) => {
        const hz = AUDIO_MIN_HZ * Math.exp(
            ((freq - FREQ_MIN) *
                INV_FREQ_RANGE) *
            AUDIO_EXP_FACTOR
        );
        return hz;
    }
    freqToHz = _freqToHz;
} else {
    const FREQ_MIN = 1;
    const FREQ_MAX = 7;

    const AUDIO_MIN_HZ = 110; // A2
    const AUDIO_MAX_HZ = 220; // A3 (1 octave spread)

    const INV_FREQ_RANGE = 1 / (FREQ_MAX - FREQ_MIN);
    const AUDIO_EXP_FACTOR = Math.log(AUDIO_MAX_HZ / AUDIO_MIN_HZ);

    /**
     * Gameplay freq → audio Hz, Logarithmic interpolation
     * @param {*} freq   Gameplay freq
     * @returns {number} Audible Hz
     */
    const _freqToHz = (freq) => {
        return AUDIO_MIN_HZ * Math.exp(
            ((freq - FREQ_MIN) *
                INV_FREQ_RANGE) *
            AUDIO_EXP_FACTOR
        );
    }
    freqToHz = _freqToHz;
}

/**
 * @typedef {Object} Channel
 * @property {OscillatorNode|null}   osc
 * @property {OscillatorNode|null}   modOsc
 * @property {OscillatorNode|null}   vibratoLfo  subtle pitch wobble for warmth
 * @property {GainNode|null}         vibratoGain
 * @property {GainNode|null}         carGain     carrier amplitude node (AM only)
 * @property {GainNode|null}         modGain     modulator depth (AM only)
 * @property {GainNode|null}         ampGain
 * @property {GainNode|null}         masterGain
 * @property {BiquadFilterNode|null} filter      low-pass, rounds off harsh harmonics
 * @property {string}                type        last-built waveform type
 */

/** @returns {Channel} */
function _emptyChannel() {
    return { osc: null, modOsc: null, vibratoLfo: null, vibratoGain: null, carGain: null, modGain: null, ampGain: null, filter: null, masterGain: null, type: "" };
}

const _chTarget = _emptyChannel();
const _chYours = _emptyChannel();

// ── channel lifecycle ─────────────────────────────────────────────────────────

/**
 * Builds a fresh audio graph for the channel and starts it silently.
 * Fades out and tears down any existing graph first.
 * @param {Channel} ch
 * @param {Signal}  sig
 */
function _buildChannel(ch, sig) {
    const ac = actx();
    const now = ac.currentTime;

    // Fade out old master then tear down after fade
    if (ch.masterGain) {
        ch.masterGain.gain.setValueAtTime(ch.masterGain.gain.value, now);
        ch.masterGain.gain.linearRampToValueAtTime(0, now + PB.FADE);
        const old = { ...ch };
        setTimeout(() => {
            try { old.osc?.stop(); } catch { }
            try { old.modOsc?.stop(); } catch { }
            [old.carGain, old.modGain, old.ampGain, old.masterGain]
                .forEach(n => { try { n?.disconnect(); } catch { } });
        }, (PB.FADE + 0.05) * 1000);
    }

    const hz = freqToHz(sig.freq);
    const isAM = sig.type === "am";
    const isPWM = sig.type === "pwm";

    // ── oscillator ────────────────────────────────────────────────────────────
    const osc = ac.createOscillator();
    osc.type = isAM ? "sine" : isPWM ? "square" : sig.type;
    osc.frequency.value = hz;

    // ── AM modulator ──────────────────────────────────────────────────────────
    let modOsc = null, carGain = null, modGain = null;
    if (isAM) {
        modOsc = ac.createOscillator();
        modOsc.type = "sine";
        modOsc.frequency.value = hz * 0.25;   // modulate at 1/4 carrier freq

        carGain = ac.createGain();
        carGain.gain.value = 1;              // baseline carrier level

        modGain = ac.createGain();
        modGain.gain.value = Math.max(0.1, sig.harm || 0.5) * 0.8; // mod depth

        modOsc.connect(modGain);
        modGain.connect(carGain.gain);  // modulates carGain.gain around 1
        osc.connect(carGain);
    }

    // ── amp + master ──────────────────────────────────────────────────────────
    // ampGain: sig.amp control × per-waveform RMS normalisation coefficient.
    // This keeps perceived loudness equal across all waveform types.
    const normCoeff = WAVEFORM_GAIN[sig.type] ?? 1.0;
    const ampGain = ac.createGain();
    ampGain.gain.value = sig.amp * 0.1 * normCoeff;
    //                              ↑    ↑
    //                         scale   compensation
    //                                 (from WAVEFORM_GAIN)

    // Examples:
    // sine:   0.5 * 0.1 * 1.000 = 0.05
    // square: 0.5 * 0.1 * 0.707 = 0.03535 ← Quieter, balances the raw square loudness
    // am:     0.5 * 0.1 * 1.334 = 0.0667  ← Louder, balances the quiet AM

    // masterGain: mute/unmute this channel (mode switching).
    // Feeds into the shared limiter, not directly to destination.
    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, now); // start silent — mode sets volume

    // Tuning knobs once you hear it:
    //
    // |Want                      | Change                             |
    // |--------------------------|------------------------------------|
    // |Warmer / more muffled     | filter.frequency.value → 1200–1800 |
    // |Brighter but still smooth | → 3000–4000                        |
    // |More wobble/alive         | vibratoGain.gain.value → 4–6       |
    // |Less wobble               | → 0.5–1                            |
    // |Thicker/chorus-y          | vibratoLfo.frequency.value → 3–4   |
    //
    // Start with these defaults and tune by ear. The filter alone will make the
    // biggest difference — square and sawtooth will go from buzzy → rounded
    // immediately.

    // ── vibrato ───────────────────────────────────────────────────────────────
    // Subtle LFO wobbles pitch ±2 Hz at 5 Hz — imperceptible as effect,
    // but removes the "frozen" quality of a pure digital oscillator.
    const vibratoLfo = ac.createOscillator();
    vibratoLfo.type = "square";
    vibratoLfo.frequency.value = 2; // 3 Hz wobble rate
    const vibratoGain = ac.createGain();
    vibratoGain.gain.value = 0.5; // ±2 Hz depth
    vibratoLfo.connect(vibratoGain);
    vibratoGain.connect(osc.frequency); // modulates carrier pitch

    // ── filter ────────────────────────────────────────────────────────────────
    // Low-pass at 2400 Hz softens harsh upper harmonics on square/sawtooth.
    // Sine passes through almost unchanged; triangle barely touched.
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.5; // gentle slope, no resonance

    // ── connect ───────────────────────────────────────────────────────────────
    (isAM ? carGain : osc).connect(ampGain);
    ampGain.connect(filter);
    filter.connect(masterGain);
    initBeatingBus();
    masterGain.connect(_beatingMix);

    // ── start ─────────────────────────────────────────────────────────────────
    osc.start(now);
    modOsc?.start(now);
    vibratoLfo.start(now);

    // ── store ─────────────────────────────────────────────────────────────────
    ch.osc = osc;
    ch.modOsc = modOsc;
    ch.vibratoLfo = vibratoLfo;
    ch.vibratoGain = vibratoGain;
    ch.carGain = carGain;
    ch.modGain = modGain;
    ch.ampGain = ampGain;
    ch.filter = filter;
    ch.masterGain = masterGain;
    ch.type = sig.type;
}

/**
 * Updates live AudioParams without rebuilding the graph.
 * Falls back to full rebuild when waveform type changes.
 * @param {Channel} ch
 * @param {Signal}  sig
 */
function _updateChannel(ch, sig) {
    if (!ch.osc || ch.type !== sig.type) {
        _buildChannel(ch, sig);
        return;
    }

    const ac = actx();
    const now = ac.currentTime;
    const tc = PB.TC;

    let hz = freqToHz(sig.freq);
    ch.osc.frequency.setTargetAtTime(hz, now, tc);
    const normCoeff = WAVEFORM_GAIN[sig.type] ?? 1.0;
    ch.ampGain.gain.setTargetAtTime(sig.amp * 0.1 * normCoeff, now, tc); // RMS-compensated

    if (ch.modOsc) {
        hz = freqToHz(sig.freq);
        ch.modOsc.frequency.setTargetAtTime(hz * 0.25, now, tc);
        ch.modGain.gain.setTargetAtTime(Math.max(0.1, sig.harm || 0.5) * 0.8, now, tc);
    }
}

/**
 * Fades and fully tears down a channel.
 * @param {Channel} ch
 */
function _destroyChannel(ch) {
    if (!ch.masterGain) return;
    const ac = actx();
    const now = ac.currentTime;
    ch.masterGain.gain.setValueAtTime(ch.masterGain.gain.value, now);
    ch.masterGain.gain.linearRampToValueAtTime(0, now + PB.FADE);
    const snap = { ...ch };
    setTimeout(() => {
        try { snap.osc?.stop(); } catch (err) { console.warn(err); }
        try { snap.modOsc?.stop(); } catch (err) { console.warn(err); }
        [snap.carGain, snap.modGain, snap.ampGain, snap.filter, snap.masterGain, snap.vibratoGain]
            .forEach(n => { try { n?.disconnect(); } catch (err) { console.warn(err); } });
        try { snap.vibratoLfo?.stop(); } catch (err) { console.warn(err) };
        try { snap.vibratoLfo?.disconnect(); } catch (err) { console.warn(err) };
    }, (PB.FADE + 0.05) * 1000);
    Object.assign(ch, _emptyChannel());
}

/**
 * Fades a channel master to a target volume.
 * @param {Channel} ch
 * @param {number}  vol
 */
function _setVol(ch, vol) {
    if (!ch.masterGain) return;
    const ac = actx();
    const now = ac.currentTime;
    ch.masterGain.gain.setValueAtTime(ch.masterGain.gain.value, now);
    ch.masterGain.gain.linearRampToValueAtTime(vol, now + PB.FADE);
}

// ── public API ────────────────────────────────────────────────────────────────

/** Build both channels. Call once per round after targetSignal is set. */
function startSignalPlayback() {
    _playbackActive = true;
    _buildChannel(_chTarget, targetSignal);
    _buildChannel(_chYours, yoursSignal);
    setPlaybackMode(_pbMode); // restore last active mode
}

/** Tear down both channels. Call on round end / game over / menu. */
function stopSignalPlayback() {
    _playbackActive = false;
    _pbMode = "off";
    _destroyChannel(_chTarget);
    _destroyChannel(_chYours);
    _updatePlaybackUI();
}

/**
 * Switch which channel(s) are audible.
 * Pressing the current active mode again turns it off.
 * @param {PlaybackMode} mode
 */
function setPlaybackMode(mode) {
    _pbMode = mode;
    if (muted || !_playbackActive) { _updatePlaybackUI(); return; }

    const t = mode === "target" || mode === "ab" ? PB.TARGET_VOL : 0;
    const y = mode === "yours" || mode === "ab" ? PB.YOURS_VOL : 0;
    _setVol(_chTarget, t);
    _setVol(_chYours, y);
    _updatePlaybackUI();
}

/** Update yours channel live while sliders move. Called from recompute(). */
function updateYoursPlayback() {
    if (!_playbackActive || muted) return;
    _updateChannel(_chYours, yoursSignal);
    // Restore correct volume for current mode after a type-change rebuild
    const y = _pbMode === "yours" || _pbMode === "ab" ? PB.YOURS_VOL : 0;
    _setVol(_chYours, y);
}

function _updatePlaybackUI() {
    const modes = ["target", "yours", "ab"];
    modes.forEach(mode => {
        UI.playback[mode]?.classList.toggle("active", _pbMode === mode && _playbackActive);
    });
}

// ─── MATH ────────────────────────────────────────────────────────────────────

function smoothstep(x) { return x * x * (3 - 2 * x); }
function sigmoid(x) { return 1 / (1 + Math.exp(-8 * (x - 0.5))); }

// ─── SINE LUT ────────────────────────────────────────────────────────────────

const LUT_SIZE = 8192, MASK = LUT_SIZE - 1, SCALE = LUT_SIZE / (Math.PI * 2);
const SIN_LUT = new Float32Array(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) SIN_LUT[i] = Math.sin((i / LUT_SIZE) * Math.PI * 2);

function fastSin(x) {
    const pos = x * SCALE, idx = Math.floor(pos), iA = idx & MASK, a = SIN_LUT[iA];
    return a + (SIN_LUT[iA + 1] - a) * (pos - idx);
}

// ─── SIGNAL SAMPLING ─────────────────────────────────────────────────────────

function sample(sig, t, addNoise) {
    const { type, freq, phase, amp, harm, noise, dc } = sig;
    const u = (freq * t + phase / 360) % 1;
    const x = u * 6.283185307179586;

    let v;
    switch (type) {
        case "sine": v = fastSin(x); break;
        case "square": v = fastSin(x) >= 0 ? 1 : -1; break;
        case "sawtooth": v = 2 * u - 1; break;
        case "triangle": v = u < 0.5 ? 4 * u - 1 : 3 - 4 * u; break;
        case "pwm": v = u < 0.65 ? 1 : -1; break;
        case "am": {
            v = fastSin(x) * (1 + (harm || 0.5) * fastSin(x * 0.25)) * 0.5;
        } break;
        default: throw new Error(`Unhandled waveform: "${type}"`);
    }

    if (harm && type !== "am") v += (harm * 0.1) * fastSin(x * 3);
    if (addNoise && noise) v += (noise * 0.1) * (rand() * 0.8 - 0.4);
    return (amp * 0.1) * v + (dc ?? 0) * 0.1;
}

// ─── MATCH SCORE (CACHED) ─────────────────────────────────────────────────────

const SCORE_SAMPLES = 96, INV_SCORE_SAMPLES = 1 / 96, SCORE_SCALE = 1 / (2 * 96);
let _cachedMatchScore = 0, _matchScoreDirty = true;

function invalidateMatchScore() { _matchScoreDirty = true; }

function matchScore() {
    if (!_matchScoreDirty) return _cachedMatchScore;
    let d0 = 0, d1 = 0, d2 = 0, d3 = 0;
    for (let i = 0; i < SCORE_SAMPLES; i += 4) {
        const s0 = sample(targetSignal, i * INV_SCORE_SAMPLES, false) - sample(yoursSignal, i * INV_SCORE_SAMPLES, false);
        const s1 = sample(targetSignal, (i + 1) * INV_SCORE_SAMPLES, false) - sample(yoursSignal, (i + 1) * INV_SCORE_SAMPLES, false);
        const s2 = sample(targetSignal, (i + 2) * INV_SCORE_SAMPLES, false) - sample(yoursSignal, (i + 2) * INV_SCORE_SAMPLES, false);
        const s3 = sample(targetSignal, (i + 3) * INV_SCORE_SAMPLES, false) - sample(yoursSignal, (i + 3) * INV_SCORE_SAMPLES, false);
        d0 += s0 < 0 ? -s0 : s0; d1 += s1 < 0 ? -s1 : s1;
        d2 += s2 < 0 ? -s2 : s2; d3 += s3 < 0 ? -s3 : s3;
    }
    const raw = 1 - (d0 + d1 + d2 + d3) * SCORE_SCALE;
    _cachedMatchScore = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    _matchScoreDirty = false;
    return _cachedMatchScore;
}

// Noise as tolerance band
//
// winThreshold() replaces the hardcoded CONFIG.WIN_PERCENTAGE in updateMeter().
// It computes: max(75, 95 - noise × 1.8). At max noise (6 units) the threshold
// drops to ~84%. At zero noise it's exactly 95% as before.
//
// The noise slider is permanently hidden via applyLevelUI() — one comment line.
// The ctrl-noise element stays in the HTML for future use. The target still has
// noise (it affects visuals and audio texture), but players never need to match
// it — they just need to get close enough despite it.
//
// The 1.8 pts per unit constant is in CONFIG.NOISE_TOLERANCE_PER_UNIT — tunable without touching logic.

/**
 * Win threshold for the current round, accounting for noise tolerance.
 * Noisy targets are inherently harder to match precisely — noise widens the
 * acceptable window so players aren't penalised for the signal's own jitter.
 * noise=0 → 95% required. noise=6 (max) → ~84% required.
 * @returns {number} percentage (0–100)
 */
function winThreshold() {
    const noiseReduction = (targetSignal.noise ?? 0) * CONFIG.NOISE_TOLERANCE_PER_UNIT;
    return Math.max(75, CONFIG.WIN_PERCENTAGE - noiseReduction); // TODO: Tweak the max (last level seems too easy)
}

// ─── CANVAS ───────────────────────────────────────────────────────────────────

/** @type {HTMLCanvasElement} */ let _canvas;
/** @type {CanvasRenderingContext2D} */ let _ctx;
let _canvasW = 320;

function initCanvas() {
    _canvas = /** @type {HTMLCanvasElement} */ (UI.canvas);
    _ctx = _canvas.getContext("2d");
    if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(entries => { _canvasW = Math.round(entries[0].contentRect.width) || 320; }).observe(_canvas);
    } else {
        _canvasW = _canvas.offsetWidth || 320;
    }
}

// ─── RENDER LOOP ──────────────────────────────────────────────────────────────

/**
 * Maximum delta time (milliseconds).
 * 
 * Lower value = higher FPS floor. Determines smoothness and timing precision.
 * - 10ms → ~100 FPS (high-refresh displays, competitive)
 * - 15ms → ~67 FPS (✓ default: rhythm-game sweet spot)
 * - 20ms → ~50 FPS (forgiving, still smooth)
 * - 30ms → ~33 FPS (lower-end devices)
 * 
 * Ensures crisp scroll animation, tight timing precision, and handles frame stutters gracefully.
 */
const _DT_MAX = 15.0;

const _FRAME_INDEPENDENT = true;

// `elapsedTime` grows smoothly regardless of frame rate
// When frames skip or stutter, dt compensates (clamped at dtMax)
// Dividing by getScrollPeriod() now gives consistent scroll speed across all frame rates
// Scroll gets faster each level (shorter period) — harder levels scroll quicker.
let _elapsedTime = 0;

const PHI = (1 + Math.sqrt(5)) / 2;

const _SCROLL_BASE_MS = 3500;
const _SCROLL_MIN_MS = 2000;
const _SCROLL_EASE_EXP = PHI;
const _SCROLL_EASE_FACTOR = 60;

function getScrollPeriod() {
    return Math.max(_SCROLL_MIN_MS, _SCROLL_BASE_MS - Math.pow(level, _SCROLL_EASE_EXP) * _SCROLL_EASE_FACTOR);
}

/** @type {DOMHighResTimeStamp} */ let _lastTime = 0;

/*
 * Current Rendering Bottlenecks
 *
 * Area                         Technique                               Pain Point
 * ---------------------------------------------------------------------------------------------
 * Logo scope (900×300)         shadowBlur: 16–20 on every frame       Notorious perf hog —
 *                                                                     triggers software fallback
 *                                                                     on many browsers
 *
 * Main wave canvas (320×120)   lineTo per pixel,                      Trivial — no bottleneck
 *                              globalAlpha compositing
 *
 * Convergence animation        globalAlpha fade + overlay             Fine — no bottleneck
 *
 * Noise/static effect          CSS steps(1) animation                 Fine
 */

/**
 * Loop is callback `FrameRequestCallback` for requestAnimationFrame
 * @link [MDN Reference](https://developer.mozilla.org/docs/Web/API/DedicatedWorkerGlobalScope/requestAnimationFrame)
 * @param {DOMHighResTimeStamp} ts
 * @returns {void}
 */
function loop(ts) {
    const dt = Math.min(ts - _lastTime, _DT_MAX);
    _elapsedTime += dt;

    /**
     * Normalized scroll position [0, 1). Wraps every SCROLL_PERIOD ms.
     * Example: _elapsedTime = 4000ms → 4000/2000 = 2.0 → 2.0 % 1 = 0.0 (loops)
     * Used for horizontal wave scrolling position.
     */
    const period = getScrollPeriod();
    const scroll = _FRAME_INDEPENDENT ?
        (_elapsedTime / period) % 1
        : (ts / period) % 1;

    const W = _canvasW, H = 120;
    if (_canvas.width !== W || _canvas.height !== H) { _canvas.width = W; _canvas.height = H; }
    _ctx.clearRect(0, 0, W, H);

    const sc = matchScore(), t = smoothstep(sc);
    const LOCK_DUR = 1950;
    let lockT = 0;
    if (_lockAnimStart > 0) {
        lockT = Math.min((ts - _lockAnimStart) / LOCK_DUR, 1);
        if (lockT >= 1) _lockAnimStart = 0;
    }

    if (lockT > 0 && lockT < 1) {
        const release = Math.min(Math.max((lockT - 0.1) / 0.6, 0), 1);

        _ctx.globalAlpha = 0.25 * (1 - release);
        drawWave(targetSignal, "#448855", W, H, scroll, 1.5);

        const flash = Math.max(0, 1 - lockT / 0.35);
        _ctx.globalAlpha = flash * 0.7;
        drawWave(yoursSignal, "#66ff88", W, H, scroll, 3 + 2 * flash);

        const settle = Math.min(lockT / 0.25, 1);
        _ctx.globalAlpha = 0.4 + 0.6 * settle;
        drawWave(yoursSignal, WAVE_COLORS.yours, W, H, scroll, 2);
    } else {
        if (roundNo === 1) { _ctx.globalAlpha = 0.1 + 0.65 * sigmoid(sc); drawWave(targetSignal, "#00ff88", W, H, scroll, 4 / 2); }
        else if (roundNo % 2 === 0) { _ctx.globalAlpha = 0.15 + 0.55 * Math.sqrt(sc); drawWave(targetSignal, "#5b8dd9", W, H, scroll, 4 / 2); }
        else { _ctx.globalAlpha = 0.15 + 0.6 * t; drawWave(targetSignal, WAVE_COLORS.target, W, H, scroll, (3 + sc) / 2); }

        _ctx.globalAlpha = 0.4 + 0.6 * t;
        if (roundNo === 1) drawWave(yoursSignal, "#ffb830", W, H, scroll, 4 / 2);
        else if (roundNo % 2 === 0) drawWave(yoursSignal, "#e8604a", W, H, scroll, 4 / 2);
        else drawWave(yoursSignal, WAVE_COLORS.yours, W, H, scroll, 4 / 2);
    }

    _ctx.globalAlpha = 1;

    _lastTime = ts;
    animRaf = requestAnimationFrame(loop);
}

function drawWave(sig, color, W, H, scroll, lineW) {
    const halfH = H * 0.5, yOffset = halfH - 10, invW = 1 / W;
    _ctx.strokeStyle = color; _ctx.lineWidth = lineW || 1.8;
    _ctx.beginPath();
    for (let px = 0; px <= W; px += 2) {
        const y = halfH - sample(sig, (px * invW - scroll + 1) % 1, true) * yOffset;
        if (px === 0) _ctx.moveTo(px, y); else _ctx.lineTo(px, y);
    }
    _ctx.stroke();
}

// ─── FLASH + SCORE POP ───────────────────────────────────────────────────────

function flash(color) {
    const el = UI.displays.flash; el.style.background = color;
    el.classList.add("go"); setTimeout(() => el.classList.remove("go"), 80);
}

function showScorePop(points) {
    const scoreEl = UI.displays.score; if (!scoreEl) return;
    const pop = document.createElement("div");
    pop.className = "score-pop"; pop.textContent = "+" + points;
    scoreEl.parentElement.style.position = "relative";
    scoreEl.parentElement.appendChild(pop);
    setTimeout(() => pop.remove(), 800);
    const gi = UI.gameInner;
    gi.classList.add("shake-light"); setTimeout(() => gi.classList.remove("shake-light"), 300);
}

// ─── METER ───────────────────────────────────────────────────────────────────

let _lastPct = 0;

function updateMeter() {
    if (won || freePlayActive) return;

    const sc = matchScore();

    const pct = Math.round(sc * 100);
    if (pct !== _lastPct) {
        _lastPct = pct;

        UI.displays.pct.textContent = `${pct}%`;

        const fill = UI.displays.fill;
        // DEPRECATE: fill.style.width = `${pct}%`;
        //            CSS add: min-width: 100%; lol (kinda works)
        fill.style.transform = `scaleX(${pct * 0.01})`;
        fill.style.background = pct > 80 ? "var(--green)" : pct > 50 ? "var(--amber)" : "var(--red)";
    }

    const fb = UI.displays.feedback;
    const winPct = winThreshold();

    if (pct >= winPct) {
        _wasCloseSfx = false;
        if (tutorialActive) { checkTutorial(); return; }
        won = true; // Don't freeze sliders during tutorial — step checks may not have passed yet
        _lockAnimStart = performance.now();
        clearInterval(timerInterval);
        const gain = CONFIG.BASE_REWARD + Math.ceil(timeLeft * CONFIG.TIME_BONUS_RATE);
        score += gain; UI.displays.score.textContent = score; showScorePop(gain);
        fb.textContent = `LOCKED IN +${gain} pts`; fb.className = "feedback win";
        flash("var(--green)"); SFX.lock(); spawnStamp("success");
        if (navigator.vibrate) navigator.vibrate(100);
        setTimeout(() => nextRound(), 1800);
    } else if (pct >= CONFIG.CLOSE_PERCENTAGE) {
        if (tutorialActive) return;
        fb.textContent = "Getting close…"; fb.className = "feedback close";
        if (!_wasCloseSfx) { SFX.close(); _wasCloseSfx = true; }
    } else {
        if (tutorialActive) return;
        fb.textContent = "Match the target signal."; fb.className = "feedback";
        _wasCloseSfx = false;
    }
}

// ─── INPUT HANDLERS (rAF-throttled) ──────────────────────────────────────────

let _recomputeScheduled = false, _setTypeScheduled = false;

function recompute() {
    if (won) return; // NOTE: Freeze sliders on lock-in
    yoursSignal.freq = +UI.sliders.freq.value; yoursSignal.amp = +UI.sliders.amp.value;
    yoursSignal.phase = +UI.sliders.phase.value; yoursSignal.dc = +UI.sliders.dc.value;
    yoursSignal.harm = +UI.sliders.harm.value; yoursSignal.noise = +UI.sliders.noise.value;
    invalidateMatchScore();
    if (_recomputeScheduled) return;
    _recomputeScheduled = true;
    requestAnimationFrame(() => {
        updateMeter();
        UI.labels.freq.textContent = `${yoursSignal.freq} Hz`;
        UI.labels.amp.textContent = (yoursSignal.amp / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
        UI.labels.phase.textContent = `${yoursSignal.phase}°`;
        UI.labels.dc.textContent = (yoursSignal.dc / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
        UI.labels.harm.textContent = (yoursSignal.harm / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
        UI.labels.noise.textContent = (yoursSignal.noise / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
        UI.sliders.freq.setAttribute("aria-valuetext", yoursSignal.freq + " Hz");
        UI.sliders.amp.setAttribute("aria-valuetext", (yoursSignal.amp / 10).toFixed(1));
        UI.sliders.phase.setAttribute("aria-valuetext", yoursSignal.phase + "°");
        UI.sliders.dc.setAttribute("aria-valuetext", (yoursSignal.dc / 10).toFixed(1));
        UI.sliders.harm.setAttribute("aria-valuetext", (yoursSignal.harm / 10).toFixed(1));
        UI.sliders.noise.setAttribute("aria-valuetext", (yoursSignal.noise / 10).toFixed(1));
        const now = Date.now();
        if (now - _lastSliderSfx > 80) { SFX.slider(); _lastSliderSfx = now; }
        updateYoursPlayback();
        if (tutorialActive) checkTutorial();
        _recomputeScheduled = false;
    });
}

function setType(btn) {
    if (won) return; // NOTE: Freeze waveform type buttons on lock-in
    document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); yoursSignal.type = btn.dataset.t; invalidateMatchScore();
    if (_setTypeScheduled) return;
    _setTypeScheduled = true;
    requestAnimationFrame(() => {
        updateMeter(); SFX.tick();
        updateYoursPlayback();
        if (navigator.vibrate) navigator.vibrate(50);
        if (tutorialActive) checkTutorial();
        _setTypeScheduled = false;
    });
}

// ─── SIGNAL BUILDERS ─────────────────────────────────────────────────────────

function buildTarget() {
    const lv = LEVELS[level];
    return {
        type: lv.types[rng(0, lv.types.length - 1)],
        freq: rng(1, 6), amp: rng(3, 10),
        phase: lv.phase ? rng(0, 7) * 45 : 0,
        dc: lv.dc ? rng(-3, 3) : 0,
        harm: lv.harm ? rng(0, 5) : 0,
        noise: lv.noise ? rng(2, 6) : 0,
    };
}

function resetYours() {
    yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    ["freq", "amp", "phase", "dc", "harm", "noise"].forEach(k => { const el = document.getElementById(`sl-${k}`); if (el) el.value = yoursSignal[k]; });
    document.querySelectorAll(".type-btn").forEach(b => b.classList.toggle("active", b.dataset.t === "sine"));
    invalidateMatchScore(); recompute();
}

// ─── LEVEL UI ────────────────────────────────────────────────────────────────

function applyLevelUI() {
    const lv = LEVELS[level];
    UI.labels.level.textContent = level + 1; UI.displays.roundTotal.textContent = lv.rounds;
    UI.controls.phase.style.opacity = lv.phase ? "1" : ".3";
    UI.controls.dc.style.opacity = lv.dc ? "1" : ".3";
    UI.controls.harm.style.display = lv.harm ? "" : "none";
    // Noise is atmosphere (tolerance band), not a puzzle param — always hidden
    //     UI.controls.noise.style.display = lv.noise ? "" : "none";
    UI.controls.noise.style.display = "none";
    UI.buttons.pwm.disabled = !lv.types.includes("pwm");
    UI.buttons.am.disabled = !lv.types.includes("am");
}

// ─── TIMER ───────────────────────────────────────────────────────────────────

function startTimer() {
    clearInterval(timerInterval);
    const lv = LEVELS[level];
    // Grace period
    // startTimer() now reads lv.grace && roundNo === 1. When true: the timer ring turns blue instead of orange (visual signal to the player that this round is safe), the urgent SFX never fires, and on timeout it calls nextRound() after a 1.2s pause with the message "Time's up. Now it counts." — not gameOver().
    // Grace is on levels 3, 4, 5, 6, 7 — every level that introduces a new parameter. Level 2 doesn't get it because it only adds waveform shapes, which players already understand the control for.
    // showLevelUpScreen() now dynamically generates its message from the level config — it lists the new params, whether there's a grace round, and whether there's a warmup. Players arrive knowing what's coming.
    const grace = lv.grace && roundNo === 1; // grace round: timeout advance, never kills
    const total = timeLeft = lv.time;
    const el = UI.displays.timer, ring = UI.timerRingFill, C = 125.6; // C = 2π × r=20

    ring.style.transition = "none"; ring.style.strokeDashoffset = "0";
    ring.style.stroke = grace ? "var(--blue)" : "#f0690a"; // blue ring = safe round
    const enableExpensiveSynchronousLayoutOnMobile = false;
    if (enableExpensiveSynchronousLayoutOnMobile) {
        ring.getBoundingClientRect(); // force reflow
    }
    ring.style.transition = "stroke-dashoffset 1s linear, stroke 0.3s";

    el.textContent = timeLeft; el.className = "timer-ring-label";
    if (grace) UI.displays.feedback.textContent = "Explore freely — no penalty this round.";

    timerInterval = setInterval(() => {
        timeLeft--;
        ring.style.strokeDashoffset = C * (1 - timeLeft / total);
        const urgent = !grace && timeLeft <= 8;
        el.textContent = timeLeft;
        el.className = urgent ? "timer-ring-label urgent" : "timer-ring-label";
        ring.style.stroke = grace ? "var(--blue)" : (urgent ? "#e85a4a" : "#f0690a");
        if (urgent) { const now = Date.now(); if (now - _lastUrgentSfx > 500) { SFX.urgent(); _lastUrgentSfx = now; } }
        if (timeLeft <= 0 && !won) {
            clearInterval(timerInterval);
            if (grace) { // Grace timeout: no gameOver.
                UI.displays.feedback.textContent = "Time's up. Now it counts.";
                const enableAdvanceToNextRound = false;
                if (enableAdvanceToNextRound) setTimeout(() => nextRound(), 1200);
            } else {
                gameOver();
            }
        }
    }, 1000);
}

// ─── LOOP CONTROL ────────────────────────────────────────────────────────────

function startLoop() { if (animRaf !== null) { cancelAnimationFrame(animRaf); animRaf = null; } animRaf = requestAnimationFrame(loop); }
function stopLoop() { _lockAnimStart = 0; if (animRaf !== null) { cancelAnimationFrame(animRaf); animRaf = null; } }

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

function exitLevel() {
    _lockAnimStart = 0;
    clearInterval(timerInterval);
    timerInterval = null;
    stopLoop();
    stopSignalPlayback();
    won = false;
}

function enterLevel() {
    showScreen("game");
    targetSignal = buildTarget();
    invalidateMatchScore();
    applyLevelUI();
    resetYours();
    const feedback = UI.displays.feedback;
    feedback.textContent = "Match the target signal.";
    feedback.className = "feedback";
    startTimer();
    startSignalPlayback();
    startLoop();
}

// ─── FREE-PLAY WARMUP ────────────────────────────────────────────────────────
// An untimed sandbox round before the first round of levels that have
// freeplay:true. No target signal, no score, no timer. Just the player's
// signal and the controls. A "READY →" button starts the real round.

/**
 * Starts the free-play warmup for the current level.
 * Called from nextRound() when level.freeplay && roundNo === 1.
 */
function startFreePlay() {
    freePlayActive = true;
    clearInterval(timerInterval);

    // Show a neutral target (flat sine) so the scope isn't empty,
    // but make it invisible — the warmup is about YOUR signal, not matching.
    // HACK: amp: 0 silent target is a code smell worth removing later.
    targetSignal = { type: "sine", freq: 1, amp: 0, phase: 0, dc: 0, harm: 0, noise: 0 };
    invalidateMatchScore();
    applyLevelUI();
    resetYours();

    // Timer ring: hide it (full, dim, no color)
    const ring = UI.timerRingFill;
    ring.style.transition = "none";
    ring.style.strokeDashOffset = "0";
    ring.style.stroke = "var(--surface)";
    const timer = UI.displays.timer;
    timer.textContent = "∞";
    timer.className = "timer-ring-label";

    // Feedback and ready button
    const feedback = UI.displays.feedback;
    feedback.textContent = "Free explore — try the controls. Hit READY when done.";
    feedback.className = "feedback close";
    UI.buttons.freeplayReady.style.display = "inline-block";
    UI.meterRow.style.opacity = "0.2"; // meter meaningless during warmup

    // Start yours playback so they can hear their own signal.
    stopSignalPlayback();
    _playbackActive = true;
    _buildChannel(_chYours, yoursSignal);
    setPlaybackMode("yours");
}

/** Called by the READY button — ends free-play and starts the real round 1. */
function endFreePlay() {
    freePlayActive = false;
    UI.buttons.freeplayReady.style.display = "none";
    UI.meterRow.style.opacity = "1";
    stopSignalPlayback();
    enterLevel();
}

// ─── ROUND / LEVEL FLOW ───────────────────────────────────────────────────────

function nextRound() {
    won = false; _lockAnimStart = 0; roundNo++;
    if (level >= LEVELS.length) {
        level = LEVELS.length - 1;
        roundNo = 1;
        startFreePlay();
        const feedback = UI.displays.feedback;
        feedback.textContent = `All ${LEVELS.length} levels unlocked. Feel Free To Explore.`; feedback.className = "feedback close";
        return;
    }
    const lv = LEVELS[level];
    if (roundNo > lv.rounds) {
        recordLevelComplete(level, score - levelStartScore);
        const nextLevel = level + 1;
        if (nextLevel >= LEVELS.length) { victory(); return; }
        level = nextLevel; roundNo = 1; levelStartScore = score;
        showLevelUpScreen(); return;
    }
    UI.displays.roundNo.textContent = roundNo;

    if (lv.freeplay && roundNo === 1) { startFreePlay(); return; }

    enterLevel();
}

function showLevelUpScreen() {
    exitLevel();
    UI.displays.luTitle.textContent = `LEVEL ${level + 1}`;
    const lv = LEVELS[level];
    const newParams = ["phase", "dc", "harm", "noise"].filter(k => lv[k]);
    // TODO: POLISH: Use screen transition like that Sine worm game (bitcrusher, distortion)
    // Wavy vignette wobbly screen reveal of param
    const paramStr = newParams.length ? `New: ${newParams.join(", ")}.` : "";
    const warmupStr = lv.freeplay ? " Free warmup round to explore." : "";
    const graceStr = lv.grace ? " First round has no time penalty." : "";
    UI.displays.luMsg.textContent = [paramStr, graceStr, warmupStr].filter(Boolean).join(" ") || "Good luck.";
    showScreen("levelup");
    SFX.levelUp();
}

function continueLevel() {
    UI.displays.roundNo.textContent = roundNo;
    enterLevel();
}

function victory() {
    exitLevel();
    const h3 = UI.displays.screenDead?.querySelector("h3");
    if (h3) { h3.textContent = "MIXED SIGNALS MASTERED"; h3.style.color = "var(--green)"; }
    UI.displays.deadMsg.textContent = `All ${LEVELS.length} levels cleared with ${score} pts. Legendary.`;
    showScreen("dead"); SFX.levelUp();
}

function gameOver() {
    exitLevel(); flash("#ff4554"); spawnStamp("fail");
    const h3 = UI.displays.screenDead?.querySelector("h3");
    if (h3) { h3.textContent = "SIGNAL LOST"; h3.style.color = "var(--red)"; }
    UI.displays.deadMsg.textContent = `Level ${level + 1} · Round ${roundNo} · ${score} pts`;
    showScreen("dead"); SFX.fail();
    const gi = UI.gameInner;
    gi.classList.add("shake"); setTimeout(() => gi.classList.remove("shake"), 500);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

/** Exits gameplay cleanly from any state. */
function goToMenu() {
    exitLevel();
    if (tutorialActive) {
        tutorialActive = false;
        document.querySelectorAll(".tutorial-glow").forEach(el => el.classList.remove("tutorial-glow"));
        UI.buttons.skipTut.style.display = "none";
    }
    won = false; freePlayActive = false;
    const btnFreePlayReady = UI.buttons.freeplayReady; if (btnFreePlayReady) btnFreePlayReady.style.display = "none";
    const meterRow = UI.meterRow; if (meterRow) meterRow.style.opacity = "1";
    renderStartScreen(); showScreen("start");
}

// ─── GAME ENTRY POINTS ────────────────────────────────────────────────────────

function startGame() {
    score = levelStartScore; roundNo = 0;
    if (!lsGet("tutorialSeen") && !tutorialActive) { startTutorial(); return; }
    UI.displays.score.textContent = score;
    showScreen("game"); startLoop(); nextRound();
}

function restartGame() { _lockAnimStart = 0; score = 0; levelStartScore = 0; level = 0; startGame(); }

function startTutorial() {
    _lockAnimStart = 0; tutorialActive = true; tutorialStep = 0; score = 0;
    showScreen("game"); startLoop();
    targetSignal = { type: "triangle", freq: 5, amp: 8, phase: 360, dc: 2, harm: 0, noise: 0 };
    invalidateMatchScore();
    roundNo = 1; UI.displays.roundNo.textContent = 1; UI.displays.roundTotal.textContent = 1;
    UI.controls.phase.style.opacity = "1"; UI.controls.dc.style.opacity = "1";
    UI.controls.harm.style.display = "none"; UI.controls.noise.style.display = "none";
    UI.buttons.pwm.disabled = false; UI.buttons.am.disabled = false;
    UI.buttons.skipTut.style.display = "inline-block";
    resetYours(); recompute(); showTutorialTask();
    startSignalPlayback();
}

// ─── TUTORIAL ────────────────────────────────────────────────────────────────

function showTutorialTask() {
    if (tutorialStep >= TUTORIAL_TASKS.length) { endTutorial(); return; }
    UI.displays.feedback.textContent = TUTORIAL_TASKS[tutorialStep].text;
    UI.displays.feedback.className = "feedback";
    highlightControl();
}

// ─── TUTORIAL STEP LOCKING ─────────────────────────────────────────────────
// Each completed step locks its control (disabled + dimmed) so the player
// can't accidentally break a matched parameter while tuning the next one.
// lockControl() disables interactive children of the step's control element.
// unlockAllTutorialControls() cleans up on exit (end/skip/restart).
// When a step's check passes, checkTutorial() locks it, advances, then
// recurses — cascading through any already-satisfied future steps so the
// player never has to re-confirm an already-met condition.

function lockControl(stepIndex) {
    const id = TUTORIAL_CONTROLS[stepIndex];
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("tutorial-done");
    el.querySelectorAll("input, button").forEach(i => i.disabled = true);
}

function unlockAllTutorialControls() {
    document.querySelectorAll(".tutorial-done, .tutorial-glow").forEach(el => {
        el.classList.remove("tutorial-done", "tutorial-glow");
        el.querySelectorAll("input, button").forEach(i => i.disabled = false);
    });
}

function checkTutorial() {
    if (!tutorialActive || tutorialStep >= TUTORIAL_TASKS.length) return;
    if (TUTORIAL_TASKS[tutorialStep].check()) {
        lockControl(tutorialStep);
        tutorialStep++;
        showTutorialTask();
        checkTutorial();
    }
}

function highlightControl() {
    document.querySelectorAll(".tutorial-glow").forEach(el => el.classList.remove("tutorial-glow"));
    const id = TUTORIAL_CONTROLS[tutorialStep];
    if (id) {
        document.getElementById(id)?.classList.add("tutorial-glow");
        UI.displays.feedback?.classList.add("tutorial-glow-text");
    }
}

function skipTutorial() {
    tutorialActive = false; lsSet("tutorialSeen", "true");
    unlockAllTutorialControls();
    UI.buttons.skipTut.style.display = "none";
    stopSignalPlayback();
    const feedback = UI.displays.feedback;
    feedback.textContent = "Tutorial skipped. Click NEW GAME to start playing.";
    renderStartScreen(); showScreen("start");
}

function endTutorial() {
    tutorialActive = false; lsSet("tutorialSeen", "true");
    unlockAllTutorialControls();
    stopSignalPlayback();
    flash("var(--green)"); SFX.lock();
    const feedback = UI.displays.feedback;
    feedback.textContent = "TUTORIAL COMPLETE!"; feedback.className = "feedback win";
    setTimeout(() => {
        UI.buttons.skipTut.style.display = "none";
        renderStartScreen(); showScreen("start");
    }, 1800);
}

// ─── HINTS / SKIP ────────────────────────────────────────────────────────────

function useHint() {
    if (won || score < CONFIG.COST_HINT) { SFX.hintBroke(); spawnStamp("hint_broke"); return; }
    score = Math.max(0, score - CONFIG.COST_HINT); UI.displays.score.textContent = score;
    const lv = LEVELS[level];
    const hints = [
        "type: " + targetSignal.type,
        "freq: " + targetSignal.freq + " Hz",
        "amp: " + (targetSignal.amp / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION),
        ...(lv.phase ? ["phase: " + targetSignal.phase + "°"] : []),
        ...(lv.dc && targetSignal.dc !== 0 ? ["dc: " + (targetSignal.dc / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)] : []),
        ...(lv.harm && targetSignal.harm > 0 ? ["harmonic: " + (targetSignal.harm / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)] : []),
    ];
    const feedback = UI.displays.feedback;
    // FUTURE: Maybe stack/flex row hints as they are gathered. No need to spam
    // the hint button and waste `score` currency
    feedback.textContent = `hint: ${hints[rng(0, hints.length - 1)]}`;
    feedback.className = "feedback close";
    SFX.hint(); spawnStamp("hint");
}

function skipRound() {
    if (score < CONFIG.COST_SKIP) { SFX.skipBroke(); spawnStamp("skip_broke"); return; }
    score = Math.max(0, score - CONFIG.COST_SKIP); UI.displays.score.textContent = score;
    SFX.skip(); spawnStamp("skip"); setTimeout(() => nextRound(), 600); /* delay */
}

// ─── LOGO OSCILLOSCOPE ───────────────────────────────────────────────────────

const LOGO_SCOPE_SCREEN = "start"; // change this if the logo moves later
let _logoScopeRAF = null;

function initLogoScope() {
    const canvas = document.getElementById("logo-scope");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const W = 900;
    const H = 300;

    const mobile = matchMedia("(max-width: 640px)").matches || navigator.maxTouchPoints > 0;

    if (mobile) {
        document.querySelectorAll('[filter="url(#logoGlowSoft)"]')
            .forEach(n => n.removeAttribute("filter"));
    }

    const scale = mobile ? 0.5 : 1;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    ctx.scale(scale * dpr, scale * dpr);

    // Prevent duplicate loops
    if (_logoScopeRAF) {
        cancelAnimationFrame(_logoScopeRAF);
        _logoScopeRAF = null;
    }

    // Resolve palette
    const styles = getComputedStyle(document.documentElement);

    const COLORS = {
        cream: styles.getPropertyValue('--cream').trim(),
        coral: styles.getPropertyValue('--coral').trim(),
    };

    const logoRand = makeRand(1831565813 ^ 0xC0FFEE);

    /* ---------------- SIGNAL CONSTANTS ---------------- */

    const NOISE_LOW_FREQ = 0.02;
    const NOISE_LOW_SPEED = 2.0;
    const NOISE_LOW_AMP = 40;

    const NOISE_HIGH_FREQ = 0.07;
    const NOISE_HIGH_SPEED = 1.3;
    const NOISE_HIGH_AMP = 20;

    const RANDOM_NOISE_AMP = 10;

    const BASE_FREQ = 0.015;
    const BASE_SPEED = 2.2;
    const BASE_AMP = 28;

    const MOD_FREQ = 0.05;
    const MOD_SPEED = 1.1;
    const MOD_AMP = 25;

    const DETAIL_FREQ = 0.11;
    const DETAIL_SPEED = 0.7;
    const DETAIL_AMP = 12;

    /* ---------------- SIGNAL MODEL ---------------- */

    function noise(x, t) {
        return (
            fastSin(x * NOISE_LOW_FREQ + t * NOISE_LOW_SPEED) * NOISE_LOW_AMP +
            fastSin(x * NOISE_HIGH_FREQ - t * NOISE_HIGH_SPEED) * NOISE_HIGH_AMP +
            (logoRand() - 0.5) * RANDOM_NOISE_AMP
        );
    }

    function signal(x, t) {
        return (
            fastSin(x * BASE_FREQ + t * BASE_SPEED) * BASE_AMP +
            fastSin(x * MOD_FREQ + t * MOD_SPEED) * MOD_AMP +
            fastSin(x * DETAIL_FREQ - t * DETAIL_SPEED) * DETAIL_AMP +
            noise(x, t)
        );
    }

    /* ---------------- STROKE HELPERS ---------------- */

    function drawLogoWave(ctx, W, H, t, color, invert, step) {
        const mid = H * 0.5;
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = color;
        for (let x = 0; x < W; x += step) {
            const y = mid + (invert ? -signal(x, t) : signal(x, t));
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    /* ---------------- RENDER LOOP ---------------- */

    let _logoElapsedTime = 0;
    let _logoLastTime = 0;
    let _lastLogoFrame = 0;
    // Optional: Reset on tab blur (prevents huge jumps when tab regains focus)
    window.addEventListener('blur', () => { _logoLastTime = 0; _logoElapsedTime = 0; _lastLogoFrame = 0; });

    function draw(ts) {
        const dt = Math.min(ts - _logoLastTime, _DT_MAX);
        _logoElapsedTime += dt;
        _logoLastTime = ts;

        const frameInterval = mobile ? 50 : 33;
        if (ts - _lastLogoFrame < frameInterval) {
            _logoScopeRAF = requestAnimationFrame(draw);
            return;
        }
        _lastLogoFrame = ts;


        if (currentScreen() !== LOGO_SCOPE_SCREEN) {
            _logoScopeRAF = requestAnimationFrame(draw);
            return;
        }

        // Stop if element vanished
        if (!document.body.contains(canvas)) {
            cancelAnimationFrame(_logoScopeRAF);
            _logoScopeRAF = null;
            return;
        }

        // Stop if start screen hidden
        const startScreen = document.getElementById("screen-start");

        if (!startScreen || startScreen.style.display === "none") {
            _logoScopeRAF = requestAnimationFrame(draw);
            return;
        }

        /**
         * Time in seconds (unbounded). Grows continuously, no wrapping.
         * Example: _logoElapsedTime = 8400ms → 8400 * 0.001 = 8.4 seconds
         * Used for wave oscillations (sine/cosine frequency calculations).
         */
        const t = _FRAME_INDEPENDENT ?
            (_logoElapsedTime * 0.00045)
            : (ts * 0.00045);

        ctx.clearRect(0, 0, W, H);

        const step = mobile ? Math.round(1 / scale) : 1;
        drawLogoWave(ctx, W, H, t, COLORS.cream, false, step);
        drawLogoWave(ctx, W, H, t * 1.05, COLORS.coral, true, step);

        _logoScopeRAF = requestAnimationFrame(draw);
    }

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            cancelAnimationFrame(_logoScopeRAF);
        } else {
            _logoLastTime = performance.now();
            _logoScopeRAF = requestAnimationFrame(draw);
        }
    });

    _logoScopeRAF = requestAnimationFrame(draw);
}

window.addEventListener("DOMContentLoaded", () => {
    initLogoScope();
});

// ─── INIT ────────────────────────────────────────────────────────────────────

initUI();
initEvents();
initCanvas();
initAudio();
renderStartScreen();
showScreen("start");


// ─── TEST ────────────────────────────────────────────────────────────────────

// At the bottom of main.js — lets test.js import pure functions
if (typeof module !== "undefined") {
    module.exports = { sample, matchScore, winThreshold, freqToHz, rng, LEVELS, CONFIG };
}