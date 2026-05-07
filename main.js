// NOTE: I want to share with you the joy of playing this fun little game. 
// NOTE: Heavely Vibed with le' AI
/**
 * @fileoverview Mixed Signals Game - Main Entry Point
 * @description A signal matching puzzle game where players adjust waveform parameters to match a randomly generated target signal.
 * @version 1.0.0
 */

/**
 * @typedef {"sine" | "square" | "sawtooth" | "triangle"} Waveform
 * @description Available oscillator waveform types.
 */

/**
 * @typedef {Object} Signal
 * @description A parametric periodic signal model.
 * @property {Waveform} type base oscillator shape // TODO: Rename this to waveform later
 * @property {number} freq   frequency in Hz
 * @property {number} amp    amplitude (linear gain)
 * @property {number} phase  phase offset in degrees
 * @property {number} dc     DC offset
 * @property {number} harm   harmonic content / distortion amount
 * @property {number} noise  noise level (0-1 typical)
 */

/**
 * @typedef {Object} Level
 * @description Game level configuration.
 * @property {number} rounds    number of rounds in the level
 * @property {number} time      total available time for each level
 * @property {Waveform[]} types available waveform types for each level
 * @property {boolean} phase    whether phase control is enabled
 * @property {boolean} dc       whether DC offset control is enabled
 * @property {boolean} harm     whether harmonic control is enabled
 * @property {boolean} noise    whether noise control is enabled
 */

// ─── CONFIG ────────────────────────────────────────────────────────────────────

/**
 * Game configuration constants.
 * @readonly
 */
const CONFIG = {
    FIXED_STEPS_PRECISION: 2, // 1 for fixed steps e.g.: 1; 2 for continuous e.g.: 0.1

    TIME_BONUS_RATE: 0.8, // points per second of remaining time

    BASE_REWARD: 100,
    COST_HINT: 25, // 100 * 0.25
    COST_SKIP: 130, // 100 * 1.3

    WIN_PERCENTAGE: 95,
    CLOSE_PERCENTAGE: 75,
}

// Predefined palette, instead of dynamic mixing.
const WAVE_COLORS = {
    target: "rgba(200,190,170,0.35)", // faded cream OR "rgba(232,224,204,0.35)"
    yours: "#f5efe0",                 // pure cream
};

/**
 * Level configurations from easy to hard.
 * @readonly 
 * @type {Level[]}
 */
const LEVELS = [
    // Learn shapes
    { rounds: 5, time: 35, types: ["sine", "square"], phase: false, dc: false, harm: false, noise: false },

    // Add more shapes
    { rounds: 5, time: 32, types: ["sine", "square", "sawtooth", "triangle"], phase: false, dc: false, harm: false, noise: false },

    // Introduce phase (new mental model)
    { rounds: 5, time: 30, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: false, harm: false, noise: false },

    // Add DC offset (visual shift recognition)
    { rounds: 5, time: 28, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: true, harm: false, noise: false },

    // Expand waveform vocabulary (pwm, am)
    { rounds: 5, time: 26, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: false, noise: false },

    // Introduce harmonics (pattern complexity)
    { rounds: 5, time: 26, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: false },

    // Final: noise (uncertainty), but DON'T punish time
    { rounds: 5, time: 28, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: true },
];

/** @type {Signal} */
let targetSignal = {};

/** @type {Signal} */
let yoursSignal = { type: "sawtooth", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };

// ─── GAME STATE VARIABLES ────────────────────────────────────────────────────────────────────

let score = 0,
    levelStartScore = 0,
    level = 0,
    roundNo = 0,
    timeLeft = 0,
    timerInterval = null,
    animRaf = null, /* NOTE: Remember to `null` animRaf after cancel */
    won = false;

let tutorialStep = 0;
let tutorialActive = false;

const TUTORIAL_TASKS = [
    {
        text: "TUTORIAL: Select TRI waveform",
        check: () => yoursSignal.type === "triangle",
    },
    {
        text: "TUTORIAL: Set frequency to 4 Hz",
        check: () => yoursSignal.freq === 4,
    },
    {
        text: "TUTORIAL: Set amplitude around 0.60",
        check: () => Math.abs(yoursSignal.amp - 6) < 0.5, // ±0.5 tolerance
    },
    {
        text: "TUTORIAL: Set phase around 90°",
        check: () => Math.abs(yoursSignal.phase - 90) <= 15, // ±15° tolerance
    },
    {
        text: "TUTORIAL: Set dc offset around 0.5",
        check: () => Math.abs(yoursSignal.dc - 5) <= 0.5,
    },
    {
        text: `TUTORIAL: Now match the target signal (${CONFIG.WIN_PERCENTAGE}%+)`,
        check: () => matchScore() >= CONFIG.WIN_PERCENTAGE * 0.01,
    }
];

// ─── CACHED DOM NODES ────────────────────────────────────────────────────────

// Cache hot DOM nodes once at init instead of querying on every frame.
// These are touched every updateMeter() call (up to rAF rate).

/** @type {Record<string, HTMLElement>} */
const DOM = {};

function initDOM() {
    const ids = [
        "score", "fill", "pct", "feedback",
        "lbl-freq", "lbl-amp", "lbl-phase", "lbl-dc", "lbl-harm", "lbl-noise",
        "sl-freq", "sl-amp", "sl-phase", "sl-dc", "sl-harm", "sl-noise",
        "timer", "timer-ring-fill",
        "round-no", "round-total", "lbl-level",
        "ctrl-phase", "ctrl-dc", "ctrl-harm", "ctrl-noise",
        "btn-pwm", "btn-am",
        "type-btns", "meter-row",
        "c-overlay", "flash", "game-inner",
        "screen-game", "screen-start", "screen-dead", "screen-levelup",
        "lu-title", "lu-msg", "dead-msg",
        "bgm-audio", "mute-btn",
        "skip-tut",
    ];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) DOM[id] = el;
        else console.error(`Failed to get DOM node of id: "${id}"`);
    }
}

