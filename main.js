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
 * Generates a random integer between lo and hi (inclusive).
 * @param {number} lo - Lower bound.
 * @param {number} hi - Upper bound.
 * @returns {number} Random integer.
 */
function rng(lo, hi) {
    return lo + Math.floor(Math.random() * (hi - lo + 1));
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
let volume = parseFloat(localStorage.getItem("bgmVolume") ?? "0.25"); // ideal: 0.4

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
        case "am": v = Math.sign(Math.sin(x)); break;
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
        const t = (px / W + scroll) % 1;
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
        ctx.save();
        ctx.globalAlpha = 0.08 * (sc - 0.5) * 2;
        ctx.strokeStyle = "#00ffb4";
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let px = 0; px <= W; px++) {
            const t = (px / W + scroll) % 1; // px / W
            const v = (sample(targetSignal, t, false) + sample(yoursSignal, t, false)) / 2;
            const y = H / 2 - v * (H / 2 - 10);
            px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    ctx.globalAlpha = 0.85;
    drawWave(ctx, targetSignal, "#38b4ff", W, H, scroll, true, 1.8);
    ctx.globalAlpha = 1;
    drawWave(ctx, yoursSignal, "#ff7043", W, H, scroll, false, 1.8);

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

            fb.textContent = "LOCKED IN +" + (100 + bonus) + " pts";
            fb.className = "feedback win";

            flash("#00ffb4");
            SFX.lock();

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
    $("screen-game").style.display = "none";

    const dead = $("screen-dead");
    dead.querySelector("h3").textContent = "SIGNAL LOST";
    dead.querySelector("h3").style.color = "var(--red)";

    $("dead-msg").textContent = `Level ${level + 1} · Round ${roundNo} · ${score} pts`;

    dead.classList.add("active");
    SFX.fail();

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