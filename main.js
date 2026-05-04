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
 * @property {number} time      number of rounds in the level
 * @property {Waveform[]} types number of rounds in the level
 * @property {boolean} phase    whether phase control is enabled
 * @property {boolean} dc       whether DC offset control is enabled
 * @property {boolean} harm     whether harmonic control is enabled
 * @property {boolean} noise    whether noise control is enabled
 */

// ─── CONFIG ────────────────────────────────────────────────────────────────────

/**
 * Game configuration constants.
 * @readonly
 * @enum {number}
 */
const CONFIG = {
    FIXED_STEPS_PRECISION: 2, // 1 for fixed steps e.g.: 1; 2 for continuous e.g.: 0.1
    COST_HINT: 5,
    COST_SKIP: 10,
    WIN_PERCENTAGE: 92, // was 95 when sliders used fixed steps
    CLOSE_PERCENTAGE: 75,
}

/**
 * Level configurations from easy to hard.
 * @readonly 
 * @type {Level[]}
 */
const LEVELS = [
    { rounds: 5, time: 30, types: ["sine", "square", "sawtooth", "triangle"], phase: false, dc: false, harm: false, noise: false },
    { rounds: 5, time: 25, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: false, harm: false, noise: false },
    { rounds: 5, time: 22, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: true, harm: false, noise: false },
    { rounds: 5, time: 20, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: false, noise: false },
    { rounds: 4, time: 18, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: true },
];

/** @type {Signal} */
let targetSignal = {};

/** @type {Signal} */
let yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };

// ─── GAME STATE VARIABLES ────────────────────────────────────────────────────────────────────

let score = 0,
    levelStartScore = 0,
    level = 0,
    roundNo = 0,
    timeLeft = 0,
    timerInterval = null,
    animRaf = null,
    won = false,
    revealed = false;

/**
 * Shorthand for document.getElementById.
 * @param {string} id - The element ID.
 * @returns {HTMLElement|null} The element or null.
 */