/**
 * Shorthand for cached DOM lookup with fallback.
 * @param {string} id - The element ID.
 * @returns {HTMLElement|null} The element or null.
 */
function $(id) {
    return DOM[id] ?? document.getElementById(id);
}

// ─── CANVAS ──────────────────────────────────────────────────────────────────
/** @type {HTMLCanvasElement|null} */
let _canvas = null;
/** @type {CanvasRenderingContext2D|null} */
let _ctx = null;

/**
 * The only thing to be careful about: if we ever innerHTML-replace the parent
 * of the canvas (we don't), the cached reference would go stale. In this
 * codebase that never happens, so the cache is safe for the lifetime of the page. 
 */
function initCanvas() {
    _canvas = /** @type {HTMLCanvasElement} */ ($("c-overlay"));
    _ctx = _canvas.getContext("2d");
}


// ─── LOCALSTORAGE HELPERS ─────────────────────────────────────────────────────

// Wrap localStorage in try/catch — Safari Private throws SecurityError.

/**
 * @param {string} key
 * @param {string|null} fallback
 * @returns {string|null}
 */
function lsGet(key, fallback = null) {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch (err) {
        console.error(err);
        return fallback;
    }
}

/**
 * @param {string} key
 * @param {string} value
 */
function lsSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        console.error(err);
    }
}

/**
 * Shows a floating score popup animation.
 * @param {number} points - Points to display (positive number).
 */
function showScorePop(points) {
    const scoreEl = $("score");
    if (!scoreEl) return;
    const pop = document.createElement("div");
    pop.className = "score-pop";
    pop.textContent = "+" + points;
    scoreEl.parentElement.style.position = "relative";
    scoreEl.parentElement.appendChild(pop);
    setTimeout(() => pop.remove(), 800);

    // Light screen shake on score pop
    const gameInner = $("game-inner");
    gameInner.classList.add("shake-light");
    setTimeout(() => gameInner.classList.remove("shake-light"), 300);
}

/**
 * PRNG Selection Guide
 * ─────────────────────────────────────────────────────────────
 * Xorshift32     🚀 Fastest — particles, per-frame noise
 * SFC32          🎮 Default — gameplay, drops, events
 * Xoshiro128**   🌍 Best quality — world gen, long simulations
 * Mulberry32/LCG 🎨 Artistic — intentional pattern/texture
 * crypto.*       🔐 Security — never use PRNGs here
 * ─────────────────────────────────────────────────────────────
 * Quality: Xoshiro128** ≥ JSF32 > SFC32 > Splitmix32 > Mulberry32 > Xorshift32 > LCG
 * Speed:   Xorshift32 > LCG > SFC32 > Xoshiro128** > JSF32 > Splitmix32 > Mulberry32
 * Note:    Splitmix32 best used as a seeder, not main RNG
 */
const Xorshift32 = (s) => {
    // Marsaglia 2003, triple (13,17,5) — one of the published valid triples
    let state = s >>> 0 || 1; // state must be non-zero
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) / 4294967296;
    };
}

/** 
 * NOTE: Use this instead of calling Math.random() for determinism
 * @type {() => number} 
 */
const rand = Xorshift32(1831565813);


/**
 * Generates a random integer between lo and hi (inclusive).
 * @param {number} lo - Lower bound.
 * @param {number} hi - Upper bound.
 * @returns {number} Random integer.
 */
function rng(lo, hi) {
    if (lo > hi) { const temp = lo; lo = hi, hi = temp; }
    return lo + (rand() * (hi - lo + 1)) | 0; // same as lo + Math.floor(rand() * (hi - lo + 1));
}

// ─── BGM ────────────────────────────────────────────────────────────────────

const BGM_TRACKS = [
    "resources/music/musinova-idm-electronic-science-technology-drumless-ambient-loop-483365.mp3",
    "resources/music/slimeyfox-after-hours-arcade-487277.mp3",
    "resources/music/pietix-art-pop-exp-2-510302.mp3",
];

let currentTrackIndex = -1;

function pickNextTrack() {
    // avoid repeating the same track
    let next;

    do {
        next = Math.floor(Math.random() * BGM_TRACKS.length);
    } while (BGM_TRACKS.length > 1 && next === currentTrackIndex);
    currentTrackIndex = next;

    return BGM_TRACKS[next];
}

let muted = lsGet("bgmMuted") === "true";
let volume = parseFloat(lsGet("bgmVolume", 0.4) ?? "0.4"); // ideal: 0.4

// NOTE: apply initial UI + audio state
(function initAudio() {
    const audio = $("bgm-audio");
    const btn = $("mute-btn");

    audio.muted = muted;
    audio.volume = volume;

    btn.textContent = muted ? "🔇" : "🎵";
    btn.style.color = muted ? "var(--text-dim)" : "";
})();

/* 
TODO:
Examples:
    - Set to 20%:
        setVolume(0.2);
    - Fade down for menus:
        setVolume(0.1);
    - Restore for gameplay:
        setVolume(0.4); 
*/
/**
 * Sets the background music volume.
 * @param {number} v - Volume level (0-1).
 */
function setVolume(v) { // future proofing
    volume = Math.max(0, Math.min(1, v));
    const audio = $("bgm-audio");
    audio.volume = volume;
    lsSet("bgmVolume", volume);
}

function startMusic() {
    const audio = $("bgm-audio");
    if (muted) return;

    if (audio.paused) {
        if (!audio.src || audio.ended) {
            audio.src = pickNextTrack();
        }
        audio.play();
    }
}

function stopMusic() {
}

