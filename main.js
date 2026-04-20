// NOTE: I want to share with you the joy of playing this fun little game. 
// NOTE: Heavely Vibed with le' AI

/**
 * @typedef {"sine" | "square" | "sawtooth" | "triangle"} Waveform
 */

/**
 * A parametric periodic signal model.
 * @typedef {Object} Signal
 * @property {Waveform} type     base oscillator shape // TODO: Rename this to waveform later
 * @property {number} freqHz     frequency in Hz
 * @property {number} amp        amplitude (linear gain)
 * @property {number} phase      phase offset in degrees
 * @property {number} dc         DC offset
 * @property {number} harm       harmonic content / distortion amount
 * @property {number} noise      noise level (0-1 typical)
 */

const LEVELS = [
    { rounds: 5, time: 30, types: ["sine", "square", "sawtooth", "triangle"], phase: false, dc: false, harm: false, noise: false },
    { rounds: 5, time: 25, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: false, harm: false, noise: false },
    { rounds: 5, time: 22, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: true, harm: false, noise: false },
    { rounds: 4, time: 18, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: false },
    { rounds: 4, time: 15, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: true },
];

/** @type {Signal} */
let targetSignal = {};

/** @type {Signal} */
let yoursSignal = { type: "sine", freqHz: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };

let score = 0,
    level = 0,
    roundNo = 0,
    timeLeft = 0,
    timerInterval = null,
    animRaf = null,
    won = false,
    revealed = false;

/**
 * The getElementById() method of the Document interface returns an Element
 * object representing the element whose id property matches the specified
 * string. Since element IDs are required to be unique if specified, they're a
 * useful way to get access to a specific element quickly.
 * @param {string} id elementId
 * @returns {HTMLElement | null}
 */
function $(id) {
    return document.getElementById(id);
}

/**
 * Random Number Generator
 * @param {number} lo 
 * @param {number} hi 
 * @returns {number}
 */
