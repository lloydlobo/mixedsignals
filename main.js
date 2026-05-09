// NOTE: I want to share with you the joy of playing this fun little game.
// NOTE: Heavely Vibed with le' AI
/**
 * @fileoverview Mixed Signals Game
 * @version 1.2.0
 */

/**
 * @typedef {"sine"|"square"|"sawtooth"|"triangle"|"pwm"|"am"} Waveform
 * @typedef {Object} Signal
 * @property {Waveform} type
 * @property {number} freq   Hz
 * @property {number} amp    linear gain
 * @property {number} phase  degrees
 * @property {number} dc     DC offset
 * @property {number} harm   harmonic amount
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
};

const WAVE_COLORS = {
    target: "rgba(200,190,170,0.35)",
    yours: "#f5efe0",
};

/** @readonly @type {Level[]} */
const LEVELS = [
    { rounds: 5, time: 35, types: ["sine", "square"], phase: false, dc: false, harm: false, noise: false },
    { rounds: 5, time: 32, types: ["sine", "square", "sawtooth", "triangle"], phase: false, dc: false, harm: false, noise: false },
    { rounds: 5, time: 30, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: false, harm: false, noise: false },
    { rounds: 5, time: 28, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: true, harm: false, noise: false },
    { rounds: 5, time: 26, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: false, noise: false },
    { rounds: 5, time: 26, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: false },
    { rounds: 5, time: 28, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: true },
];

// ─── GAME STATE ───────────────────────────────────────────────────────────────

/** @type {Signal} */ let targetSignal = {};
/** @type {Signal} */ let yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };

let score = 0, levelStartScore = 0, level = 0, roundNo = 0,
    timeLeft = 0, timerInterval = null, animRaf = null, won = false;

let tutorialStep = 0, tutorialActive = false;

const TUTORIAL_TASKS = [
    { text: "TUTORIAL: Select TRI waveform", check: () => yoursSignal.type === "triangle" },
    { text: "TUTORIAL: Set frequency to 4 Hz", check: () => yoursSignal.freq === 4 },
    { text: "TUTORIAL: Set amplitude around 0.60", check: () => Math.abs(yoursSignal.amp - 6) < 0.5 },
    { text: "TUTORIAL: Set phase around 90°", check: () => Math.abs(yoursSignal.phase - 90) <= 15 },
    { text: "TUTORIAL: Set dc offset around 0.5", check: () => Math.abs(yoursSignal.dc - 5) <= 0.5 },
    { text: "TUTORIAL: Now match the target (95%+)", check: () => matchScore() >= 0.95 },
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
    document.getElementById("game").dataset.screen = screen;
}

function currentScreen() {
    return document.getElementById("game").dataset.screen ?? "start";
}

// ─── DOM CACHE ────────────────────────────────────────────────────────────────

/** @type {Record<string, HTMLElement>} */
const DOM = {};

function initDOM() {
    [
        "game",
        "score", "fill", "pct", "feedback",
        "lbl-freq", "lbl-amp", "lbl-phase", "lbl-dc", "lbl-harm", "lbl-noise",
        "sl-freq", "sl-amp", "sl-phase", "sl-dc", "sl-harm", "sl-noise",
        "timer", "timer-ring-fill",
        "round-no", "round-total", "lbl-level",
        "ctrl-phase", "ctrl-dc", "ctrl-harm", "ctrl-noise",
        "btn-pwm", "btn-am",
        "type-btns", "meter-row",
        "c-overlay", "flash", "game-inner",
        "screen-dead", "lu-title", "lu-msg", "dead-msg",
        "bgm-audio", "mute-btn", "skip-tut",
        "btn-continue", "unlock-msg", "level-select-grid",
        "pb-target", "pb-yours", "pb-ab",
    ].forEach(id => { const el = document.getElementById(id); if (el) DOM[id] = el; });
}