function toggleMute() {
    muted = !muted;

    const audio = $("bgm-audio");
    const btn = $("mute-btn");

    audio.muted = muted; // critical sync
    lsSet("bgmMuted", muted);

    btn.textContent = muted ? "🔇" : "🎵";
    btn.style.color = muted ? "var(--text-dim)" : "";

    if (muted) { // stopMusic()
        if (!audio.paused) audio.pause();
    } else if ($("screen-game").style.display !== "none") {
        startMusic();
    }
}

// autoplay gate
document.addEventListener("click", () => {
    if (!muted) startMusic();
}, { once: true });

$("bgm-audio").addEventListener("ended", () => {
    if (!muted) {
        $("bgm-audio").src = pickNextTrack();
        $("bgm-audio").play();
    }
});

// ─── SFX ────────────────────────────────────────────────────────────────────

const AudioCtx = window.AudioContext || window.webkitAudioContext;

/** @type {AudioContext | null} */
let _actx = null; // type AudioContextState = "closed" | "interrupted" | "running" | "suspended";

/** @returns {AudioContext} */
function actx() { // or simply `return _actx || (_actx = new AudioCtx());`
    if (!_actx) _actx = new AudioCtx();
    if (_actx.state === "suspended") _actx.resume();
    return _actx;
}

let _lastSliderSfx = 0;
let _lastUrgentSfx = 0;
// let _urgentBeepDone = false;
let _wasCloseSfx = false;

