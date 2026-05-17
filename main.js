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
 * @property {number} freq
 * @property {number} amp
 * @property {number} phase
 * @property {number} dc
 * @property {number} harm
 * @property {number} noise
 * @property {string} [archetype]
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
 * @property {string}     [graceColor] CSS color for grace round accent theme
 *
 * @typedef {Object} SaveData
 * @property {number}   highestLevel    0-indexed
 * @property {number[]} bestScores      per level
 * @property {number[]} seenCeremonies  level indices where ceremony was shown
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
    { rounds: 5, time: 30, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: false, harm: false, noise: false, grace: true, graceColor: "var(--blue)" },
    // LV4 — grace: DC offset is new
    { rounds: 5, time: 28, types: ["sine", "square", "sawtooth", "triangle"], phase: true, dc: true, harm: false, noise: false, grace: true, graceColor: "var(--amber)" },
    // LV5 — grace: PWM and AM are new
    { rounds: 5, time: 26, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: false, noise: false, grace: true, graceColor: "var(--coral)" },
    // LV6 — grace + freeplay: harmonics need exploration time most of all
    { rounds: 5, time: 36, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: false, grace: true, freeplay: true, graceColor: "var(--green)" },
    // LV7 — noise as atmosphere (tolerance band), not a slider to match
    { rounds: 5, time: 32, types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"], phase: true, dc: true, harm: true, noise: true, grace: true, graceColor: "var(--text-dim)" },
];

// ─── CEREMONIES ──────────────────────────────────────────────────────────────
// Each level that introduces a new mechanic gets a ceremony (shown once).
// Map key = level index (0-based).
const CEREMONIES = {
    2: {
        tag: "PHASE", color: "var(--blue)",
        title: "PHASE UNLOCKED",
        desc: "Phase shifts the wave in time — a horizontal offset. At 180° the shape flips entirely. Align to match.",
    },
    3: {
        tag: "DC", color: "var(--amber)",
        title: "DC OFFSET UNLOCKED",
        desc: "DC offset raises or lowers the wave center — like shifting the baseline. Watch the zero line drift.",
    },
    4: {
        tag: "PWM/AM", color: "var(--coral)",
        title: "PWM & AM UNLOCKED",
        desc: "PWM varies pulse width for a fizzy edge. AM rides a carrier wave — amplitude becomes the signal itself.",
    },
    5: {
        tag: "HARM", color: "var(--green)",
        title: "HARMONICS UNLOCKED",
        desc: "Harmonics layer overtones above the fundamental. Each adds texture and body to the wave.",
    },
};

// ─── SIGNAL ARCHETYPES ──────────────────────────────────────────────────────
// Authored named signal presets that appear as targets, adding personality.
// levelMin = minimum 0-indexed level where this archetype can appear.
const ARCHETYPES = [
    { name: "Heartbeat",   type: "square",   freq: 2, amp: 8,  phase: 0,   dc: 0, harm: 0, levelMin: 0 },
    { name: "Sonar",       type: "sine",     freq: 5, amp: 9,  phase: 0,   dc: 0, harm: 0, levelMin: 0 },
    { name: "Bell",        type: "sine",     freq: 7, amp: 5,  phase: 0,   dc: 0, harm: 0, levelMin: 0 },
    { name: "Thump",       type: "square",   freq: 1, amp: 10, phase: 0,   dc: 0, harm: 0, levelMin: 0 },
    { name: "Reactor",     type: "sawtooth", freq: 1, amp: 10, phase: 0,   dc: 0, harm: 0, levelMin: 1 },
    { name: "Phase Shift", type: "triangle", freq: 3, amp: 7,  phase: 180, dc: 0, harm: 0, levelMin: 2 },
    { name: "Subsonic",    type: "sine",     freq: 1, amp: 9,  phase: 0,   dc: -3, harm: 0, levelMin: 3 },
    { name: "Wobble",      type: "am",       freq: 3, amp: 5,  phase: 0,   dc: 0, harm: 0, levelMin: 4 },
    { name: "Glitch",      type: "pwm",      freq: 4, amp: 6,  phase: 180, dc: 0, harm: 0, levelMin: 4 },
    { name: "Drone",       type: "sawtooth", freq: 2, amp: 4,  phase: 0,   dc: 0, harm: 4, levelMin: 5 },
];

// On debut levels, only archetypes that exercise the new param appear —
// prevents dilution of _pickWeightedParam's non-zero boost.
const _DEBUT_ARCHETYPES = {
    2: ["Phase Shift"],
    3: ["Subsonic"],
    4: ["Wobble", "Glitch"],
    5: ["Drone"],
};

// ─── GAME STATE ───────────────────────────────────────────────────────────────

/** @type {Signal} */ let targetSignal = {};
/** @type {Signal} */ let yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };

// Resource handles (kept as bare lets — no lifecycle dependency)
let timerInterval = null;
let animRaf = null;

/** Per-round state. reset() clears everything except roundNo (managed by nextRound()). */
const Round = {
    roundNo: 0,
    timeLeft: 0,
    won: false,
    _lockAnimStart: 0,
    _lockScrollPos: -1,
    _lastPct: 0,
    _recomputeScheduled: false,
    _setTypeScheduled: false,
    _lastUrgentSfx: 0,
    _wasCloseSfx: false,

    reset() {
        this.timeLeft = 0;
        this.won = false;
        this._lockAnimStart = 0;
        this._lockScrollPos = -1;
        this._lastPct = 0;
        this._recomputeScheduled = false;
        this._setTypeScheduled = false;
        this._lastUrgentSfx = 0;
        this._wasCloseSfx = false;
    },
};

/** Session-level state that persists across rounds/levels in one play session. */
const Session = {
    score: 0,
    levelStartScore: 0,
    level: 0,
    freePlayActive: false,
    tutorialStep: 0,
    tutorialActive: false,

    muted: false,
    sfxMuted: false,
    volume: 0.4,
    postGameFreeplay: false,
};

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