/** @param {string} id @returns {HTMLElement|null} */
function $(id) { return DOM[id] ?? document.getElementById(id); }

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

    const continueBtn = $("btn-continue");
    if (continueBtn) {
        const hasProgress = save.highestLevel > 0 || save.bestScores[0] > 0;
        continueBtn.style.display = hasProgress ? "inline-block" : "none";
        if (hasProgress) continueBtn.textContent = `CONTINUE (LV ${save.highestLevel + 1})`;
    }

    const unlockMsg = $("unlock-msg");
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
    const grid = $("level-select-grid");
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
    const audio = $("bgm-audio"), btn = $("mute-btn");
    audio.muted = muted; audio.volume = volume;
    btn.textContent = muted ? "🔇" : "🎵";
    btn.style.color = muted ? "var(--text-dim)" : "";
    audio.addEventListener("ended", () => {
        if (!muted) { audio.src = pickNextTrack(); audio.play(); }
    });
}

function startMusic() {
    const audio = $("bgm-audio");
    if (muted || !audio.paused) return;
    if (!audio.src || audio.ended) audio.src = pickNextTrack();
    audio.play();
}

function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    $("bgm-audio").volume = volume;
    lsSet("bgmVolume", String(volume));
}

function toggleMute() {
    muted = !muted;
    const audio = $("bgm-audio"), btn = $("mute-btn");
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

document.addEventListener("click", () => { if (!muted) startMusic(); }, { once: true });

// ─── SFX ─────────────────────────────────────────────────────────────────────

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let _actx = null;
function actx() {
    if (!_actx) _actx = new AudioCtx();
    if (_actx.state === "suspended") _actx.resume();
    return _actx;
}

let _lastSliderSfx = 0, _lastUrgentSfx = 0, _wasCloseSfx = false;

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
    lock: () => {
        if (muted) return;
        const ac = actx();
        [[523, 0], [659, 0.07], [784, 0.14], [1047, 0.21]].forEach(([f, t]) => {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = "triangle"; o.frequency.value = f;
            g.gain.setValueAtTime(0, ac.currentTime + t);
            g.gain.linearRampToValueAtTime(0.15, ac.currentTime + t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
            o.connect(g); g.connect(ac.destination);
            o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.2);
        });
    },
    fail: () => {
        if (muted) return;
        const ac = actx();
        [[200, 0], [160, 0.1], [120, 0.22]].forEach(([f, t]) => {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = "sawtooth"; o.frequency.value = f;
            g.gain.setValueAtTime(0.12, ac.currentTime + t);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.18);
            o.connect(g); g.connect(ac.destination);
            o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.2);
        });
    },
    hint: () => {
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 660;
        o.frequency.linearRampToValueAtTime(880, ac.currentTime + 0.12);
        g.gain.setValueAtTime(0.1, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.2);
    },
    levelUp: () => {
        if (muted) return;
        const ac = actx();
        [[330, 0], [392, 0.1], [494, 0.2], [659, 0.32], [880, 0.44]].forEach(([f, t]) => {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = "triangle"; o.frequency.value = f;
            g.gain.setValueAtTime(0.13, ac.currentTime + t);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
            o.connect(g); g.connect(ac.destination);
            o.start(ac.currentTime + t); o.stop(ac.currentTime + 0.28);
        });
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
        g.gain.setValueAtTime(0.05, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.05);
    },
};

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
let _pbMode = "off";
let _playbackActive = false;

const PB = {
    TARGET_VOL: 0.25,
    YOURS_VOL: 0.28,
    FADE: 0.04,  // s — fade in/out to prevent clicks
    TC: 0.02,  // s — AudioParam smoothing time constant
};

/** Gameplay freq 1–6 → audible Hz, exponential 3-octave spread. */
function freqToHz(f) { return 110 * Math.pow(2, ((f - 1) / 5) * 3); }