const SFX = {
    /**
     * Plays a short tick sound.
     * @param {number} [pitch=880] - Frequency in Hz.
     */
    tick: (pitch = 880) => { // In setType()
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = pitch;
        g.gain.setValueAtTime(0.12, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + 0.06);
    },
    slider: () => { // In recompute(), after reading the slider values
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 440 + yoursSignal.freq * 40;
        g.gain.setValueAtTime(0.06, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.04);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + 0.05);
    },
    lock: () => { // In updateMeter(), inside the pct >= WIN_PCT branch
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
    fail: () => { // In gameOver(), skipRound()
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
    hint: () => { // In useHint(), after deducting score
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 660;
        o.frequency.linearRampToValueAtTime(880, ac.currentTime + 0.12);
        g.gain.setValueAtTime(0.1, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + 0.2);
    },
    levelUp: () => { // In showLevelUp(), victory()
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        [[330, 0], [392, 0.1], [494, 0.2], [659, 0.32], [880, 0.44]].forEach(([f, t]) => {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = "triangle"; o.frequency.value = f;
            g.gain.setValueAtTime(0.13, ac.currentTime + t);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
            o.connect(g); g.connect(ac.destination);
            o.start(ac.currentTime + t); o.stop(ac.currentTime + 0.28);
        });
    },
    urgent: () => { // In startTimer()'s setInterval, inside the timeLeft <= 8 branch
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "square"; o.frequency.value = 330;
        g.gain.setValueAtTime(0.07, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + 0.09);
    },
    close: () => { // In updateMeter(), inside the pct >= 75 branch
        // Soft rising tone as we get close to matching the signal
        if (muted) return;
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 330;
        o.frequency.linearRampToValueAtTime(440, ac.currentTime + 0.15);
        g.gain.setValueAtTime(0.05, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + 0.05);
    },
}

// function lerp(a, b, t) { return a + (b - a) * t };
// function lerptau(a, b) { return a + (b - a) * 0.12 };
function smoothstep(x) { return x * x * (3 - 2 * x); }
function sigmoid(x) { return 1 / (1 + Math.exp(-8 * (x - 0.5))); }

/**
 * HIGH-PERFORMANCE SINE LOOK-UP TABLE
 * Best for: Audio synthesis, heavy physics, or particle systems.
 * 
 * BENCHMARK RESULTS (vs Math.sin):
 * - Lerp Function: ~3x faster (High fidelity)
 * - Inlined Lerp: ~4x faster (Optimal for browsers)
 * - Inlined Nearest: ~9x faster (Maximum throughput, slight stair-stepping)
 */

// 1. Configuration
const LUT_SIZE = 8192; // Must be power of 2 for bitwise & MASK
const MASK = LUT_SIZE - 1;
const SCALE = LUT_SIZE / (Math.PI * 2);

// 2. Initialize Table
// We use LUT_SIZE + 1 so that [idx + 1] is always valid without a second mask.
// Length +1 allows branchless lerp: SIN_LUT[idx + 1] at idx=8191 is valid. (index + 1 is always valid)
const SIN_LUT = new Float32Array(LUT_SIZE + 1); // Usage: Math.sin(x) => SIN_LUT[(x * SCALE) & MASK]

for (let i = 0; i <= LUT_SIZE; i++) { // Fill with high-precision native sine values
    SIN_LUT[i] = Math.sin((i / LUT_SIZE) * Math.PI * 2);
}

/**
 * Fast Sine replacement using Linear Interpolation.
 * Provides high fidelity (Max Error ~1e-7) with excellent speed.
 * @param {number} x Angle in radians.
 * @returns {number} The sine of x.
 */
function fastSin(x) {
    const pos = x * SCALE;
    const idx = Math.floor(pos); // Math.floor is essential for correct behavior with negative numbers
    const iA = idx & MASK; // Wrap the index to the table size using bitwise AND
    const frac = pos - idx;
    const a = SIN_LUT[iA];
    return a + (SIN_LUT[iA + 1] - a) * frac; // Linear interpolation between the current index and the next
}

/**
 * BEFORE (Slower due to stack overhead):
 *     for (let i = 0; i < len; i++) {
 *         buffer[i] = fastSin(angle); 
 *         angle += step;
 *     }
 */

/**
 * HOT-LOOP OPTIMIZATIONS
 * For performance-critical blocks, bypass function overhead by inlining.
 */

/* --- OPTION A: INLINED LERP (Balanced Speed & Precision) --- */
/*
    const lut = SIN_LUT, s = SCALE, m = MASK;
    for (let i = 0; i < len; i++) {
        const p = angle * s;
        const id = Math.floor(p);
        const iA = id & m;
        const a = lut[iA];
        
        buffer[i] = a + (lut[iA + 1] - a) * (p - id);
        angle += step;
    }
*/

/* --- OPTION B: INLINED NEAREST (Absolute Maximum Speed) --- */
/* 
    // Roughly 9x faster than Math.sin(). Use for particles/physics.
    const lut = SIN_LUT, s = SCALE, m = MASK;
    for (let i = 0; i < len; i++) {
        // Bitwise & handles both the floor and the wrap-around
        buffer[i] = lut[(angle * s) & m];
        angle += step;
    }
*/

/**
 * Samples the signal value at a given time.
 * @param {Signal} sig - The signal to sample.
 * @param {number} t - Time (0-1 normalized).
 * @param {boolean} addNoise - Whether to add noise.
 * @returns {number} The sampled value.
 */
function sample(sig, t, addNoise) {
    const { type, freq, phase, amp, harm, noise, dc } = sig;

    const u = (freq * t + (phase / 360)) % 1; // Normalized phase (0.0 to 1.0)
    const x = u * 6.283185307179586; // Pre-calculated PI * 2

    let v;
    switch (type) {
        case "sine": v = fastSin(x); break;
        case "square": v = fastSin(x) >= 0 ? 1 : -1; break;
        case "sawtooth": v = 2 * u - 1; break;
        case "triangle": v = u < 0.5 ? 4 * u - 1 : 3 - 4 * u; break;
        case "pwm": v = u < 0.65 ? 1 : -1; break;
        case "am": {
            const modFreqMult = 0.25; // Or make this a property of the signal
            const modIndex = harm || 0.5; // Use harm to control intensity
            const carrier = fastSin(x);
            const mod = fastSin(x * modFreqMult);
            v = carrier * (1 + modIndex * mod); // Standard AM formula: Carrier * (1 + Depth * Modulator)
            v *= 0.5; // We multiply by 0.5 at the end to keep the signal within -1 to 1 range
        } break;
        default: throw new Error(`Unhandled waveform: "${type}"`);
    }

    if (harm && type !== "am") v += (harm * 0.1) * fastSin(x * 3); // Add Harmonic (3rd) - using mul instead of div
    if (addNoise && noise) v += (noise * 0.1) * (rand() * 0.8 - 0.4); // Add Bipolar Noise
    return (amp * 0.1) * v + (dc ?? 0) * 0.1; // Final Gain and DC Offset
}


const SCORE_SAMPLES = 96; // 64 = faster but noisier scoring | 96 = ideal | 128 = diminishing returns
const INV_SCORE_SAMPLES = 1 / SCORE_SAMPLES;
const SCORE_SCALE = 1 / (2 * SCORE_SAMPLES);

// ─── MATCH SCORE CACHE ────────────────────────────────────────────────────────

// Cache matchScore() result. Invalidated on any slider/type change.
// Prevents running 96-sample scoring at rAF rate (up to 120×/s).

let _cachedMatchScore = 0;
let _matchScoreDirty = true;

/** Mark cache stale — call whenever yoursSignal changes. */
function invalidateMatchScore() { _matchScoreDirty = true; }

/**
 * Calculates similarity score between target and player signals.
 * Pure procedural sampling. No buffers.
 * Returns cached result unless invalidated.
 * @returns {number} Score from 0 (no match) to 1 (perfect match).
 */
function matchScore() {
    if (!_matchScoreDirty) return _cachedMatchScore;

    let d0 = 0, d1 = 0, d2 = 0, d3 = 0;

    for (let i = 0; i < SCORE_SAMPLES; i += 4) {
        const t0 = i * INV_SCORE_SAMPLES;
        const t1 = (i + 1) * INV_SCORE_SAMPLES;
        const t2 = (i + 2) * INV_SCORE_SAMPLES;
        const t3 = (i + 3) * INV_SCORE_SAMPLES;

        // Avoid using noise during scoring, and so we pass `false`
        const s0 = sample(targetSignal, t0, false) - sample(yoursSignal, t0, false);
        const s1 = sample(targetSignal, t1, false) - sample(yoursSignal, t1, false);
        const s2 = sample(targetSignal, t2, false) - sample(yoursSignal, t2, false);
        const s3 = sample(targetSignal, t3, false) - sample(yoursSignal, t3, false);

        d0 += s0 < 0 ? -s0 : s0;
        d1 += s1 < 0 ? -s1 : s1;
        d2 += s2 < 0 ? -s2 : s2;
        d3 += s3 < 0 ? -s3 : s3;
    }

    const d = d0 + d1 + d2 + d3;
    const raw = 1 - d * SCORE_SCALE;

    _cachedMatchScore = raw < 0 ? 0 : (raw > 1 ? 1 : raw);
    _matchScoreDirty = false;

    return _cachedMatchScore;
}

/**
 * Draws a waveform on the canvas from a pre-computed buffer.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {Signal} sig - Signal.
 * @param {string} color - Stroke color.
 * @param {number} W - Canvas width.
 * @param {number} H - Canvas height.
 * @param {number} scroll - Scroll offset (0-1).
 * @param {number} [lineW=1.8] - Line width.
 */
function drawWave(ctx, sig, color, W, H, scroll, lineW = 1.8) {
    const halfH = H * 0.5;
    const yOffset = halfH - 10;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineW || 1.8;

    ctx.beginPath();

    const invW = 1 / W;
    const stride = 2; // Exaggerate sampled (hardware) look "reduce horizontal resolution"

    for (let px = 0; px <= W; px += stride) {
        const t = (px * invW - scroll + 1) % 1;
        const y = halfH - sample(sig, t, true) * yOffset;
        if (px === 0) ctx.moveTo(px, y)
        else ctx.lineTo(px, y);
    }

    ctx.stroke();
}

// ─── CANVAS RESIZE OBSERVER ───────────────────────────────────────────────────

// Use ResizeObserver so we update canvas dimensions only when the
// element actually changes size, instead of reading offsetWidth every frame.

let _canvasW = 320; // fallback until observer fires

(function initCanvasResizeObserver() {
    const id = "c-overlay";
    const c = document.getElementById(id);
    if (!c) {
        console.error(`Failed to get canvas of id "${id}"!`)
        return;
    }
    if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(entries => {
            for (const entry of entries) {
                _canvasW = Math.round(entry.contentRect.width) || 320;
            }
        }).observe(c);
    } else {
        // Fallback for old browsers: read once, accept it may not update on resize
        _canvasW = c.offsetWidth || 320;
    }
})();