/**
 * @param {"start"|"dead"|"levelup"|"levelselect"|"game"|"minigame"} screen
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
    function collect(prefix, names) {
        return Object.fromEntries(names.map(n => [n, document.getElementById(`${prefix}${n}`)]));
    }

    UI.labels   = collect("lbl-",  ["freq", "amp", "phase", "dc", "harm", "noise", "level"]);
    UI.sliders  = collect("sl-",   ["freq", "amp", "phase", "dc", "harm", "noise"]);
    UI.controls = collect("ctrl-", ["phase", "dc", "harm", "noise"]);
    UI.playback = collect("pb-",   ["target", "yours", "ab"]);

    UI.buttons = {
        continue:        document.getElementById("btn-continue"),
        newGame:         document.getElementById("btn-new-game"),
        selectLevel:     document.getElementById("btn-select-level"),
        tutorial:        document.getElementById("btn-tutorial"),
        retry:           document.getElementById("btn-retry"),
        deadLevelSelect: document.getElementById("btn-dead-level-select"),
        startOver:       document.getElementById("btn-start-over"),
        continueLevel:   document.getElementById("btn-continue-level"),
        levelBack:       document.getElementById("btn-level-back"),
        dismissCeremony: document.getElementById("btn-dismiss-ceremony"),
        hint:            document.getElementById("btn-hint"),
        skip:            document.getElementById("btn-skip"),
        menu:            document.getElementById("menu-btn"),
        skipTut:         document.getElementById("skip-tut"),
        freeplayReady:   document.getElementById("btn-freeplay-ready"),
        mute:            document.getElementById("mute-btn"),
        sfx:             document.getElementById("sfx-btn"),
        pwm:             document.getElementById("btn-pwm"),
        am:              document.getElementById("btn-am"),
    };
    
    UI.displays = {
        score:      document.getElementById("score"),
        pct:        document.getElementById("pct"),
        feedback:   document.getElementById("feedback"),
        timer:      document.getElementById("timer"),
        roundNo:    document.getElementById("round-no"),
        roundTotal: document.getElementById("round-total"),
        fill:       document.getElementById("fill"),
        flash:      document.getElementById("flash"),
        deadMsg:    document.getElementById("dead-msg"),
        luTitle:    document.getElementById("lu-title"),
        luMsg:      document.getElementById("lu-msg"),
        unlockMsg:  document.getElementById("unlock-msg"),
        screenDead: document.getElementById("screen-dead"),
    };

    UI.canvas          = document.getElementById("c-overlay");
    UI.audio           = document.getElementById("bgm-audio");
    UI.stampLayer      = document.getElementById("stamp-layer");
    UI.gameInner       = document.getElementById("game-inner");
    UI.timerRingFill   = document.getElementById("timer-ring-fill");
    UI.meterRow        = document.getElementById("meter-row");
    UI.archetypeName   = document.getElementById("archetype-name");
    UI.game            = document.getElementById("game");
    UI.levelSelectGrid = document.getElementById("level-select-grid");
    UI.typeButtons     = document.getElementById("type-btns");
    UI.sliderContainer = document.querySelector(".param-list");
}

// ─── DISPATCH ──────────────────────────────────────────────────

function dispatch(action) {
    switch (action.type) {
        case "SCORE_ADD":
            Session.score += action.payload;
            UI.displays.score.textContent = Session.score;
            break;
        case "SCORE_SET":
            Session.score = action.payload;
            UI.displays.score.textContent = Session.score;
            break;
        case "SCORE_DEDUCT":
            Session.score = Math.max(0, Session.score - action.payload);
            UI.displays.score.textContent = Session.score;
            break;
        case "SCORE_RESET":
            Session.score = 0;
            Session.levelStartScore = 0;
            UI.displays.score.textContent = Session.score;
            break;
        case "LEVEL_SET":
            Session.level = action.payload;
            break;
        case "ROUND_NEXT":
            Round.roundNo++;
            UI.displays.roundNo.textContent = Round.roundNo;
            break;
        case "ROUND_SET":
            Round.roundNo = action.payload;
            UI.displays.roundNo.textContent = Round.roundNo;
            break;
    }
}

// ─── BUTTON ACTION TABLE ────────────────────────────────────────

const BUTTON_ACTIONS = {
    "btn-continue": continueSave,
    "btn-new-game": restartGame,
    "btn-select-level": showLevelSelect,
    "btn-tutorial": startTutorial,
    "btn-retry": () => { SFX.nav(); startGame(); },
    "btn-dead-level-select": showLevelSelect,
    "btn-start-over": restartGame,
    "btn-continue-level": continueLevel,
    "btn-level-back": () => { SFX.back(); renderStartScreen(); showScreen("start"); },
    "btn-dismiss-ceremony": dismissCeremony,
    "btn-hint": useHint,
    "btn-skip": skipRound,
    "menu-btn": goToMenu,
    "skip-tut": skipTutorial,
    "btn-freeplay-ready": endFreePlay,
    "mute-btn": toggleMute,
    "sfx-btn": toggleSfxMute,
};

// ─── EVENT BINDING ────────────────────────────────────────────────────────────

function initEvents() {
    Object.entries(BUTTON_ACTIONS).forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("click", fn);
        UI.buttons[id] = el;
    });

    document.getElementById("ceremony-overlay")?.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) { SFX.back(); dismissCeremony(); }
    });

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
            const wrap = document.querySelector(".scope-wrap");
            if (wrap) wrap.classList.add("held");
            overlay.classList.add("held");
        });
        const closeGate = () => {
            if (!_pointerGate) return;
            const ac = actx();
            _pointerGate.gain.cancelScheduledValues(ac.currentTime);
            _pointerGate.gain.setValueAtTime(_pointerGate.gain.value, ac.currentTime);
            _pointerGate.gain.linearRampToValueAtTime(0, ac.currentTime + PB.GATE_RELEASE);
            const wrap = document.querySelector(".scope-wrap");
            if (wrap) wrap.classList.remove("held");
            overlay.classList.remove("held");
        };
        overlay.addEventListener("pointerup", closeGate);
        overlay.addEventListener("pointerleave", closeGate);
    }

    document.addEventListener("click", () => { if (!Session.muted) startMusic(); }, { once: true });
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

function freshSave() { return { highestLevel: 0, bestScores: new Array(LEVELS.length).fill(0), seenCeremonies: [] }; }

/** @returns {SaveData} */
function loadSave() {
    try {
        const raw = lsGet(SAVE_KEY);
        if (!raw) return freshSave();
        const d = JSON.parse(raw);
        if (typeof d.highestLevel !== "number" || !Array.isArray(d.bestScores)) return freshSave();
        while (d.bestScores.length < LEVELS.length) d.bestScores.push(0);
        if (!Array.isArray(d.seenCeremonies)) d.seenCeremonies = [];
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
    // ✗ transitionBGM(BGM_STATE.MENU); — music must NOT play on page load;
    //   player must interact first (click/tab+enter) per browser autoplay policy.
    //   Re-enable once a user-gesture gate is in place.
    const save = loadSave();

    const continueBtn = UI.buttons.continue;
    if (continueBtn) {
        const hasProgress = save.highestLevel > 0 || save.bestScores[0] > 0;
        continueBtn.classList.toggle("hidden", !hasProgress);
        if (hasProgress) {
            const nextLv = save.highestLevel + 1;
            continueBtn.textContent = nextLv > LEVELS.length
                ? "CONTINUE (FREEPLAY)"
                : `CONTINUE (LV ${nextLv})`;
        }
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
    SFX.confirm();
    const save = loadSave();
    dispatch({ type: "LEVEL_SET", payload: save.highestLevel });
    dispatch({ type: "SCORE_RESET" });
    dispatch({ type: "ROUND_SET", payload: 0 });
    startGame();
}

// ─── LEVEL SELECT ─────────────────────────────────────────────────────────────

function showLevelSelect() {
    transitionBGM(BGM_STATE.MENU);
    SFX.nav();
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
    dispatch({ type: "LEVEL_SET", payload: selectedLevel });
    dispatch({ type: "SCORE_RESET" });
    dispatch({ type: "ROUND_SET", payload: 0 });
    startGame();
}

// ─── PRNG (Xorshift32) ───────────────────────────────────────────────────────

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
const stampPick = pick(stampRand);

// ─── BGM ─────────────────────────────────────────────────────────────────────

const BGM_STATE = {
    MENU:     "menu",
    GAMEPLAY: "gameplay",
    RESULT:   "result",
};

const BGM_POOL = {
    menu: [
        "pietix-art-pop-exp-2-510302.mp3",
        "slimeyfox-after-hours-arcade-487277.mp3",
        "musinova-idm-electronic-science-technology-drumless-ambient-loop-483365.mp3",
    ],
    gameplay: [
        "penguinmusic-penguinmusic-modern-chillout-future-calm-12641.mp3",
        "databend-neon-nebula-ambient-electronic-background-loopable-edit-439364.mp3",
        "penguinmusic-lazy-day-stylish-futuristic-chill-239287.mp3",
    ],
    result: null,
};

const _poolLastIndex = { menu: -1, gameplay: -1, result: -1 };
let _bgmState = null;

function _pickFromPool(pool, stateKey) {
    let next;
    do { next = Math.floor(stampRand() * pool.length); }
    while (pool.length > 1 && next === _poolLastIndex[stateKey]);
    _poolLastIndex[stateKey] = next;
    return pool[next];
}

function _playFromPool(pool, stateKey) {
    const audio = UI.audio;
    const next = _pickFromPool(pool, stateKey);
    audio.src = "resources/music/" + next;
    if (!Session.muted) audio.play();
}

function transitionBGM(state) {
    if (state === _bgmState) return;
    _bgmState = state;
    const pool = BGM_POOL[state] ?? BGM_POOL.menu;
    _playFromPool(pool, state);
}

Session.muted = lsGet("bgmMuted") === "true";
Session.sfxMuted = lsGet("sfxMuted") === "true";
Session.volume = parseFloat(lsGet("bgmVolume") ?? "0.4");

function initAudio() {
    createMixGraph();
    const audio = UI.audio, btn = UI.buttons.mute;
    audio.muted = Session.muted; audio.volume = Session.volume;
    btn.textContent = "BGM";
    btn.style.color = Session.muted ? "var(--text-dim)" : "var(--blue)";
    const sfxBtn = UI.buttons.sfx;
    if (sfxBtn) { sfxBtn.textContent = "SFX"; sfxBtn.style.color = Session.sfxMuted ? "var(--text-dim)" : "var(--blue)"; }
    audio.addEventListener("ended", () => {
        if (!Session.muted) {
            const pool = BGM_POOL[_bgmState] ?? BGM_POOL.menu;
            _playFromPool(pool, _bgmState);
        }
    });
}

function startMusic() {
    const audio = UI.audio;
    if (Session.muted || !audio.paused) return;
    if (!audio.src || audio.ended) {
        const pool = BGM_POOL[_bgmState] ?? BGM_POOL.menu;
        audio.src = "resources/music/" + _pickFromPool(pool, _bgmState);
    }
    audio.play();
}

function setVolume(v) {
    Session.volume = Math.max(0, Math.min(1, v));
    UI.audio.volume = Session.volume;
    lsSet("bgmVolume", String(Session.volume));
}

function toggleMute() {
    Session.muted = !Session.muted;
    const audio = UI.audio, btn = UI.buttons.mute;
    SFX.toggle(!Session.muted);
    audio.muted = Session.muted;
    lsSet("bgmMuted", String(Session.muted));
    btn.textContent = "BGM";
    btn.style.color = Session.muted ? "var(--text-dim)" : "var(--blue)";
    if (Session.muted) {
        if (!audio.paused) audio.pause();
    } else {
        if (currentScreen() === "game") startMusic();
    }
}

function toggleSfxMute() {
    Session.sfxMuted = !Session.sfxMuted;
    const btn = UI.buttons.sfx;
    SFX.toggle(!Session.sfxMuted);
    btn.textContent = "SFX";
    btn.style.color = Session.sfxMuted ? "var(--text-dim)" : "var(--blue)";
    lsSet("sfxMuted", String(Session.sfxMuted));
}

// ─── SFX ─────────────────────────────────────────────────────────────────────

const AudioCtx = (() => {
    try {
        return (window.AudioContext || window.webkitAudioContext);
    } catch (err) {
        console.warn(`Audio context unavailable (private browsing?):`, err);
        return null;
    }
})()

let _actx = null;

function actx() {
    if (!_actx) _actx = new AudioCtx();
    if (_actx.state === "suspended") _actx.resume();
    return _actx;
}

let _lastSliderSfx = 0;

// ── SFX helpers ───────────────────────────────────────────────────────────────

function _warmNote(ac, freq, startTime, gain, duration, detune = 4) {
    const t = startTime;
    const attack = 0.008;

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
        env.connect(MIX.sfx);
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
            _warmNote(ac, f, ac.currentTime + t, 0.13, 0.22 + Math.floor(stampRand() * 4)));
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
        o.connect(g); g.connect(MIX.sfx);
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
        o.connect(g); g.connect(MIX.sfx);
        o.start(ac.currentTime + 0.18); o.stop(ac.currentTime + 0.40);
    },
];

function _sfxNote(opts) {
    if (Session.sfxMuted) return;
    const ac = actx(), o = ac.createOscillator(), g = ac.createGain();
    o.type = opts.type || "sine";
    o.frequency.value = opts.freq;
    if (opts.freqEnd !== undefined) {
        o.frequency.linearRampToValueAtTime(opts.freqEnd, ac.currentTime + (opts.freqRampTime ?? opts.dur));
    }
    if (opts.gainStart !== undefined) {
        g.gain.setValueAtTime(opts.gainStart, ac.currentTime);
        g.gain.linearRampToValueAtTime(opts.gain, ac.currentTime + (opts.attack || 0.008));
    } else {
        g.gain.setValueAtTime(opts.gain, ac.currentTime);
    }
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + opts.dur);
    o.connect(g); g.connect(MIX.sfx); o.start(); o.stop(ac.currentTime + opts.dur);
}

