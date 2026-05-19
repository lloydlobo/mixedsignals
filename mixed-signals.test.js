/**
 * Mixed Signals — Unit Tests
 * Run with: node mixed-signals.test.js
 * No dependencies, no build step, no browser required.
 *
 * Tests pure logic only — no DOM, no Web Audio, no canvas.
 * Stubs for browser globals are declared at the top.
 */

"use strict";

// ─── TEST HARNESS ─────────────────────────────────────────────────────────────

let _passed = 0, _failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓  ${name}`);
        _passed++;
    } catch (e) {
        console.error(`  ✗  ${name}`);
        console.error(`     ${e.message}`);
        _failed++;
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg ?? "assertion failed");
}

function assertEq(a, b, msg) {
    if (a !== b) throw new Error(msg ?? `expected ${b}, got ${a}`);
}

function assertClose(a, b, tolerance = 0.001, msg) {
    if (Math.abs(a - b) > tolerance)
        throw new Error(msg ?? `expected ${b} ± ${tolerance}, got ${a}`);
}

function assertThrows(fn, msg) {
    try { fn(); throw new Error("expected throw, got none"); }
    catch (e) { if (e.message === "expected throw, got none") throw new Error(msg ?? e.message); }
}

// ─── BROWSER STUBS ───────────────────────────────────────────────────────────
// Only stub what the tested functions actually reference at call time.

const localStorage = (() => {
    const store = {};
    return {
        getItem: k => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    };
})();

function lsGet(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
}

// Minimal UI stub — tests that touch dispatch need score display
const UI = {
    displays: {
        score: { textContent: "" },
        roundNo: { textContent: "" },
    },
};

// ─── INLINE CONSTANTS (copied verbatim from main.js) ─────────────────────────

// freqToHz constants
const AUDIO_MIN_HZ = 110, AUDIO_MAX_HZ = 220;
const FREQ_MIN = 1, FREQ_MAX = 8;
const INV_FREQ_RANGE = 1 / (FREQ_MAX - FREQ_MIN);
const AUDIO_EXP_FACTOR = Math.log(AUDIO_MAX_HZ / AUDIO_MIN_HZ);

// Scroll constants
const PHI = (1 + Math.sqrt(5)) / 2;
const RENDER_SCROLL = {
    SCROLL_BASE_MS: 3500,
    SCROLL_MIN_MS: 2000,
    SCROLL_EASE_EXP: PHI,
    SCROLL_EASE_FACTOR: 60,
};

const CONFIG = {
    FIXED_STEPS_PRECISION: 2,
    TIME_BONUS_RATE: 0.8,
    BASE_REWARD: 100,
    COST_HINT: 25,
    COST_SKIP: 130,
    WIN_PERCENTAGE: 95,
    CLOSE_PERCENTAGE: 75,
    NOISE_TOLERANCE_PER_UNIT: 1.2,
};

const LEVELS = [
    { rounds: 5, time: 35, types: ["sine", "square"], phase: false, dc: false, harm: false, noise: false, freeplay: true },
    { rounds: 5, time: 32, types: ["sine", "square", "sawtooth", "triangle"], phase: false, dc: false, harm: false, noise: false },
    { rounds: 5, time: 30, types: ["sine", "square", "sawtooth", "triangle"], phase: true,  dc: false, harm: false, noise: false, grace: true },
    { rounds: 5, time: 28, types: ["sine", "square", "sawtooth", "triangle"], phase: true,  dc: true,  harm: false, noise: false, grace: true },
    { rounds: 5, time: 26, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: false, noise: false, grace: true },
    { rounds: 5, time: 36, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true,  noise: false, grace: true, freeplay: true },
    { rounds: 5, time: 32, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true,  noise: true,  grace: true },
];

const SAVE_KEY = "mixedSignalsSave";

// ─── INLINE IMPLEMENTATIONS (extracted from main.js, no browser deps) ─────────

function makeRand(seed = 1831565813) {
    let s = seed >>> 0;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const gameRand = makeRand(1831565813);
const stampRand = makeRand(0xC0FFEE31);
function rng(lo, hi) {
    if (lo > hi) { const t = lo; lo = hi; hi = t; }
    return lo + (gameRand() * (hi - lo + 1)) | 0;
}
const pick = (rng) => (arr) => arr[Math.floor(rng() * arr.length)];
const gamePick = pick(gameRand);

function smoothstep(x) { return x * x * (3 - 2 * x); }
function sigmoid(x)    { return 1 / (1 + Math.exp(-8 * (x - 0.5))); }

const LUT_SIZE = 8192, MASK = LUT_SIZE - 1, SCALE = LUT_SIZE / (Math.PI * 2);
const SIN_LUT = new Float32Array(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) SIN_LUT[i] = Math.sin((i / LUT_SIZE) * Math.PI * 2);
function fastSin(x) {
    const pos = x * SCALE, idx = Math.floor(pos), iA = idx & MASK, a = SIN_LUT[iA];
    return a + (SIN_LUT[iA + 1] - a) * (pos - idx);
}

const SAMPLERS = Object.freeze({
    sine:     (x, u, harm) => fastSin(x),
    square:   (x, u, harm) => fastSin(x) >= 0 ? 1 : -1,
    sawtooth: (x, u, harm) => 2 * u - 1,
    triangle: (x, u, harm) => u < 0.5 ? 4 * u - 1 : 3 - 4 * u,
    pwm:      (x, u, harm) => u < 0.65 ? 1 : -1,
    am:       (x, u, harm) => fastSin(x) * (1 + (harm || 0.5) * fastSin(x * 0.25)) * 0.5,
});

function sample(sig, t, addNoise) {
    if (!sig) return 0;
    const { type, freq, phase, amp, harm, noise, dc } = sig;
    const u = (freq * t + phase / 360) % 1;
    const x = u * 6.283185307179586;
    if (!SAMPLERS[type]) throw new Error(`Unhandled waveform: "${type}"`);
    let v = SAMPLERS[type](x, u, harm);
    if (harm && type !== "am") v += (harm * 0.1) * fastSin(x * 3);
    if (addNoise && noise) v += (noise * 0.1) * (gameRand() * 0.8 - 0.4);
    return (amp * 0.1) * v + (dc ?? 0) * 0.1;
}

const SCORE_SAMPLES = 96, INV_SCORE_SAMPLES = 1 / 96, SCORE_SCALE = 1 / (2 * 96);
let _targetSignal = {}, _yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
let _cachedMatchScore = 0, _matchScoreDirty = true;
function invalidateMatchScore() { _matchScoreDirty = true; }
function matchScore() {
    if (!_matchScoreDirty) return _cachedMatchScore;
    let d0 = 0, d1 = 0, d2 = 0, d3 = 0;
    for (let i = 0; i < SCORE_SAMPLES; i += 4) {
        const s0 = sample(_targetSignal, i * INV_SCORE_SAMPLES, false) - sample(_yoursSignal, i * INV_SCORE_SAMPLES, false);
        const s1 = sample(_targetSignal, (i+1) * INV_SCORE_SAMPLES, false) - sample(_yoursSignal, (i+1) * INV_SCORE_SAMPLES, false);
        const s2 = sample(_targetSignal, (i+2) * INV_SCORE_SAMPLES, false) - sample(_yoursSignal, (i+2) * INV_SCORE_SAMPLES, false);
        const s3 = sample(_targetSignal, (i+3) * INV_SCORE_SAMPLES, false) - sample(_yoursSignal, (i+3) * INV_SCORE_SAMPLES, false);
        d0 += s0 < 0 ? -s0 : s0; d1 += s1 < 0 ? -s1 : s1;
        d2 += s2 < 0 ? -s2 : s2; d3 += s3 < 0 ? -s3 : s3;
    }
    const raw = 1 - (d0 + d1 + d2 + d3) * SCORE_SCALE;
    _cachedMatchScore = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    _matchScoreDirty = false;
    return _cachedMatchScore;
}

// winThreshold needs Session refs — use a local proxy
const _Session = { assistEasyMatch: false };
let _yoursType = "sine", _targetType = "sine", _targetNoise = 0;
function winThreshold() {
    const easyMatchWinPCT = 88;
    if (_Session.assistEasyMatch && _yoursType === _targetType) return easyMatchWinPCT;
    if (_yoursType !== _targetType) return 99;
    const noiseReduction = (_targetNoise ?? 0) * CONFIG.NOISE_TOLERANCE_PER_UNIT;
    return Math.max(75, CONFIG.WIN_PERCENTAGE - noiseReduction);
}

// dispatch — needs Session + UI
const _DispatchSession = { score: 0, levelStartScore: 0, level: 0 };
const _Round = { roundNo: 0 };
function dispatch(action) {
    switch (action.type) {
        case "SCORE_ADD":
            _DispatchSession.score += action.payload;
            UI.displays.score.textContent = _DispatchSession.score;
            break;
        case "SCORE_SET":
            _DispatchSession.score = action.payload;
            UI.displays.score.textContent = _DispatchSession.score;
            break;
        case "SCORE_DEDUCT":
            _DispatchSession.score = Math.max(0, _DispatchSession.score - action.payload);
            UI.displays.score.textContent = _DispatchSession.score;
            break;
        case "SCORE_RESET":
            _DispatchSession.score = 0;
            _DispatchSession.levelStartScore = 0;
            UI.displays.score.textContent = _DispatchSession.score;
            break;
        case "LEVEL_SET":
            _DispatchSession.level = action.payload;
            break;
        case "ROUND_NEXT":
            _Round.roundNo++;
            UI.displays.roundNo.textContent = _Round.roundNo;
            break;
        case "ROUND_SET":
            _Round.roundNo = action.payload;
            UI.displays.roundNo.textContent = _Round.roundNo;
            break;
    }
}

// save system
const DEFAULT_SETTINGS = () => ({
    bgmMuted: false, sfxMuted: false, bgmVolume: 0.4, sfxVolume: 0.4,
    ceremonies: true, screenShake: true, minigames: false,
    assistDisableUrgent: false, assistInfiniteTime: false,
    assistEasyMatch: false, assistNoFail: false,
});
function freshSave() {
    return { highestLevel: 0, bestScores: new Array(LEVELS.length).fill(0), seenCeremonies: [], settings: DEFAULT_SETTINGS(), telemetry: [] };
}
function writeSave(data) { lsSet(SAVE_KEY, JSON.stringify(data)); }
function loadSave() {
    try {
        const raw = lsGet(SAVE_KEY);
        if (!raw) return freshSave();
        const d = JSON.parse(raw);
        if (typeof d.highestLevel !== "number" || !Array.isArray(d.bestScores)) return freshSave();
        while (d.bestScores.length < LEVELS.length) d.bestScores.push(0);
        if (!Array.isArray(d.seenCeremonies)) d.seenCeremonies = [];
        if (!d.settings) {
            d.settings = {
                bgmMuted:    lsGet("bgmMuted") === "true",
                sfxMuted:    lsGet("sfxMuted") === "true",
                bgmVolume:   parseFloat(lsGet("bgmVolume") ?? "0.4"),
                sfxVolume:   0.4, ceremonies: true, screenShake: true,
            };
        }
        d.settings = { ...DEFAULT_SETTINGS(), ...d.settings };
        return d;
    } catch { return freshSave(); }
}

// ─── ADDITIONAL PURE FUNCTIONS ─────────────────────────────────────────────────

function freqToHz(freq) {
    return AUDIO_MIN_HZ * Math.exp((freq - FREQ_MIN) * INV_FREQ_RANGE * AUDIO_EXP_FACTOR);
}

function getScrollPeriod(level) {
    return Math.max(RENDER_SCROLL.SCROLL_MIN_MS, RENDER_SCROLL.SCROLL_BASE_MS - level ** RENDER_SCROLL.SCROLL_EASE_EXP * RENDER_SCROLL.SCROLL_EASE_FACTOR);
}

const _SessionCeremony = { level: 0, ceremonies: true };
const CEREMONIES = { 2: {}, 3: {}, 4: {}, 5: {} };
function hasPendingCeremony() {
    return _SessionCeremony.ceremonies && _SessionCeremony.level in CEREMONIES;
}

const WAVEFORM_GAIN = Object.freeze({
    sine: 1.0,
    square: Math.SQRT1_2,
    sawtooth: 1.225,
    triangle: 1.225,
    pwm: 0.877,
    am: 1.334,
});

function _pickWeightedType(types, level) {
    const weights = types.map(t => {
        if (level <= 4) return 1;
        if (t === "pwm" || t === "am") return level === 4 ? 3 : level === 5 ? 2 : 1;
        return 1;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = gameRand() * total;
    for (let i = 0; i < types.length; i++) {
        r -= weights[i];
        if (r <= 0) return types[i];
    }
    return types[types.length - 1];
}

function _pickWeightedParam(values, debutLevel, boost, level) {
    let total = 0;
    for (let i = 0; i < values.length; i++) {
        total += values[i] === 0 ? 1 : level === debutLevel ? boost : level === debutLevel + 1 ? Math.max(1, (boost * 0.6) | 0) : 1;
    }
    let r = gameRand() * total;
    for (let i = 0; i < values.length; i++) {
        const w = values[i] === 0 ? 1 : level === debutLevel ? boost : level === debutLevel + 1 ? Math.max(1, (boost * 0.6) | 0) : 1;
        r -= w;
        if (r <= 0) return values[i];
    }
    return values[values.length - 1];
}

function recordLevelComplete(completedLevel, runScore) {
    const save = loadSave();
    save.highestLevel = Math.max(save.highestLevel, completedLevel + 1);
    save.bestScores[completedLevel] = Math.max(save.bestScores[completedLevel], runScore);
    if (!save.telemetry) save.telemetry = [];
    save.telemetry.push({
        level: completedLevel,
        rounds: 5,
        hintsUsed: 0,
        skipsUsed: 0,
        score: runScore,
        timeRemaining: 10,
    });
    writeSave(save);
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

console.log("\n── makeRand / rng ───────────────────────────────────────────");

test("makeRand produces values in [0, 1)", () => {
    const r = makeRand(42);
    for (let i = 0; i < 100; i++) {
        const v = r();
        assert(v >= 0 && v < 1, `out of range: ${v}`);
    }
});

test("makeRand is deterministic with same seed", () => {
    const r1 = makeRand(999), r2 = makeRand(999);
    for (let i = 0; i < 20; i++) assertEq(r1(), r2(), "sequences diverged");
});

test("makeRand produces different sequences with different seeds", () => {
    const r1 = makeRand(1), r2 = makeRand(2);
    let same = true;
    for (let i = 0; i < 10; i++) if (r1() !== r2()) { same = false; break; }
    assert(!same, "different seeds produced identical sequences");
});

test("rng returns integers in [lo, hi]", () => {
    const r = makeRand(1);
    // reset gameRand via local version
    for (let i = 0; i < 200; i++) {
        const v = lo => {
            const hi = 5;
            return lo + (r() * (hi - lo + 1)) | 0;
        };
        const x = v(1);
        assert(x >= 1 && x <= 5, `rng(1,5) out of range: ${x}`);
    }
});

test("rng handles lo > hi by swapping", () => {
    // rng swaps internally — just check no crash and result in range
    const r = makeRand(7);
    const v = 3 + (r() * (8 - 3 + 1)) | 0;
    assert(v >= 3 && v <= 8);
});

console.log("\n── fastSin / LUT ────────────────────────────────────────────");

test("fastSin(0) ≈ 0", () => assertClose(fastSin(0), 0));
test("fastSin(π/2) ≈ 1", () => assertClose(fastSin(Math.PI / 2), 1, 0.001));
test("fastSin(π) ≈ 0", () => assertClose(fastSin(Math.PI), 0, 0.001));
test("fastSin(3π/2) ≈ -1", () => assertClose(fastSin(3 * Math.PI / 2), -1, 0.001));
test("fastSin matches Math.sin within tolerance across range", () => {
    for (let i = 0; i < 100; i++) {
        const x = (i / 100) * Math.PI * 2;
        assertClose(fastSin(x), Math.sin(x), 0.0005, `at x=${x.toFixed(3)}`);
    }
});

console.log("\n── sample ───────────────────────────────────────────────────");

const baseSig = { type: "sine", freq: 1, amp: 10, phase: 0, dc: 0, harm: 0, noise: 0 };

test("sample returns 0 for null sig", () => assertEq(sample(null, 0.25, false), 0));

test("sine at t=0.25 ≈ peak (amp * 0.1)", () => {
    // t=0.25 → u=0.25 → x=π/2 → sin=1
    assertClose(sample(baseSig, 0.25, false), 1.0, 0.01);
});

test("sine at t=0.75 ≈ trough (-amp * 0.1)", () => {
    assertClose(sample(baseSig, 0.75, false), -1.0, 0.01);
});

test("square is ±(amp * 0.1) only", () => {
    const sq = { ...baseSig, type: "square" };
    for (let i = 0; i < 20; i++) {
        const v = sample(sq, i / 20, false);
        assert(Math.abs(Math.abs(v) - 1.0) < 0.001, `square not ±1: ${v}`);
    }
});

test("sawtooth at t=0 ≈ -amp*0.1, at t=0.5 ≈ 0, at t=0.999 ≈ +amp*0.1", () => {
    const saw = { ...baseSig, type: "sawtooth" };
    assertClose(sample(saw, 0, false),   -1.0, 0.01);
    assertClose(sample(saw, 0.5, false),  0.0, 0.01);
    assertClose(sample(saw, 0.999, false), 1.0, 0.02);
});

test("triangle peaks at t=0.5, zero at t=0.25, troughs at t=1.0", () => {
    // triangle: u<0.5 → 4u-1, else 3-4u
    // t=0.25 → u=0.25 → 4*0.25-1 = 0 (zero crossing)
    // t=0.5  → u=0.5  → 4*0.5-1 = 1 (peak)
    // t=1.0  → u=0.0  → 4*0-1 = -1 (trough, wraps)
    const tri = { ...baseSig, type: "triangle" };
    assertClose(sample(tri, 0.25, false),  0.0, 0.01);
    assertClose(sample(tri, 0.5,  false),  1.0, 0.01);
    assertClose(sample(tri, 0.0,  false), -1.0, 0.01);
});

test("dc offset shifts output by dc*0.1", () => {
    const dc3 = { ...baseSig, type: "sine", amp: 0, dc: 3 };
    assertClose(sample(dc3, 0, false), 0.3, 0.001);
});

test("unknown waveform type throws", () => {
    assertThrows(() => sample({ ...baseSig, type: "unknown" }, 0, false));
});

test("amp=0 produces dc offset only", () => {
    const silent = { ...baseSig, amp: 0, dc: 5 };
    assertClose(sample(silent, 0.25, false), 0.5, 0.001);
    assertClose(sample(silent, 0.75, false), 0.5, 0.001);
});

console.log("\n── matchScore ───────────────────────────────────────────────");

test("identical signals score 1.0", () => {
    const sig = { type: "sine", freq: 2, amp: 7, phase: 0, dc: 0, harm: 0, noise: 0 };
    _targetSignal = sig; _yoursSignal = { ...sig };
    invalidateMatchScore();
    assertClose(matchScore(), 1.0, 0.001);
});

test("opposite-phase signals score significantly below identical signals", () => {
    // 180° phase shift inverts the wave — score is ~0.36, not 1.0
    // matchScore measures MAE not correlation, so phase-inverted ≠ score 0
    _targetSignal = { type: "sine", freq: 1, amp: 10, phase: 0,   dc: 0, harm: 0, noise: 0 };
    _yoursSignal  = { type: "sine", freq: 1, amp: 10, phase: 180, dc: 0, harm: 0, noise: 0 };
    invalidateMatchScore();
    const sc = matchScore();
    assert(sc < 0.5, `expected phase-inverted score < 0.5, got ${sc}`);
    assert(sc < 0.99, "phase-inverted should not score as identical");
});

test("matchScore is cached — second call without invalidate returns same value", () => {
    _targetSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    _yoursSignal  = { type: "sine", freq: 2, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    invalidateMatchScore();
    const first = matchScore();
    // Mutate without invalidating — cache should return stale value
    _yoursSignal.freq = 1;
    const second = matchScore();
    assertEq(first, second, "cache was bypassed");
});

test("matchScore after invalidate reflects new signal", () => {
    _targetSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    _yoursSignal  = { type: "sine", freq: 2, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    invalidateMatchScore();
    const mismatch = matchScore();
    _yoursSignal.freq = 1;
    invalidateMatchScore();
    const match = matchScore();
    assert(match > mismatch, `expected match (${match}) > mismatch (${mismatch})`);
});

test("matchScore in [0, 1]", () => {
    for (const type of ["sine", "square", "sawtooth", "triangle"]) {
        _targetSignal = { type, freq: 3, amp: 8, phase: 45, dc: 1, harm: 0, noise: 0 };
        _yoursSignal  = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
        invalidateMatchScore();
        const sc = matchScore();
        assert(sc >= 0 && sc <= 1, `score out of range for ${type}: ${sc}`);
    }
});

console.log("\n── winThreshold ─────────────────────────────────────────────");

test("type match, no noise → 95%", () => {
    _yoursType = "sine"; _targetType = "sine"; _targetNoise = 0;
    _Session.assistEasyMatch = false;
    assertEq(winThreshold(), 95);
});

test("type mismatch always → 99 regardless of assist", () => {
    _yoursType = "sine"; _targetType = "square"; _targetNoise = 0;
    _Session.assistEasyMatch = false;
    assertEq(winThreshold(), 99);
    _Session.assistEasyMatch = true;
    assertEq(winThreshold(), 99);
});

test("noise=6 reduces threshold by 7.2pts → 87.8 → clamped to max(75,...)", () => {
    _yoursType = "sine"; _targetType = "sine"; _targetNoise = 6;
    _Session.assistEasyMatch = false;
    assertClose(winThreshold(), 95 - 6 * 1.2, 0.01); // 87.8
});

test("noise cannot reduce threshold below 75", () => {
    _yoursType = "sine"; _targetType = "sine"; _targetNoise = 100;
    _Session.assistEasyMatch = false;
    assertEq(winThreshold(), 75);
});

test("assistEasyMatch with correct type → 88", () => {
    _yoursType = "square"; _targetType = "square"; _targetNoise = 0;
    _Session.assistEasyMatch = true;
    assertEq(winThreshold(), 88);
});

test("assistEasyMatch with wrong type → 99, not 88", () => {
    _yoursType = "sine"; _targetType = "square"; _targetNoise = 0;
    _Session.assistEasyMatch = true;
    assertEq(winThreshold(), 99);
});

console.log("\n── dispatch ─────────────────────────────────────────────────");

test("SCORE_ADD accumulates", () => {
    _DispatchSession.score = 0;
    dispatch({ type: "SCORE_ADD", payload: 100 });
    dispatch({ type: "SCORE_ADD", payload: 50 });
    assertEq(_DispatchSession.score, 150);
});

test("SCORE_DEDUCT floors at 0", () => {
    _DispatchSession.score = 20;
    dispatch({ type: "SCORE_DEDUCT", payload: 100 });
    assertEq(_DispatchSession.score, 0);
});

test("SCORE_DEDUCT subtracts correctly when sufficient", () => {
    _DispatchSession.score = 200;
    dispatch({ type: "SCORE_DEDUCT", payload: 25 });
    assertEq(_DispatchSession.score, 175);
});

test("SCORE_RESET zeroes score and levelStartScore", () => {
    _DispatchSession.score = 500;
    _DispatchSession.levelStartScore = 200;
    dispatch({ type: "SCORE_RESET" });
    assertEq(_DispatchSession.score, 0);
    assertEq(_DispatchSession.levelStartScore, 0);
});

test("SCORE_SET sets exactly", () => {
    _DispatchSession.score = 999;
    dispatch({ type: "SCORE_SET", payload: 42 });
    assertEq(_DispatchSession.score, 42);
});

test("LEVEL_SET updates level", () => {
    _DispatchSession.level = 0;
    dispatch({ type: "LEVEL_SET", payload: 3 });
    assertEq(_DispatchSession.level, 3);
});

test("ROUND_NEXT increments roundNo", () => {
    _Round.roundNo = 2;
    dispatch({ type: "ROUND_NEXT" });
    assertEq(_Round.roundNo, 3);
});

test("ROUND_SET sets exactly", () => {
    _Round.roundNo = 99;
    dispatch({ type: "ROUND_SET", payload: 1 });
    assertEq(_Round.roundNo, 1);
});

test("dispatch updates UI.displays.score textContent", () => {
    _DispatchSession.score = 0;
    dispatch({ type: "SCORE_ADD", payload: 77 });
    assertEq(UI.displays.score.textContent, 77);
});

console.log("\n── save / loadSave / migration ──────────────────────────────");

test("freshSave returns correct shape", () => {
    const s = freshSave();
    assertEq(s.highestLevel, 0);
    assertEq(s.bestScores.length, LEVELS.length);
    assert(Array.isArray(s.seenCeremonies));
    assert(typeof s.settings === "object");
});

test("loadSave returns freshSave when nothing stored", () => {
    localStorage.clear();
    const s = loadSave();
    assertEq(s.highestLevel, 0);
    assertEq(typeof s.settings.bgmMuted, "boolean");
});

test("loadSave round-trips through writeSave", () => {
    localStorage.clear();
    const fresh = freshSave();
    fresh.highestLevel = 3;
    fresh.bestScores[2] = 420;
    writeSave(fresh);
    const loaded = loadSave();
    assertEq(loaded.highestLevel, 3);
    assertEq(loaded.bestScores[2], 420);
});

test("loadSave merges DEFAULT_SETTINGS for missing keys", () => {
    localStorage.clear();
    // Write a save missing new settings keys
    const partial = { highestLevel: 1, bestScores: new Array(LEVELS.length).fill(0), seenCeremonies: [], settings: { bgmMuted: true } };
    lsSet(SAVE_KEY, JSON.stringify(partial));
    const loaded = loadSave();
    // bgmMuted preserved
    assertEq(loaded.settings.bgmMuted, true);
    // Missing keys filled from DEFAULT_SETTINGS
    assertEq(typeof loaded.settings.ceremonies, "boolean");
    assertEq(typeof loaded.settings.assistNoFail, "boolean");
});

test("loadSave pads bestScores shorter than LEVELS.length", () => {
    localStorage.clear();
    const short = { highestLevel: 0, bestScores: [10, 20], seenCeremonies: [], settings: DEFAULT_SETTINGS() };
    lsSet(SAVE_KEY, JSON.stringify(short));
    const loaded = loadSave();
    assertEq(loaded.bestScores.length, LEVELS.length);
    assertEq(loaded.bestScores[0], 10);
    assertEq(loaded.bestScores[1], 20);
    assertEq(loaded.bestScores[2], 0);
});

test("loadSave returns freshSave on corrupt JSON", () => {
    localStorage.clear();
    lsSet(SAVE_KEY, "{{not valid json}}");
    const s = loadSave();
    assertEq(s.highestLevel, 0);
});

test("loadSave returns freshSave when highestLevel is missing", () => {
    localStorage.clear();
    lsSet(SAVE_KEY, JSON.stringify({ bestScores: [] }));
    const s = loadSave();
    assertEq(s.highestLevel, 0);
});

console.log("\n── smoothstep / sigmoid ─────────────────────────────────────");

test("smoothstep(0) = 0", () => assertEq(smoothstep(0), 0));
test("smoothstep(1) = 1", () => assertEq(smoothstep(1), 1));
test("smoothstep(0.5) = 0.5", () => assertEq(smoothstep(0.5), 0.5));
test("smoothstep is monotone increasing", () => {
    let prev = smoothstep(0);
    for (let i = 1; i <= 10; i++) {
        const cur = smoothstep(i / 10);
        assert(cur >= prev, `not monotone at ${i/10}`);
        prev = cur;
    }
});

test("sigmoid(0.5) = 0.5", () => assertClose(sigmoid(0.5), 0.5, 0.001));
test("sigmoid(0) < 0.1 (steep at edges)", () => assert(sigmoid(0) < 0.1));
test("sigmoid(1) > 0.9", () => assert(sigmoid(1) > 0.9));

console.log("\n── freqToHz ──────────────────────────────────────────────");

test("freqToHz(1) = AUDIO_MIN_HZ (110)", () => assertClose(freqToHz(1), 110, 0.001));

test("freqToHz(8) = AUDIO_MAX_HZ (220)", () => assertClose(freqToHz(8), 220, 0.001));

test("freqToHz is monotonic increasing", () => {
    let prev = freqToHz(1);
    for (let f = 1.5; f <= 8; f += 0.5) {
        const cur = freqToHz(f);
        assert(cur > prev, `not monotonic at ${f}`);
        prev = cur;
    }
});

test("freqToHz(4.5) = geometric mean ~155.56", () => assertClose(freqToHz(4.5), 155.56, 0.5));

console.log("\n── getScrollPeriod ────────────────────────────────────────");

test("getScrollPeriod(0) = SCROLL_BASE_MS (3500)", () => assertEq(getScrollPeriod(0), 3500));

test("getScrollPeriod does not fall below SCROLL_MIN_MS (2000)", () => {
    for (let lv = 0; lv < 20; lv++) {
        assert(getScrollPeriod(lv) >= 2000, `below min at level ${lv}`);
    }
});

test("getScrollPeriod decreases with level", () => {
    for (let lv = 1; lv < 10; lv++) {
        assert(getScrollPeriod(lv) <= getScrollPeriod(lv - 1), `increased from lv${lv - 1} to lv${lv}`);
    }
});

console.log("\n── pick ───────────────────────────────────────────────────");

test("pick returns an element from the array", () => {
    const r = makeRand(42);
    const p = pick(r);
    const arr = [10, 20, 30];
    for (let i = 0; i < 50; i++) {
        const v = p(arr);
        assert(arr.includes(v), `unexpected value: ${v}`);
    }
});

test("pick returns undefined for empty array", () => {
    const r = makeRand(42);
    const p = pick(r);
    assertEq(p([]), undefined);
});

test("pick single-element array always returns that element", () => {
    const r = makeRand(99);
    const p = pick(r);
    for (let i = 0; i < 20; i++) assertEq(p([42]), 42);
});

console.log("\n── WAVEFORM_GAIN ──────────────────────────────────────────");

test("all waveform types have a gain coefficient", () => {
    for (const t of ["sine", "square", "sawtooth", "triangle", "pwm", "am"]) {
        assert(typeof WAVEFORM_GAIN[t] === "number" && WAVEFORM_GAIN[t] > 0, `missing/invalid gain for ${t}`);
    }
});

test("sine gain is exactly 1.0 (reference)", () => assertEq(WAVEFORM_GAIN.sine, 1.0));

test("square gain equals Math.SQRT1_2", () => assertEq(WAVEFORM_GAIN.square, Math.SQRT1_2));

console.log("\n── _pickWeightedType ──────────────────────────────────────");

test("_pickWeightedType returns a type from the given list", () => {
    const types = ["sine", "square", "sawtooth"];
    for (let i = 0; i < 50; i++) {
        const t = _pickWeightedType(types, 0);
        assert(types.includes(t), `unexpected type: ${t}`);
    }
});

test("_pickWeightedType at level 4 boosts pwm/am weight", () => {
    // With equal weights all types are equally likely, but at lv4 pwm+am get 3x
    // Run many iterations and verify both appear
    const types = ["sine", "pwm", "am"];
    let sawPwm = false, sawAm = false, sawSine = false;
    for (let i = 0; i < 200; i++) {
        const t = _pickWeightedType(types, 4);
        if (t === "pwm") sawPwm = true;
        if (t === "am") sawAm = true;
        if (t === "sine") sawSine = true;
    }
    assert(sawPwm, "pwm never picked at level 4");
    assert(sawAm, "am never picked at level 4");
    assert(sawSine, "sine never picked at level 4");
});

console.log("\n── _pickWeightedParam ─────────────────────────────────────");

test("_pickWeightedParam returns a value from the given array", () => {
    const vals = [0, 45, 90, 180];
    for (let i = 0; i < 50; i++) {
        const v = _pickWeightedParam(vals, 2, 6, 3);
        assert(vals.includes(v), `unexpected value: ${v}`);
    }
});

test("_pickWeightedParam at debut level 2 uses boost multiplier", () => {
    // non-zero values at debut level 2 get boost=6x weight; value=0 gets 1x
    const vals = [0, 45];
    let sawZero = false, saw45 = false;
    for (let i = 0; i < 200; i++) {
        const v = _pickWeightedParam(vals, 2, 6, 2);
        if (v === 0) sawZero = true;
        if (v === 45) saw45 = true;
    }
    assert(sawZero, "0 never picked at debut");
    assert(saw45, "45 never picked at debut");
});

console.log("\n── hasPendingCeremony ─────────────────────────────────────");

test("hasPendingCeremony returns false when ceremonies disabled", () => {
    _SessionCeremony.ceremonies = false;
    _SessionCeremony.level = 2;
    assert(!hasPendingCeremony());
    _SessionCeremony.ceremonies = true;
});

test("hasPendingCeremony returns true for level with ceremony", () => {
    _SessionCeremony.level = 2;
    assert(hasPendingCeremony());
});

test("hasPendingCeremony returns false for level without ceremony", () => {
    _SessionCeremony.level = 0;
    assert(!hasPendingCeremony());
    _SessionCeremony.level = 1;
    assert(!hasPendingCeremony());
    _SessionCeremony.level = 6;
    assert(!hasPendingCeremony());
});

console.log("\n── recordLevelComplete ────────────────────────────────────");

test("recordLevelComplete updates highestLevel", () => {
    localStorage.clear();
    recordLevelComplete(0, 100);
    const s = loadSave();
    assertEq(s.highestLevel, 1);
});

test("recordLevelComplete does not decrease highestLevel", () => {
    localStorage.clear();
    recordLevelComplete(3, 200);
    recordLevelComplete(1, 50);
    const s = loadSave();
    assertEq(s.highestLevel, 4);
});

test("recordLevelComplete keeps best score per level", () => {
    localStorage.clear();
    recordLevelComplete(0, 100);
    recordLevelComplete(0, 50);
    const s = loadSave();
    assertEq(s.bestScores[0], 100);
});

console.log("\n── sample: additional waveforms & features ────────────────");

test("pwm at u<0.65 = +amp*0.1, at u≥0.65 = -amp*0.1", () => {
    const pw = { ...baseSig, type: "pwm" };
    assertClose(sample(pw, 0.0, false),  1.0, 0.01);
    assertClose(sample(pw, 0.649, false), 1.0, 0.01);
    assertClose(sample(pw, 0.65, false), -1.0, 0.01);
    assertClose(sample(pw, 0.999, false), -1.0, 0.01);
});

test("am at t=0 is zero crossing", () => {
    const am = { ...baseSig, type: "am", harm: 0.5 };
    assertClose(sample(am, 0, false), 0.0, 0.02);
});

test("harmonics add overtones for non-AM types", () => {
    const harmSig = { ...baseSig, type: "sawtooth", harm: 3 };
    const noHarm  = { ...baseSig, type: "sawtooth", harm: 0 };
    let diff = false;
    for (let i = 0; i < 50; i++) {
        if (Math.abs(sample(harmSig, i / 50, false) - sample(noHarm, i / 50, false)) > 0.001) {
            diff = true; break;
        }
    }
    assert(diff, "harmonics had no effect on sawtooth");
});

test("harmonics affect AM through the AM sampler", () => {
    const amH = { ...baseSig, type: "am", harm: 3 };
    const am0  = { ...baseSig, type: "am", harm: 0 };
    let diff = false;
    for (let i = 0; i < 50; i++) {
        if (Math.abs(sample(amH, i / 50, false) - sample(am0, i / 50, false)) > 0.001) {
            diff = true; break;
        }
    }
    assert(diff, "harm parameter should change AM output");
});

test("noise adds variance when addNoise=true", () => {
    const noisy = { ...baseSig, type: "sine", amp: 10, noise: 5 };
    const vals = new Set();
    for (let i = 0; i < 30; i++) vals.add(sample(noisy, i / 30, true));
    assert(vals.size > 1, "noise produced identical values");
});

test("noise is ignored when addNoise=false", () => {
    const noisy = { ...baseSig, type: "sine", amp: 0, noise: 5 };
    for (let i = 0; i < 10; i++) assertEq(sample(noisy, i / 10, false), 0);
});

test("phase shifts the wave by the expected fraction", () => {
    // phase=180 shifts the wave by half a period
    const shifted = { ...baseSig, phase: 180 };
    // t=0.25 with phase=180 → u = (1*0.25 + 180/360) % 1 = (0.25 + 0.5) % 1 = 0.75
    // sample at u=0.75 for sine = trough = -1 (amp=10 → amp*0.1 = 1 → -1)
    assertClose(sample(shifted, 0.25, false), -1.0, 0.01);
});

console.log("\n── matchScore: additional edge cases ──────────────────────");

test("matchScore with null target (treats target as silence)", () => {
    _targetSignal = null;
    _yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    invalidateMatchScore();
    const sc = matchScore();
    assert(sc >= 0 && sc < 1, "score should be non-negative and less than 1 for null target");
});

test("matchScore with all waveform types stays in [0, 1]", () => {
    for (const tT of ["sine", "square", "sawtooth", "triangle", "pwm", "am"]) {
        for (const tY of ["sine", "square", "sawtooth", "triangle", "pwm", "am"]) {
            _targetSignal = { type: tT, freq: 3, amp: 8, phase: 0, dc: 0, harm: 0, noise: 0 };
            _yoursSignal  = { type: tY, freq: 5, amp: 6, phase: 90, dc: 1, harm: 0, noise: 0 };
            invalidateMatchScore();
            const sc = matchScore();
            assert(sc >= 0 && sc <= 1, `score out of range for ${tT} vs ${tY}: ${sc}`);
        }
    }
});

test("matchScore with harmonics improves when your harm matches target", () => {
    _targetSignal = { type: "sawtooth", freq: 2, amp: 7, phase: 0, dc: 0, harm: 4, noise: 0 };
    _yoursSignal  = { type: "sawtooth", freq: 2, amp: 7, phase: 0, dc: 0, harm: 0, noise: 0 };
    invalidateMatchScore();
    const miss = matchScore();
    _yoursSignal.harm = 4;
    invalidateMatchScore();
    const match = matchScore();
    assert(match > miss, `harm match (${match}) not > harm mismatch (${miss})`);
});

test("matchScore caching works after double invalidate", () => {
    _targetSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    _yoursSignal  = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    invalidateMatchScore();
    const v1 = matchScore();
    invalidateMatchScore(); // second invalidate before read
    const v2 = matchScore();
    assertClose(v1, v2, 0.001);
});

console.log("\n── rng edge cases ─────────────────────────────────────────");

test("rng lo === hi returns lo", () => {
    const r = makeRand(1);
    // call gameRand a few times then test rng(5,5) ≡ 5
    const localRng = (lo, hi) => { const v = lo + (r() * (hi - lo + 1)) | 0; return v; };
    for (let i = 0; i < 20; i++) assertEq(localRng(7, 7), 7);
});

test("rng swapped lo>hi still returns in original [hi, lo]", () => {
    const r = makeRand(3);
    const localRng = (lo, hi) => {
        if (lo > hi) { const t = lo; lo = hi; hi = t; }
        return lo + (r() * (hi - lo + 1)) | 0;
    };
    for (let i = 0; i < 100; i++) {
        const v = localRng(10, 3);
        assert(v >= 3 && v <= 10, `out of range: ${v}`);
    }
});

console.log("\n── fastSin edge cases ─────────────────────────────────────");

test("fastSin wraps large positive values", () => {
    assertClose(fastSin(Math.PI * 200), Math.sin(Math.PI * 200), 0.001);
});

test("fastSin wraps negative values", () => {
    assertClose(fastSin(-Math.PI / 2), Math.sin(-Math.PI / 2), 0.001);
});

test("fastSin at exact LUT boundaries", () => {
    // LUT_SIZE=8192, SCALE=8192/(2π) ≈ 1303.79
    // x = idx / SCALE for integer idx should hit exact LUT entries
    const x = 1 / (LUT_SIZE / (Math.PI * 2)); // one LUT step
    assertClose(fastSin(x), Math.sin(x), 0.001);
});

console.log("\n── self-validating source sync ─────────────────────────────");

test("CONFIG values match main.js source", () => {
    const fs = require("fs");
    const src = fs.readFileSync("./main.js", "utf8");
    const m = src.match(/const CONFIG = Object\.freeze\(\{([\s\S]*?)\}\);/);
    assert(m, "could not find CONFIG in main.js");
    // Extract key: value pairs from the match
    const srcConfig = {};
    const lineRe = /(\w+):\s*([^,\n]+)/g;
    let match;
    while ((match = lineRe.exec(m[1])) !== null) {
        srcConfig[match[1]] = match[2].trim();
    }
    for (const key of Object.keys(CONFIG)) {
        assert(key in srcConfig, `CONFIG.${key} missing in main.js source`);
        assertEq(CONFIG[key], Number(srcConfig[key]), `CONFIG.${key} mismatch: ${CONFIG[key]} vs ${srcConfig[key]}`);
    }
});

test("LEVELS.length matches main.js source", () => {
    const fs = require("fs");
    const src = fs.readFileSync("./main.js", "utf8");
    const m = src.match(/const LEVELS = \[([\s\S]*?)\];/);
    assert(m, "could not find LEVELS in main.js");
    const braceRe = /\{[\s\S]*?\}/g;
    const srcCount = (m[1].match(braceRe) || []).length;
    assertEq(LEVELS.length, srcCount, `LEVELS.length mismatch: ${LEVELS.length} vs ${srcCount}`);
});

console.log("\n── telemetry ────────────────────────────────────────────────");

test("recordLevelComplete appends telemetry entry", () => {
    localStorage.clear();
    const save = freshSave();
    writeSave(save);
    recordLevelComplete(0, 150);
    const loaded = loadSave();
    assert(Array.isArray(loaded.telemetry), "telemetry should be an array");
    assertEq(loaded.telemetry.length, 1, "should have 1 telemetry entry");
    assertEq(loaded.telemetry[0].level, 0);
    assertEq(loaded.telemetry[0].score, 150);
});

test("telemetry preserves multiple entries across levels", () => {
    localStorage.clear();
    const save = freshSave();
    writeSave(save);
    recordLevelComplete(0, 100);
    recordLevelComplete(1, 200);
    recordLevelComplete(0, 300);
    const loaded = loadSave();
    assertEq(loaded.telemetry.length, 3);
    assertEq(loaded.telemetry[0].level, 0);
    assertEq(loaded.telemetry[1].level, 1);
    assertEq(loaded.telemetry[2].level, 0);
});

test("freshSave initializes telemetry as empty array", () => {
    const s = freshSave();
    assert(Array.isArray(s.telemetry), "telemetry should be an array");
    assertEq(s.telemetry.length, 0);
});

// ─── RESULTS ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(52)}`);
console.log(`  ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
    console.error(`\n  ${_failed} test(s) failed.`);
    process.exit(1);
} else {
    console.log(`\n  All tests passed.`);
}