/**
 * Main animation loop for rendering waveforms.
 * @param {number} ts - Timestamp from requestAnimationFrame.
 */
function loop(ts) {
    const scroll = (ts / 4200) % 1;

    const W = _canvasW; // from ResizeObserver (use cached width instead of forcing layout)
    const H = 120; // hardcoded in <canvas />

    if (_canvas.width !== W || _canvas.height !== H) { // PERF: Avoid canvas resize every frame.
        _canvas.width = W;
        _canvas.height = H;
    }

    /** @type {CanvasRenderingContext2D|null} */
    _ctx.clearRect(0, 0, W, H);

    // Use cached matchScore — already computed by updateMeter() this frame
    const sc = matchScore();
    const t = smoothstep(sc);

    // Dual waveform layering 
    // (target vs yours) - Make it feel like a comparison instrument.
    // Target → dim, thin | Yours → bright, thicker
    //
    // PERF:
    //       loop() has two parallel if/else if/else blocks for target vs yours that
    //       mirror each other
    //          
    //       The color/alpha selection logic for roundNo is duplicated. A single
    //       lookup table keyed by roundNo % 3 (or roundNo === 1) collapses this to
    //       one decision instead of six branches.
    //
    // --- target ---
    if (roundNo === 1) { // original alpha: 0.85
        _ctx.globalAlpha = 0.1 + 0.65 * sigmoid(sc); // logistic ('designed' feel)
        drawWave(_ctx, targetSignal, "#00ff88", W, H, scroll, 4); // traditional: bright phosphor green
    } else if (roundNo % 2 === 0) {
        _ctx.globalAlpha = 0.15 + 0.55 * Math.sqrt(sc); // perceptual ('natural' feel)
        drawWave(_ctx, targetSignal, "#5b8dd9", W, H, scroll, 4); // var(--blue)
    } else {
        _ctx.globalAlpha = 0.15 + 0.6 * t; // starts subtle (0.15) - ramps smoothly - avoids harsh jump near 1.0
        drawWave(_ctx, targetSignal, WAVE_COLORS.target, W, H, scroll, 3 + sc);
    }
    // --- yours ---
    if (roundNo === 1) { // original alpha: 0.85
        _ctx.globalAlpha = 0.9; // yours
        drawWave(_ctx, yoursSignal, "#ffb830", W, H, scroll, 4); // traditional scope color: yellow/amber
    } else if (roundNo % 2 === 0) {
        _ctx.globalAlpha = 0.9; // yours
        drawWave(_ctx, yoursSignal, "#e8604a", W, H, scroll, 4); // var(--coral)
    } else {
        _ctx.globalAlpha = 0.9; // yours
        drawWave(_ctx, yoursSignal, WAVE_COLORS.yours, W, H, scroll, 4);
    }

    _ctx.globalAlpha = 1; // reset

    animRaf = requestAnimationFrame(loop);
}

/**
 * Flashes the screen with a color.
 * @param {string} color - CSS color value.
 */
function flash(color) {
    const el = $("flash");
    el.style.background = color;
    el.classList.add("go");
    setTimeout(() => el.classList.remove("go"), 80);
}

/**
 * BASE: 100
 * TIME BONUS: 0.8 * timeLeft (dynamic, depends on completion speed)
 * Typical observed range: ~100–125
 * @param {number} timeLeft 
 * @returns {number}
 */
function computeScoreGainFromTimeLeft(timeLeft) {
    const bonus = Math.ceil(timeLeft * CONFIG.TIME_BONUS_RATE); // bonus = Math.pow(timeLeft, 1.1) * k;
    return CONFIG.BASE_REWARD + bonus;
}

/**
 * Updates the match percentage meter and checks win condition.
 */
function updateMeter() {
    const sc = matchScore(); // reads from cache if not dirty

    const pct = Math.round(sc * 100);
    $("pct").textContent = `${pct}%`;

    const fill = $("fill"); // resolved from DOM cache
    fill.style.width = `${pct}%`;
    fill.style.background = pct > 80 ? "var(--green)" : (pct > 50 ? "var(--amber)" : "var(--red)");

    const fb = $("feedback"); // resolved from DOM cache
    if (!won) {
        if (pct >= CONFIG.WIN_PERCENTAGE) {
            won = true;
            _wasCloseSfx = false; // reset state

            if (tutorialActive) {
                checkTutorial();
                return;
            }

            clearInterval(timerInterval);

            const scoreGain = computeScoreGainFromTimeLeft(timeLeft);
            score += scoreGain;
            $("score").textContent = score;
            showScorePop(scoreGain);

            fb.textContent = `LOCKED IN +${scoreGain} pts`;
            fb.className = "feedback win";

            flash("var(--green)");
            SFX.lock();
            if (navigator.vibrate) navigator.vibrate(100);

            setTimeout(() => nextRound(), 1800);
        } else if (pct >= CONFIG.CLOSE_PERCENTAGE) {
            fb.textContent = "Getting close…";
            fb.className = "feedback close";

            // Make the 'close' state edge-triggered, not continuous
            if (!_wasCloseSfx) {
                SFX.close();
                _wasCloseSfx = true;
            }
        } else {
            fb.textContent = "Match the target signal.";
            fb.className = "feedback";

            _wasCloseSfx = false; // must be state-based (not per-frame)
        }
    }
}