/**
 * @typedef {Object} Channel
 * @property {OscillatorNode|null} osc
 * @property {OscillatorNode|null} modOsc
 * @property {GainNode|null}       carGain   carrier amplitude node (AM only)
 * @property {GainNode|null}       modGain   modulator depth (AM only)
 * @property {GainNode|null}       ampGain
 * @property {GainNode|null}       masterGain
 * @property {string}              type      last-built waveform type
 */

/** @returns {Channel} */
function _emptyChannel() {
    return { osc: null, modOsc: null, carGain: null, modGain: null, ampGain: null, masterGain: null, type: "" };
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
    const ampGain = ac.createGain();
    ampGain.gain.value = sig.amp * 0.1;     // 1–10 → 0.1–1.0

    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, now);  // start silent — mode sets volume

    // ── connect ───────────────────────────────────────────────────────────────
    (isAM ? carGain : osc).connect(ampGain);
    ampGain.connect(masterGain);
    masterGain.connect(ac.destination);

    // ── start ─────────────────────────────────────────────────────────────────
    osc.start(now);
    modOsc?.start(now);

    // ── store ─────────────────────────────────────────────────────────────────
    ch.osc = osc;
    ch.modOsc = modOsc;
    ch.carGain = carGain;
    ch.modGain = modGain;
    ch.ampGain = ampGain;
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

    ch.osc.frequency.setTargetAtTime(freqToHz(sig.freq), now, tc);
    ch.ampGain.gain.setTargetAtTime(sig.amp * 0.1, now, tc);

    if (ch.modOsc) {
        ch.modOsc.frequency.setTargetAtTime(freqToHz(sig.freq) * 0.25, now, tc);
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
        try { snap.osc?.stop(); } catch { }
        try { snap.modOsc?.stop(); } catch { }
        [snap.carGain, snap.modGain, snap.ampGain, snap.masterGain]
            .forEach(n => { try { n?.disconnect(); } catch { } });
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
    const modes = { "pb-target": "target", "pb-yours": "yours", "pb-ab": "ab" };
    Object.entries(modes).forEach(([id, mode]) => {
        $(id)?.classList.toggle("active", _pbMode === mode && _playbackActive);
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

// ─── CANVAS ───────────────────────────────────────────────────────────────────

/** @type {HTMLCanvasElement} */ let _canvas;
/** @type {CanvasRenderingContext2D} */ let _ctx;
let _canvasW = 320;

function initCanvas() {
    _canvas = /** @type {HTMLCanvasElement} */ ($("c-overlay"));
    _ctx = _canvas.getContext("2d");
    if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(entries => { _canvasW = Math.round(entries[0].contentRect.width) || 320; }).observe(_canvas);
    } else {
        _canvasW = _canvas.offsetWidth || 320;
    }
}

// ─── RENDER LOOP ──────────────────────────────────────────────────────────────

function loop(ts) {
    const scroll = (ts / 4200) % 1;
    const W = _canvasW, H = 120;
    if (_canvas.width !== W || _canvas.height !== H) { _canvas.width = W; _canvas.height = H; }
    _ctx.clearRect(0, 0, W, H);

    const sc = matchScore(), t = smoothstep(sc);

    if (roundNo === 1) { _ctx.globalAlpha = 0.1 + 0.65 * sigmoid(sc); drawWave(targetSignal, "#00ff88", W, H, scroll, 4 / 2); }
    else if (roundNo % 2 === 0) { _ctx.globalAlpha = 0.15 + 0.55 * Math.sqrt(sc); drawWave(targetSignal, "#5b8dd9", W, H, scroll, 4 / 2); }
    else { _ctx.globalAlpha = 0.15 + 0.6 * t; drawWave(targetSignal, WAVE_COLORS.target, W, H, scroll, (3 + sc) / 2); }

    _ctx.globalAlpha = 0.4 + 0.6 * t;
    if (roundNo === 1) drawWave(yoursSignal, "#ffb830", W, H, scroll, 4 / 2);
    else if (roundNo % 2 === 0) drawWave(yoursSignal, "#e8604a", W, H, scroll, 4 / 2);
    else drawWave(yoursSignal, WAVE_COLORS.yours, W, H, scroll, 4 / 2);

    _ctx.globalAlpha = 1;
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
    const el = $("flash"); el.style.background = color;
    el.classList.add("go"); setTimeout(() => el.classList.remove("go"), 80);
}

function showScorePop(points) {
    const scoreEl = $("score"); if (!scoreEl) return;
    const pop = document.createElement("div");
    pop.className = "score-pop"; pop.textContent = "+" + points;
    scoreEl.parentElement.style.position = "relative";
    scoreEl.parentElement.appendChild(pop);
    setTimeout(() => pop.remove(), 800);
    const gi = $("game-inner");
    gi.classList.add("shake-light"); setTimeout(() => gi.classList.remove("shake-light"), 300);
}

// ─── METER ───────────────────────────────────────────────────────────────────

let _lastPct = 0;

function updateMeter() {
    const sc = matchScore();

    const pct = Math.round(sc * 100);
    if (pct !== _lastPct) {
        _lastPct = pct;

        $("pct").textContent = `${pct}%`;

        const fill = $("fill");
        // DEPRECATE: fill.style.width = `${pct}%`;
        //            CSS add: min-width: 100%; lol (kinda works)
        fill.style.transform = `scaleX(${pct * 0.01})`;
        fill.style.background = pct > 80 ? "var(--green)" : pct > 50 ? "var(--amber)" : "var(--red)";
    }

    const fb = $("feedback");
    if (won) return;

    if (pct >= CONFIG.WIN_PERCENTAGE) {
        won = true; _wasCloseSfx = false;
        if (tutorialActive) { checkTutorial(); return; }
        clearInterval(timerInterval);
        const gain = CONFIG.BASE_REWARD + Math.ceil(timeLeft * CONFIG.TIME_BONUS_RATE);
        score += gain; $("score").textContent = score; showScorePop(gain);
        fb.textContent = `LOCKED IN +${gain} pts`; fb.className = "feedback win";
        flash("var(--green)"); SFX.lock();
        if (navigator.vibrate) navigator.vibrate(100);
        setTimeout(() => nextRound(), 1800);
    } else if (pct >= CONFIG.CLOSE_PERCENTAGE) {
        fb.textContent = "Getting close…"; fb.className = "feedback close";
        if (!_wasCloseSfx) { SFX.close(); _wasCloseSfx = true; }
    } else {
        fb.textContent = "Match the target signal."; fb.className = "feedback";
        _wasCloseSfx = false;
    }
}

// ─── INPUT HANDLERS (rAF-throttled) ──────────────────────────────────────────

let _recomputeScheduled = false, _setTypeScheduled = false;

function recompute() {
    yoursSignal.freq = +$("sl-freq").value; yoursSignal.amp = +$("sl-amp").value;
    yoursSignal.phase = +$("sl-phase").value; yoursSignal.dc = +$("sl-dc").value;
    yoursSignal.harm = +$("sl-harm").value; yoursSignal.noise = +$("sl-noise").value;
    invalidateMatchScore();
    if (_recomputeScheduled) return;
    _recomputeScheduled = true;
    requestAnimationFrame(() => {
        updateMeter();
        $("lbl-freq").textContent = `${yoursSignal.freq} Hz`;
        $("lbl-amp").textContent = (yoursSignal.amp / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
        $("lbl-phase").textContent = `${yoursSignal.phase}°`;
        $("lbl-dc").textContent = (yoursSignal.dc / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
        $("lbl-harm").textContent = (yoursSignal.harm / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
        $("lbl-noise").textContent = (yoursSignal.noise / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
        const now = Date.now();
        if (now - _lastSliderSfx > 80) { SFX.slider(); _lastSliderSfx = now; }
        updateYoursPlayback();
        if (tutorialActive) checkTutorial();
        _recomputeScheduled = false;
    });
}

function setType(btn) {
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
    ["freq", "amp", "phase", "dc", "harm", "noise"].forEach(k => { const el = $(`sl-${k}`); if (el) el.value = yoursSignal[k]; });
    document.querySelectorAll(".type-btn").forEach(b => b.classList.toggle("active", b.dataset.t === "sine"));
    invalidateMatchScore(); recompute();
}

// ─── LEVEL UI ────────────────────────────────────────────────────────────────

function applyLevelUI() {
    const lv = LEVELS[level];
    $("lbl-level").textContent = level + 1; $("round-total").textContent = lv.rounds;
    $("ctrl-phase").style.opacity = lv.phase ? "1" : ".3";
    $("ctrl-dc").style.opacity = lv.dc ? "1" : ".3";
    $("ctrl-harm").style.display = lv.harm ? "" : "none";
    $("ctrl-noise").style.display = lv.noise ? "" : "none";
    $("btn-pwm").disabled = !lv.types.includes("pwm");
    $("btn-am").disabled = !lv.types.includes("am");
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
    const el = $("timer"), ring = $("timer-ring-fill"), C = 125.6; // C = 2π × r=20

    ring.style.transition = "none"; ring.style.strokeDashoffset = "0";
    ring.style.stroke = grace ? "var(--blue)" : "#f0690a"; // blue ring = safe round
    const enableExpensiveSynchronousLayoutOnMobile = false;
    if (enableExpensiveSynchronousLayoutOnMobile) {
        ring.getBoundingClientRect(); // force reflow
    }
    ring.style.transition = "stroke-dashoffset 1s linear, stroke 0.3s";

    el.textContent = timeLeft; el.className = "timer-ring-label";
    if (grace) $("feedback").textContent = "Explore freely — no penalty this round.";

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
                $("feedback").textContent = "Time's up. Now it counts.";
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
function stopLoop() { if (animRaf !== null) { cancelAnimationFrame(animRaf); animRaf = null; } }

// ─── ROUND / LEVEL FLOW ───────────────────────────────────────────────────────

function nextRound() {
    won = false; roundNo++;
    const lv = LEVELS[level];
    if (roundNo > lv.rounds) {
        recordLevelComplete(level, score - levelStartScore);
        const nextLevel = level + 1;
        if (nextLevel >= LEVELS.length) { victory(); return; }
        level = nextLevel; roundNo = 1; levelStartScore = score;
        showLevelUpScreen(); return;
    }
    $("round-no").textContent = roundNo;
    targetSignal = buildTarget(); invalidateMatchScore();
    applyLevelUI(); resetYours();
    $("feedback").textContent = "Match the target signal."; $("feedback").className = "feedback";
    startTimer();
    startSignalPlayback();
}

function showLevelUpScreen() {
    clearInterval(timerInterval);
    $("lu-title").textContent = `LEVEL ${level + 1}`;
    const lv = LEVELS[level];
    const newParams = ["phase", "dc", "harm", "noise"].filter(k => lv[k]);
    // TODO: BONUS: Use screen transition like that Sine worm game (bitcrusher, distortion)
    // Wavy vignette wobbly screen reveal of param
    const paramStr = newParams.length ? `New: ${newParams.join(", ")}.` : "";
    const graceStr = lv.grace ? " First round has no time penalty." : "";
    // $("lu-msg").textContent = "New parameters unlocked. Less time. Good luck.";
    $("lu-msg").textContent = [paramStr, graceStr, /* warmupStr */].filter(Boolean).join(" ") || "Good luck.";
    showScreen("levelup");
    SFX.levelUp();
}

function continueLevel() {
    showScreen("game");
    $("round-no").textContent = roundNo;
    targetSignal = buildTarget(); invalidateMatchScore();
    applyLevelUI(); resetYours();
    const feedback = $("feedback");
    feedback.textContent = "Match the target signal."; feedback.className = "feedback";
    startTimer();
    startSignalPlayback();
}

function victory() {
    clearInterval(timerInterval); stopLoop(); stopSignalPlayback();
    const h3 = $("screen-dead")?.querySelector("h3");
    if (h3) { h3.textContent = "MIXED SIGNALS MASTERED"; h3.style.color = "var(--green)"; }
    $("dead-msg").textContent = `All ${LEVELS.length} levels cleared with ${score} pts. Legendary.`;
    showScreen("dead"); SFX.levelUp();
}

function gameOver() {
    clearInterval(timerInterval); stopLoop(); stopSignalPlayback(); flash("#ff4554");
    const h3 = $("screen-dead")?.querySelector("h3");
    if (h3) { h3.textContent = "SIGNAL LOST"; h3.style.color = "var(--red)"; }
    $("dead-msg").textContent = `Level ${level + 1} · Round ${roundNo} · ${score} pts`;
    showScreen("dead"); SFX.fail();
    const gi = $("game-inner");
    gi.classList.add("shake"); setTimeout(() => gi.classList.remove("shake"), 500);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

/** Exits gameplay cleanly from any state. */
function goToMenu() {
    clearInterval(timerInterval); timerInterval = null;
    stopLoop(); stopSignalPlayback();
    if (tutorialActive) {
        tutorialActive = false;
        document.querySelectorAll(".tutorial-glow").forEach(el => el.classList.remove("tutorial-glow"));
        $("skip-tut").style.display = "none";
    }
    won = false;
    renderStartScreen(); showScreen("start");
}

// ─── GAME ENTRY POINTS ────────────────────────────────────────────────────────

function startGame() {
    score = levelStartScore; roundNo = 0;
    if (!lsGet("tutorialSeen") && !tutorialActive) { startTutorial(); return; }
    $("score").textContent = score;
    showScreen("game"); startLoop(); nextRound();
}

function restartGame() { score = 0; levelStartScore = 0; level = 0; startGame(); }

function startTutorial() {
    tutorialActive = true; tutorialStep = 0; score = 0;
    showScreen("game"); startLoop();
    targetSignal = { type: "triangle", freq: 4, amp: 6, phase: 0, dc: 0, harm: 0, noise: 0 };
    invalidateMatchScore();
    roundNo = 1; $("round-no").textContent = 1; $("round-total").textContent = 1;
    $("ctrl-phase").style.opacity = "1"; $("ctrl-dc").style.opacity = "1";
    $("ctrl-harm").style.display = "none"; $("ctrl-noise").style.display = "none";
    $("btn-pwm").disabled = false; $("btn-am").disabled = false;
    $("skip-tut").style.display = "inline-block";
    resetYours(); recompute(); showTutorialTask();
    startSignalPlayback();
}

// ─── TUTORIAL ────────────────────────────────────────────────────────────────

function showTutorialTask() {
    if (tutorialStep >= TUTORIAL_TASKS.length) { endTutorial(); return; }
    $("feedback").textContent = TUTORIAL_TASKS[tutorialStep].text;
    $("feedback").className = "feedback";
    highlightControl();
}

function checkTutorial() {
    if (!tutorialActive || tutorialStep >= TUTORIAL_TASKS.length) return;
    if (TUTORIAL_TASKS[tutorialStep].check()) { tutorialStep++; showTutorialTask(); }
}

function highlightControl() {
    document.querySelectorAll(".tutorial-glow").forEach(el => el.classList.remove("tutorial-glow"));
    const id = TUTORIAL_CONTROLS[tutorialStep];
    if (id) $(id)?.classList.add("tutorial-glow");
}

function skipTutorial() {
    tutorialActive = false; lsSet("tutorialSeen", "true");
    document.querySelectorAll(".tutorial-glow").forEach(el => el.classList.remove("tutorial-glow"));
    $("skip-tut").style.display = "none";
    stopSignalPlayback();
    $("feedback").textContent = "Tutorial skipped. Click NEW GAME to start playing.";
    renderStartScreen(); showScreen("start");
}

function endTutorial() {
    tutorialActive = false; lsSet("tutorialSeen", "true");
    document.querySelectorAll(".tutorial-glow").forEach(el => el.classList.remove("tutorial-glow"));
    stopSignalPlayback();
    flash("var(--green)"); SFX.lock();
    $("feedback").textContent = "TUTORIAL COMPLETE!"; $("feedback").className = "feedback win";
    setTimeout(() => {
        $("skip-tut").style.display = "none";
        renderStartScreen(); showScreen("start");
    }, 1800);
}

// ─── HINTS / SKIP ────────────────────────────────────────────────────────────

function useHint() {
    if (won || score < CONFIG.COST_HINT) return;
    score = Math.max(0, score - CONFIG.COST_HINT); $("score").textContent = score;
    const lv = LEVELS[level];
    const hints = [
        "type: " + targetSignal.type,
        "freq: " + targetSignal.freq + " Hz",
        "amp: " + (targetSignal.amp / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION),
        ...(lv.phase ? ["phase: " + targetSignal.phase + "°"] : []),
        ...(lv.dc && targetSignal.dc !== 0 ? ["dc: " + (targetSignal.dc / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)] : []),
        ...(lv.harm && targetSignal.harm > 0 ? ["harmonic: " + (targetSignal.harm / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)] : []),
    ];
    $("feedback").textContent = `hint: ${hints[rng(0, hints.length - 1)]}`;
    $("feedback").className = "feedback close";
    SFX.hint();
}

function skipRound() {
    if (score < CONFIG.COST_SKIP) return;
    score = Math.max(0, score - CONFIG.COST_SKIP); $("score").textContent = score;
    SFX.fail(); nextRound();
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

    canvas.width = W;
    canvas.height = H;

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
            Math.sin(x * NOISE_LOW_FREQ + t * NOISE_LOW_SPEED) * NOISE_LOW_AMP +
            Math.sin(x * NOISE_HIGH_FREQ - t * NOISE_HIGH_SPEED) * NOISE_HIGH_AMP +
            (Math.random() - 0.5) * RANDOM_NOISE_AMP
        );
    }

    function signal(x, t) {
        return (
            Math.sin(x * BASE_FREQ + t * BASE_SPEED) * BASE_AMP +
            Math.sin(x * MOD_FREQ + t * MOD_SPEED) * MOD_AMP +
            Math.sin(x * DETAIL_FREQ - t * DETAIL_SPEED) * DETAIL_AMP +
            noise(x, t)
        );
    }

    /* ---------------- RENDER LOOP ---------------- */

    function draw(ts) {
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

        const t = ts * 0.001;

        ctx.clearRect(0, 0, W, H);

        const mid = H / 2;

        // PRIMARY SIGNAL
        ctx.strokeStyle = COLORS.cream;
        ctx.shadowColor = COLORS.cream;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 2;

        ctx.beginPath();

        for (let x = 0; x < W; x++) {

            const y = mid + signal(x, t);

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();

        // INTERFERENCE SIGNAL
        ctx.strokeStyle = COLORS.coral;
        ctx.shadowColor = COLORS.coral;
        ctx.shadowBlur = 20;

        ctx.beginPath();

        for (let x = 0; x < W; x++) {

            const y = mid - signal(x, t * 1.05);

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();

        _logoScopeRAF = requestAnimationFrame(draw);
    }

    _logoScopeRAF = requestAnimationFrame(draw);
}

window.addEventListener("DOMContentLoaded", () => {
    initLogoScope();
});

// ─── INIT ────────────────────────────────────────────────────────────────────

initDOM();
initCanvas();
initAudio();
renderStartScreen();
showScreen("start");