const SFX = {
    tick: (pitch = 880) => _sfxNote({ freq: pitch, gain: 0.12, dur: 0.06 }),

    slider: () => _sfxNote({ freq: 440 + yoursSignal.freq * 40, gain: 0.06, dur: 0.05 }),

    lock: () => {
        if (Session.sfxMuted) return;
        stampPick(_LOCK_VARIANTS)(actx());
    },

    fail: () => {
        if (Session.sfxMuted) return;
        const ac = actx();
        [[220, 0], [175, 0.11], [130, 0.24]].forEach(([f, t]) =>
            _warmNote(ac, f, ac.currentTime + t, 0.11, 0.22, 3));
    },

    skip: () => _sfxNote({ type: "triangle", freq: 330, freqEnd: 200, freqRampTime: 0.12, gainStart: 0, gain: 0.12, dur: 0.20 }),

    skipBroke: () => _sfxNote({ type: "sawtooth", freq: 180, gain: 0.08, dur: 0.14 }),

    hint: () => _sfxNote({ freq: 660, freqEnd: 880, freqRampTime: 0.12, gainStart: 0, gain: 0.10, dur: 0.22 }),

    hintBroke: () => {
        if (Session.sfxMuted) return;
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
        if (Session.sfxMuted) return;
        const ac = actx();
        [[330, 0], [392, 0.1], [494, 0.2], [659, 0.32], [880, 0.44]].forEach(([f, t]) =>
            _warmNote(ac, f, ac.currentTime + t, 0.12, 0.28));
    },

    nav: () => _sfxNote({ freq: 660, gain: 0.08, dur: 0.04 }),

    back: () => _sfxNote({ freq: 600, freqEnd: 480, freqRampTime: 0.06, gain: 0.07, dur: 0.10 }),

    confirm: () => _sfxNote({ freq: 520, freqEnd: 740, freqRampTime: 0.07, gain: 0.09, dur: 0.10 }),

    reset: () => {
        _sfxNote({ freq: 880, gain: 0.10, dur: 0.05 });
        setTimeout(() => _sfxNote({ freq: 1100, gain: 0.08, dur: 0.05 }), 60);
    },

    toggle: (on) => _sfxNote({ type: "triangle", freq: on ? 660 : 400, gain: 0.06, dur: 0.04 }),

    urgent: () => _sfxNote({ type: "square", freq: 330, gain: 0.07, dur: 0.09 }),

    close: () => _sfxNote({ freq: 330, freqEnd: 440, freqRampTime: 0.15, gainStart: 0, gain: 0.05, dur: 0.24 }),
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
    const word = stampPick(words);

    const el = document.createElement("div");
    el.className = `stamp stamp-${type}`;
    el.textContent = word;

    // Random position within safe inner zone (avoid edges)
    const px = 15 + stampRand() * 55; // 15–70% from left
    const py = 15 + stampRand() * 55; // 15–70% from top
    el.style.left = `${px}%`;
    el.style.top = `${py}%`;

    // Slight random rotation: −8° to +8°
    const deg = (stampRand() * 16 - 8).toFixed(1);
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

// RMS loudness normalisation per waveform type (reference: sine = 1.0)
const WAVEFORM_GAIN = Object.freeze({
    sine: 1.000,
    square: 0.707,
    sawtooth: 1.225,
    triangle: 1.225,
    pwm: 0.877,
    am: 1.334,
});

// ─────────────────────────────────────────────────────────
// MIX GRAPH
// ─────────────────────────────────────────────────────────

const MIX = {
    target: null,
    yours: null,
    sfx: null,
    bgm: null,
    mix: null,
    glue: null,
    saturator: null,
    limiter: null,
    master: null,
};

let _clarityFilter = null;

function createSaturator(ac) {
    const shaper = ac.createWaveShaper();
    const n = 44100;
    const curve = new Float32Array(n);
    const k = 2.5;
    for (let i = 0; i < n; i++) {
        const x = i * 2 / n - 1;
        curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    shaper.curve = curve;
    shaper.oversample = "4x";
    return shaper;
}

function createMixGraph() {
    if (MIX.master) return;
    const ac = actx();

    MIX.target = ac.createGain();
    MIX.yours = ac.createGain();
    MIX.sfx = ac.createGain();
    MIX.bgm = ac.createGain();
    MIX.mix = ac.createGain();
    MIX.master = ac.createGain();

    MIX.glue = ac.createDynamicsCompressor();
    MIX.glue.threshold.value = -18;
    MIX.glue.knee.value = 12;
    MIX.glue.ratio.value = 2;
    MIX.glue.attack.value = 0.02;
    MIX.glue.release.value = 0.15;

    MIX.saturator = createSaturator(ac);
    MIX.limiter = getLimiter();

    _clarityFilter = ac.createBiquadFilter();
    _clarityFilter.type = "highshelf";
    _clarityFilter.frequency.value = 2000;
    _clarityFilter.gain.value = 0;

    MIX.sfx.connect(MIX.mix);
    MIX.bgm.connect(MIX.mix);

    MIX.mix.connect(_clarityFilter);
    _clarityFilter.connect(MIX.glue);
    MIX.glue.connect(MIX.saturator);
    MIX.saturator.connect(MIX.limiter);
    MIX.limiter.connect(MIX.master);
    MIX.master.connect(ac.destination);
    MIX.master.gain.value = 1;
}

// Brickwall limiter catches transients from type switches, AM peaks, and gain overshoot
let _limiter = null;
let _pointerGate = null;
let _tensionFilter = null;

function initBeatingBus() {
    if (_tensionFilter) return;
    const ac = actx();
    _tensionFilter = ac.createBiquadFilter();
    _tensionFilter.type = "lowpass";
    _tensionFilter.frequency.value = 3000;
    _tensionFilter.Q.value = 0.7;
    _pointerGate = ac.createGain();
    _pointerGate.gain.value = 0;
    MIX.target.connect(_tensionFilter);
    MIX.yours.connect(_tensionFilter);
    _tensionFilter.connect(_pointerGate);
    _pointerGate.connect(MIX.mix);
}

function resetTensionFilter() {
    if (!_tensionFilter) return;
    _tensionFilter.frequency.setValueAtTime(3000, actx().currentTime);
}

function duckTarget() {
    if (_pbMode !== "ab") return;
    const t = actx().currentTime;
    const g = MIX.target.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.82, t + 0.02);
    g.linearRampToValueAtTime(1, t + 0.15);
}

let _lastClarity = -1;

function updateMixState() {
    const sc = smoothstep(matchScore());
    if (Math.abs(sc - _lastClarity) < 0.05) return;
    _lastClarity = sc;
    const now = actx().currentTime;
    _clarityFilter.gain.setTargetAtTime(sc * 6, now, 0.2);
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
    c.connect(MIX.master);
    _limiter = c;
    return _limiter;
}

// Musical octave tuning: 1→8 spans one octave (A2→A3)
// Equal logarithmic spacing — each step multiplies by ~1.104
const AUDIO_MIN_HZ = 110, AUDIO_MAX_HZ = 220;
const FREQ_MIN = 1, FREQ_MAX = 8;
const INV_FREQ_RANGE = 1 / (FREQ_MAX - FREQ_MIN);
const AUDIO_EXP_FACTOR = Math.log(AUDIO_MAX_HZ / AUDIO_MIN_HZ);

const freqToHz = (freq) => AUDIO_MIN_HZ * Math.exp(
    ((freq - FREQ_MIN) * INV_FREQ_RANGE) * AUDIO_EXP_FACTOR
);

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

function _fadeOutChannel(ch) {
    if (!ch.masterGain) return;
    const ac = actx();
    const now = ac.currentTime;
    ch.masterGain.gain.setValueAtTime(ch.masterGain.gain.value, now);
    ch.masterGain.gain.linearRampToValueAtTime(0, now + PB.FADE);
    const snap = { ...ch };
    setTimeout(() => {
        [snap.osc, snap.modOsc, snap.vibratoLfo].forEach(n => { try { n?.stop(); } catch {} });
        [snap.carGain, snap.modGain, snap.ampGain, snap.filter, snap.masterGain, snap.vibratoGain, snap.vibratoLfo]
            .forEach(n => { try { n?.disconnect(); } catch {} });
    }, (PB.FADE + 0.05) * 1000);
}

/**
 * Builds a fresh audio graph for the channel and starts it silently.
 * Fades out and tears down any existing graph first.
 * @param {Channel} ch
 * @param {Signal}  sig
 */
function _buildChannel(ch, sig) {
    _fadeOutChannel(ch);

    const ac = actx();
    const now = ac.currentTime;
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

    const normCoeff = WAVEFORM_GAIN[sig.type] ?? 1.0;
    const ampGain = ac.createGain();
    ampGain.gain.value = sig.amp * 0.1 * normCoeff;

    // masterGain: mute/unmute this channel (mode switching).
    // Feeds into the shared limiter, not directly to destination.
    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, now); // start silent — mode sets volume

    const vibratoLfo = ac.createOscillator();
    vibratoLfo.type = "square";
    vibratoLfo.frequency.value = 2;
    const vibratoGain = ac.createGain();
    vibratoGain.gain.value = 0.5;
    vibratoLfo.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.5;

    // ── connect ───────────────────────────────────────────────────────────────
    (isAM ? carGain : osc).connect(ampGain);
    ampGain.connect(filter);
    filter.connect(masterGain);
    initBeatingBus();
    masterGain.connect(sig === targetSignal ? MIX.target : MIX.yours);

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
    _fadeOutChannel(ch);
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
    if (!_playbackActive) { _updatePlaybackUI(); return; }

    const t = mode === "target" || mode === "ab" ? PB.TARGET_VOL : 0;
    const y = mode === "yours" || mode === "ab" ? PB.YOURS_VOL : 0;
    _setVol(_chTarget, t);
    _setVol(_chYours, y);
    _updatePlaybackUI();

    const wrap = document.querySelector(".scope-wrap");
    if (wrap) {
        wrap.classList.remove("glow-target", "glow-yours", "glow-ab");
        if (mode !== "off") wrap.classList.add("glow-" + mode);
    }
}