function $(id) {
    return document.getElementById(id);
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
const prngs = {
    "Math.random": (_seed) => () => Math.random(), // ~ unseeded

    LCG: (s) => {
        // Numerical Recipes: a=1664525, c=1013904223 (Knuth vol.2)
        let state = s >>> 0;
        return () => {
            state = (Math.imul(1664525, state) + 1013904223) | 0;
            return (state >>> 0) / 4294967296;
        };
    },

    Xorshift32: (s) => {
        // Marsaglia 2003, triple (13,17,5) — one of the published valid triples
        let state = s >>> 0 || 1; // state must be non-zero
        return () => {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 4294967296;
        };
    },

    Splitmix32: (s) => {
        // Stafford's finalizer — corrected constants vs previous version
        let state = s >>> 0;
        return () => {
            state = (state + 0x9e3779b9) | 0;
            let z = state;
            z = Math.imul(z ^ (z >>> 16), 0x85ebca77); // corrected: was 0x85ebca6b
            z = Math.imul(z ^ (z >>> 13), 0xc2b2ae3d); // corrected: was 0xc2b2ae35
            return ((z ^ (z >>> 16)) >>> 0) / 4294967296;
        };
    },

    Mulberry32: (s) => {
        // Tommy Ettinger's design — matches original exactly
        let state = s >>> 0;
        return () => {
            state = (state + 0x6d2b79f5) | 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    JSF32: (s) => {
        // Jenkins Small Fast — http://burtleburtle.net/bob/rand/smallprng.html
        // Init: a=0xf1ea5eed, b=c=d=seed (fixed: was d=0, under-mixes initial state)
        let a = 0xf1ea5eed, b = s >>> 0, c = s >>> 0, d = s >>> 0;
        for (let i = 0; i < 20; i++) { // burn-in: JSF poorly mixed from cold
            const e = (a - ((b << 27) | (b >>> 5))) | 0;
            a = (b ^ ((c << 17) | (c >>> 15))) | 0;
            b = (c + d) | 0;
            c = (d + e) | 0;
            d = (e + a) | 0;
        }
        return () => {
            const e = (a - ((b << 27) | (b >>> 5))) | 0;
            a = (b ^ ((c << 17) | (c >>> 15))) | 0;
            b = (c + d) | 0;
            c = (d + e) | 0;
            d = (e + a) | 0;
            return (d >>> 0) / 4294967296;
        };
    },

    SFC32: (s) => {
        // Chris Doty-Humphrey's Small Fast Counting RNG
        // Fixed: output is t, not c+t (c is next state, not part of output)
        let a = s >>> 0, b = (s ^ 0xdeadbeef) >>> 0, c = (s ^ 0xbeefdead) >>> 0, d = 1;
        return () => {
            const t = (((a + b) | 0) + d) | 0;
            d = (d + 1) | 0;
            a = b ^ (b >>> 9);
            b = (c + (c << 3)) | 0;
            c = (c << 21) | (c >>> 11);
            return (t >>> 0) / 4294967296; // fixed: was (c + t | 0)
        };
    },

    "Xoshiro128**": (s) => {
        // Blackman & Vigna — https://prng.di.unimi.it/xoshiro128starstar.c
        // Both multiplies use imul to prevent float overflow on * 9
        let a = s >>> 0, b = (s ^ 0x9e3779b9) >>> 0, c = (s ^ 0x6c62272e) >>> 0, d = (s ^ 0xf3bcc908) >>> 0;
        return () => {
            const r = Math.imul(b, 5);
            const out = Math.imul((r << 7) | (r >>> 25), 9);
            const t = b << 9;
            c ^= a; d ^= b; b ^= c; a ^= d; c ^= t;
            d = (d << 11) | (d >>> 21);
            return (out >>> 0) / 4294967296;
        };
    },
};

// NOTE: Use this instead of calling Math.random() for determinism
const rand = prngs.Xorshift32(1831565813);

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

/**
 * Throws an error for unimplemented features.
 * @param {string} [msg=""] - Error message.
 * @throws {Error} Always throws.
 */
function unimplemented(msg = "") {
    throw new Error(`UNIMPLEMENTED: ${msg}`);
}

// ─── BGM ────────────────────────────────────────────────────────────────────

let muted = localStorage.getItem("bgmMuted") === "true";
let volume = parseFloat(localStorage.getItem("bgmVolume") ?? "0.4"); // ideal: 0.4

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
    localStorage.setItem("bgmVolume", volume);
}

function startMusic() {
    const audio = $("bgm-audio");
    audio.volume = volume;
    if (!muted && audio.paused) audio.play();
}

function stopMusic() {
    const audio = $("bgm-audio");
    if (!audio.paused) audio.pause();
}

/**
 * Fades BGM volume down over duration ms, then pauses if pauseAfter is true.
 * @param {number} duration - Fade duration in ms.
 * @param {boolean} pauseAfter - Whether to pause after fade.
 */
function fadeBGM(duration = 1000, pauseAfter = true) {
    const audio = $("bgm-audio");
    const startVol = audio.volume;
    const steps = 20;
    const stepTime = duration / steps;
    let step = 0;
    const interval = setInterval(() => {
        step++;
        audio.volume = Math.max(0, startVol * (1 - step / steps));
        if (step >= steps) {
            clearInterval(interval);
            if (pauseAfter) audio.pause();
            audio.volume = startVol; // restore for next play
        }
    }, stepTime);
}

function toggleMute() {
    muted = !muted;

    const audio = $("bgm-audio");
    const btn = $("mute-btn");

    audio.muted = muted; // critical sync
    localStorage.setItem("bgmMuted", muted);

    btn.textContent = muted ? "🔇" : "🎵";
    btn.style.color = muted ? "var(--text-dim)" : "";

    if (muted) {
        stopMusic();
    } else if ($("screen-game").style.display !== "none") {
        startMusic();
    }
}

// autoplay gate
document.addEventListener("click", () => {
    if (!muted) startMusic();
}, { once: true });

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
let _urgentBeepDone = false;
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
        const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
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
            o.type = "triangle";; o.frequency.value = f;
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

const LUT_SIZE = 8192; // Must be power of 2 for bitwise & MASK
const MASK = LUT_SIZE - 1;
const SCALE = LUT_SIZE / (Math.PI * 2);

// +1 length allows for branchless linear interpolation (index + 1 is always valid)
const SIN_LUT = new Float32Array(LUT_SIZE + 1); // Usage: Math.sin(x) => SIN_LUT[(x * SCALE) & MASK]
for (let i = 0; i <= LUT_SIZE; i++) {
    SIN_LUT[i] = Math.sin((i / LUT_SIZE) * Math.PI * 2);
}

/**
 * Fast Sine replacement using Linear Interpolation.
 * Provides high fidelity with extreme speed.
 * @param {number} x A numeric expression that contains an angle measured in radians.
 * @returns {number}
 */
function fastSin(x) {
    const pos = (x * SCALE) & MASK;
    const idx = pos | 0;
    const fraction = pos - idx;
    const a = SIN_LUT[idx];
    const b = SIN_LUT[idx + 1];
    return a + (b - a) * fraction; // lerp
}

/**
 * Samples the signal value at a given time.
 * @param {Signal} sig - The signal to sample.
 * @param {number} t - Time (0-1 normalized).
 * @param {boolean} addNoise - Whether to add noise.
 * @returns {number} The sampled value.
 */
function sample(sig, t, addNoise) {
    const { type, freq, phase, amp, harm, noise, dc } = sig;

    // Normalized phase (0.0 to 1.0)
    const u = (freq * t + (phase / 360)) % 1;
    const x = u * 6.283185307179586; // Pre-calculated PI * 2

    let v; // let v = 0;
    switch (type) {
        case "sine": v = fastSin(x); break;
        case "square": v = fastSin(x) >= 0 ? 1 : -1; break; // does not consider phase: v = u < 0.5 ? 1 : -1; break;
        case "pwm": v = u < 0.65 ? 1 : -1; break;
        case "sawtooth": v = 2 * u - 1; break;
        case "triangle": v = u < 0.5 ? 4 * u - 1 : 3 - 4 * u; break;
        case "am": v = (fastSin(x)) * (0.5 * (1 + fastSin(x * (harm || 0.05)))); break; // carrier * modulator (LFO-style volume swell)
        default: throw new Error(`Unhandled waveform: "${type}"`); // default: v = 0;

    }

    // Add Harmonic (3rd) - using mul instead of div
    if (harm && type !== "am") v += (harm * 0.1) * fastSin(x * 3);

    // Add Bipolar Noise
    if (addNoise && noise) v += (noise * 0.1) * (rand() * 0.8 - 0.4);

    // Final Gain and DC Offset
    return (amp * 0.1) * v + (dc ?? 0) * 0.1;
}

/**
 * Calculates the similarity score between target and player signals.
 * @returns {number} Score from 0 (no match) to 1 (perfect match).
 */
function matchScore() {
    let d = 0;
    const N = 300;

    for (let i = 0; i <= N; i++) {
        const t = i / N;
        d += Math.abs(sample(targetSignal, t, false) - sample(yoursSignal, t, false));
    }

    return Math.max(0, 1 - d / (2 * N));
}

/**
 * Draws the background grid on the canvas.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {number} W - Canvas width.
 * @param {number} H - Canvas height.
 */
function drawGrid(ctx, W, H) {
    ctx.strokeStyle = "rgba(0,255,180,0.07)"; ctx.lineWidth = .5;
    const cols = 8, rows = 4;
    for (let i = 1; i < cols; i++) { const x = W / cols * i; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let i = 1; i < rows; i++) { const y = H / rows * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(0,255,180,0.15"; ctx.lineWidth = .5;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
}

/**
 * Draws a waveform on the canvas.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {Signal} sig - The signal to draw.
 * @param {string} color - Stroke color.
 * @param {number} W - Canvas width.
 * @param {number} H - Canvas height.
 * @param {number} scroll - Scroll offset (0-1).
 * @param {boolean} noisy - Whether to add noise.
 * @param {number} [lineW=1.8] - Line width.
 */
function drawWave(ctx, sig, color, W, H, scroll, noisy, lineW) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW || 1.8;
    ctx.beginPath();
    for (let px = 0; px <= W; px++) {
        const t = (px / W - scroll + 1) % 1; // px / W (left: px/W + scroll) (right: px/W - scroll + 1)
        const v = sample(sig, t, noisy);
        const y = H / 2 - v * (H / 2 - 10);
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
    }
    ctx.stroke();
}

/**
 * Main animation loop for rendering waveforms.
 * @param {number} ts - Timestamp from requestAnimationFrame.
 */
function loop(ts) {
    const scroll = (ts / 4200) % 1;
    const c = $("c-overlay");
    if (!c) { animRaf = requestAnimationFrame(loop); return; }
    c.width = c.offsetWidth || 320;
    c.height = 120;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, W, H);

    const sc = matchScore();
    if (sc > 0.5) {
        // Overlay: both signals share one oscilloscope. A faint green trace
        // blends in as you get closer, giving you a visual diff of where you're off.
        ctx.save();
        ctx.globalAlpha = 0.3 * (sc - 0.5) * 2; // multiplier 0.08 or 0.3 <---fainter---
        ctx.strokeStyle = "#00ffb4";
        ctx.lineWidth = 2.5 * (sc + 0.5);
        ctx.beginPath();
        for (let px = 0; px <= W; px++) {
            const t = (px / W - scroll + 1) % 1; // px / W (left: px/W + scroll) (right: px/W - scroll + 1)
            const v = (sample(targetSignal, t, false) + sample(yoursSignal, t, false)) / 2;
            const y = H / 2 - v * (H / 2 - 10);
            px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    ctx.globalAlpha = 0.85;
    drawWave(ctx, targetSignal, "#00ff88", W, H, scroll, true, 4); // bright phosphor green
    ctx.globalAlpha = 1;
    drawWave(ctx, yoursSignal, "#ffb830", W, H, scroll, true, 4); // traditional scope color // --amber

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
 * Updates the match percentage meter and checks win condition.
 */
function updateMeter() {
    const sc = matchScore();

    const pct = Math.round(sc * 100);
    $("pct").textContent = `${pct}%`;

    const fill = $("fill");
    fill.style.width = `${pct}%`;
    fill.style.background = pct > 80 ? "#00ffb4" : (pct > 50 ? "#ffb830" : "#ff4554");

    const fb = $("feedback");
    if (!won && !revealed) {
        if (pct >= CONFIG.WIN_PERCENTAGE) {
            won = true;
            _wasCloseSfx = false; // reset state

            clearInterval(timerInterval);

            const bonus = Math.ceil(timeLeft * .8);
            score += 100 + bonus;
            $("score").textContent = score;
            showScorePop(100 + bonus);

            fb.textContent = "LOCKED IN +" + (100 + bonus) + " pts";
            fb.className = "feedback win";

            flash("#00ffb4");
            SFX.lock();
            if (navigator.vibrate) navigator.vibrate(100);

            setTimeout(() => nextRound(), 1800);
        } else if (pct >= CONFIG.CLOSE_PERCENTAGE) {
            fb.textContent = "Getting close…";
            fb.className = "feedback close";

            // Make the “close” state edge-triggered, not continuous
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

/**
 * Reads slider values and updates player signal.
 */
function recompute() {
    yoursSignal.freq = +$("sl-freq").value;
    yoursSignal.amp = +$("sl-amp").value;
    yoursSignal.phase = +$("sl-phase").value;
    yoursSignal.dc = +$("sl-dc").value;
    yoursSignal.harm = +$("sl-harm").value;
    yoursSignal.noise = +$("sl-noise").value;

    $("lbl-freq").textContent = `${yoursSignal.freq} Hz`;
    $("lbl-amp").textContent = (yoursSignal.amp / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
    $("lbl-phase").textContent = `${yoursSignal.phase}°`;
    $("lbl-dc").textContent = (yoursSignal.dc / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
    $("lbl-harm").textContent = (yoursSignal.harm / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
    $("lbl-noise").textContent = (yoursSignal.noise / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);

    // Subtle slider sfx - throttled
    const now = Date.now();
    if (now - _lastSliderSfx > 80) {
        SFX.slider();
        _lastSliderSfx = now;
    }

    updateMeter();
}

/**
 * Sets the waveform type from button click.
 * @param {HTMLElement} btn - The clicked button.
 */
function setType(btn) {
    document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    yoursSignal.type = btn.dataset.t;

    SFX.tick();
    if (navigator.vibrate) navigator.vibrate(50);
    updateMeter();
}

/**
 * Builds a random target signal based on current level.
 * @returns {Signal} The generated target signal.
 */
function buildTarget() {
    const lv = LEVELS[level];
    /** @type {Signal} */
    const t = {};
    t.type = lv.types[rng(0, lv.types.length - 1)];
    t.freq = rng(1, 6);
    t.amp = rng(3, 10);
    t.phase = lv.phase ? rng(0, 7) * 45 : 0;
    t.dc = lv.dc ? rng(-3, 3) : 0;
    t.harm = lv.harm ? rng(0, 5) : 0;
    t.noise = lv.noise ? rng(2, 6) : 0;
    return t;
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
    document.querySelectorAll(".type-btn").forEach(b => b.classList.toggle("active", b.dataset.t === "sine"));
    recompute();
}

/**
 * Advances to the next round.
 */
function nextRound() {
    won = false;
    revealed = false;
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
    dead.querySelector("h3").textContent = "MIXED SIGNALS MASTERED";
    dead.querySelector("h3").style.color = "var(--green)";

    $("dead-msg").textContent = "All 5 levels cleared with " + score + " pts. Legendary.";

    dead.classList.add("active");
    SFX.levelUp();

    cancelAnimationFrame(animRaf);
}

/**
 * Shows the game over screen.
 */
function gameOver() {
    clearInterval(timerInterval);
    flash("#ff4554");
    if (false) {
        // FIXME: high-pass it instead or reduce volume a bit
        // TODO: On retry return volume to "as-it-was"
        fadeBGM(1000, true); // smooth fade-out over 1s
    }
    $("screen-game").style.display = "none";

    const dead = $("screen-dead");
    dead.querySelector("h3").textContent = "SIGNAL LOST";
    dead.querySelector("h3").style.color = "var(--red)";

    $("dead-msg").textContent = `Level ${level + 1} · Round ${roundNo} · ${score} pts`;

    dead.classList.add("active");
    SFX.fail();

    // Screen shake + haptic
    const gameInner = $("game-inner");
    gameInner.classList.add("shake");
    setTimeout(() => gameInner.classList.remove("shake"), 500);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    cancelAnimationFrame(animRaf);
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
    timeLeft = LEVELS[level].time;

    const el = $("timer");
    el.textContent = timeLeft;
    el.className = "timer";

    timerInterval = setInterval(() => {
        timeLeft--;

        el.textContent = timeLeft;
        el.className = `timer${timeLeft <= 8 ? " urgent" : ""}`;

        if (timeLeft <= 8) {
            const now = Date.now(); // Throttle
            if (now - _lastUrgentSfx > 500) { // play every 0.5s (tweak)
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
    if (won || revealed) return;

    if (score < CONFIG.COST_HINT) return

    score = Math.max(0, score - CONFIG.COST_HINT);
    $("score").textContent = score;

    const hints = [
        "type: " + targetSignal.type,
        "freq: " + targetSignal.freq + " Hz",
        "amp: " + (targetSignal.amp / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION),
        ...(LEVELS[level].phase ? ['phase: ' + targetSignal.phase + "°"] : []),
        ...(LEVELS[level].dc && targetSignal.dc !== 0 ? ["dc: " + (targetSignal.dc / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)] : []),
        ...(LEVELS[level].harm && targetSignal.harm > 0 ? ["harmonic: " + (targetSignal.harm / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)] : []),
    ];

    const h = hints[rng(0, hints.length - 1)];
    $("feedback").textContent = `hint: ${h}`;
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

/**
 * Starts the game.
 */
function startGame() {
    // level = 0; // FIXED: Level intentionally NOT reset here
    score = levelStartScore; // score = 0; // FIXED: score intentionally NOT reset here
    roundNo = 0;

    $("score").textContent = score; // $("score").textContent = 0;

    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $("screen-game").style.display = "block";

    if (animRaf) cancelAnimationFrame(animRaf);
    requestAnimationFrame(loop);
    nextRound();
}