function rng(lo, hi) {
    return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** @param {string?} msg */
function unimplemented(msg = "") {
    throw new Error(`UNIMPLEMENTED: ${msg}`);
}

function sample(sig, t, addNoise) {
    const a = sig.amp / 10;
    const p = (sig.phase / 180) * Math.PI;
    const x = 2 * Math.PI * sig.freqHz * t + p;
    const h = (sig.harm || 0) / 10, n = (sig.noise || 0) / 10;
    let v;
    switch (sig.type) {
        case "sine": v = Math.sin(x); break;
        case "square": v = Math.sign(Math.sin(x)); break;
        case "sawtooth": v = 2 * ((sig.freqHz * t + sig.phase / 360) % 1) - 1; break;
        case "triangle": { const u = (sig.freqHz * t + sig.phase / 360) % 1; v = u < .5 ? 4 * u - 1 : 3 - 4 * u; }; break;
        case "pwm": { const u = (sig.freqHz * t + sig.phase / 360) % 1; v = u < .65 ? 1 : -1; }; break;
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

function matchScore() {
    let d = 0;
    const N = 300;

    for (let i = 0; i <= N; i++) {
        const t = i / N;
        d += Math.abs(sample(targetSignal, t, false) - sample(yoursSignal, t, false));
    }

    return Math.max(0, 1 - d / (2 * N));
}

function drawGrid(ctx, W, H) {
    ctx.strokeStyle = "rgba(0,255,180,0.07)"; ctx.lineWidth = .5;
    const cols = 8, rows = 4;
    for (let i = 1; i < cols; i++) { const x = W / cols * i; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let i = 1; i < rows; i++) { const y = H / rows * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(0,255,180,0.15"; ctx.lineWidth = .5;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
}

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

function flash(color) {
    const el = $("flash");
    el.style.background = color;
    el.classList.add("go");
    setTimeout(() => el.classList.remove("go"), 80);
}

// NOTE: Win results are mutated here
function updateMeter() {
    const sc = matchScore();

    const pct = Math.round(sc * 100);
    $("pct").textContent = `${pct}%`;

    const fill = $("fill");
    fill.style.width = `${pct}%`;
    fill.style.background = pct > 80 ? "#00ffb4" : (pct > 50 ? "#ffb830" : "#ff4554");

    const fb = $("feedback");
    if (!won && !revealed) {
        if (pct >= 95) {
            won = true;

            clearInterval(timerInterval);

            const bonus = Math.ceil(timeLeft * .8);
            score += 100 + bonus;
            $("score").textContent = score;

            fb.textContent = "LOCKED IN +" + (100 + bonus) + " pts";
            fb.className = "feedback win";

            flash("#00ffb4");
            setTimeout(() => nextRound(), 1800);
        } else if (pct >= 75) {
            fb.textContent = "Getting close…";
            fb.className = "feedback close";
        } else {
            fb.textContent = "Match the target signal.";
            fb.className = "feedback";
        }
    }
}

function recompute() {
    yoursSignal.freqHz = +$("sl-freq").value;
    yoursSignal.amp = +$("sl-amp").value;
    yoursSignal.phase = +$("sl-phase").value;
    yoursSignal.dc = +$("sl-dc").value;
    yoursSignal.harm = +$("sl-harm").value;
    yoursSignal.noise = +$("sl-noise").value;

    $("lbl-freq").textContent = `${yoursSignal.freqHz} Hz`;
    $("lbl-amp").textContent = (yoursSignal.amp / 10).toFixed(1);
    $("lbl-phase").textContent = `${yoursSignal.phase}°`;
    $("lbl-dc").textContent = (yoursSignal.dc / 10).toFixed(1);
    $("lbl-harm").textContent = (yoursSignal.harm / 10).toFixed(1);
    $("lbl-noise").textContent = (yoursSignal.noise / 10).toFixed(1);

    updateMeter();
}

function setType(btn) {
    document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    yoursSignal.type = btn.dataset.t;
    updateMeter();
}

function buildTarget() {
    const lv = LEVELS[level];
    /** @type {Signal} */
    const t = {};
    t.type = lv.types[rng(0, lv.types.length - 1)];
    t.freqHz = rng(1, 6);
    t.amp = rng(3, 10);
    t.phase = lv.phase ? rng(0, 7) * 45 : 0;
    t.dc = lv.dc ? rng(-3, 3) : 0;
    t.harm = lv.harm ? rng(0, 5) : 0;
    t.noise = lv.noise ? rng(2, 6) : 0;
    return t;
}

function resetYours() {
    yoursSignal = { type: "sine", freqHz: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    ["freqHz", "amp", "phase", "dc", "harm", "noise"].forEach(k => {
        const el = $(`sl-${k}`);
        if (el) el.value = yoursSignal[k];
    });
    document.querySelectorAll(".type-btn").forEach(b => b.classList.toggle("active", b.dataset.t === "sine"));
    recompute();
}

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

function showLevelUp() {
    clearInterval(timerInterval);
    $("screen-game").classList.remove("active");
    $("screen-game").style.display = "none";
    $("lu-title").textContent = `LEVEL ${level + 1}`;
    $("lu-msg").textContent = "New parameters unlocked. Less time. Good luck.";
    $("screen-levelup").classList.add("active");
}

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

function victory() {
    $("screen-game").style.display = "none";

    const dead = $("screen-dead");
    dead.querySelector("h3").textContent = "SIGNAL MASTERED";
    dead.querySelector("h3").style.color = "var(--green)";

    $("dead-msg").textContent = "All 5 levels cleared with " + score + " pts. Legendary.";

    dead.classList.add("active");
    cancelAnimationFrame(animRaf);
}

function gameOver() {
    flash("#ff4554");
    $("screen-game").style.display = "none";

    const dead = $("screen-dead");
    dead.querySelector("h3").textContent = "SIGNAL LOST";
    dead.querySelector("h3").style.color = "var(--red)";

    $("dead-msg").textContent = `Level ${level + 1} · Round ${roundNo} · ${score} pts`;

    dead.classList.add("active");
    cancelAnimationFrame(animRaf);
}

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

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            gameOver();
        }
    }, 1000);
}

function useHint() {
    if (won || revealed) return;

    const cost = 5;
    if (score < cost) return

    score = Math.max(0, score - cost);
    $("score").textContent = score;

    const hints = [
        "type: " + target.type,
        "freq: " + target.freq + " Hz",
        "amp: " + (target.amp / 10).toFixed(1),
        ...(LEVELS[level].phase ? ['phase: ' + target.phase + "°"] : []),
        ...(LEVELS[level].dc && target.dc !== 0 ? ["dc: " + (target.dc / 10).toFixed(1)] : []),
        ...(LEVELS[level].harm && target.harm > 0 ? ["harmonic: " + (target.harm / 10).toFixed(1)] : []),
    ];

    const h = hints[rng(0, hints.length - 1)];
    $("feedback").textContent = `hint: ${h}`;

    $("feedback").className = "feedback close";
}

function skipRound() {
    const cost = 10;
    if (score < cost) return;

    score = Math.max(0, score - cost);
    $("score").textContent = score;

    nextRound();
}

function startGame() {
    score = 0;
    level = 0;
    roundNo = 0;

    $("score").textContent = 0;
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $("screen-game").style.display = "block";

    if (animRaf) cancelAnimationFrame(animRaf);
    requestAnimationFrame(loop);
    nextRound();
}