// --- THROTTLERS Scheduler State ---

let _recomputeScheduled = false;
let _setTypeScheduled = false;

/**
 * Reads slider values and updates player signal, rebuilds yours buffer.
 */
function recompute() {
    yoursSignal.freq = +$("sl-freq").value;
    yoursSignal.amp = +$("sl-amp").value;
    yoursSignal.phase = +$("sl-phase").value;
    yoursSignal.dc = +$("sl-dc").value;
    yoursSignal.harm = +$("sl-harm").value;
    yoursSignal.noise = +$("sl-noise").value;

    invalidateMatchScore(); // mark cache stale on signal change

    // Batches all slider inputs into one computation per frame instead of per-event.
    // Synced to the display refresh rate and feels smoother.
    if (!_recomputeScheduled) {
        _recomputeScheduled = true;

        requestAnimationFrame(() => {
            updateMeter();
            $("lbl-freq").textContent = `${yoursSignal.freq} Hz`;
            $("lbl-amp").textContent = (yoursSignal.amp / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
            $("lbl-phase").textContent = `${yoursSignal.phase}°`;
            $("lbl-dc").textContent = (yoursSignal.dc / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
            $("lbl-harm").textContent = (yoursSignal.harm / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
            $("lbl-noise").textContent = (yoursSignal.noise / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
            const now = Date.now(); // Subtle slider sfx - throttled
            if (now - _lastSliderSfx > 80) { SFX.slider(); _lastSliderSfx = now; }
            if (tutorialActive) checkTutorial();
            _recomputeScheduled = false;
        });
    }
}

/**
 * Sets the waveform type from button click.
 * @param {HTMLElement} btn - The clicked button.
 */
function setType(btn) {

    // PERF: setType() walks all .type-btn elements to remove active, then adds
    //       it to one This is O(n) on every button press. Since only one button is
    //       ever active, track _activeTypeBtn and toggle just two elements instead of
    //       querySelectorAll-ing the whole group.

    document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    yoursSignal.type = btn.dataset.t;

    invalidateMatchScore(); // mark cache stale on signal change

    // Batches all button inputs into one computation per frame instead of per-event.
    // Synced to the display refresh rate and feels smoother.
    if (!_setTypeScheduled) {
        _setTypeScheduled = true;
        requestAnimationFrame(() => {
            updateMeter();
            SFX.tick();
            if (navigator.vibrate) navigator.vibrate(50);
            if (tutorialActive) checkTutorial();
            _setTypeScheduled = false;
        });
    }
}

//
// TODO: Cache target signal buffer	❌ Not done	
//       drawWave() still calls sample() live per pixel for target
//

/**
 * Builds a random target signal based on current level.
 * Fills targetBuf immediately.
 * @returns {Signal} The generated target signal.
 */
function buildTarget() {
    const lv = LEVELS[level];
    /** @type {Signal} */
    const sig = {
        type: lv.types[rng(0, lv.types.length - 1)],
        freq: rng(1, 6),
        amp: rng(3, 10),
        phase: lv.phase ? rng(0, 7) * 45 : 0,
        dc: lv.dc ? rng(-3, 3) : 0,
        harm: lv.harm ? rng(0, 5) : 0,
        noise: lv.noise ? rng(2, 6) : 0,
    };
    return sig;
}

/**
 * Resets player signal to default values.
 */
function resetYours() {
    yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    ["freq", "amp", "phase", "dc", "harm", "noise"].forEach(k => {
        const el = $(`sl-${k}`);
        if (el) el.value = yoursSignal[k];
    });

    document.querySelectorAll(".type-btn")
        .forEach(b => b.classList.toggle("active", b.dataset.t === "sine"));

    invalidateMatchScore(); // mark cache stale on signal change

    // WARN: recompute() should read sliders after they're set. It currently does,
    //       since the rAF defers the read. But this is fragile — worth a comment or restructuring.
    recompute();
}

let hintsThisRound = [];


/**
 * Advances to the next round.
 */
function nextRound() {
    won = false;
    roundNo++;

    const lv = LEVELS[level];
    if (roundNo > lv.rounds) {
        const nextLevel = level + 1;
        if (nextLevel >= LEVELS.length) { victory(); return; }

        level = nextLevel;
        roundNo = 1;
        levelStartScore = score; // snapshot before showing level up screen

        showLevelUp();
        return;
    }

    $("round-no").textContent = roundNo;

    targetSignal = buildTarget();
    invalidateMatchScore(); // new target = dirty cache

    // PERF: Mutate the array
    hintsThisRound = [
        "type: " + targetSignal.type,
        "freq: " + targetSignal.freq + " Hz",
        "amp: " + (targetSignal.amp / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION),
        ...(LEVELS[level].phase ? ['phase: ' + targetSignal.phase + "°"] : []),
        ...(LEVELS[level].dc && targetSignal.dc !== 0 ? ["dc: " + (targetSignal.dc / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)] : []),
        ...(LEVELS[level].harm && targetSignal.harm > 0 ? ["harmonic: " + (targetSignal.harm / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)] : []),
    ];

    applyLevelUI();
    resetYours();

    $("feedback").textContent = "Match the target signal";
    $("feedback").className = "feedback";

    startTimer();
}

/**
 * Shows the level up screen.
 */
function showLevelUp() {
    clearInterval(timerInterval);
    $("screen-game").classList.remove("active");
    $("screen-game").style.display = "none";
    $("lu-title").textContent = `LEVEL ${level + 1}`;
    $("lu-msg").textContent = "New parameters unlocked. Less time. Good luck.";
    $("screen-levelup").classList.add("active");
    SFX.levelUp();
}

/**
 * Continues to the next level after level up screen.
 */
function continueLevel() {
    $("screen-levelup").classList.remove("active");
    $("screen-game").style.display = "block";
    $("round-no").textContent = roundNo;

    targetSignal = buildTarget();
    invalidateMatchScore(); // new target = dirty cache

    applyLevelUI();
    resetYours();

    $("feedback").textContent = "Match the target signal.";
    $("feedback").className = "feedback";

    startTimer();
}

/**
 * Shows the victory screen.
 */
function victory() {
    clearInterval(timerInterval);
    $("screen-game").style.display = "none";

    const dead = $("screen-dead");
    const h3 = dead.querySelector("h3");
    h3.textContent = "MIXED SIGNALS MASTERED";
    h3.style.color = "var(--green)";

    $("dead-msg").textContent = `All ${LEVELS.length} levels cleared with ${score} pts. Legendary.`;

    dead.classList.add("active");
    SFX.levelUp();

    if (animRaf !== null) { // guard before cancel
        cancelAnimationFrame(animRaf);
        animRaf = null; // null after cancel
    }
}

/**
 * Shows the game over screen.
 */
function gameOver() {
    clearInterval(timerInterval);
    flash("var(--red)"); // alternatively use "#ff4554"

    $("screen-game").style.display = "none";

    const dead = $("screen-dead");
    const h3 = dead.querySelector("h3");
    h3.textContent = "SIGNAL LOST";
    h3.style.color = "var(--red)";

    $("dead-msg").textContent = `Level ${level + 1} · Round ${roundNo} · ${score} pts`;

    dead.classList.add("active");
    SFX.fail();

    // Screen shake + haptic
    const gameInner = $("game-inner");
    gameInner.classList.add("shake");
    setTimeout(() => gameInner.classList.remove("shake"), 500);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    if (animRaf !== null) { // guard before cancel
        cancelAnimationFrame(animRaf);
        animRaf = null; // null after cancel
    }
}

/**
 * Applies level-specific UI visibility.
 */
function applyLevelUI() {
    const lv = LEVELS[level];
    $("lbl-level").textContent = level + 1;
    $("round-total").textContent = lv.rounds;

    $("ctrl-phase").style.opacity = lv.phase ? "1" : ".3";
    $("ctrl-dc").style.opacity = lv.dc ? "1" : ".3";

    $("ctrl-harm").style.display = lv.harm ? "" : "none";
    $("ctrl-noise").style.display = lv.noise ? "" : "none";

    $("btn-pwm").disabled = !lv.types.includes("pwm");
    $("btn-am").disabled = !lv.types.includes("am");
}

/**
 * Starts the countdown timer.
 */
function startTimer() {

    clearInterval(timerInterval);
    const total = timeLeft = LEVELS[level].time;

    const el = $("timer");
    const ring = $("timer-ring-fill");
    const C = 125.6; // 2π × r=20

    // Snap reset without transition
    ring.style.transition = "none";
    ring.style.strokeDashoffset = "0";
    ring.style.stroke = "#f0690a"; // var(--te-orange)
    ring.getBoundingClientRect(); // force reflow
    ring.style.transition = "stroke-dashoffset 1s linear, stroke 0.3s";

    el.textContent = timeLeft;
    // el.className = ""; // HACK: Disabled this, since timer digits were unstyled for a second at round start

    timerInterval = setInterval(() => {
        timeLeft--;

        ring.style.strokeDashoffset = C * (1 - timeLeft / total);

        const urgent = timeLeft <= 8;
        el.textContent = timeLeft;
        el.className = urgent ? "timer-ring-label urgent" : "timer-ring-label";
        ring.style.stroke = urgent ? "#e85a4a" : "#f0690a"; // ? var(--red) : var(--te-orange)

        if (urgent) {
            const now = Date.now();
            if (now - _lastUrgentSfx > 500) {
                SFX.urgent();
                _lastUrgentSfx = now;
            }
        }

        if (timeLeft <= 0 && !won) {
            clearInterval(timerInterval);
            gameOver();
        }
    }, 1000);
}

/**
 * Uses a hint to reveal one target parameter.
 */
function useHint() {
    if (won) return;
    if (score < CONFIG.COST_HINT) return

    score = Math.max(0, score - CONFIG.COST_HINT);
    $("score").textContent = score;

    $("feedback").textContent = `hint: ${hintsThisRound[rng(0, hintsThisRound.length - 1)]}`;
    $("feedback").className = "feedback close";

    SFX.hint();
}

/**
 * Skips the current round.
 */
function skipRound() {
    if (score < CONFIG.COST_SKIP) return;

    score = Math.max(0, score - CONFIG.COST_SKIP);
    $("score").textContent = score;
    SFX.fail();

    nextRound();
}

/**
 * Restarts the game from the beginning.
 */
function restartGame() {
    score = 0;
    levelStartScore = 0;
    level = 0;
    startGame();
}

// TODO: 
// startGame() and startTutorial() share identical rAF cancel + screen-clear
// boilerplate
// Both do querySelectorAll(".screen").forEach(remove active) + cancel rAF +
// screen-game show. Extract a showGameScreen() helper.

/**
 * Starts the game.
 */
function startGame() {
    // level = 0; // FIXED: Level intentionally NOT reset here
    score = levelStartScore; // score = 0; // FIXED: score intentionally NOT reset here
    roundNo = 0;

    if (!lsGet("tutorialSeen") && !tutorialActive) {
        startTutorial();
        return;
    }

    $("score").textContent = score; // $("score").textContent = 0;

    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $("screen-game").style.display = "block";


    if (animRaf !== null) { // guard before cancel
        cancelAnimationFrame(animRaf);
        animRaf = null; // null after cancel
    }

    animRaf = requestAnimationFrame(loop);

    nextRound();
}

function startTutorial() {
    tutorialActive = true;
    tutorialStep = 0;
    score = 0;

    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $("screen-game").style.display = "block";

    if (animRaf !== null) { // guard before cancel
        cancelAnimationFrame(animRaf);
        animRaf = null; // null after cancel
    }
    animRaf = requestAnimationFrame(loop);

    targetSignal = { type: "triangle", freq: 4, amp: 6, phase: 0, dc: 0, harm: 0, noise: 0 };;
    invalidateMatchScore(); // new target = dirty cache

    roundNo = 1;
    $("round-no").textContent = roundNo;
    $("round-total").textContent = 1;

    // Enable all basic controls for tutorial
    $("ctrl-phase").style.opacity = "1";
    $("ctrl-dc").style.opacity = "1";
    $("ctrl-harm").style.display = "none";
    $("ctrl-noise").style.display = "none";
    $("btn-pwm").disabled = false;
    $("btn-am").disabled = false;

    // Show skip tutorial button
    $("skip-tut").style.display = "inline-block";

    resetYours();
    recompute();

    showTutorialTask();
}

function showTutorialTask() {
    if (tutorialStep >= TUTORIAL_TASKS.length) {
        endTutorial();
        return;
    }

    const task = TUTORIAL_TASKS[tutorialStep];
    $("feedback").textContent = task.text;
    $("feedback").className = "feedback";
    highlightControl();
}

function checkTutorial() {
    if (!tutorialActive || tutorialStep >= TUTORIAL_TASKS.length) {
        return;
    }

    const task = TUTORIAL_TASKS[tutorialStep];
    if (task.check()) {
        tutorialStep++;
        showTutorialTask();
    }
}

const TUTORIAL_CONTROLS = ["type-btns", "ctrl-freq", "ctrl-amp", "ctrl-phase", "ctrl-dc", "meter-row"]

function highlightControl() {
    document.querySelectorAll(".tutorial-glow")
        .forEach(el => el.classList.remove("tutorial-glow"));

    const el = $(TUTORIAL_CONTROLS[tutorialStep]);
    if (el) el.classList.add("tutorial-glow");
}

function skipTutorial() {
    tutorialActive = false;
    lsSet("tutorialSeen", "true"); // NOTE: "true" for local storage (safe write)

    document.querySelectorAll(".tutorial-glow")
        .forEach(el => el.classList.remove("tutorial-glow"));

    $("skip-tut").style.display = "none";
    $("screen-game").style.display = "none";
    $("screen-start").classList.add("active");
    $("feedback").textContent = "Tutorial skipped. Click INITIALIZE to start playing.";
}

function endTutorial() {
    tutorialActive = false;
    lsSet("tutorialSeen", "true"); // NOTE: "true" for local storage (safe write)

    document.querySelectorAll(".tutorial-glow")
        .forEach(el => el.classList.remove("tutorial-glow"));

    flash("var(--green)");
    SFX.lock();

    $("feedback").textContent = "TUTORIAL COMPLETE!";
    $("feedback").className = "feedback win";

    setTimeout(() => {
        $("screen-game").style.display = "none";
        $("screen-start").classList.add("active");
        $("skip-tut").style.display = "none";
    }, 1800);
}

// Optional: hide address bar aggressively
// This helps on some Android browsers:
window.addEventListener('load', () => {
    setTimeout(() => window.scrollTo(0, 1), 0);
});

// Problem:  when the browser suspends the tab during a pinch-zoom gesture,
// requestAnimationFrame stops firing and never restarts. The loop just dies
// silently.
//
// Two things happen on mobile pinch-zoom: the browser fires visibilitychange to
// hidden briefly, and sometimes just drops RAF callbacks entirely without
// firing anything. The focus listener catches the second case.
const _isEnableFocusOnVisibilityChange = false; // FIXME: Buggy (the timer runs on focus, but the drawing stops)
if (_isEnableFocusOnVisibilityChange) {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            // Tab/app returned to foreground — restart loop if game is active
            if ($("screen-game").classList.contains("active")) { // FIXME: screen-game or screen?
                if (animRaf) cancelAnimationFrame(animRaf);
                animRaf = requestAnimationFrame(loop);
            }
        } else {
            // Tab hidden — kill loop cleanly to save battery
            if (animRaf) cancelAnimationFrame(animRaf);
        }
    });
    window.addEventListener("focus", () => {
        if ($("screen-game").classList.contains("active")) {
            if (animRaf) cancelAnimationFrame(animRaf);
            animRaf = requestAnimationFrame(loop);
        }
    });
}

// Easy wins:
//
// - [x] Timer visibility — consistent complaint across both versions. It needs to be
//       bigger or more prominent during gameplay, not tucked in the topbar.
// 
// [ ] Phase lock issue — 360° and 0° are the same wave but your matchScore()
//     probably computes them as different. Needs modulo normalization: Math.abs(a - b) % 360 clamped to [0, 180].
//
// Bigger features:
//
// - [ ] Audible wave — play the user's current waveform through the Web Audio
//       API quietly in the background as they tune. This is actually a great learning
//       mechanic and fits the game concept perfectly. You already have all the wave
//       math — you just need an OscillatorNode or ScriptProcessorNode fed by your
//       existing signal params.
// - [ ] Save progress / continue — "start from beginning" is a real pain point
//       for a jam game. Even just localStorage persisting level and score between
//       sessions would fix this.

// ─── INIT ────────────────────────────────────────────────────────────────────
// Run DOM cache population after the document is ready.
// The script is loaded with `defer` so the DOM is guaranteed to be parsed.

initDOM();
initCanvas();