/** Update yours channel live while sliders move. Called from recompute(). */
function updateYoursPlayback() {
    if (!_playbackActive) return;
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

const SAMPLERS = Object.freeze({
    sine:     (x, u, harm) => fastSin(x),
    square:   (x, u, harm) => fastSin(x) >= 0 ? 1 : -1,
    sawtooth: (x, u, harm) => 2 * u - 1,
    triangle: (x, u, harm) => u < 0.5 ? 4 * u - 1 : 3 - 4 * u,
    pwm:      (x, u, harm) => u < 0.65 ? 1 : -1,
    am:       (x, u, harm) => fastSin(x) * (1 + (harm || 0.5) * fastSin(x * 0.25)) * 0.5,
});

function sample(sig, t, addNoise) {
    const { type, freq, phase, amp, harm, noise, dc } = sig;
    const u = (freq * t + phase / 360) % 1;
    const x = u * 6.283185307179586;
    if (!SAMPLERS[type]) throw new Error(`Unhandled waveform: "${type}"`);
    let v = SAMPLERS[type](x, u, harm);
    if (harm && type !== "am") v += (harm * 0.1) * fastSin(x * 3);
    if (addNoise && noise) v += (noise * 0.1) * (gameRand() * 0.8 - 0.4);
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

// Noise widens the win threshold: noisy targets are easier to lock in.
// The noise slider is hidden — players can't match it, they just need to
// get close enough despite it.

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
const PHI = (1 + Math.sqrt(5)) / 2;

// ─── RENDER CONSTANTS ────────────────────────────────────────────────────────
// DT_MAX: frame-time ceiling — clamps big jumps on tab-switch / stutter.
// SCROLL_*: wave scroll speed, eased per level (higher level → shorter period → faster).
// LOCK_MS: duration of the lock-in animation (rings + flash + settle).
// TIMER_CIRC: SVG stroke-dashoffset circumference (2π × r=20 ≈ 125.6).
// LOGO_SPEED: logo oscilloscope time scaling factor.
const RENDER = {
    DT_MAX:             15.0,
    FRAME_INDEPENDENT:  true,
    SCROLL_BASE_MS:     3500,
    SCROLL_MIN_MS:      2000,
    SCROLL_EASE_EXP:    PHI,
    SCROLL_EASE_FACTOR: 60,
    LOCK_MS:            1950,
    TIMER_CIRC:         125.6,
    LOGO_SPEED:         0.00045,
};

// `elapsedTime` grows smoothly regardless of frame rate.
// Dividing by getScrollPeriod() gives consistent scroll speed across all frame rates.
let _elapsedTime = 0;

function getScrollPeriod() {
    return Math.max(RENDER.SCROLL_MIN_MS, RENDER.SCROLL_BASE_MS - Math.pow(Session.level, RENDER.SCROLL_EASE_EXP) * RENDER.SCROLL_EASE_FACTOR);
}

/** @type {DOMHighResTimeStamp} */ let _lastTime = 0;

function loop(ts) {
    const dt = Math.min(ts - _lastTime, RENDER.DT_MAX);
    _elapsedTime += dt;

    /**
     * Normalized scroll position [0, 1). Wraps every SCROLL_PERIOD ms.
     * Example: _elapsedTime = 4000ms → 4000/2000 = 2.0 → 2.0 % 1 = 0.0 (loops)
     * Used for horizontal wave scrolling position.
     */
    const period = getScrollPeriod();
    const scroll = RENDER.FRAME_INDEPENDENT ?
        (_elapsedTime / period) % 1
        : (ts / period) % 1;

    const W = _canvasW, H = 120;
    if (_canvas.width !== W || _canvas.height !== H) { _canvas.width = W; _canvas.height = H; }
    _ctx.clearRect(0, 0, W, H);

    const sc = matchScore(), t = smoothstep(sc);
    const LOCK_DUR = RENDER.LOCK_MS;
    let lockT = 0;
    if (Round._lockAnimStart > 0) {
        // Freeze scroll at lock moment for micro-replay effect
        if (Round._lockScrollPos < 0) Round._lockScrollPos = scroll;
        lockT = Math.min((ts - Round._lockAnimStart) / LOCK_DUR, 1);
        if (lockT >= 1) { Round._lockAnimStart = 0; Round._lockScrollPos = -1; }
    }

    const repScroll = Round._lockScrollPos >= 0 ? Round._lockScrollPos : scroll;

    if (lockT > 0 && lockT < 1) {
        // Radar ring emanates from scope center during lock
        _ctx.globalAlpha = Math.max(0, 0.25 * (1 - lockT / 0.6));
        for (let r = 0; r < 3; r++) {
            const rad = (lockT * W * 0.5 + r * 20) % (W * 0.5);
            _ctx.beginPath(); _ctx.arc(W * 0.5, H * 0.5, rad, 0, Math.PI * 2);
            _ctx.strokeStyle = "#66ff88"; _ctx.lineWidth = 1.5;
            _ctx.stroke();
        }
        const release = Math.min(Math.max((lockT - 0.1) / 0.6, 0), 1);

        _ctx.globalAlpha = 0.25 * (1 - release);
        drawWave(targetSignal, "#448855", W, H, repScroll, 1.5);

        const flash = Math.max(0, 1 - lockT / 0.35);
        _ctx.globalAlpha = flash * 0.7;
        drawWave(yoursSignal, "#66ff88", W, H, repScroll, 3 + 2 * flash);

        const settle = Math.min(lockT / 0.25, 1);
        _ctx.globalAlpha = 0.4 + 0.6 * settle;
        drawWave(yoursSignal, WAVE_COLORS.yours, W, H, repScroll, 2);
    } else {
        if (Round.roundNo === 1) { _ctx.globalAlpha = 0.1 + 0.65 * sigmoid(sc); drawWave(targetSignal, "#00ff88", W, H, scroll, 4 / 2); }
        else if (Round.roundNo % 2 === 0) { _ctx.globalAlpha = 0.15 + 0.55 * Math.sqrt(sc); drawWave(targetSignal, "#5b8dd9", W, H, scroll, 4 / 2); }
        else { _ctx.globalAlpha = 0.15 + 0.6 * t; drawWave(targetSignal, WAVE_COLORS.target, W, H, scroll, (3 + sc) / 2); }

        _ctx.globalAlpha = 0.4 + 0.6 * t;
        if (Round.roundNo === 1) drawWave(yoursSignal, "#ffb830", W, H, scroll, 4 / 2);
        else if (Round.roundNo % 2 === 0) drawWave(yoursSignal, "#e8604a", W, H, scroll, 4 / 2);
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

function updateMeter() {
    if (Round.won || Session.freePlayActive) return;

    const sc = matchScore();

    const pct = Math.round(sc * 100);
    if (pct !== Round._lastPct) {
        Round._lastPct = pct;

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
        Round._wasCloseSfx = false;
        if (Session.tutorialActive) { checkTutorial(); return; }
        Round.won = true; // Don't freeze sliders during tutorial — step checks may not have passed yet
        Round._lockAnimStart = performance.now();
        clearInterval(timerInterval);
        const gain = CONFIG.BASE_REWARD + Math.ceil(Round.timeLeft * CONFIG.TIME_BONUS_RATE);
        dispatch({ type: "SCORE_ADD", payload: gain }); showScorePop(gain);
        fb.textContent = `LOCKED IN +${gain} pts`; fb.className = "feedback win";
        flash("var(--green)"); SFX.lock(); spawnStamp("success");
        if (navigator.vibrate) navigator.vibrate(100);
        setTimeout(() => nextRound(), 1800);
    } else if (pct >= CONFIG.CLOSE_PERCENTAGE) {
        if (Session.tutorialActive) return;
        fb.textContent = "Getting close…"; fb.className = "feedback close";
        if (!Round._wasCloseSfx) { SFX.close(); Round._wasCloseSfx = true; }
    } else {
        if (Session.tutorialActive) return;
        fb.textContent = "Match the target signal."; fb.className = "feedback";
        Round._wasCloseSfx = false;
    }
    updateMixState();
}

// ─── INPUT HANDLERS (rAF-throttled) ──────────────────────────────────────────

function syncLabels() {
    document.querySelectorAll("[data-param]").forEach(el => {
        const param = el.dataset.param;
        const unit = el.dataset.unit || "";
        const raw = +el.value;
        const label = document.querySelector(`[data-for="${param}"]`);
        if (!label) return;
        if (unit === "Hz") {
            label.textContent = raw + " Hz";
            el.setAttribute("aria-valuetext", raw + " Hz");
        } else if (unit === "°") {
            label.textContent = raw + "°";
            el.setAttribute("aria-valuetext", raw + "°");
        } else {
            label.textContent = (raw / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION);
            el.setAttribute("aria-valuetext", (raw / 10).toFixed(1));
        }
    });
}

function scheduleRender() {
    if (Round._recomputeScheduled) return;
    Round._recomputeScheduled = true;
    requestAnimationFrame(() => {
        updateMeter();
        syncLabels();
        const now = Date.now();
        if (now - _lastSliderSfx > 80) { SFX.slider(); _lastSliderSfx = now; }
        duckTarget();
        updateYoursPlayback();
        if (Session.tutorialActive) checkTutorial();
        Round._recomputeScheduled = false;
    });
}

function recompute() {
    if (Round.won) return;
    applySignal(readSliders());
    scheduleRender();
}

function setType(btn) {
    if (Round.won) return; // NOTE: Freeze waveform type buttons on lock-in
    document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); yoursSignal.type = btn.dataset.t; invalidateMatchScore();
    if (Round._setTypeScheduled) return;
    Round._setTypeScheduled = true;
    requestAnimationFrame(() => {
        updateMeter(); SFX.tick();
        updateYoursPlayback();
        if (navigator.vibrate) navigator.vibrate(50);
        if (Session.tutorialActive) checkTutorial();
        Round._setTypeScheduled = false;
    });
}

// ─── SIGNAL BUILDERS ─────────────────────────────────────────────────────────

function _pickWeightedType(types, level) {
    // Boost PWM/AM in levels where they debut so players actually encounter them
    const weights = types.map(t => {
        if (level <= 4) return 1; // before LV5: uniform
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
        total += values[i] === 0 ? 1
            : level === debutLevel ? boost
            : level === debutLevel + 1 ? Math.max(1, (boost * 0.6) | 0)
            : 1;
    }
    let r = gameRand() * total;
    for (let i = 0; i < values.length; i++) {
        const w = values[i] === 0 ? 1
            : level === debutLevel ? boost
            : level === debutLevel + 1 ? Math.max(1, (boost * 0.6) | 0)
            : 1;
        r -= w;
        if (r <= 0) return values[i];
    }
    return values[values.length - 1];
}

function buildTarget() {
    const lv = LEVELS[Session.level];

    // 40% chance: use a signal archetype (gives each round personality)
    let archetype = null;
    if (gameRand() < 0.4) {
        const isDebut = Session.level in _DEBUT_ARCHETYPES;
        const valid = ARCHETYPES.filter(a =>
            a.levelMin <= Session.level && (!isDebut || _DEBUT_ARCHETYPES[Session.level].includes(a.name))
        );
        if (valid.length) archetype = valid[rng(0, valid.length - 1)];
    }

    if (archetype) {
        const isDebut = Session.level in _DEBUT_ARCHETYPES && _DEBUT_ARCHETYPES[Session.level].includes(archetype.name);
        // Chaos jitter: on non-debut encounters, the archetype drifts ±1 to feel organic
        const j = () => isDebut ? 0 : rng(-1, 1);
        return {
            type: archetype.type,
            freq: Math.max(1, Math.min(8, archetype.freq + j())),
            amp: Math.max(1, Math.min(10, archetype.amp + j())),
            phase: archetype.phase,
            dc: archetype.dc,
            harm: archetype.harm,
            noise: lv.noise ? rng(2, 6) : 0,
            archetype: archetype.name,
        };
    }

    return {
        type: _pickWeightedType(lv.types, Session.level),
        freq: rng(1, 6), amp: rng(3, 10),
        phase: lv.phase ? _pickWeightedParam([0,45,90,135,180,225,270,315], 2, 6, Session.level) : 0,
        dc: lv.dc ? _pickWeightedParam([-3,-2,-1,0,1,2,3], 3, 3, Session.level) : 0,
        harm: lv.harm ? _pickWeightedParam([0,1,2,3,4,5], 5, 3, Session.level) : 0,
        noise: lv.noise ? rng(2, 6) : 0,
    };
}

function readSliders() {
    return {
        freq: +UI.sliders.freq.value, amp: +UI.sliders.amp.value,
        phase: +UI.sliders.phase.value, dc: +UI.sliders.dc.value,
        harm: +UI.sliders.harm.value, noise: +UI.sliders.noise.value,
    };
}

function applySignal(sig) {
    Object.assign(yoursSignal, sig);
    invalidateMatchScore();
}

function resetYours() {
    yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
    ["freq", "amp", "phase", "dc", "harm", "noise"].forEach(k => { const el = document.getElementById(`sl-${k}`); if (el) el.value = yoursSignal[k]; });
    document.querySelectorAll(".type-btn").forEach(b => b.classList.toggle("active", b.dataset.t === "sine"));
    invalidateMatchScore(); recompute();
}

// ─── LEVEL UI ────────────────────────────────────────────────────────────────

function applyLevelUI() {
    const lv = LEVELS[Session.level];
    UI.labels.level.textContent = Session.postGameFreeplay ? "∞" : Session.level + 1; UI.displays.roundTotal.textContent = lv.rounds;
    UI.controls.phase.style.opacity = lv.phase ? "1" : ".3";
    UI.controls.dc.style.opacity = lv.dc ? "1" : ".3";
    UI.controls.harm.classList.toggle("hidden", !lv.harm);
    // Noise is atmosphere (tolerance band), not a puzzle param — always hidden
    UI.controls.noise.classList.add("hidden");
    UI.buttons.pwm.disabled = !lv.types.includes("pwm");
    UI.buttons.am.disabled = !lv.types.includes("am");
}

// ─── TIMER ───────────────────────────────────────────────────────────────────

function startTimer() {
    clearInterval(timerInterval);
    resetTensionFilter();
    const lv = LEVELS[Session.level];
    const grace = lv.grace && Round.roundNo === 1; // grace round: timeout advances, never kills
    const total = Round.timeLeft = lv.time;
    const el = UI.displays.timer, ring = UI.timerRingFill, C = RENDER.TIMER_CIRC;

    ring.style.transition = "none"; ring.style.strokeDashoffset = "0";
    const graceColor = grace ? (lv.graceColor ?? "var(--blue)") : null;
    ring.style.stroke = graceColor ?? "#f0690a";
    ring.style.transition = "stroke-dashoffset 1s linear, stroke 0.3s";

    // Grace theme: tint meter + scope-wrap to match the new param
    const meterFill = UI.displays.fill;
    const scopeWrap = document.querySelector(".scope-wrap");
    if (meterFill) meterFill.style.background = graceColor ?? "";
    if (scopeWrap) scopeWrap.classList.toggle("grace-active", grace);

    el.textContent = Round.timeLeft; el.className = "timer-ring-label";
    if (grace) UI.displays.feedback.textContent = "Explore freely — no penalty this round.";

    timerInterval = setInterval(() => {
        Round.timeLeft--;
        ring.style.strokeDashoffset = C * (1 - Round.timeLeft / total);
        const urgent = !grace && Round.timeLeft <= 8;
        el.textContent = Round.timeLeft;
        el.className = urgent ? "timer-ring-label urgent" : "timer-ring-label";
        ring.style.stroke = grace ? (lv.graceColor ?? "var(--blue)") : (urgent ? "#e85a4a" : "#f0690a");
        if (urgent) {
            const pct = Math.max(0, (Round.timeLeft - 1) / 7);
            const freq = 150 + pct * 2050;
            _tensionFilter.frequency.setValueAtTime(freq, actx().currentTime);
            const now = Date.now();
            if (now - Round._lastUrgentSfx > 500) { SFX.urgent(); Round._lastUrgentSfx = now; }
        }
        const wrap = document.querySelector(".scope-wrap");
        if (wrap) wrap.classList.toggle("urgent", urgent);
        const cv = document.getElementById("c-overlay");
        if (cv) cv.classList.toggle("urgent", urgent);
        const tw = document.querySelector(".timer-ring-wrap");
        if (tw) tw.classList.toggle("urgent", urgent);
        if (Round.timeLeft <= 0 && !Round.won) {
            clearInterval(timerInterval);
            if (grace) {
                UI.displays.feedback.textContent = "Time's up. Now it counts.";
            } else {
                gameOver();
            }
        }
    }, 1000);
}

// ─── LOOP CONTROL ────────────────────────────────────────────────────────────

function startLoop() { if (animRaf !== null) { cancelAnimationFrame(animRaf); animRaf = null; } animRaf = requestAnimationFrame(loop); }
function stopLoop() { Round._lockAnimStart = 0; if (animRaf !== null) { cancelAnimationFrame(animRaf); animRaf = null; } }

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

function exitLevel() {
    Round.reset();
    clearInterval(timerInterval);
    timerInterval = null;
    stopLoop();
    stopSignalPlayback();
    if (UI.archetypeName) {
        UI.archetypeName.textContent = "";
        UI.archetypeName.classList.add("hidden");
    }
    resetTensionFilter();
    const meterFill = UI.displays.fill;
    if (meterFill) meterFill.style.background = "";
    const scopeWrap = document.querySelector(".scope-wrap");
    if (scopeWrap) scopeWrap.classList.remove("grace-active");
}

function enterLevel() {
    transitionBGM(BGM_STATE.GAMEPLAY);
    showScreen("game");
    targetSignal = buildTarget();
    if (UI.archetypeName) {
        UI.archetypeName.textContent = targetSignal.archetype ?? "";
        UI.archetypeName.classList.toggle("hidden", !targetSignal.archetype);
    }
    invalidateMatchScore();
    applyLevelUI();
    resetYours();
    const feedback = UI.displays.feedback;
    feedback.textContent = "Match the target signal.";
    feedback.className = "feedback";
    const wrap = document.querySelector(".scope-wrap");
    if (wrap) wrap.classList.remove("urgent");
    const cv = document.getElementById("c-overlay");
    if (cv) cv.classList.remove("urgent");
    const tw = document.querySelector(".timer-ring-wrap");
    if (tw) tw.classList.remove("urgent");
    startTimer();
    startSignalPlayback();
    startLoop();
}

// ─── FREE-PLAY WARMUP ────────────────────────────────────────────────────────
function startFreePlay() {
    Session.freePlayActive = true;
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
    UI.buttons.freeplayReady.classList.remove("hidden");
    UI.meterRow.style.opacity = "0.2"; // meter meaningless during warmup

    // Start yours playback so they can hear their own signal.
    stopSignalPlayback();
    _playbackActive = true;
    _buildChannel(_chYours, yoursSignal);
    setPlaybackMode("yours");
}

/** Called by the READY button — ends free-play and starts the real round 1. */

function endFreePlay() {
    SFX.confirm();
    Session.freePlayActive = false;
    UI.buttons.freeplayReady.classList.add("hidden");
    UI.meterRow.style.opacity = "1";
    stopSignalPlayback();
    enterLevel();
}

// ─── ROUND / LEVEL FLOW ───────────────────────────────────────────────────────

function nextRound() {
    Round.won = false; Round._lockAnimStart = 0; dispatch({ type: "ROUND_NEXT" });
    if (Session.level >= LEVELS.length) {
        dispatch({ type: "LEVEL_SET", payload: LEVELS.length - 1 });
        dispatch({ type: "ROUND_SET", payload: 1 });
        Session.postGameFreeplay = true;
        startFreePlay();
        const feedback = UI.displays.feedback;
        feedback.textContent = `All ${LEVELS.length} levels unlocked. Feel Free To Explore.`; feedback.className = "feedback close";
        return;
    }
    const lv = LEVELS[Session.level];
    if (Round.roundNo > lv.rounds) {
        recordLevelComplete(Session.level, Session.score - Session.levelStartScore);
        const nextLevel = Session.level + 1;
        if (nextLevel >= LEVELS.length) { victory(); return; }
        dispatch({ type: "LEVEL_SET", payload: nextLevel });
        dispatch({ type: "ROUND_SET", payload: 1 });
        Session.levelStartScore = Session.score;
        runMiniGame(Session.level, () => { showLevelUpScreen(); }); return;
    }
    UI.displays.roundNo.textContent = Round.roundNo;

    if (lv.freeplay && Round.roundNo === 1) { startFreePlay(); return; }

    enterLevel();
}

function showLevelUpScreen() {
    transitionBGM(BGM_STATE.MENU);
    exitLevel();
    UI.displays.luTitle.textContent = `LEVEL ${Session.level + 1}`;
    const lv = LEVELS[Session.level];
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

function hasPendingCeremony() {
    if (!(Session.level in CEREMONIES)) return false;
    const save = loadSave();
    return !save.seenCeremonies.includes(Session.level);
}

function showCeremony() {
    const c = CEREMONIES[Session.level];
    if (!c) { enterLevel(); return; }
    SFX.levelUp();
    const overlay = document.getElementById("ceremony-overlay");
    document.getElementById("ceremony-title").textContent = c.title;
    document.getElementById("ceremony-desc").textContent = c.desc;
    document.getElementById("ceremony-tag").textContent = c.tag;
    document.getElementById("ceremony-tag").style.color = c.color;
    overlay.classList.remove("hidden");
}

function dismissCeremony() {
    SFX.back();
    const overlay = document.getElementById("ceremony-overlay");
    overlay.classList.add("hidden");
    const save = loadSave();
    if (!save.seenCeremonies.includes(Session.level)) save.seenCeremonies.push(Session.level);
    writeSave(save);
    enterLevel();
}

function continueLevel() {
    SFX.nav();
    UI.displays.roundNo.textContent = Round.roundNo;
    if (hasPendingCeremony()) {
        showCeremony();
    } else {
        enterLevel();
    }
}

function victory() {
    transitionBGM(BGM_STATE.RESULT);
    exitLevel();
    const h3 = UI.displays.screenDead?.querySelector("h3");
    if (h3) { h3.textContent = "MIXED SIGNALS MASTERED"; h3.style.color = "var(--green)"; }
    UI.displays.deadMsg.textContent = `All ${LEVELS.length} levels cleared with ${Session.score} pts. Legendary.`;
    showScreen("dead"); SFX.levelUp();
}

function gameOver() {
    transitionBGM(BGM_STATE.RESULT);
    exitLevel(); flash("#ff4554"); spawnStamp("fail");
    const h3 = UI.displays.screenDead?.querySelector("h3");
    if (h3) { h3.textContent = "SIGNAL LOST"; h3.style.color = "var(--red)"; }
    UI.displays.deadMsg.textContent = `Level ${Session.level + 1} · Round ${Round.roundNo} · ${Session.score} pts`;
    showScreen("dead"); SFX.fail();
    const gi = UI.gameInner;
    gi.classList.add("shake"); setTimeout(() => gi.classList.remove("shake"), 500);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

/** Exits gameplay cleanly from any state. */
function goToMenu() {
    SFX.back();
    exitLevel();
    if (Session.tutorialActive) {
        Session.tutorialActive = false;
        document.querySelectorAll(".tutorial-glow").forEach(el => el.classList.remove("tutorial-glow"));
        UI.buttons.skipTut.classList.add("hidden");
    }
    Round.won = false; Session.freePlayActive = false; Session.postGameFreeplay = false;
    if (UI.buttons.freeplayReady) UI.buttons.freeplayReady.classList.add("hidden");
    if (UI.meterRow) UI.meterRow.style.opacity = "1";
    renderStartScreen(); showScreen("start");
}

// ─── GAME ENTRY POINTS ────────────────────────────────────────────────────────

function startGame() {
    dispatch({ type: "SCORE_SET", payload: Session.levelStartScore });
    dispatch({ type: "ROUND_SET", payload: 0 });
    if (!lsGet("tutorialSeen") && !Session.tutorialActive) { startTutorial(); return; }
    showScreen("game"); startLoop(); nextRound();
}

function restartGame() { SFX.reset(); Round._lockAnimStart = 0; dispatch({ type: "SCORE_RESET" }); dispatch({ type: "LEVEL_SET", payload: 0 }); Session.postGameFreeplay = false; startGame(); }

function startTutorial() {
    transitionBGM(BGM_STATE.GAMEPLAY);
    SFX.nav();
    Round._lockAnimStart = 0; Session.tutorialActive = true; Session.tutorialStep = 0; dispatch({ type: "SCORE_RESET" });
    showScreen("game"); startLoop();
    targetSignal = { type: "triangle", freq: 5, amp: 8, phase: 360, dc: 2, harm: 0, noise: 0 };
    invalidateMatchScore();
    dispatch({ type: "ROUND_SET", payload: 1 }); UI.displays.roundTotal.textContent = 1;
    UI.controls.phase.style.opacity = "1"; UI.controls.dc.style.opacity = "1";
    UI.controls.harm.classList.add("hidden"); UI.controls.noise.classList.add("hidden");
    UI.buttons.pwm.disabled = false; UI.buttons.am.disabled = false;
    UI.buttons.skipTut.classList.remove("hidden");
    resetYours(); recompute(); showTutorialTask();
    startSignalPlayback();
}

// ─── TUTORIAL ────────────────────────────────────────────────────────────────

function showTutorialTask() {
    if (Session.tutorialStep >= TUTORIAL_TASKS.length) { endTutorial(); return; }
    UI.displays.feedback.textContent = TUTORIAL_TASKS[Session.tutorialStep].text;
    UI.displays.feedback.className = "feedback";
    highlightControl();
}

// Each completed step locks its control so the player can't accidentally
// break a matched parameter while tuning the next one.

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
    if (!Session.tutorialActive || Session.tutorialStep >= TUTORIAL_TASKS.length) return;
    if (TUTORIAL_TASKS[Session.tutorialStep].check()) {
        lockControl(Session.tutorialStep);
        Session.tutorialStep++;
        showTutorialTask();
        checkTutorial();
    }
}

function highlightControl() {
    document.querySelectorAll(".tutorial-glow").forEach(el => el.classList.remove("tutorial-glow"));
    const id = TUTORIAL_CONTROLS[Session.tutorialStep];
    if (id) {
        document.getElementById(id)?.classList.add("tutorial-glow");
        UI.displays.feedback?.classList.add("tutorial-glow-text");
    }
}

function skipTutorial() {
    SFX.back();
    Session.tutorialActive = false; lsSet("tutorialSeen", "true");
    unlockAllTutorialControls();
    UI.buttons.skipTut.classList.add("hidden");
    stopSignalPlayback();
    const feedback = UI.displays.feedback;
    feedback.textContent = "Tutorial skipped. Click NEW GAME to start playing.";
    renderStartScreen(); showScreen("start");
}

function endTutorial() {
    Session.tutorialActive = false; lsSet("tutorialSeen", "true");
    unlockAllTutorialControls();
    stopSignalPlayback();
    flash("var(--green)"); SFX.lock();
    const feedback = UI.displays.feedback;
    feedback.textContent = "TUTORIAL COMPLETE!"; feedback.className = "feedback win";
    setTimeout(() => {
        UI.buttons.skipTut.classList.add("hidden");
        renderStartScreen(); showScreen("start");
    }, 1800);
}

// ─── HINTS / SKIP ────────────────────────────────────────────────────────────

function useHint() {
    if (Round.won || Session.score < CONFIG.COST_HINT) { SFX.hintBroke(); spawnStamp("hint_broke"); return; }
    dispatch({ type: "SCORE_DEDUCT", payload: CONFIG.COST_HINT });
    const lv = LEVELS[Session.level];
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
    if (Session.score < CONFIG.COST_SKIP) { SFX.skipBroke(); spawnStamp("skip_broke"); return; }
    dispatch({ type: "SCORE_DEDUCT", payload: CONFIG.COST_SKIP });
    SFX.skip(); spawnStamp("skip"); setTimeout(() => nextRound(), 600); /* delay */
}

// ── MINI-GAME ENGINE ────────────────────────────────────────────

const MINIGAMES = [
    { id: "peak",   name: "PEAK HIT",      desc: "Tap the button each time the wave crests." },
    { id: "needle", name: "NEEDLE STOP",   desc: "Stop the needle inside the green zone." },
    { id: "pulse",  name: "PULSE TAP",     desc: "Tap in sync with the pulse. Match the beat 4 times." },
    { id: "noise",  name: "NOISE FILTER",  desc: "Mash the button to clear the static before time runs out." },
];

const MG_DIFFICULTY = [
    { peakSpeed: 0.003, peakTarget: 3, needleBase: 0.35, needleLimit: 0.9,  pulseWindow: 180, noiseDecay: 0.040 },
    { peakSpeed: 0.004, peakTarget: 3, needleBase: 0.45, needleLimit: 1.1,  pulseWindow: 150, noiseDecay: 0.035 },
    { peakSpeed: 0.005, peakTarget: 4, needleBase: 0.55, needleLimit: 1.3,  pulseWindow: 120, noiseDecay: 0.030 },
    { peakSpeed: 0.006, peakTarget: 4, needleBase: 0.65, needleLimit: 1.5,  pulseWindow: 100, noiseDecay: 0.025 },
];

let mgRaf = null, mgDone = false, mgOnDone = null, mgBonusPts = 0;
let mgState = {};

const $mg = id => document.getElementById(id);
SFX.beep = (freq, dur = 0.08, gain = 0.1, type = "sine") => _sfxNote({ freq, dur, gain, type });

function runMiniGame(completedLevel, onDone) {
    mgOnDone = onDone;
    mgDone = false;
    mgBonusPts = 0;
    const cfg = MG_DIFFICULTY[Math.min(completedLevel, MG_DIFFICULTY.length - 1)];
    const mg = MINIGAMES[completedLevel % 4];

    showScreen("minigame");
    $mg("mg-name").textContent = mg.name;
    $mg("mg-desc").textContent = mg.desc;
    $mg("mg-status").textContent = "";
    $mg("mg-status").className = "mg-status";
    $mg("mg-bonus-tag").textContent = "";
    $mg("mg-bar-wrap").style.display = "none";
    $mg("mg-bar").style.width = "100%";

    const btn = $mg("mg-btn");
    btn.textContent = "READY";
    btn.disabled = false;
    btn.className = "mg-action-btn";
    btn.onclick = () => mgStart(cfg, mg);

    if (mgRaf) { cancelAnimationFrame(mgRaf); mgRaf = null; }
    mgDrawIdle(mg);
}

function mgStart(cfg, mg) {
    const btn = $mg("mg-btn");
    btn.textContent = "...";
    btn.disabled = true;

    let c = 3;
    $mg("mg-status").textContent = "GET READY · " + c;
    const iv = setInterval(() => {
        c--;
        SFX.beep(c > 0 ? 660 : 880, 0.1, 0.15);
        if (c > 0) { $mg("mg-status").textContent = "GET READY · " + c; }
        else {
            clearInterval(iv);
            $mg("mg-status").textContent = "GO!";
            setTimeout(() => mgLaunch(cfg, mg), 120);
        }
    }, 600);
}

function mgLaunch(cfg, mg) {
    mgDone = false;
    cancelAnimationFrame(mgRaf);
    switch (mg.id) {
        case "peak":   mgPeakStart(cfg); break;
        case "needle": mgNeedleStart(cfg); break;
        case "pulse":  mgPulseStart(cfg); break;
        case "noise":  mgNoiseStart(cfg); break;
    }
}

function mgFinish(pts, msg, win) {
    if (mgDone) return;
    mgDone = true;
    cancelAnimationFrame(mgRaf);
    mgRaf = null;

    mgBonusPts = pts;
    dispatch({ type: "SCORE_ADD", payload: pts });

    $mg("mg-status").textContent = msg;
    $mg("mg-status").className = "mg-status " + (win ? "win" : "bad");
    $mg("mg-bonus-tag").textContent = pts > 0 ? "+" + pts + " pts bonus carried to next level" : "no bonus this time";

    const btn = $mg("mg-btn");
    btn.textContent = "CONTINUE";
    btn.disabled = false;
    btn.className = "mg-action-btn";
    btn.onclick = () => {
        if (mgOnDone) mgOnDone();
    };

    if (win) { flash("#00ffb4"); SFX.lock(); }
    else { SFX.fail(); }
}

// ── IDLE DRAW ─────────────────────────────────────

function mgDrawIdle(mg) {
    const c = $mg("mg-canvas");
    c.width = c.offsetWidth || 400; c.height = 110;
    const ctx = c.getContext("2d"), W = c.width, H = c.height;
    const t = Date.now() * 0.001;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(0,255,180,0.06)"; ctx.lineWidth = .5;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
        const y = H / 2 - fastSin((x / W) * Math.PI * 4 + t) * H * 0.3;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#00ffb4"; ctx.lineWidth = 1.5; ctx.stroke();
    if (!mgDone) mgRaf = requestAnimationFrame(() => mgDrawIdle(mg));
}

// ── PEAK HIT ──────────────────────────────────────

function mgPeakStart(cfg) {
    const TARGET_HITS = cfg.peakTarget;
    let hits = 0, lastPeak = false, startT = Date.now(), duration = 7000;
    let peakHitThisWindow = false;
    let missedTimeout = null;
    mgState = { hits: 0, canHit: false, flashUntil: 0 };

    const btn = $mg("mg-btn");
    btn.textContent = "HIT"; btn.disabled = false;
    btn.onclick = () => {
        if (mgDone || !mgState.canHit) return;
        hits++; mgState.hits = hits;
        SFX.beep(880 + hits * 80, 0.1, 0.2);
        mgState.flashUntil = performance.now() + 80;
        $mg("mg-status").textContent = "HIT! " + hits + "/" + TARGET_HITS;
        $mg("mg-status").className = "mg-status win";
        peakHitThisWindow = true;
        mgState.canHit = false;
        if (hits >= TARGET_HITS) { mgFinish(30, "PERFECT TIMING!", true); return; }
    };

    $mg("mg-bar-wrap").style.display = "block";

    function tick() {
        if (mgDone) return;
        const now = Date.now(), elapsed = now - startT;
        const timeLeft = Math.max(0, (duration - elapsed) / duration);
        $mg("mg-bar").style.width = (timeLeft * 100) + "%";
        $mg("mg-bar").style.background = timeLeft > 0.4 ? "#00ffb4" : "#ff4554";

        if (elapsed > duration) {
            const pts = mgState.hits >= TARGET_HITS ? 30 : mgState.hits * 8;
            mgFinish(pts, mgState.hits >= TARGET_HITS ? "PERFECT!" : "Missed some peaks. +" + (mgState.hits * 8) + " pts", mgState.hits >= TARGET_HITS);
            return;
        }

        const c = $mg("mg-canvas");
        c.width = c.offsetWidth || 400; c.height = 110;
        const ctx = c.getContext("2d"), W = c.width, H = c.height;
        const t = now * cfg.peakSpeed;
        const waveY = fastSin(t);
        const isPeak = waveY > 0.85;

        ctx.clearRect(0, 0, W, H);

        // flash overlay
        const pn = performance.now();
        if (mgState.flashUntil && pn < mgState.flashUntil) {
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = "#00ffb4";
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        } else {
            mgState.flashUntil = 0;
        }

        ctx.strokeStyle = "rgba(0,255,180,0.06)"; ctx.lineWidth = .5;
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
        ctx.fillStyle = "rgba(0,255,180,0.06)";
        ctx.fillRect(0, 0, W, H * 0.2);
        ctx.font = "8px Share Tech Mono"; ctx.fillStyle = "rgba(0,255,180,0.4)";
        ctx.fillText("PEAK ZONE", 4, 12);

        ctx.beginPath();
        for (let x = 0; x < W; x++) {
            const wt = (x / W) * Math.PI * 6 + t - Math.PI * 3;
            const y = H / 2 - fastSin(wt) * H * 0.38;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = isPeak ? "#ffb830" : "#00ffb4";
        ctx.lineWidth = isPeak ? 2.5 : 1.5;
        if (isPeak) { ctx.shadowColor = "#ffb830"; ctx.shadowBlur = 10; }
        ctx.stroke(); ctx.shadowBlur = 0;

        const dotY = H / 2 - waveY * H * 0.38;
        ctx.beginPath(); ctx.arc(W * 0.5, dotY, 5, 0, Math.PI * 2);
        ctx.fillStyle = isPeak ? "#ffb830" : "rgba(0,255,180,0.5)"; ctx.fill();

        mgState.canHit = isPeak;

        // NOW! visible for full peak window
        if (isPeak && !lastPeak && !mgDone) {
            peakHitThisWindow = false;
            if (missedTimeout) { clearTimeout(missedTimeout); missedTimeout = null; }
            $mg("mg-status").textContent = "NOW!";
            $mg("mg-status").className = "mg-status amber";
        }
        // MISSED when peak closes without a hit
        if (!isPeak && lastPeak && !mgDone && !peakHitThisWindow && mgState.hits < TARGET_HITS) {
            $mg("mg-status").textContent = "MISSED";
            $mg("mg-status").className = "mg-status bad";
            if (missedTimeout) clearTimeout(missedTimeout);
            missedTimeout = setTimeout(() => {
                $mg("mg-status").textContent = "";
                $mg("mg-status").className = "mg-status";
                missedTimeout = null;
            }, 400);
        }

        lastPeak = isPeak;
        mgRaf = requestAnimationFrame(tick);
    }
    tick();
}

// ── NEEDLE STOP ───────────────────────────────────

function mgNeedleStart(cfg) {
    let started = Date.now();
    let duration = 6000;
    const baseSpeed = cfg.needleBase;
    const speedLimit = cfg.needleLimit;
    const GREEN_LO = 0.33, GREEN_HI = 0.67;
    let stopped = false;
    let needlePos = 0;

    const btn = $mg("mg-btn");
    btn.textContent = "STOP";
    btn.disabled = false;

    btn.onclick = () => {
        if (stopped || mgDone) return;
        stopped = true;
        const inZone = needlePos >= GREEN_LO && needlePos <= GREEN_HI;
        const precision = inZone ? 1 - Math.abs(needlePos - 0.5) / 0.17 : 0;
        const pts = inZone ? Math.round(10 + precision * 20) : 0;
        mgFinish(pts, inZone ? "LOCKED! +" + pts + " pts" : "MISSED THE ZONE", inZone);
    };

    function tick() {
        if (stopped || mgDone) return;
        const now = Date.now();
        const t = (now - started) * 0.001;
        const difficultyCurve = 0.1;
        const speed = Math.min(speedLimit, baseSpeed + t * difficultyCurve);
        const fDrift = 0.04;
        const drift = fastSin(t * 0.7) * fDrift;
        let raw = fastSin(t * (speed + drift) * Math.PI * 2);
        const k = 0.6;
        raw = Math.tanh(raw * (1 + k)) / Math.tanh(1 + k);
        if (Math.random() < 0.5) { raw += 0.03 * fastSin(t * 6); }
        needlePos = 0.5 + 0.5 * raw;

        const c = $mg("mg-canvas");
        c.width = c.offsetWidth || 400; c.height = 110;
        const ctx = c.getContext("2d"), W = c.width, H = c.height;
        ctx.clearRect(0, 0, W, H);

        const trackY = H * 0.6, trackH = 8;
        ctx.fillStyle = "#111";
        ctx.fillRect(0, trackY, W, trackH);
        ctx.fillStyle = "rgba(0,255,180,0.25)";
        ctx.fillRect(W * GREEN_LO, trackY, W * (GREEN_HI - GREEN_LO), trackH);
        ctx.strokeStyle = "rgba(0,255,180,0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(W * GREEN_LO, trackY, W * (GREEN_HI - GREEN_LO), trackH);

        ctx.font = "8px Share Tech Mono";
        ctx.fillStyle = "rgba(0,255,180,0.7)";
        ctx.fillText("TARGET", W * 0.5 - 18, trackY - 4);

        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 10; i++) {
            const x = W * (i / 10);
            ctx.beginPath(); ctx.moveTo(x, trackY - 4); ctx.lineTo(x, trackY + trackH + 4); ctx.stroke();
        }

        const nx = W * needlePos;
        const inZone = needlePos >= GREEN_LO && needlePos <= GREEN_HI;

        ctx.strokeStyle = inZone ? "#ffb830" : "#ff4554";
        ctx.lineWidth = 2.5;
        if (inZone) {
            ctx.shadowColor = "#ffb830";
            ctx.shadowBlur = 8 + 6 * Math.sin(now * 0.005);
        }
        ctx.beginPath(); ctx.moveTo(nx, trackY - 20); ctx.lineTo(nx, trackY + trackH + 6); ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath(); ctx.arc(nx, trackY - 22, 5, 0, Math.PI * 2);
        ctx.fillStyle = inZone ? "#ffb830" : "#ff4554"; ctx.fill();

        const speedPct = Math.min(1, (speed - 0.6) / 0.8);
        ctx.font = "9px Share Tech Mono";
        ctx.fillStyle = "rgba(255,69,84," + speedPct.toFixed(2) + ")";
        ctx.fillText("SPEED: " + speed.toFixed(2) + "x", 4, 16);

        // Precision label
        if (inZone) {
            const dist = Math.abs(needlePos - 0.5);
            if (dist < 0.05) {
                $mg("mg-status").textContent = "CENTER +30";
                $mg("mg-status").className = "mg-status win";
            } else {
                $mg("mg-status").textContent = "EDGE +12";
                $mg("mg-status").className = "mg-status amber";
            }
        } else {
            $mg("mg-status").textContent = "";
            $mg("mg-status").className = "mg-status";
        }

        if (now - started > duration && !stopped) {
            stopped = true;
            mgFinish(0, "TIME'S UP", false);
            return;
        }

        mgRaf = requestAnimationFrame(tick);
    }
    tick();
}

// ── PULSE TAP ─────────────────────────────────────

function mgPulseStart(cfg) {
    const BPM = 90, BEAT_MS = 60000 / BPM;
    const TARGET = 4;
    const WINDOW = cfg.pulseWindow;
    let hits = 0, startT = Date.now(), lastBeatT = Date.now(), beatCount = 0;
    let flashOn = false;
    let offBeatMsgTimeout = null;

    const btn = $mg("mg-btn");
    btn.textContent = "TAP"; btn.disabled = false;
    btn.onclick = () => {
        if (mgDone) return;
        const now = Date.now();
        const sinceBeat = Math.abs(now - lastBeatT);
        const onBeat = sinceBeat < WINDOW;
        if (onBeat) {
            hits++;
            SFX.beep(660, 0.08, 0.2);
            $mg("mg-status").textContent = "ON BEAT! " + hits + "/" + TARGET;
            $mg("mg-status").className = "mg-status win";
            if (hits >= TARGET) { mgFinish(35, "PERFECT RHYTHM!", true); }
        } else {
            if (offBeatMsgTimeout) clearTimeout(offBeatMsgTimeout);
            if (sinceBeat < BEAT_MS * 0.5) {
                $mg("mg-status").textContent = "LATE";
            } else {
                $mg("mg-status").textContent = "EARLY";
            }
            $mg("mg-status").className = "mg-status bad";
            SFX.beep(220, 0.1, 0.1, "sawtooth");
            offBeatMsgTimeout = setTimeout(() => {
                if (!mgDone) {
                    $mg("mg-status").textContent = "";
                    $mg("mg-status").className = "mg-status";
                }
            }, 300);
        }
    };

    function tick() {
        if (mgDone) return;
        const now = Date.now(), elapsed = now - startT;
        if (elapsed > 10000 && !mgDone) {
            mgFinish(hits * 8, "Time's up. +" + (hits * 8) + " pts", false);
            return;
        }
        const sinceLastBeat = now - lastBeatT;
        if (sinceLastBeat >= BEAT_MS) {
            lastBeatT = now; beatCount++;
            SFX.beep(440, 0.05, 0.08);
            flashOn = true;
            setTimeout(() => { flashOn = false; }, 80);
        }
        const beatPhase = (sinceLastBeat / BEAT_MS);
        const inWindow = sinceLastBeat < WINDOW || sinceLastBeat > (BEAT_MS - WINDOW);

        const c = $mg("mg-canvas");
        c.width = c.offsetWidth || 400; c.height = 110;
        const ctx = c.getContext("2d"), W = c.width, H = c.height;
        ctx.clearRect(0, 0, W, H);

        // Contracting ring
        const ring = Math.max(0, (1 - beatPhase) * W * 0.45);
        const alpha = Math.max(0, 1 - beatPhase);
        ctx.strokeStyle = "rgba(0,255,180," + (alpha * 0.5).toFixed(2) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, ring, 0, Math.PI * 2); ctx.stroke();

        ctx.strokeStyle = inWindow ? "rgba(255,184,48,0.5)" : "rgba(90,112,96,0.2)";
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, 30, 0, Math.PI * 2); ctx.stroke();

        ctx.beginPath(); ctx.arc(W / 2, H / 2, flashOn ? 14 : 8, 0, Math.PI * 2);
        ctx.fillStyle = flashOn ? "#ffb830" : "rgba(0,255,180,0.6)";
        if (flashOn) { ctx.shadowColor = "#ffb830"; ctx.shadowBlur = 20; }
        ctx.fill(); ctx.shadowBlur = 0;

        for (let i = 0; i < TARGET; i++) {
            ctx.beginPath(); ctx.arc(W / 2 - ((TARGET - 1) * 14) + i * 28, H - 20, 5, 0, Math.PI * 2);
            ctx.fillStyle = i < hits ? "#00ffb4" : "#1a2020"; ctx.fill();
            ctx.strokeStyle = i < hits ? "#00ffb4" : "#333"; ctx.lineWidth = 1; ctx.stroke();
        }

        ctx.font = "9px Share Tech Mono"; ctx.fillStyle = "rgba(90,112,96,0.6)";
        ctx.fillText("BPM: " + BPM, 4, 14);

        mgRaf = requestAnimationFrame(tick);
    }
    tick();
}

// ── NOISE FILTER ──────────────────────────────────

function mgNoiseStart(cfg) {
    let noise = 1.0, startT = Date.now(), duration = 6500, mashes = 0;
    const DECAY = cfg.noiseDecay;
    let bursts = [];
    let shakeUntil = 0;
    let noiseCleared = false;

    const btn = $mg("mg-btn");
    btn.textContent = "CLEAR"; btn.disabled = false;
    btn.onclick = () => {
        if (mgDone) return;
        noise = Math.max(0, noise - DECAY);
        mashes++;
        SFX.beep(200 + mashes * 10, 0.04, 0.08, "square");

        const c = $mg("mg-canvas");
        const W = c.offsetWidth || 400;
        bursts.push({ x: Math.random() * W, y: Math.random() * 110, start: performance.now() });
        shakeUntil = performance.now() + 100;

        if (noise < 0.1 && !noiseCleared) {
            noiseCleared = true;
            mgState._noiseFlashUntil = performance.now() + 120;
            SFX.beep(1047, 0.15, 0.25);
        }

        if (noise <= 0.05) { mgFinish(40, "SIGNAL CLEAR!", true); }
    };

    $mg("mg-bar-wrap").style.display = "block";

    function tick() {
        if (mgDone) return;
        const pn = performance.now();
        const elapsed = Date.now() - startT;
        noise = Math.min(1, noise + 0.0008);
        const timeLeft = Math.max(0, 1 - (elapsed / duration));
        $mg("mg-bar").style.width = (timeLeft * 100) + "%";
        $mg("mg-bar").style.background = timeLeft > 0.4 ? "#00ffb4" : "#ff4554";

        if (elapsed > duration && !mgDone) {
            const pts = noise < 0.3 ? 20 : noise < 0.6 ? 10 : 0;
            mgFinish(pts, noise < 0.15 ? "Mostly clear. +" + pts + " pts" : "Static remains. +" + pts + " pts", noise < 0.3);
            return;
        }

        const c = $mg("mg-canvas");
        c.width = c.offsetWidth || 400; c.height = 110;
        const ctx = c.getContext("2d"), W = c.width, H = c.height;
        const shaking = pn < shakeUntil;

        ctx.save();
        if (shaking) { ctx.translate(2 * (Math.random() - 0.5), 2 * (Math.random() - 0.5)); }

        ctx.clearRect(-5, -5, W + 10, H + 10);

        // Clean sine with emergent opacity/lineWidth
        const cleanAlpha = noise < 0.5 ? (0.3 + (1 - noise * 2) * 0.7) : 0;
        const cleanLineWidth = noise < 0.5 ? (1.5 + (1 - noise * 2) * 1.5) : 0;
        if (cleanAlpha > 0.01) {
            ctx.globalAlpha = cleanAlpha;
            ctx.beginPath();
            const t = Date.now() * 0.002;
            for (let x = 0; x < W; x++) {
                const y = H / 2 - fastSin((x / W) * Math.PI * 4 + t) * H * 0.35;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.strokeStyle = "#00ffb4";
            ctx.lineWidth = cleanLineWidth;
            ctx.shadowColor = "#00ffb4";
            ctx.shadowBlur = cleanLineWidth * 4;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }

        // Noise layer
        if (noise > 0.05) {
            ctx.globalAlpha = noise;
            for (let x = 0; x < W; x += 2) {
                const amp = (Math.random() - 0.5) * H * 0.7 * noise;
                const y = H / 2 + amp;
                ctx.beginPath(); ctx.moveTo(x, H / 2); ctx.lineTo(x, y);
                ctx.strokeStyle = "hsl(" + (140 + Math.random() * 40) + ",60%," + (40 + Math.random() * 20) + "%)";
                ctx.lineWidth = 1.5; ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // Visual bursts
        const burstAge = 250;
        const n2 = performance.now();
        bursts = bursts.filter(b => n2 - b.start < burstAge);
        for (const b of bursts) {
            const age = (n2 - b.start) / burstAge;
            ctx.globalAlpha = 1 - age;
            ctx.strokeStyle = "#00ffb4";
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const dx = Math.cos(angle) * 18;
                const dy = Math.sin(angle) * 18;
                ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + dx, b.y + dy); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // One-shot noise cleared flash
        if (mgState._noiseFlashUntil && n2 < mgState._noiseFlashUntil) {
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = "#00ffb4";
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        } else {
            mgState._noiseFlashUntil = 0;
        }

        ctx.restore();

        const pct = Math.round(noise * 100);
        ctx.font = "9px Share Tech Mono";
        ctx.fillStyle = noise > 0.5 ? "rgba(255,69,84,0.7)" : "rgba(0,255,180,0.6)";
        ctx.fillText("NOISE: " + pct + "%", 4, 14);

        $mg("mg-status").textContent = noise < 0.15 ? "Almost clear!" : noise < 0.4 ? "Keep going..." : "Mash harder!";
        $mg("mg-status").className = "mg-status" + (noise < 0.15 ? " win" : noise < 0.4 ? " amber" : "");

        mgRaf = requestAnimationFrame(tick);
    }
    tick();
}

// ── TEST SHORTCUT ─────────────────────────────────

window._testMG = (i) => {
    runMiniGame(i, () => {
        showScreen("start");
    });
};

// ── WAVE LIBRARY ──────────────────────────────────────────────

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
            (stampRand() - 0.5) * RANDOM_NOISE_AMP
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
        const dt = Math.min(ts - _logoLastTime, RENDER.DT_MAX);
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
        const t = RENDER.FRAME_INDEPENDENT ?
            (_logoElapsedTime * RENDER.LOGO_SPEED)
            : (ts * RENDER.LOGO_SPEED);

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