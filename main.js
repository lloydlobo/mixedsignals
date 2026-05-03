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

// ─── UTILITIES ────────────────────────────────────────────────────────────────

const lerp = (a, b, t) => a + (b - a) * t;

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
    WIN_PERCENTAGE: 92, // was 95 when sliders used fixed steps, then 92
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

// ─── FEEDBACK STATE ────────────────────────────────────────────────────────────

let urgency = 0,
    interactionEnergy = 0,
    screenFlash = 0,
    freezeFrames = 0,
    locked = false,
    lockStreak = 0;

const particles = [];

// ─── CONTINUOUS AUDIO ─────────────────────────────────────────────────────────

let contAudio = { ctx: null, osc: null, gain: null, filter: null };

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
 * Generates a random integer between lo and hi (inclusive).
 * @param {number} lo - Lower bound.
 * @param {number} hi - Upper bound.
 * @returns {number} Random integer.
 */
function rng(lo, hi) {
    return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// quadratic ramp
// calmer entry
// chaotic edge near success
function getInstability(sc) { // naive: `(sc > 0.85 && sc < 0.92) ? (sc - 0.85) / 0.07 : 0;`
    if (sc <= 0.85 || sc >= 0.92) return 0;
    const t = (sc - 0.85) / 0.07;
    return t * t;
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

// ─── CONTINUOUS AUDIO ─────────────────────────────────────────────────────

// Low Sub-Bass Drone
function initContAudio() {
    if (contAudio.ctx) return;
    contAudio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    contAudio.osc = contAudio.ctx.createOscillator();
    contAudio.gain = contAudio.ctx.createGain();
    contAudio.filter = contAudio.ctx.createBiquadFilter();

    contAudio.osc.type = "sine";
    contAudio.osc.frequency.value = 50;
    contAudio.filter.type = "lowpass";
    contAudio.filter.frequency.value = 80;
    contAudio.gain.gain.value = 0;

    contAudio.osc.connect(contAudio.filter);
    contAudio.filter.connect(contAudio.gain);
    contAudio.gain.connect(contAudio.ctx.destination);
    contAudio.osc.start();
}

function updateContAudio(matchQuality) {
    if (!contAudio.ctx || muted) return;
    if (contAudio.ctx.state === "suspended") contAudio.ctx.resume();

    const e = matchQuality;
    const u = urgency;
    const ie = interactionEnergy;
    const now = contAudio.ctx.currentTime;

    const base = lerp(0.05, 0.15, e)
    const urgencyDuck = (1 - u * 0.3);
    const interactionBoost = ie * 0.2;

    const instability = getInstability(e);

    contAudio.osc.frequency.linearRampToValueAtTime(lerp(50, 80, e), now + 0.05);
    contAudio.filter.frequency.linearRampToValueAtTime(lerp(80, 200, e), now + 0.05);
    contAudio.gain.gain.linearRampToValueAtTime(base * urgencyDuck + interactionBoost, now + 0.05);
    contAudio.osc.detune.value = instability * 30; // cents
}

// ─── PARTICLES ──────────────────────────────────────────────────────────────

function spawnParticles(n, cx, cy) {
    for (let i = 0; i < n; i++) {
        particles.push({
            x: cx,
            y: cy,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            size: Math.random() < 0.3 ? 3 : 1,
            life: 1,
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life *= 0.96;
        if (p.life < 0.01) particles.splice(i, 1);
    }
}

function drawParticles(ctx) {
    particles.forEach(p => {
        ctx.fillStyle = `rgba(255,200,100,${p.life})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    });
}

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

        // Continuous audio nudge on slider move
        if (contAudio.ctx && !muted) {
            const now = contAudio.ctx.currentTime;
            const delta = interactionEnergy * 30;
            contAudio.osc.frequency.linearRampToValueAtTime(
                // contAudio.osc.frequency.value + (Math.random() * 40 - 20), // fixme: too jumpy
                contAudio.osc.frequency.value + delta,
                now + 0.08
            );
        }
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

/**
 * Samples the signal value at a given time.
 * @param {Signal} sig - The signal to sample.
 * @param {number} t - Time (0-1 normalized).
 * @param {boolean} addNoise - Whether to add noise.
 * @returns {number} The sampled value.
 */
function sample(sig, t, addNoise) {
    const a = sig.amp / 10;
    const p = (sig.phase / 180) * Math.PI;
    const x = 2 * Math.PI * sig.freq * t + p;
    const h = (sig.harm || 0) / 10, n = (sig.noise || 0) / 10;
    let v;
    switch (sig.type) {
        case "sine": v = Math.sin(x); break;
        case "square": v = Math.sign(Math.sin(x)); break;
        case "sawtooth": v = 2 * ((sig.freq * t + sig.phase / 360) % 1) - 1; break;
        case "triangle": {
            const u = (sig.freq * t + sig.phase / 360) % 1;
            v = u < .5 ? 4 * u - 1 : 3 - 4 * u;
        }; break;
        case "pwm": {
            const u = (sig.freq * t + sig.phase / 360) % 1;
            v = u < .65 ? 1 : -1;
        }; break;
        case "am": {
            // v = Math.sign(Math.sin(x)); 
            const carrier = Math.sin(x);
            const mod = Math.sin(x * 0.25); // slower mod freq
            v = carrier * (1 + h * mod); // reuse harmonics as modulation index
        }; break;
        default: {
            const msg = `Exhausted all enumerated values for "Waveform". Got ${sig.type}`;
            throw new Error(msg);
        }
    }
    v += h * Math.sin(3 * x);
    if (addNoise && n > 0) v += n * (Math.random() - .5) * .8;
    return a * v + (sig.dc || 0) / 10;
}

/**
 * Calculates the similarity score between target and player signals.
 * @returns {number} Score from 0 (no match) to 1 (perfect match).
 */
function matchScore() {
    let best = Infinity;
    const N = 300;

    // Phase-invariant comparison pass
    // - feels fairer
    // - reduces “I’m clearly matching but score says no”
    // - especially important once phase control is unlocked
    for (let offset = 0; offset < 20; offset++) { // Try small phase offsets (cheap alignment) 
        let d = 0;
        const shift = offset / 20;

        for (let i = 0; i <= N; i++) {
            const t = i / N;
            d += Math.abs(
                sample(targetSignal, t, false) -
                sample(yoursSignal, t, false)
            );
        }

        best = Math.min(best, d);
    }

    return Math.max(0, 1 - best / (2 * N));
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
    ctx.strokeStyle = "rgba(0,255,180,0.15)"; ctx.lineWidth = .5;
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
    if (freezeFrames > 0) {
        freezeFrames--;
        animRaf = requestAnimationFrame(loop);
        return;
    }

    const scroll = (ts / 4200) % 1;
    const c = $("c-overlay");
    if (!c) { animRaf = requestAnimationFrame(loop); return; }
    c.width = c.offsetWidth || 320;
    c.height = 120;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;

    // Trail effect (signal persistence)
    ctx.fillStyle = "rgba(10,12,15,0.15)";
    ctx.fillRect(0, 0, W, H);
    drawGrid(ctx, W, H);

    // Update state
    const sc = matchScore();
    // urgency = 1 - (timeLeft / LEVELS[level].time); // ramps too early and feels flat
    urgency = Math.pow(1 - (timeLeft / LEVELS[level].time), 2); // use a curve: calm early game • sharp tension late game
    interactionEnergy *= 0.9;

    // Near-miss instability
    const instability = getInstability(sc);

    // Update continuous audio
    updateContAudio(sc);

    // Draw waveforms with enhanced rendering
    const e = sc;
    ctx.lineWidth = lerp(1, 3, e * e);
    ctx.shadowBlur = lerp(2, 18, e);
    ctx.shadowColor = "rgba(255,180,80,0.8)";
    ctx.globalAlpha = lerp(0.7, 1, e);

    const ie = interactionEnergy;
    ctx.shadowBlur += ie * 10;
    ctx.globalAlpha += ie * 0.1;


    if (sc > 0.5) {
        // overlay: wave merging
        const mix = sc;
        const r = lerp(255, 0, mix);
        const g = lerp(184, 255, mix);
        const b = lerp(48, 180, mix);
        ctx.save();
        ctx.globalAlpha = 0.3 * (sc - 0.5) * 2;

        // low match → amber-ish
        // high match → green/white
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 + mix * 0.4})`;
        // ctx.strokeStyle = "#00ffb4";

        ctx.lineWidth = 2.5 * (sc + 0.5);
        ctx.beginPath();
        for (let px = 0; px <= W; px++) {
            const t = (px / W - scroll + 1) % 1;
            const v = (sample(targetSignal, t, false) + sample(yoursSignal, t, false)) / 2;
            const jitter = instability * 2;
            let y = H / 2 - v * (H / 2 - 10) + (Math.random() - 0.5) * jitter;

            const wobble = Math.sin(ts * 0.05 + px * 0.02) * jitter;
            const phaseWobble = instability * 0.2 + Math.sin(ts * 0.01); // better than random phase drift

            y += lerp(wobble, phaseWobble, e);

            px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    ctx.globalAlpha = 0.85;
    ctx.shadowColor = "rgba(0,255,136,0.6)";
    drawWave(ctx, targetSignal, "#00ff88", W, H, scroll, true, 4);
    ctx.globalAlpha = 1;
    ctx.shadowColor = "rgba(255,184,48,0.6)";
    drawWave(ctx, yoursSignal, "#ffb830", W, H, scroll, true, 4);

    // Reset shadow
    ctx.shadowBlur = 0;

    // Screen flash (lock-in effect)
    if (screenFlash > 0) {
        ctx.fillStyle = `rgba(255,220,150,${screenFlash})`;
        ctx.fillRect(0, 0, W, H);
        screenFlash *= 0.85;
    }

    // Urgency vignette overlay
    const u = urgency;
    if (u > 0) {
        const vignetteAlpha = lerp(0, 0.5, u);
        ctx.fillStyle = `rgba(0,0,0,${vignetteAlpha})`;
        ctx.fillRect(0, 0, W, H);
    }

    // Update and draw particles
    updateParticles();
    drawParticles(ctx);

    // Lock-in trigger
    //
    // - lockStreak counts consecutive frames above threshold
    // - > 4 ≈ ~80ms at 60fps → feels intentional, not accidental
    // - any dip below 0.92 resets it → prevents spike-trigger
    //
    // If it feels too strict / too easy
    // if (lockStreak > 4)
    //   - > 2 → easier, more responsive
    //   - > 6 → stricter, more deliberate
    if (sc > CONFIG.WIN_PERCENTAGE) {
        lockStreak++;

        if (lockStreak > 4 && !locked) { // triggerLock() // lock FX
            locked = true;

            screenFlash = 1;
            freezeFrames = 6;

            // NOTE: Moved in triggerWin to avoid multiple spawns
            // spawnParticles(40, W / 2, H / 2);

            // quick dip: Right before triggering the lock. Then let existing SFX.lock() hit.
            if (contAudio.gain) { // That contrast makes it feel like a resolution, not just a reward.
                contAudio.gain.gain.value *= 0.2;
            }

            // Optional: pre-win feedback (feels great)
            if (!won) {
                $("feedback").textContent = "LOCKING…";
                $("feedback").className = "feedback close";
            }
        }
    } else {
        lockStreak = 0;
    }

    // Hysteresis unlock
    if (sc < 0.88) locked = false; // NOTE: Replaced with this
    // if (sc <= 0.92) locked = false; // NOTE: [Removed] Can retrigger lock multiple times if player hovers around threshold.

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

// Triggered ONLY by updateMeter()
function triggerWin() {
    if (won) return; // hard guard (idempotent)

    won = true;
    clearInterval(timerInterval);

    const bonus = Math.ceil(timeLeft * .8);
    const pts = 100 + bonus;

    score += pts;
    $("score").textContent = score;
    showScorePop(pts);

    const c = $("c-overlay");
    const W = c.width, H = c.height;
    spawnParticles(40, W / 2, H / 2);
    spawnParticles(40, 0, 0);
    spawnParticles(40, W / 1, H / 1);

    $("feedback").textContent = `LOCKED IN +${pts} pts`;
    $("feedback").className = "feedback win";

    flash("#00ffb4");
    SFX.lock();
    if (navigator.vibrate) navigator.vibrate(100);

    setTimeout(() => nextRound(), 1800);
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
            _wasCloseSfx = false; // reset state
            triggerWin();
        } else if (pct >= CONFIG.CLOSE_PERCENTAGE) {
            fb.textContent = "Getting close…";
            fb.className = "feedback close";

            if (!_wasCloseSfx) { // Make the “close” state edge-triggered, not continuous
                SFX.close();
                _wasCloseSfx = true;
            }
        } else {
            fb.textContent = "Match the target signal."; // TODO: Maybe leave this empty
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
        // Boost interaction energy on slider move
        interactionEnergy += 0.2;
        interactionEnergy = Math.min(interactionEnergy, 1);
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
    lockStreak = 0;
    locked = false;

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

    // Reset feedback state
    urgency = 0;
    interactionEnergy = 0;
    screenFlash = 0;
    freezeFrames = 0;
    locked = false;
    particles.length = 0;

    initContAudio();

    // Mobile-friendly: passive touchstart for snappier slider response
    document.querySelectorAll('input[type="range"]').forEach((slider) => {
        slider.addEventListener("touchstart", () => {}, { passive: true });
    });

    if (animRaf) cancelAnimationFrame(animRaf);
    requestAnimationFrame(loop);
    nextRound();
}