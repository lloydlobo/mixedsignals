/// <reference path="types.d.ts" />

/**
 * Mixed Signals
 * @fileoverview I want to share with you the joy of playing this fun little
 * game — originally made for Ludum Dare 59.
 * Heavily vibed with le' AI. Hope you enjoy playing it!
 * @version 0.6.0
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const CONFIG = Object.freeze({
	FIXED_STEPS_PRECISION: 2,
	TIME_BONUS_RATE: 0.8,
	BASE_REWARD: 100,
	COST_HINT: 25,
	COST_SKIP: 130,
	WIN_PERCENTAGE: 95,
	CLOSE_PERCENTAGE: 75,
	// Noise widens the win threshold: noisy targets are easier to "lock in".
	// noise=0 → no change. noise=6 (max) → threshold drops by 10 points.
	NOISE_TOLERANCE_PER_UNIT: 1.2,
});

const SIG_SCALE = Object.freeze({
	AMP: 0.1,
	DC: 0.1,
	HARM: 0.1,
	NOISE: 0.1,
	HARM_MULTIPLE: 3,
	NOISE_RANGE: 0.8,
});

const WAVE_COLORS = {
	target: "rgba(200,190,170,0.35)",
	yours: "#f5efe0",
};

const LEVELS = [
	// LV1 — freeplay warmup so players understand controls before the clock starts
	{ rounds: 5, time: 35, types: ["sine", "square"], phase: false, dc: false, harm: false, noise: false, freeplay: true },
	{ rounds: 5, time: 32, types: ["sine", "square", "sawtooth", "triangle"], phase: false, dc: false, harm: false, noise: false },
	// LV3 — grace: phase is new, give players one round to discover it
	{
		rounds: 5,
		time: 30,
		types: ["sine", "square", "sawtooth", "triangle"],
		phase: true,
		dc: false,
		harm: false,
		noise: false,
		grace: true,
		graceColor: "var(--blue)",
	},
	// LV4 — grace: DC offset is new
	{
		rounds: 5,
		time: 28,
		types: ["sine", "square", "sawtooth", "triangle"],
		phase: true,
		dc: true,
		harm: false,
		noise: false,
		grace: true,
		graceColor: "var(--amber)",
	},
	// LV5 — grace: PWM and AM are new
	{
		rounds: 5,
		time: 26,
		types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"],
		phase: true,
		dc: true,
		harm: false,
		noise: false,
		grace: true,
		graceColor: "var(--coral)",
	},
	// LV6 — grace + freeplay: harmonics need exploration time most of all
	{
		rounds: 5,
		time: 36,
		types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"],
		phase: true,
		dc: true,
		harm: true,
		noise: false,
		grace: true,
		freeplay: true,
		graceColor: "var(--green)",
	},
	// LV7 — noise as atmosphere (tolerance band), not a slider to match
	{
		rounds: 5,
		time: 32,
		types: ["sine", "square", "sawtooth", "triangle", "pwm", "am"],
		phase: true,
		dc: true,
		harm: true,
		noise: true,
		grace: true,
		graceColor: "var(--text-dim)",
	},
];

// ─── CEREMONIES ──────────────────────────────────────────────────────────────
// Each level that introduces a new mechanic gets a ceremony (shown once).
// Map key = level index (0-based).
// luMsg is shown on the level-up screen as a preview before the ceremony.
const CEREMONIES = {
	2: {
		tag: "PHASE",
		color: "var(--blue)",
		title: "PHASE UNLOCKED",
		desc: "Phase shifts the wave in time — a horizontal offset. At 180° the shape flips entirely. Align to match.",
		luMsg: "Phase unlocked — shift the waveform forward or backward in time.",
	},
	3: {
		tag: "DC",
		color: "var(--amber)",
		title: "DC OFFSET UNLOCKED",
		desc: "DC offset raises or lowers the wave center — like shifting the baseline. Watch the zero line drift.",
		luMsg: "DC Offset unlocked — raise or lower the waveform baseline.",
	},
	4: {
		tag: "PWM/AM",
		color: "var(--coral)",
		title: "PWM & AM UNLOCKED",
		desc: "PWM varies pulse width for a fizzy edge. AM rides a carrier wave — amplitude becomes the signal itself.",
		luMsg: "PWM & AM unlocked — two new wave types with unique modulation.",
	},
	5: {
		tag: "HARM",
		color: "var(--green)",
		title: "HARMONICS UNLOCKED",
		desc: "Harmonics layer overtones above the fundamental. Each adds texture and body to the wave.",
		luMsg: "Harmonics unlocked — layer overtones to shape richer waveforms.",
	},
};

// ─── SIGNAL ARCHETYPES ──────────────────────────────────────────────────────
// Authored named signal presets that appear as targets, adding personality.
// levelMin = minimum 0-indexed level where this archetype can appear.
const ARCHETYPES = [
	{ name: "Heartbeat", type: "square", freq: 2, amp: 8, phase: 0, dc: 0, harm: 0, levelMin: 0 },
	{ name: "Sonar", type: "sine", freq: 5, amp: 9, phase: 0, dc: 0, harm: 0, levelMin: 0 },
	{ name: "Bell", type: "sine", freq: 7, amp: 5, phase: 0, dc: 0, harm: 0, levelMin: 0 },
	{ name: "Thump", type: "square", freq: 1, amp: 10, phase: 0, dc: 0, harm: 0, levelMin: 0 },
	{ name: "Reactor", type: "sawtooth", freq: 1, amp: 10, phase: 0, dc: 0, harm: 0, levelMin: 1 },
	{ name: "Phase Shift", type: "triangle", freq: 3, amp: 7, phase: 180, dc: 0, harm: 0, levelMin: 2 },
	{ name: "Subsonic", type: "sine", freq: 1, amp: 9, phase: 0, dc: -3, harm: 0, levelMin: 3 },
	{ name: "Wobble", type: "am", freq: 3, amp: 5, phase: 0, dc: 0, harm: 0, levelMin: 4 },
	{ name: "Glitch", type: "pwm", freq: 4, amp: 6, phase: 180, dc: 0, harm: 0, levelMin: 4 },
	{ name: "Drone", type: "sawtooth", freq: 2, amp: 4, phase: 0, dc: 0, harm: 4, levelMin: 5 },
	{ name: "Resonance", type: "sine", freq: 4, amp: 6, phase: 0, dc: 0, harm: 4, levelMin: 5 },
	{ name: "Buzz", type: "square", freq: 3, amp: 7, phase: 0, dc: 0, harm: 3, levelMin: 5 },
	{ name: "Hum", type: "triangle", freq: 2, amp: 5, phase: 0, dc: 0, harm: 2, levelMin: 5 },
	{ name: "Siren", type: "am", freq: 6, amp: 7, phase: 0, dc: 0, harm: 0, levelMin: 4 },
	{ name: "Stutter", type: "pwm", freq: 7, amp: 8, phase: 0, dc: 0, harm: 0, levelMin: 4 },
	{ name: "Scrambler", type: "pwm", freq: 5, amp: 6, phase: 90, dc: 0, harm: 3, levelMin: 6 },
	{ name: "Throb", type: "sawtooth", freq: 3, amp: 8, phase: 0, dc: -2, harm: 2, levelMin: 6 },
	{ name: "Guide", type: "pwm", freq: 5, amp: 7, phase: 0, dc: 0, harm: 0, levelMin: 5 },
	{ name: "Guide", type: "am", freq: 5, amp: 7, phase: 0, dc: 0, harm: 0, levelMin: 5 },
	{ name: "Ghost", type: "pwm", freq: 5, amp: 7, phase: 0, dc: 0, harm: 0, levelMin: 6 },
	{ name: "Ghost", type: "am", freq: 5, amp: 7, phase: 0, dc: 0, harm: 0, levelMin: 6 },
];

// On debut levels, only archetypes that exercise the new param appear —
// prevents dilution of _pickWeightedParam's non-zero boost.
const _DEBUT_ARCHETYPES = {
	2: ["Phase Shift"],
	3: ["Subsonic"],
	4: ["Wobble", "Glitch", "Siren", "Stutter"],
	5: ["Drone", "Resonance", "Buzz", "Hum", "Guide"],
};

// ─── GAME STATE ───────────────────────────────────────────────────────────────

let targetSignal = {};
let yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
let _smoothPhase = yoursSignal.phase;

// Resource handles (kept as bare lets — no lifecycle dependency)
let timerInterval = null;
let animRaf = null;

/** Per-round state. reset() clears everything except roundNo (managed by nextRound()). */
const Round = {
	roundNo: 0,
	timeLeft: 0,
	won: false,
	combo: 0,
	_hintsUsed: 0,
	_skipsUsed: 0,
	_lockAnimStart: 0,
	_lockScrollPos: -1,
	_lastPct: 0,
	_recomputeScheduled: false,
	_setTypeScheduled: false,
	_lastUrgentSfx: 0,
	_wasCloseSfx: false,
	_typePuzzle: false,
	_revealedHints: null,

	reset() {
		this.timeLeft = 0;
		this.won = false;
		this.combo = 0;
		this._hintsUsed = 0;
		this._skipsUsed = 0;
		this._lockAnimStart = 0;
		this._lockScrollPos = -1;
		this._lastPct = 0;
		this._recomputeScheduled = false;
		this._setTypeScheduled = false;
		this._lastUrgentSfx = 0;
		this._wasCloseSfx = false;
		this._typePuzzle = false;
		this._revealedHints = new Set();
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
	screenShake: true,
	minigames: false,
	assistDisableUrgent: false,
	assistInfiniteTime: false,
	assistEasyMatch: false,
	assistNoFail: false,
	assistParamGuide: "off",
	assistFreeGuide: false,
	sfxVolume: 0.4,
	postGameFreeplay: false,
};

const TUTORIAL_TASKS = [
	{ text: "TUTORIAL: Select TRI waveform", check: () => yoursSignal.type === "triangle" },
	{ text: "TUTORIAL: Set frequency to 5 Hz", check: () => yoursSignal.freq === 5 },
	{ text: "TUTORIAL: Set amplitude around 0.80", check: () => Math.abs(yoursSignal.amp - 8) < 0.5 },
	{ text: "TUTORIAL: Set phase around 360°", check: () => Math.abs(yoursSignal.phase - 360) <= 2 },
	{ text: "TUTORIAL: Set dc offset around 0.3", check: () => Math.abs(yoursSignal.dc - 3) <= 0.125 },
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

	UI.labels = collect("lbl-", ["freq", "amp", "phase", "dc", "harm", "noise", "level"]);
	UI.sliders = collect("sl-", ["freq", "amp", "phase", "dc", "harm", "noise"]);
	UI.controls = collect("ctrl-", ["phase", "dc", "harm", "noise"]);
	UI.playback = collect("pb-", ["target", "yours", "ab"]);

	UI.buttons = {
		continue: document.getElementById("btn-continue"),
		newGame: document.getElementById("btn-new-game"),
		selectLevel: document.getElementById("btn-select-level"),
		tutorial: document.getElementById("btn-tutorial"),
		retry: document.getElementById("btn-retry"),
		deadLevelSelect: document.getElementById("btn-dead-level-select"),
		startOver: document.getElementById("btn-start-over"),
		continueLevel: document.getElementById("btn-continue-level"),
		levelBack: document.getElementById("btn-level-back"),
		dismissCeremony: document.getElementById("btn-dismiss-ceremony"),
		hint: document.getElementById("btn-hint"),
		skip: document.getElementById("btn-skip"),
		menu: document.getElementById("menu-btn"),
		skipTut: document.getElementById("skip-tut"),
		freeplayReady: document.getElementById("btn-freeplay-ready"),
		pwm: document.getElementById("btn-pwm"),
		am: document.getElementById("btn-am"),
	};

	UI.displays = {
		score: document.getElementById("score"),
		pbDisplay: document.getElementById("pb-display"),
		pct: document.getElementById("pct"),
		feedback: document.getElementById("feedback"),
		hintLog: document.getElementById("hint-log"),
		timer: document.getElementById("timer"),
		roundNo: document.getElementById("round-no"),
		roundTotal: document.getElementById("round-total"),
		fill: document.getElementById("fill"),
		flash: document.getElementById("flash"),
		deadMsg: document.getElementById("dead-msg"),
		victoryMsg: document.getElementById("victory-msg"),
		luTitle: document.getElementById("lu-title"),
		luMsg: document.getElementById("lu-msg"),
		luScore: document.getElementById("lu-score"),
		luBest: document.getElementById("lu-best"),
		luRounds: document.getElementById("lu-rounds"),
		luCombo: document.getElementById("lu-combo"),
		luTime: document.getElementById("lu-time"),
		luHints: document.getElementById("lu-hints"),
		luSkips: document.getElementById("lu-skips"),
		unlockMsg: document.getElementById("unlock-msg"),
		screenDead: document.getElementById("screen-dead"),
	};

	UI.canvas = document.getElementById("c-overlay");
	UI.audio = document.getElementById("bgm-audio");
	UI.stampLayer = document.getElementById("stamp-layer");
	UI.gameInner = document.getElementById("game-inner");
	UI.timerRingFill = document.getElementById("timer-ring-fill");
	UI.meterRow = document.getElementById("meter-row");
	UI.archetypeName = document.getElementById("archetype-name");
	UI.game = document.getElementById("game");
	UI.levelSelectGrid = document.getElementById("level-select-grid");
	UI.typeButtons = document.getElementById("type-btns");
	UI.sliderContainer = document.querySelector(".param-list");
	UI.scopeWrap = document.querySelector(".scope-wrap");
	UI.timerRingWrap = document.querySelector(".timer-ring-wrap");
	UI.scorePop = document.createElement("div");
	UI.scorePop.className = "score-pop";
	UI.scorePop.style.display = "none";
}

// ─── DISPATCH ──────────────────────────────────────────────────

function dispatch(action) {
	switch (action.type) {
		case "SCORE_ADD":
			Session.score += action.payload;
			UI.displays.score.textContent = Session.postGameFreeplay ? "∞" : Session.score;
			break;
		case "SCORE_SET":
			Session.score = action.payload;
			UI.displays.score.textContent = Session.postGameFreeplay ? "∞" : Session.score;
			break;
		case "SCORE_DEDUCT":
			Session.score = Math.max(0, Session.score - action.payload);
			UI.displays.score.textContent = Session.postGameFreeplay ? "∞" : Session.score;
			break;
		case "SCORE_RESET":
			Session.score = 0;
			Session.levelStartScore = 0;
			UI.displays.score.textContent = Session.postGameFreeplay ? "∞" : Session.score;
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
	"btn-retry": () => {
		SFX.nav();
		startGame();
	},
	"btn-dead-level-select": showLevelSelect,
	"btn-start-over": restartGame,
	"btn-continue-level": continueLevel,
	"btn-level-back": () => {
		SFX.back();
		renderStartScreen();
		showScreen("start");
	},
	"btn-dismiss-ceremony": dismissCeremony,
	"btn-victory-continue": () => {
		SFX.back();
		renderStartScreen();
		showScreen("start");
	},
	"btn-victory-freeplay": startVictoryFreeplay,
	"btn-hint": useHint,
	"btn-skip": skipRound,
	"menu-btn": goToMenu,
	"skip-tut": skipTutorial,
	"btn-freeplay-ready": endFreePlay,
	"btn-settings": showSettings,
	"btn-close-settings": closeSettings,
};

// ─── EVENT BINDING ────────────────────────────────────────────────────────────

function initEvents() {
	Object.entries(BUTTON_ACTIONS).forEach(([id, fn]) => {
		const el = document.getElementById(id);
		if (!el) return;
		el.addEventListener("click", fn);
		UI.buttons[id] = el;
	});

	document.getElementById("ceremony-overlay")?.addEventListener("click", e => {
		if (e.target === e.currentTarget) {
			SFX.back();
			dismissCeremony();
		}
	});

	document.getElementById("settings-overlay")?.addEventListener("click", e => {
		if (e.target === e.currentTarget) {
			SFX.back();
			closeSettings();
		}
	});

	initSettingsOverlay();

	// Delegated type button listener (handles all 6 waveform buttons)
	UI.typeButtons?.addEventListener("click", e => {
		const btn = e.target.closest(".type-btn");
		if (btn) setType(btn);
	});

	// Delegated slider listener
	UI.sliderContainer?.addEventListener("input", recompute);

	// Playback toggle buttons
	["target", "yours", "ab"].forEach(mode => void UI.playback[mode]?.addEventListener("click", () => setPlaybackMode(_pbMode === mode ? "off" : mode)));

	// Credits popup toggle — keyboard + click accessible
	const creditsBtn = document.getElementById("btn-credits");
	const creditsWrap = document.querySelector(".credits-wrap");
	if (creditsBtn && creditsWrap) {
		creditsBtn.addEventListener("click", () => {
			const isOpen = creditsWrap.classList.toggle("open");
			if (isOpen) {
				_prevBgmState = _bgmState;
				transitionBGM(BGM_STATE.CREDITS);
			} else {
				transitionBGM(_prevBgmState);
			}
		});
		document.addEventListener("keydown", e => {
			if (e.key === "Escape" && creditsWrap.classList.contains("open")) {
				creditsWrap.classList.remove("open");
				creditsBtn.focus();
				transitionBGM(_prevBgmState);
			}
		});
		document.addEventListener("click", e => {
			if (creditsWrap.classList.contains("open") && !creditsWrap.contains(e.target)) {
				creditsWrap.classList.remove("open");
				transitionBGM(_prevBgmState);
			}
		});
	}

	// Pointer gate for beating audio — touch/hold scope to hear the mix
	const overlay = UI.canvas;
	if (overlay) {
		overlay.addEventListener("pointerdown", () => {
			if (!_pointerGate) return;
			const ac = actx();
			_pointerGate.gain.cancelScheduledValues(ac.currentTime);
			_pointerGate.gain.setValueAtTime(_pointerGate.gain.value, ac.currentTime);
			_pointerGate.gain.linearRampToValueAtTime(PB.BEAT_VOL, ac.currentTime + PB.GATE_ATTACK);
			if (UI.scopeWrap) UI.scopeWrap.classList.add("held");
			overlay.classList.add("held");
		});
		const closeGate = () => {
			if (!_pointerGate) return;
			const ac = actx();
			_pointerGate.gain.cancelScheduledValues(ac.currentTime);
			_pointerGate.gain.setValueAtTime(_pointerGate.gain.value, ac.currentTime);
			_pointerGate.gain.linearRampToValueAtTime(0, ac.currentTime + PB.GATE_RELEASE);
			if (UI.scopeWrap) UI.scopeWrap.classList.remove("held");
			overlay.classList.remove("held");
		};
		overlay.addEventListener("pointerup", closeGate);
		overlay.addEventListener("pointerleave", closeGate);
	}

	document.addEventListener(
		"click",
		() => {
			actx();
			if (!Session.muted) startMusic();
		},
		{ once: true },
	);
	document.addEventListener("pointerdown", _initAudioOnGesture, { once: true });
	document.addEventListener("keydown", _initAudioOnGesture, { once: true });
	window.addEventListener("blur", () => {
		_lastTime = 0;
		_elapsedTime = 0;
	});

	document.addEventListener("keydown", e => {
		if (e.repeat) return;
		const target = e.target;
		if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
		if (e.key === "Escape") {
			const so = document.getElementById("settings-overlay");
			if (so && !so.classList.contains("hidden")) {
				e.preventDefault();
				closeSettings();
				return;
			}
			const co = document.getElementById("ceremony-overlay");
			if (co && !co.classList.contains("hidden")) {
				e.preventDefault();
				dismissCeremony();
				return;
			}
			return;
		}
		const num = parseInt(e.key, 10);
		if (num >= 1 && num <= 6 && currentScreen() === "game" && !Round.won) {
			const btns = document.querySelectorAll(".type-btn");
			if (btns[num - 1]) {
				e.preventDefault();
				btns[num - 1].click();
			}
		}
	});
}

// ─── LOCALSTORAGE (Safari-safe) ───────────────────────────────────────────────

function lsGet(key, fallback = null) {
	try {
		return localStorage.getItem(key) ?? fallback;
	} catch {
		return fallback;
	}
}
function lsSet(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* private / quota — ignore */
	}
}

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────

const SAVE_KEY = "mixedSignalsSave";

function freshSave() {
	return { highestLevel: 0, bestScores: new Array(LEVELS.length).fill(0), seenCeremonies: [], settings: DEFAULT_SETTINGS(), telemetry: [] };
}
const DEFAULT_SETTINGS = () => ({
	bgmMuted: false,
	sfxMuted: false,
	bgmVolume: 0.4,
	sfxVolume: 0.4,
	ceremonies: true,
	screenShake: true,
	minigames: false,
	assistDisableUrgent: false,
	assistInfiniteTime: false,
	assistEasyMatch: false,
	assistNoFail: false,
	assistParamGuide: "off",
	assistFreeGuide: false,
});

/** @returns {SaveData} */
function loadSave() {
	try {
		const raw = lsGet(SAVE_KEY);
		if (!raw) return freshSave();
		const d = JSON.parse(raw);
		if (typeof d.highestLevel !== "number" || !Array.isArray(d.bestScores)) return freshSave();
		while (d.bestScores.length < LEVELS.length) d.bestScores.push(0);
		if (!Array.isArray(d.seenCeremonies)) d.seenCeremonies = [];
		// Migrate settings — construct from old lsGet keys if missing
		if (!d.settings) {
			d.settings = {
				bgmMuted: lsGet("bgmMuted") === "true",
				sfxMuted: lsGet("sfxMuted") === "true",
				bgmVolume: parseFloat(lsGet("bgmVolume") ?? "0.4"),
				sfxVolume: 0.4,
				ceremonies: true,
				screenShake: true,
			};
			// Clear old keys after migration
			try {
				localStorage.removeItem("bgmMuted");
				localStorage.removeItem("sfxMuted");
				localStorage.removeItem("bgmVolume");
			} catch {}
			writeSave(d);
		}
		d.settings = { ...DEFAULT_SETTINGS(), ...d.settings };
		return d;
	} catch {
		return freshSave();
	}
}

/** @param {SaveData} data */
function writeSave(data) {
	lsSet(SAVE_KEY, JSON.stringify(data));
}

/**
 * @param {number} completedLevel 0-indexed
 * @param {number} runScore
 */
function recordLevelComplete(completedLevel, runScore) {
	const save = loadSave();
	save.highestLevel = Math.max(save.highestLevel, completedLevel + 1);
	save.bestScores[completedLevel] = Math.max(save.bestScores[completedLevel], runScore);
	if (!save.telemetry) save.telemetry = [];
	save.telemetry.push({
		level: completedLevel,
		rounds: Round.roundNo,
		hintsUsed: Round._hintsUsed,
		skipsUsed: Round._skipsUsed,
		score: runScore,
		timeRemaining: Round.timeLeft,
	});
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
			continueBtn.textContent = nextLv > LEVELS.length ? "CONTINUE (FREEPLAY)" : `CONTINUE (LV ${nextLv})`;
		}
	}

	const unlockMsg = UI.displays.unlockMsg;
	if (unlockMsg) {
		const unlocked = Math.min(save.highestLevel + 1, LEVELS.length);
		unlockMsg.textContent = unlocked < LEVELS.length ? `${unlocked}/${LEVELS.length} levels unlocked` : "All levels unlocked";
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
		btn.className = ["level-select-btn", unlocked ? "unlocked" : "locked", i === save.highestLevel ? "current" : ""].join(" ").trim();
		btn.disabled = !unlocked;

		const num = document.createElement("span");
		num.className = "ls-num";
		num.textContent = `LV ${i + 1}`;
		const sc = document.createElement("span");
		sc.className = "ls-score";
		sc.textContent = best > 0 ? `${best} pts` : unlocked ? "not played" : "locked";
		const tags = document.createElement("span");
		tags.className = "ls-tags";
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
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return (s >>> 0) / 4294967296;
	};
}
const gameRand = makeRand(1831565813);
const stampRand = makeRand(0xc0ffee31);

function rng(lo, hi) {
	if (lo > hi) {
		const t = lo;
		lo = hi;
		hi = t;
	}
	return (lo + gameRand() * (hi - lo + 1)) | 0;
}

const pick = rng => arr => arr[Math.floor(rng() * arr.length)];
const gamePick = pick(gameRand);
const stampPick = pick(stampRand);

// ─── BGM ─────────────────────────────────────────────────────────────────────

const BGM_FADE_DURATION = 1; // seconds

const BGM_STATE = {
	MENU: "menu",
	GAMEPLAY: "gameplay",
	SETTINGS: "settings",
	CREDITS: "credits",
	VICTORY: "victory",
	GAMEOVER: "gameover",
};

const BGM_POOL = {
	menu: ["pietix-cinematic-arthouse-room-with-open-doors-4-535342.mp3"],
	gameplay: [
		"penguinmusic-penguinmusic-modern-chillout-future-calm-12641.mp3",
		"databend-neon-nebula-ambient-electronic-background-loopable-edit-439364.mp3",
		"penguinmusic-lazy-day-stylish-futuristic-chill-239287.mp3",
	],
	settings: ["pietix-cinematic-aloha-lounge-rumba-2-535338.mp3"],
	credits: ["pietix-art-pop-exp-2-510302.mp3", "slimeyfox-after-hours-arcade-487277.mp3"],
	victory: ["kevinmacleod-study-and-relax.mp3"],
	gameover: ["musinova-idm-electronic-science-technology-drumless-ambient-loop-483365.mp3"],
};

// Background preloader — fire-and-forget fetch, never blocks the game
const _bgmCache = new Map();
const _bgmCacheMax = 9;

function _bgmSrc(filename) {
	return _bgmCache.get(filename) ?? `resources/music/${filename}`;
}

function _prefetchBGM(filename) {
	return fetch(`resources/music/${filename}`)
		.then(r => {
			if (!r.ok) throw Error();
			return r.blob();
		})
		.then(blob => {
			if (_bgmCache.size >= _bgmCacheMax) {
				const [key] = _bgmCache.keys();
				URL.revokeObjectURL(_bgmCache.get(key));
				_bgmCache.delete(key);
			}
			_bgmCache.set(filename, URL.createObjectURL(blob));
		})
		.catch(() => {});
}

const _poolLastIndex = { menu: -1, gameplay: -1, settings: -1, credits: -1, victory: -1, gameover: -1 };
let _bgmState = null;
let _bgmFadeTimeout = null;
let _prevBgmState = null;

function _pickFromPool(pool, stateKey) {
	let next;
	do {
		next = Math.floor(stampRand() * pool.length);
	} while (pool.length > 1 && next === _poolLastIndex[stateKey]);
	_poolLastIndex[stateKey] = next;
	return pool[next];
}

function _fadeBGM(toGain, duration = BGM_FADE_DURATION) {
	const ac = actx();
	const now = ac.currentTime;
	MIX.bgm.gain.setValueAtTime(MIX.bgm.gain.value, now);
	MIX.bgm.gain.linearRampToValueAtTime(toGain, now + duration);
}

function _playFromPool(pool, stateKey, fadeIn = false) {
	const audio = UI.audio;
	const next = _pickFromPool(pool, stateKey);
	audio.src = _bgmSrc(next);
	if (!Session.muted) {
		if (fadeIn && MIX.bgm) MIX.bgm.gain.value = 0;
		_tryPlayAudio();
		if (fadeIn) _fadeBGM(Session.volume);
	}
}

function transitionBGM(state) {
	if (state === _bgmState) return;
	if (_bgmFadeTimeout) clearTimeout(_bgmFadeTimeout);
	const prevState = _bgmState;
	_bgmState = state;
	const pool = BGM_POOL[state] ?? BGM_POOL.menu;
	if (prevState !== null) {
		_fadeBGM(0);
	}
	_bgmFadeTimeout = setTimeout(
		() => {
			_bgmFadeTimeout = null;
			_playFromPool(pool, state, true);
		},
		prevState !== null ? BGM_FADE_DURATION * 1000 : 0,
	);
	if (state === BGM_STATE.GAMEPLAY) {
		for (const t of BGM_POOL.gameplay) _prefetchBGM(t);
	} else if (BGM_POOL[state]) {
		for (const t of BGM_POOL[state]) _prefetchBGM(t);
	}
}

// Load settings from save
const _initSettings = loadSave().settings;
const _def = DEFAULT_SETTINGS();
Session.muted = _initSettings.bgmMuted;
Session.sfxMuted = _initSettings.sfxMuted;
Session.volume = _initSettings.bgmVolume;
Session.screenShake = _initSettings.screenShake ?? _def.screenShake;
Session.ceremonies = _initSettings.ceremonies ?? _def.ceremonies;
Session.minigames = _initSettings.minigames ?? _def.minigames;
Session.sfxVolume = _initSettings.sfxVolume ?? _def.sfxVolume;
Session.assistDisableUrgent = _initSettings.assistDisableUrgent ?? _def.assistDisableUrgent;
Session.assistInfiniteTime = _initSettings.assistInfiniteTime ?? _def.assistInfiniteTime;
Session.assistEasyMatch = _initSettings.assistEasyMatch ?? _def.assistEasyMatch;
Session.assistNoFail = _initSettings.assistNoFail ?? _def.assistNoFail;
// Migrate old boolean assistParamGuide to three-way string
const _rawGuide = _initSettings.assistParamGuide;
Session.assistParamGuide = typeof _rawGuide === "boolean" ? (_rawGuide ? "gradient" : "off") : (_rawGuide ?? _def.assistParamGuide);
Session.assistFreeGuide = _initSettings.assistFreeGuide ?? _def.assistFreeGuide;

function initAudio() {
	const audio = UI.audio,
		btn = UI.buttons.mute;
	audio.volume = 1;
	audio.muted = false;

	function wire() {
		if (!_actx || !MIX.master) return;
		if (MIX.sfx) MIX.sfx.gain.value = Session.sfxVolume;
		try {
			_actx.createMediaElementSource(audio).connect(MIX.bgm);
		} catch {}
		MIX.bgm.gain.value = Session.muted ? 0 : Session.volume;
	}

	createMixGraph();
	wire();
	if (!_audioReady) _pendingAudioInit.push(wire);

	if (btn) {
		btn.textContent = "BGM";
		btn.style.color = Session.muted ? "var(--text-dim)" : "var(--blue)";
	}
	const sfxBtn = UI.buttons.sfx;
	if (sfxBtn) {
		sfxBtn.textContent = "SFX";
		sfxBtn.style.color = Session.sfxMuted ? "var(--text-dim)" : "var(--blue)";
	}
	audio.addEventListener("ended", () => {
		const pool = BGM_POOL[_bgmState] ?? BGM_POOL.menu;
		_playFromPool(pool, _bgmState, true);
	});
}

function startMusic() {
	const audio = UI.audio;
	if (Session.muted || !audio.paused) return;
	if (!audio.src || audio.ended) {
		const pool = BGM_POOL[_bgmState] ?? BGM_POOL.menu;
		audio.src = _bgmSrc(_pickFromPool(pool, _bgmState));
		MIX.bgm.gain.value = 0;
	}
	audio.play();
	_fadeBGM(Session.volume);
}

function toggleMute() {
	Session.muted = !Session.muted;
	const audio = UI.audio,
		btn = UI.buttons.mute;
	SFX.toggle(!Session.muted);
	if (_bgmFadeTimeout) clearTimeout(_bgmFadeTimeout);
	const save = loadSave();
	save.settings.bgmMuted = Session.muted;
	writeSave(save);
	if (btn) {
		btn.textContent = "BGM";
		btn.style.color = Session.muted ? "var(--text-dim)" : "var(--blue)";
	}
	const stg = document.getElementById("stg-bgm");
	if (stg) {
		stg.textContent = Session.muted ? "OFF" : "ON";
		stg.classList.toggle("on", !Session.muted);
	}
	if (Session.muted) {
		_fadeBGM(0);
		_bgmFadeTimeout = setTimeout(() => {
			_bgmFadeTimeout = null;
			if (!audio.paused) audio.pause();
		}, BGM_FADE_DURATION * 1000);
	} else {
		if (audio.ended || !audio.src) {
			const pool = BGM_POOL[_bgmState] ?? BGM_POOL.menu;
			audio.src = _bgmSrc(_pickFromPool(pool, _bgmState));
		}
		MIX.bgm.gain.value = 0;
		audio.play();
		_fadeBGM(Session.volume);
	}
}

function toggleSfxMute() {
	Session.sfxMuted = !Session.sfxMuted;
	const btn = UI.buttons.sfx;
	SFX.toggle(!Session.sfxMuted);
	const save = loadSave();
	save.settings.sfxMuted = Session.sfxMuted;
	writeSave(save);
	if (btn) {
		btn.textContent = "SFX";
		btn.style.color = Session.sfxMuted ? "var(--text-dim)" : "var(--blue)";
	}
	const stg = document.getElementById("stg-sfx");
	if (stg) {
		stg.textContent = Session.sfxMuted ? "OFF" : "ON";
		stg.classList.toggle("on", !Session.sfxMuted);
	}
}

// ─── SFX ─────────────────────────────────────────────────────────────────────

const AudioCtx = (() => {
	try {
		return window.AudioContext || window.webkitAudioContext;
	} catch (err) {
		console.warn(`Audio context unavailable (private browsing?):`, err);
		return null;
	}
})();

let _actx = null;
let _audioReady = false;
const _pendingAudioInit = [];

function _flushPendingAudio() {
	for (const fn of _pendingAudioInit) fn();
	_pendingAudioInit.length = 0;
}

function _initAudioOnGesture() {
	if (_audioReady) return;
	_audioReady = true;
	_actx = new AudioCtx();
	_flushPendingAudio();
}

function actx() {
	return _actx;
}

function _tryPlayAudio() {
	UI.audio.play().catch(() => {
		UI.audio.addEventListener("canplay", () => UI.audio.play().catch(() => {}), { once: true });
	});
}

let _lastSliderSfx = 0;

// ── SFX helpers ───────────────────────────────────────────────────────────────

function _warmNote(ac, freq, startTime, gain, duration, detune = 4) {
	const t = startTime;
	const attack = 0.008;

	const filterOpen = 1800; // Hz — where the filter "opens" to
	const filterClosed = 400; // Hz — dark starting point

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
	moogOsc(freq + detune, gain * 0.5); // detuned second osc, slightly quieter
}

// ── Lock variations ───────────────────────────────────────────────────────────
// Five distinct melodic personalities, all warm triangle + detuned twin.
// Picked randomly on each win so 35 locks/playthrough don't feel repetitive.

const _LOCK_GAIN = 0.08;
const _LOCK_VARIANTS = [
	// A: "happy bounce" — ascending C chord, quick and cheerful
	ac => {
		[
			[523, 0],
			[659, 0.07],
			[784, 0.14],
			[1047, 0.21],
		].forEach(([f, t]) => void _warmNote(ac, f, ac.currentTime + t, _LOCK_GAIN, 0.22 + Math.floor(stampRand() * 4)));
	},

	// B: "smug little nod" — 3 notes, last one wobbles like it's pleased with itself
	ac => {
		[
			[440, 0],
			[554, 0.08],
			[659, 0.16],
		].forEach(([f, t]) => void _warmNote(ac, f, ac.currentTime + t, _LOCK_GAIN, 0.26));
		// wobble on the last note
		const o = ac.createOscillator(),
			g = ac.createGain();
		o.type = "triangle";
		o.frequency.value = 659;
		o.frequency.linearRampToValueAtTime(698, ac.currentTime + 0.28);
		o.frequency.linearRampToValueAtTime(659, ac.currentTime + 0.36);
		g.gain.setValueAtTime(0, ac.currentTime + 0.16);
		g.gain.linearRampToValueAtTime(0.03, ac.currentTime + 0.18);
		g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
		o.connect(g);
		g.connect(MIX.sfx);
		o.start(ac.currentTime + 0.16);
		o.stop(ac.currentTime + 0.42);
	},

	// C: "lil fanfare" — 5 notes, bounces back to middle, feels playful
	ac => {
		[
			[392, 0],
			[523, 0.07],
			[659, 0.14],
			[523, 0.2],
			[784, 0.28],
		].forEach(([f, t]) => void _warmNote(ac, f, ac.currentTime + t, _LOCK_GAIN, 0.2));
	},

	// D: "soft bloop" — just 2 notes, understated, like a quiet thumbs up
	ac => {
		[
			[440, 0],
			[659, 0.1],
		].forEach(([f, t]) => void _warmNote(ac, f, ac.currentTime + t, _LOCK_GAIN, 0.28, 6));
	},

	// E: "wobbly high five" — 3 notes climbing, last one slides up a bit, triumphant but goofy
	ac => {
		[
			[523, 0],
			[784, 0.09],
			[1047, 0.18],
		].forEach(([f, t]) => void _warmNote(ac, f, ac.currentTime + t, _LOCK_GAIN, 0.2));
		const o = ac.createOscillator(),
			g = ac.createGain();
		o.type = "triangle";
		o.frequency.value = 1047;
		o.frequency.linearRampToValueAtTime(1175, ac.currentTime + 0.32);
		g.gain.setValueAtTime(0, ac.currentTime + 0.18);
		g.gain.linearRampToValueAtTime(0.06, ac.currentTime + 0.2);
		g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.38);
		o.connect(g);
		g.connect(MIX.sfx);
		o.start(ac.currentTime + 0.18);
		o.stop(ac.currentTime + 0.4);
	},
];

function _sfxNote(opts) {
	if (Session.sfxMuted) return;
	const ac = actx(),
		o = ac.createOscillator(),
		g = ac.createGain();
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
	g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (opts.dur || 0.1));
	o.connect(g);
	g.connect(MIX.sfx);
	o.start();
	o.stop(ac.currentTime + opts.dur);
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
		[
			[220, 0],
			[175, 0.11],
			[130, 0.24],
		].forEach(([f, t]) => void _warmNote(ac, f, ac.currentTime + t, 0.11, 0.22, 3));
	},

	skip: () => _sfxNote({ type: "triangle", freq: 330, freqEnd: 200, freqRampTime: 0.12, gainStart: 0, gain: 0.12, dur: 0.2 }),

	skipBroke: () => _sfxNote({ type: "sawtooth", freq: 180, gain: 0.08, dur: 0.14 }),

	hint: () => _sfxNote({ freq: 660, freqEnd: 880, freqRampTime: 0.12, gainStart: 0, gain: 0.1, dur: 0.22 }),

	hintBroke: () => {
		if (Session.sfxMuted) return;
		const ac = actx(),
			o = ac.createOscillator(),
			g = ac.createGain();
		o.type = "sine";
		o.frequency.value = 660;
		o.frequency.linearRampToValueAtTime(720, ac.currentTime + 0.04);
		o.frequency.linearRampToValueAtTime(380, ac.currentTime + 0.12);
		g.gain.setValueAtTime(0, ac.currentTime);
		g.gain.linearRampToValueAtTime(0.08, ac.currentTime + 0.008);
		g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.16);
		o.connect(g);
		g.connect(ac.destination);
		o.start();
		o.stop(ac.currentTime + 0.18);
	},

	levelUp: () => {
		if (Session.sfxMuted) return;
		const ac = actx();
		[
			[330, 0],
			[392, 0.1],
			[494, 0.2],
			[659, 0.32],
			[880, 0.44],
		].forEach(([f, t]) => void _warmNote(ac, f, ac.currentTime + t, 0.12, 0.12));
	},

	nav: () => _sfxNote({ freq: 660, gain: 0.08, dur: 0.04 }),

	back: () => _sfxNote({ freq: 600, freqEnd: 480, freqRampTime: 0.06, gain: 0.07, dur: 0.1 }),

	confirm: () => _sfxNote({ freq: 520, freqEnd: 740, freqRampTime: 0.07, gain: 0.09, dur: 0.1 }),

	reset: () => {
		_sfxNote({ freq: 880, gain: 0.1, dur: 0.05 });
		setTimeout(() => _sfxNote({ freq: 1100, gain: 0.08, dur: 0.05 }), 60);
	},

	toggle: on => _sfxNote({ type: "triangle", freq: on ? 660 : 400, gain: 0.06, dur: 0.04 }),

	urgent: () => _sfxNote({ type: "square", freq: 330, gain: 0.07, dur: 0.09 }),

	close: () => _sfxNote({ freq: 330, freqEnd: 440, freqRampTime: 0.15, gainStart: 0, gain: 0.05, dur: 0.24 }),
};

// ─── STAMP SYSTEM ─────────────────────────────────────────────────────────────
// Tactile rubber-stamp feedback. One stamp at a time, DOM-based, no canvas.
// Inspired by Threes / WarioWare micro-feedback — restrained, not juice-spam.

const STAMP_WORDS = {
	hint: ["BLIP", "PING", "TRACE", "WARMER"],
	hint_broke: ["NO SIGNAL", "FLAT BROKE", "INSUFFICIENT", "LOW FUNDS"],
	skip: ["ZONK", "STATIC", "DRIFT", "WHEEEE"],
	skip_broke: ["NOPE", "NO CREDIT", "HELD", "LOCKED OUT"],
	fail: ["DESYNC", "FZZZT", "LOST LOCK", "OVERLOAD"],
	success: ["LOCKED", "CLEAN", "DIALED", "SMOOTH"],
	combo_2: ["NICE", "SOLID", "ON FIRE", "DOUBLED"],
	combo_3: ["GREAT", "SMOKIN", "CRUSHING", "Tearin it up"],
	combo_5: ["AMAZING", "LEGENDARY", "FLAWLESS", "PLATINUM"],
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

	// Random scale start: squishes in from a different size each time
	const scaleStart = (1.2 + stampRand() * 1.0).toFixed(2);
	el.style.setProperty("--stamp-scale-start", `scale(${scaleStart})`);

	layer.appendChild(el);
	_activeStamp = el;

	// Self-remove after animation completes
	el.addEventListener(
		"animationend",
		() => {
			el.remove();
			if (_activeStamp === el) _activeStamp = null;
		},
		{ once: true },
	);
}

// ─── SIGNAL PLAYBACK ─────────────────────────────────────────────────────────

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
	sine: 1.0,
	square: Math.SQRT1_2, // 0.7071067811865476
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
	limiter: null,
	master: null,
};

let _clarityFilter = null;

function createMixGraph() {
	if (MIX.master) return;
	if (!_actx) {
		_pendingAudioInit.push(() => createMixGraph());
		return;
	}
	const ac = _actx;

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

	MIX.limiter = getLimiter();

	_clarityFilter = ac.createBiquadFilter();
	_clarityFilter.type = "highshelf";
	_clarityFilter.frequency.value = 2000;
	_clarityFilter.gain.value = 0;

	MIX.sfx.connect(MIX.mix);
	MIX.bgm.connect(MIX.mix);

	MIX.mix.connect(_clarityFilter);
	_clarityFilter.connect(MIX.glue);
	MIX.glue.connect(MIX.limiter);
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
	const now = (_actx ?? actx()).currentTime;
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
const AUDIO_MIN_HZ = 110,
	AUDIO_MAX_HZ = 220;
const FREQ_MIN = 1,
	FREQ_MAX = 8;
const INV_FREQ_RANGE = 1 / (FREQ_MAX - FREQ_MIN);
const AUDIO_EXP_FACTOR = Math.log(AUDIO_MAX_HZ / AUDIO_MIN_HZ);

const freqToHz = freq => AUDIO_MIN_HZ * Math.exp((freq - FREQ_MIN) * INV_FREQ_RANGE * AUDIO_EXP_FACTOR);

function _emptyChannel() {
	return { osc: null, modOsc: null, carGain: null, modGain: null, ampGain: null, filter: null, masterGain: null, type: "" };
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
	setTimeout(
		() => {
			[snap.osc, snap.modOsc].forEach(n => {
				try {
					n?.stop();
				} catch {}
			});
			[snap.carGain, snap.modGain, snap.ampGain, snap.filter, snap.masterGain].forEach(n => {
				try {
					n?.disconnect();
				} catch {}
			});
		},
		(PB.FADE + 0.05) * 1000,
	);
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
	let modOsc = null,
		carGain = null,
		modGain = null;
	if (isAM) {
		modOsc = ac.createOscillator();
		modOsc.type = "sine";
		modOsc.frequency.value = hz * 0.25; // modulate at 1/4 carrier freq

		carGain = ac.createGain();
		carGain.gain.value = 1; // baseline carrier level

		modGain = ac.createGain();
		modGain.gain.value = Math.max(0.1, sig.harm || 0.5) * 0.8; // mod depth

		modOsc.connect(modGain);
		modGain.connect(carGain.gain); // modulates carGain.gain around 1
		osc.connect(carGain);
	}

	const normCoeff = WAVEFORM_GAIN[sig.type] ?? 1.0;
	const ampGain = ac.createGain();
	ampGain.gain.value = sig.amp * 0.1 * normCoeff;

	// masterGain: mute/unmute this channel (mode switching).
	// Feeds into the shared limiter, not directly to destination.
	const masterGain = ac.createGain();
	masterGain.gain.setValueAtTime(0, now); // start silent — mode sets volume

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

	// ── store ─────────────────────────────────────────────────────────────────
	ch.osc = osc;
	ch.modOsc = modOsc;
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
	if (!_playbackActive) {
		_updatePlaybackUI();
		return;
	}

	const t = mode === "target" || mode === "ab" ? PB.TARGET_VOL : 0;
	const y = mode === "yours" || mode === "ab" ? PB.YOURS_VOL : 0;
	_setVol(_chTarget, t);
	_setVol(_chYours, y);
	_updatePlaybackUI();

	if (UI.scopeWrap) {
		UI.scopeWrap.classList.remove("glow-target", "glow-yours", "glow-ab");
		if (mode !== "off") UI.scopeWrap.classList.add(`glow-${mode}`);
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
	modes.forEach(mode => void UI.playback[mode]?.classList.toggle("active", _pbMode === mode && _playbackActive));
}

// ─── MATH ────────────────────────────────────────────────────────────────────

function smoothstep(x) {
	return x * x * (3 - 2 * x);
}
function sigmoid(x) {
	return 1 / (1 + Math.exp(-8 * (x - 0.5)));
}

// ─── SINE LUT ────────────────────────────────────────────────────────────────

const LUT_SIZE = 8192,
	MASK = LUT_SIZE - 1,
	SCALE = LUT_SIZE / (Math.PI * 2);
const SIN_LUT = new Float32Array(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) SIN_LUT[i] = Math.sin((i / LUT_SIZE) * Math.PI * 2);

function fastSin(x) {
	const pos = x * SCALE,
		idx = Math.floor(pos),
		iA = idx & MASK,
		a = SIN_LUT[iA];
	return a + (SIN_LUT[iA + 1] - a) * (pos - idx);
}

// ─── SIGNAL SAMPLING ─────────────────────────────────────────────────────────

const SAMPLERS = Object.freeze({
	sine: (x, _u, _harm) => fastSin(x),
	square: (x, _u, _harm) => (fastSin(x) >= 0 ? 1 : -1),
	sawtooth: (_x, u, _harm) => 2 * u - 1,
	triangle: (_x, u, _harm) => (u < 0.5 ? 4 * u - 1 : 3 - 4 * u),
	pwm: (_x, u, _harm) => (u < 0.65 ? 1 : -1),
	am: (x, _u, harm) => fastSin(x) * (1 + (harm || 0.5) * fastSin(x * 0.25)) * 0.5,
});

const INV_360 = 1 / 360;

function wrapUnit(u) {
	u -= Math.floor(u);
	return u;
}

function sample(sig, t, addNoise) {
	if (!sig) return 0;
	const { type, freq, phase, amp, harm, noise, dc } = sig;
	let u = wrapUnit(freq * t + phase * INV_360);
	if (u < 0) u += 1;
	const x = u * Math.PI * 2;
	if (!SAMPLERS[type]) throw new Error(`Unhandled waveform: "${type}"`);
	let v = SAMPLERS[type](x, u, harm);
	if (harm && type !== "am") v += harm * SIG_SCALE.HARM * fastSin(x * SIG_SCALE.HARM_MULTIPLE);
	if (addNoise && noise) v += noise * SIG_SCALE.NOISE * (gameRand() * SIG_SCALE.NOISE_RANGE - SIG_SCALE.NOISE_RANGE / 2);
	return amp * SIG_SCALE.AMP * v + (dc ?? 0) * SIG_SCALE.DC;
}

// ─── MATCH SCORE ────────────────────────────────────────────────────────────

function normalizePhase(phase) {
	return wrapUnit(phase * INV_360);
} // let u=phase/360; if(u>=1)u-=1;else if(u<0)u+=1;return u;

/**
 * Zenith matchScore (v2.0)
 * Uses Phase Accumulators to eliminate 200 multiplications per call.
 * Logic is unrolled to remove the overhead of the sample() wrapper.
 * Note: matchScore intentionally does NOT add noise.
 * Noise is visual/atmospheric — scoring uses clean samples only.
 */
function matchScore() {
	if (!_matchScoreDirty) return _cachedMatchScore;

	const tS = targetSignal ?? buildTarget(),
		yS = yoursSignal;

	const TWO_PI = Math.PI * 2;
	const invS = INV_SCORE_SAMPLES;

	// Hoist variables into local registers for the CPU
	const samplerT = SAMPLERS[tS.type];
	const samplerY = SAMPLERS[yS.type];

	if (!samplerT) throw new Error(`Unhandled waveform: "${tS.type}"`);
	if (!samplerY) throw new Error(`Unhandled waveform: "${yS.type}"`);
	if (!samplerT || !samplerY) {
		_matchScoreDirty = false;
		return 0;
	}

	// ─── ACCUMULATOR SETUP ─────────────────────────────────────────────────
	// Pre-calculate initial phases [0, 1]
	let uT = normalizePhase(tS.phase);
	let uY = normalizePhase(_smoothPhase);

	// Pre-calculate fixed phase steps (increments) per sample
	const stepT = tS.freq * invS;
	const stepY = yS.freq * invS;

	const ampT = tS.amp * SIG_SCALE.AMP;
	const ampY = yS.amp * SIG_SCALE.AMP;
	const dcT = (tS.dc ?? 0) * SIG_SCALE.DC;
	const dcY = (yS.dc ?? 0) * SIG_SCALE.DC;
	const harmT = tS.harm;
	const harmY = yS.harm;

	let dSum = 0;

	// ─── THE HOT LOOP ──────────────────────────────────────────────────────
	// This loop is now branchless and multiplication-lite.
	for (let i = 0; i < SCORE_SAMPLES; i++) {
		// Target Signal (Specialized Inlined Sampling)
		const xT = uT * TWO_PI;
		let vT = samplerT(xT, uT, harmT);
		if (harmT && tS.type !== "am") vT += harmT * SIG_SCALE.HARM * fastSin(xT * SIG_SCALE.HARM_MULTIPLE);
		const valT = vT * ampT + dcT;

		// Yours Signal (Specialized Inlined Sampling)
		const xY = uY * TWO_PI;
		let vY = samplerY(xY, uY, harmY);
		if (harmY && yS.type !== "am") vY += harmY * SIG_SCALE.HARM * fastSin(xY * SIG_SCALE.HARM_MULTIPLE);
		const valY = vY * ampY + dcY;

		// Absolute Difference
		const diff = valT - valY;
		dSum += diff < 0 ? -diff : diff;

		// LINEAR ACCUMULATION (Instead of i * step)
		uT += stepT;
		if (uT >= 1) uT -= 1;
		uY += stepY;
		if (uY >= 1) uY -= 1;
	}

	// Wrap-up and cache
	const raw = 1 - dSum * SCORE_SCALE;
	_cachedMatchScore = raw < 0 ? 0 : raw > 1 ? 1 : raw; // Compact: Math.min(1, Math.max(0, raw));
	_matchScoreDirty = false;
	return _cachedMatchScore;
}

// ─── MATCH SCORE (CACHED) ─────────────────────────────────────────────────────

const SCORE_SAMPLES = 96,
	INV_SCORE_SAMPLES = 1 / 96,
	SCORE_SCALE = 1 / (2 * 96);
let _cachedMatchScore = 0,
	_matchScoreDirty = true;

function invalidateMatchScore() {
	_matchScoreDirty = true;
}

// ─── PARAM GRADIENT ASSIST ───────────────────────────────────────────────────
//
// This is a LOCAL GRADIENT PROBE, NOT a fixed target-value indicator.
//
// For each of the 5 parameters it:
//   1. Computes the baseline match score with current values.
//   2. Nudges the param UP by a small step → measures score change.
//   3. Nudges the param DOWN by the same step → measures score change.
//   4. Restores original value.
//
// The arrows show only which direction improves the score from where you are
// right now (▲ = up helps, ▼ = down helps, • = locally optimal). Because
// parameters interact (amplitude changes affect DC offset's relative impact,
// phase shifts sample alignment, etc.), adjusting one param can change the
// gradient for others — so arrows shift dynamically.
//
// LIMITATION: This is a local gradient, not a global optimum finder. A ▼
// arrow means "lowering helps right now" but does not say how far. The
// step size in GRADIENT_STEPS also affects sensitivity — too large and
// the gradient misses fine optima, too small and score noise dominates.

const GRADIENT_STEPS = { freq: 1, amp: 0.5, phase: 5, dc: 0.5, harm: 0.5 };

function paramGradient() {
	if (!targetSignal || Round.won || Session.freePlayActive) return null;
	_smoothPhase = yoursSignal.phase;
	const base = matchScore();
	const result = {};

	for (const [param, step] of Object.entries(GRADIENT_STEPS)) {
		const saved = yoursSignal[param];

		yoursSignal[param] = saved + step;
		if (param === "phase") _smoothPhase = yoursSignal.phase;
		_matchScoreDirty = true;
		const scoreUp = matchScore();

		yoursSignal[param] = saved - step;
		if (param === "phase") _smoothPhase = yoursSignal.phase;
		_matchScoreDirty = true;
		const scoreDown = matchScore();

		yoursSignal[param] = saved;
		if (param === "phase") _smoothPhase = yoursSignal.phase;
		_matchScoreDirty = true;

		const best = Math.max(scoreUp, scoreDown);
		if (best <= base) {
			result[param] = { dir: 0, magnitude: 0 };
		} else {
			result[param] = {
				dir: scoreUp >= scoreDown ? 1 : -1,
				magnitude: best - base,
			};
		}
	}

	return result;
}

// Strategy B: direct target comparison.
// For each param, compare yoursSignal against targetSignal.
// Direction ▲/▼ shows whether to increase or decrease toward the target.
// Magnitude is |diff| / range, normalized to [0, 1].
// Unlike the probe (Strategy A), arrows NEVER shift when you change
// other params — each arrow depends only on that param vs the target.
function paramGradientTargetDelta() {
	if (!targetSignal || Round.won || Session.freePlayActive) return null;
	const result = {};
	for (const p of DRAG_PARAMS) {
		const paramId = p.id;
		const target = targetSignal[paramId];
		const current = yoursSignal[paramId];
		if (target === undefined || current === undefined) continue;
		const diff = target - current;
		const range = p.max - p.min;
		const magnitude = Math.min(Math.abs(diff) / range, 1);
		if (Math.abs(diff) < p.step * 0.5) {
			result[paramId] = { dir: 0, magnitude: 0 };
		} else {
			result[paramId] = {
				dir: Math.sign(diff),
				magnitude,
			};
		}
	}
	return result;
}

// biome-ignore lint/correctness/noUnusedVariables: Call from DevTools to A/B test both strategies: abCompareParamGradients()
function abCompareParamGradients() {
	const probe = paramGradient();
	const direct = paramGradientTargetDelta();
	if (!probe || !direct) {
		console.log("[AB] one or both strategies unavailable");
		return;
	}
	for (const param of Object.keys(probe)) {
		const a = probe[param],
			b = direct[param];
		if (a && b && a.dir !== b.dir && a.dir !== 0 && b.dir !== 0) {
			console.log(
				"[AB] probe=%s direct=%s param=%s yours=%s target=%s",
				a.dir > 0 ? "▲" : "▼",
				b.dir > 0 ? "▲" : "▼",
				param,
				yoursSignal[param],
				targetSignal[param],
			);
		}
	}
}

function updateParamArrows() {
	const arrows = document.querySelectorAll(".param-arrow");
	const guideOn = Session.assistParamGuide;
	const affordable = Session.postGameFreeplay || Session.assistFreeGuide || Session.score >= CONFIG.COST_HINT;

	if (guideOn === "off" || !affordable || Round.won || !targetSignal || Session.freePlayActive) {
		arrows.forEach(el => {
			el.textContent = "";
			el.className = "param-arrow";
		});
		return;
	}

	if (yoursSignal.type !== targetSignal.type) {
		arrows.forEach(el => {
			el.textContent = "";
			el.className = "param-arrow";
		});
		return;
	}

	const gradient = Session.assistParamGuide === "direct" ? paramGradientTargetDelta() : paramGradient();
	if (!gradient) {
		arrows.forEach(el => {
			el.textContent = "";
		});
		return;
	}

	arrows.forEach(el => {
		const param = el.dataset.param;
		const g = gradient[param];
		if (!g) return;

		if (g.dir === 0) {
			el.textContent = "•";
			el.className = "param-arrow arrow-ok";
		} else {
			el.textContent = g.dir > 0 ? "▲" : "▼";
			const strong = g.magnitude > 0.05;
			el.className = `param-arrow ${strong ? "arrow-strong" : "arrow-soft"}`;
		}
	});
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
	const easyMatchWinPCT = 88;
	if (Session.assistEasyMatch && yoursSignal.type === targetSignal.type) return easyMatchWinPCT;
	if (yoursSignal.type !== targetSignal.type) return 99;
	const noiseReduction = (targetSignal.noise ?? 0) * CONFIG.NOISE_TOLERANCE_PER_UNIT;
	return Math.max(75, CONFIG.WIN_PERCENTAGE - noiseReduction);
}

// ─── CANVAS ───────────────────────────────────────────────────────────────────

let _canvas;
let _ctx;
let _canvasW = 320;

function initCanvas() {
	_canvas = /** @type {HTMLCanvasElement} */ (UI.canvas);
	_ctx = _canvas.getContext("2d");
	if (typeof ResizeObserver !== "undefined") {
		new ResizeObserver(entries => {
			_canvasW = Math.round(entries[0].contentRect.width) || 320;
		}).observe(_canvas);
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
	DT_MAX: 15.0,
	FRAME_INDEPENDENT: true,
	SCROLL_BASE_MS: 3500,
	SCROLL_MIN_MS: 2000,
	SCROLL_EASE_EXP: PHI,
	SCROLL_EASE_FACTOR: 60,
	LOCK_MS: 1950,
	TIMER_CIRC: 125.6,
	LOGO_SPEED: 0.00045,
};

// `elapsedTime` grows smoothly regardless of frame rate.
// Dividing by getScrollPeriod() gives consistent scroll speed across all frame rates.
let _elapsedTime = 0;

function getScrollPeriod() {
	return Math.max(RENDER.SCROLL_MIN_MS, RENDER.SCROLL_BASE_MS - Session.level ** RENDER.SCROLL_EASE_EXP * RENDER.SCROLL_EASE_FACTOR);
}

let _lastTime = 0;

let _meterSquashT = 0;
let _meterWinSlinkyT = 0;
let _springAmp = 0.08,
	_springFreq = 6,
	_springSettle = 0.1;
let _celebTargetAmp = 0.12,
	_celebTargetFreq = 4,
	_celebYoursAmp = 0.15,
	_celebYoursFreq = 5;

// 1.3 is roughly a quarter-period offset — enough that they drift visibly
// against each other without ever being perfectly opposed. You can also
// try Math.PI * 0.5 (exact quarter phase) or Math.PI (fully opposed,
// mirror-image jelly) depending on which feel you like.
const YOURS_SIGNAL_WOBBLE_PHASES = [1.3, Math.PI * 0.5, Math.PI * 0.618, Math.PI * 0.85, Math.PI];
const MAX_YOURS_SIGNAL_WOBBLE_PHASES = YOURS_SIGNAL_WOBBLE_PHASES.length;

// Per-wave target wobble personality profiles
const WOBBLE_TARGET_PROFILES = {
	sine: { amp: 2.5, freq: 3.0, speed: 0.001 },
	square: { amp: 4.0, freq: 1.5, speed: 0.0008 },
	sawtooth: { amp: 3.0, freq: 5.0, speed: 0.0014 },
	triangle: { amp: 1.5, freq: 3.5, speed: 0.0009 },
	pwm: { amp: 4.5, freq: 1.0, speed: 0.001 },
	am: { amp: 2.5, freq: 2.0, speed: 0.0007 },
};

// Per-wave your-signal wobble personality profiles
const WOBBLE_YOURS_PROFILES = {
	sine: { amp: 2.0, freq: 5.5, speed: 0.0025 },
	square: { amp: 3.5, freq: 2.5, speed: 0.002 },
	sawtooth: { amp: 3.0, freq: 7.0, speed: 0.003 },
	triangle: { amp: 1.2, freq: 4.0, speed: 0.002 },
	pwm: { amp: 4.0, freq: 2.0, speed: 0.0025 },
	am: { amp: 2.5, freq: 6.0, speed: 0.0018 },
};

// Each waveform type has its own celebration dance personality
const CELEBRATION_PROFILES = {
	sine: { targetAmp: 0.08, targetFreq: 4.0, yoursAmp: 0.1, yoursFreq: 5.0 },
	square: { targetAmp: 0.2, targetFreq: 1.5, yoursAmp: 0.25, yoursFreq: 2.0 },
	sawtooth: { targetAmp: 0.15, targetFreq: 5.0, yoursAmp: 0.18, yoursFreq: 6.0 },
	triangle: { targetAmp: 0.07, targetFreq: 3.0, yoursAmp: 0.09, yoursFreq: 4.0 },
	pwm: { targetAmp: 0.22, targetFreq: 1.2, yoursAmp: 0.28, yoursFreq: 1.8 },
	am: { targetAmp: 0.12, targetFreq: 6.0, yoursAmp: 0.15, yoursFreq: 7.0 },
};

const RIPPLE_FREQ = 0.008;
const RIPPLE_SPEED = 4;

function loop(ts) {
	const dt = Math.min(ts - _lastTime, RENDER.DT_MAX);
	_elapsedTime += dt;

	// Smooth phase toward slider value every frame
	let phaseDelta = yoursSignal.phase - _smoothPhase;
	if (phaseDelta > 180) phaseDelta -= 360;
	if (phaseDelta < -180) phaseDelta += 360;
	const _smoothFactor = 1 - Math.exp(-dt / 80);
	_smoothPhase += phaseDelta * _smoothFactor;
	if (_smoothPhase >= 360) _smoothPhase -= 360;
	if (_smoothPhase < 0) _smoothPhase += 360;
	if (Math.abs(_smoothPhase - yoursSignal.phase) < 0.1) _smoothPhase = yoursSignal.phase;
	invalidateMatchScore();

	/**
	 * Normalized scroll position [0, 1). Wraps every SCROLL_PERIOD ms.
	 * Example: _elapsedTime = 4000ms → 4000/2000 = 2.0 → 2.0 % 1 = 0.0 (loops)
	 * Used for horizontal wave scrolling position.
	 */
	const period = getScrollPeriod();
	const scroll = RENDER.FRAME_INDEPENDENT ? (_elapsedTime / period) % 1 : (ts / period) % 1;

	const targetW = _canvasW;
	const targetH = 120;
	if (_canvas.width !== targetW || _canvas.height !== targetH) {
		_canvas.width = targetW;
		_canvas.height = targetH;
	}
	_ctx.clearRect(0, 0, targetW, targetH);

	const sc = matchScore(),
		t = smoothstep(sc);
	const _smoothYoursSig = { ...yoursSignal, phase: _smoothPhase };
	const _targetWobble = WOBBLE_TARGET_PROFILES[targetSignal?.type ?? "sine"];
	const _yoursWobble = WOBBLE_YOURS_PROFILES[_smoothYoursSig.type ?? "sine"];
	const LOCK_DUR = RENDER.LOCK_MS;
	let lockT = 0;
	if (Round._lockAnimStart > 0) {
		// Freeze scroll at lock moment for micro-replay effect
		if (Round._lockScrollPos < 0) {
			Round._lockScrollPos = scroll;
			_springAmp = 0.06 + gameRand() * 0.05;
			_springFreq = 4 + gameRand() * 4;
			_springSettle = 0.08 + gameRand() * 0.05;
			const profile = CELEBRATION_PROFILES[targetSignal?.type] ?? CELEBRATION_PROFILES.sine;
			_celebTargetAmp = profile.targetAmp;
			_celebTargetFreq = profile.targetFreq;
			_celebYoursAmp = profile.yoursAmp;
			_celebYoursFreq = profile.yoursFreq;
		}
		lockT = Math.min((ts - Round._lockAnimStart) / LOCK_DUR, 1);
		if (lockT >= 1) {
			Round._lockAnimStart = 0;
			Round._lockScrollPos = -1;
		}
	}

	const _impactStr = lockT > 0 ? Math.max(0, 1 - lockT * 2.5) : 0;

	let _scrollOff = 0;
	if (Round._lockScrollPos >= 0) {
		const t2 = lockT;
		const decay = Math.exp(-t2 * 2);
		const osc = Math.cos(t2 * Math.PI * _springFreq);
		_scrollOff = -_springAmp * decay * osc + _springSettle * (1 - Math.exp(-t2 * 2.5));
	}
	const repScroll = Round._lockScrollPos >= 0 ? (Round._lockScrollPos + _scrollOff + 1) % 1 : scroll;

	const YOURS_SIGNAL_WOBBLE_PHASE = YOURS_SIGNAL_WOBBLE_PHASES[Math.min(Math.min(5, MAX_YOURS_SIGNAL_WOBBLE_PHASES), Session.level)]; // Decrease wobbling as rounds get harder

	if (lockT > 0 && lockT < 1) {
		// Radar ring emanates from scope center during lock
		_ctx.globalAlpha = Math.max(0, 0.25 * (1 - lockT / 0.6));
		for (let r = 0; r < 3; r++) {
			const t = lockT;
			const smoothLock = t * t * (3 - 2 * t);
			const rad = smoothLock * targetW * 0.55 + r * 20;
			const wobble = fastSin(_elapsedTime * 0.008 + r * 2.1) * 3 * (1 - t);
			_ctx.beginPath();
			_ctx.arc(targetW * 0.5, targetH * 0.5, Math.max(1, rad + wobble), 0, Math.PI * 2);
			_ctx.strokeStyle = "#66ff88";
			_ctx.lineWidth = 1.5;
			_ctx.stroke();
		}
		const release = Math.min(Math.max((lockT - 0.1) / 0.6, 0), 1);

		_ctx.globalAlpha = 0.25 * (1 - release);
		if (targetSignal !== null)
			drawWave(
				targetSignal,
				"#448855",
				targetW,
				targetH,
				repScroll,
				1.5,
				0,
				{ ..._targetWobble, celebAmp: _celebTargetAmp, celebFreq: _celebTargetFreq },
				lockT,
				_impactStr,
			);

		const flash = Math.max(0, 1 - lockT / 0.35);
		_ctx.globalAlpha = flash * 0.7;
		drawWave(
			_smoothYoursSig,
			"#66ff88",
			targetW,
			targetH,
			repScroll,
			3 + 2 * flash,
			YOURS_SIGNAL_WOBBLE_PHASE,
			{ ..._yoursWobble, celebAmp: _celebYoursAmp, celebFreq: _celebYoursFreq },
			lockT,
			_impactStr,
		);

		const settle = Math.min(lockT / 0.25, 1);
		_ctx.globalAlpha = 0.4 + 0.6 * settle;
		drawWave(
			_smoothYoursSig,
			WAVE_COLORS.yours,
			targetW,
			targetH,
			repScroll,
			2,
			YOURS_SIGNAL_WOBBLE_PHASE,
			{ ..._yoursWobble, celebAmp: _celebYoursAmp, celebFreq: _celebYoursFreq },
			lockT,
			_impactStr,
		);
	} else {
		if (Round.roundNo === 1) {
			_ctx.globalAlpha = 0.1 + 0.65 * sigmoid(sc);
			if (targetSignal !== null) drawWave(targetSignal, "#00ff88", targetW, targetH, scroll, 4 / 2, 0, _targetWobble, lockT);
		} else if (Round.roundNo % 2 === 0) {
			_ctx.globalAlpha = 0.15 + 0.55 * Math.sqrt(sc);
			if (targetSignal !== null) drawWave(targetSignal, "#5b8dd9", targetW, targetH, scroll, 4 / 2, 0, _targetWobble, lockT);
		} else {
			_ctx.globalAlpha = 0.15 + 0.6 * t;
			if (targetSignal !== null) drawWave(targetSignal, WAVE_COLORS.target, targetW, targetH, scroll, (3 + sc) / 2, 0, _targetWobble, lockT);
		}

		_ctx.globalAlpha = 0.4 + 0.6 * t;
		if (Round.roundNo === 1) drawWave(_smoothYoursSig, "#ffb830", targetW, targetH, scroll, 4 / 2, YOURS_SIGNAL_WOBBLE_PHASE, _yoursWobble, lockT);
		else if (Round.roundNo % 2 === 0) drawWave(_smoothYoursSig, "#e8604a", targetW, targetH, scroll, 4 / 2, YOURS_SIGNAL_WOBBLE_PHASE, _yoursWobble, lockT);
		else drawWave(_smoothYoursSig, WAVE_COLORS.yours, targetW, targetH, scroll, 4 / 2, YOURS_SIGNAL_WOBBLE_PHASE, _yoursWobble, lockT);
	}

	_ctx.globalAlpha = 1;

	const mFill = UI.displays.fill;
	if (_meterWinSlinkyT > 0 && mFill) {
		_meterWinSlinkyT -= dt;
		if (_meterWinSlinkyT < 0) _meterWinSlinkyT = 0;
		const pct2 = Math.round(matchScore() * 100);
		const progress = 1 - _meterWinSlinkyT / 600;
		const amp = 0.35 * Math.exp(-progress * 3.5);
		const squash = 1 - amp * Math.cos(progress * Math.PI * 5);
		mFill.style.transform = `scaleX(${pct2 * 0.01}) scaleY(${squash})`;
	} else if (_meterSquashT > 0 && mFill) {
		_meterSquashT -= dt;
		if (_meterSquashT < 0) _meterSquashT = 0;
		const pct2 = Math.round(matchScore() * 100);
		const squash = 1 - (_meterSquashT / 300) * 0.3;
		mFill.style.transform = `scaleX(${pct2 * 0.01}) scaleY(${squash})`;
	}

	_lastTime = ts;
	animRaf = requestAnimationFrame(loop);
}

/**
 * @function drawWave
 * @description Renders a procedurally generated wave with a 'jelly wobble' effect.
 * * OPTIMIZATIONS USED:
 * 1. 2-Way Stride: Reduces loop bookkeeping overhead by 50%.
 * 2. LUT-Indexing: Replaces Math.sin() with a Float32Array lookup (Masked bitwise).
 * 3. Branch Hoisting: MoveTo is called before the loop to remove internal conditionals.
 * 4. Fast Wrapping: Replaces modulo (%) with subtraction for phase accumulation.
 */
function drawWave(sig, color, W, H, scroll, lineW, wobblePhase = 0, wobbleOpts = {}, lockT = 0, impactStr = 0) {
	const halfH = H * 0.5,
		yOffset = halfH - 10,
		invW = 1 / W;

	// Dynamic LOD: If the system is scheduled for a recompute (heavy load),
	// we double the step size to trade a bit of visual crispness for frame stability.
	const step = Round._recomputeScheduled ? 4 : 2;

	// ─── Wiggle Wiggle Wiggle ───────────────────────────────────────────────
	// Wobbling powered thanks to [Digital Squirm](https://ldjam.com/events/ludum-dare/59/digital-squirm-processing).
	// Canvas 2D only, so no GPU shader path. Jelly on canvas means perturbing
	// the y-position of each pixel column with a time-varying sine —
	// essentially adding a secondary wobble on top of the existing sample() output.

	// #1: Per-wave wobble personality (with sensible defaults)
	const baseAmp = wobbleOpts.amp ?? 2.5;
	const baseFreq = wobbleOpts.freq ?? 4.0;
	const baseSpeed = wobbleOpts.speed ?? 0.0018;

	// #3: Wobble frequency drift over time — gives a breathing quality
	const wobbleFreq = baseFreq + fastSin(_elapsedTime * 0.0003) * 1.5;
	const wobbleSpeed = baseSpeed;
	const t = _elapsedTime * wobbleSpeed + wobblePhase;

	// #2: Score-reactive wobble amplitude — jelly calms as match improves
	const scoreFactor = 1 - matchScore();

	// #4: Urgency amp spike — wave panics when time is low
	const urgencyBoost = Round.timeLeft <= 8 ? 1 + (8 - Round.timeLeft) * 0.15 : 1;

	// #5: Lock-in freeze — jelly solidifies on win with celebration dance
	const celebAmp = wobbleOpts.celebAmp ?? 0;
	const celebFreq = wobbleOpts.celebFreq ?? 0;
	const lockFactor = lockT > 0 ? 1 - lockT + celebAmp * Math.sin(lockT * Math.PI * celebFreq) * (1 - lockT) : 1;

	const wobbleAmp = baseAmp * scoreFactor * urgencyBoost * lockFactor;

	// ─── MATH SIMPLIFICATION ────────────────────────────────────────────────
	// We want the LUT index.
	// The base math is: (px * wobbleFreq * invW * 2PI + t) * (LUT_SIZE / 2PI)
	// The 2PIs cancel out, leaving: (px * wobbleFreq * invW * LUT_SIZE) + (t * SCALE)
	// We pre-calculate the 'lutStep' to avoid multiplication inside the hot path.
	const lutStep = wobbleFreq * invW * LUT_SIZE * step;
	let lutIndex = t * SCALE;

	// ─── PHASE ACCUMULATOR OPTIMIZATION ─────────────────────────────────────
	const phaseStep = step * invW;

	// Calculate initial phase. Adding 1.0 handles positive wrapping.
	// The if-statement acts as a fast modulo for negative JS scroll edge-cases.
	let sigPhase = (1.0 - scroll) % 1.0;
	if (sigPhase < 0) sigPhase += 1.0;

	_ctx.strokeStyle = color;
	_ctx.lineWidth = lineW || 1.8;
	_ctx.beginPath();

	// ─── IMPACT RIPPLE (lock celebration) ───────────────────────────────────
	const _impactActive = impactStr > 0;
	const _halfW = W * 0.5;
	const _impactPhase = lockT * RIPPLE_SPEED;

	// ─── HOIST INITIALIZATION (BRANCH ELIMINATION) ──────────────────────────
	// Handle px = 0 explicitly so we don't have an if-statement in the loop.
	// Direct lookup: floor the index and wrap it with the MASK bitwise.
	let jelly = SIN_LUT[(lutIndex | 0) & MASK] * wobbleAmp;
	_ctx.moveTo(0, halfH - sample(sig, sigPhase, true) * yOffset + jelly);

	// Advance 1 step to align loop with 'px = step'
	lutIndex += lutStep;
	sigPhase += phaseStep;

	// ─── THE ZENITH STRIDE ──────────────────────────────────────────────────
	// We process 2 samples per loop iteration. This reduces loop bookkeeping
	// overhead by 50% and provides the highest stable throughput in V8/Chrome.
	let px = step;
	const limit = W - step;
	const twoStep = step * 2;

	for (; px <= limit; px += twoStep) {
		// --- Sample A ---
		if (sigPhase >= 1.0) sigPhase -= 1.0; // Fast modulo subtraction
		jelly = SIN_LUT[(lutIndex | 0) & MASK] * wobbleAmp;
		const _dxA = Math.abs(px - _halfW);
		const _fA = Math.max(0, 1 - (_dxA / _halfW) * 2);
		const _rA = _impactActive ? impactStr * fastSin(_dxA * RIPPLE_FREQ + _impactPhase) * _fA * _fA * _fA : 0;
		_ctx.lineTo(px, halfH - sample(sig, sigPhase, true) * yOffset + jelly + _rA);

		lutIndex += lutStep;
		sigPhase += phaseStep;

		// --- Sample B ---
		if (sigPhase >= 1.0) sigPhase -= 1.0;
		jelly = SIN_LUT[(lutIndex | 0) & MASK] * wobbleAmp;
		const _dxB = Math.abs(px + step - _halfW);
		const _fB = Math.max(0, 1 - (_dxB / _halfW) * 2);
		const _rB = _impactActive ? impactStr * fastSin(_dxB * RIPPLE_FREQ + _impactPhase) * _fB * _fB * _fB : 0;
		_ctx.lineTo(px + step, halfH - sample(sig, sigPhase, true) * yOffset + jelly + _rB);

		lutIndex += lutStep;
		sigPhase += phaseStep;
	}

	// ─── CLEANUP ─────────────────────────────────────────────────────────────
	// Handle the remaining pixels if the canvas width isn't a multiple of our stride.
	for (; px <= W; px += step) {
		if (sigPhase >= 1.0) sigPhase -= 1.0;
		jelly = SIN_LUT[(lutIndex | 0) & MASK] * wobbleAmp;
		const _dx = Math.abs(px - _halfW);
		const _f = Math.max(0, 1 - (_dx / _halfW) * 2);
		const _r = _impactActive ? impactStr * fastSin(_dx * RIPPLE_FREQ + _impactPhase) * _f * _f * _f : 0;
		_ctx.lineTo(px, halfH - sample(sig, sigPhase, true) * yOffset + jelly + _r);

		lutIndex += lutStep;
		sigPhase += phaseStep;
	}

	_ctx.stroke();
}

// ─── FLASH + SCORE POP ───────────────────────────────────────────────────────

function flash(color) {
	const el = UI.displays.flash;
	el.style.background = color;
	el.classList.add("go");
	setTimeout(() => el.classList.remove("go"), 80);
}

function showScorePop(points) {
	const scoreEl = UI.displays.score;
	if (!scoreEl) return;
	const pop = UI.scorePop;
	pop.textContent = `+${points}`;
	pop.style.display = "block";
	scoreEl.parentElement.style.position = "relative";
	scoreEl.parentElement.appendChild(pop);

	const skew = (gameRand() * 12 - 6).toFixed(1);
	const squash = (0.85 + gameRand() * 0.1).toFixed(2);
	const s0 = +squash;
	pop.style.transform = `translateY(0) skewX(${skew}deg) scaleY(${s0})`;
	pop.style.opacity = "1";

	const startT = performance.now();
	const duration = 500;
	function animPop() {
		const t = Math.min((performance.now() - startT) / duration, 1);
		const p = 1 - t;
		const skewDeg = (skew * p).toFixed(1);
		let scaleY;
		if (t < 0.35) {
			scaleY = s0 + (1.12 - s0) * (t / 0.35);
		} else {
			scaleY = 1.12 - 0.12 * ((t - 0.35) / 0.65);
		}
		pop.style.transform = `translateY(${-36 * t}px) skewX(${skewDeg}deg) scaleY(${scaleY})`;
		pop.style.opacity = 1 - t;
		if (t < 1) {
			requestAnimationFrame(animPop);
			return;
		}
		pop.style.display = "none";
	}
	requestAnimationFrame(animPop);

	const gi = UI.gameInner;
	const g = UI.game;
	if (Session.screenShake) {
		gi.classList.add("shake-light");
		g.classList.add("shake-light");
		setTimeout(() => {
			gi.classList.remove("shake-light");
			g.classList.remove("shake-light");
		}, 300);
	}
}

// ─── METER ───────────────────────────────────────────────────────────────────

function updateMeter() {
	if (Round.won || Session.freePlayActive) return;

	const sc = matchScore();

	const pct = Math.round(sc * 100);
	if (pct !== Round._lastPct) {
		Round._lastPct = pct;

		UI.displays.pct.textContent = `${pct}%`;

		_meterSquashT = 300;
		const fill = UI.displays.fill;
		// DEPRECATE: fill.style.width = `${pct}%`;
		//            CSS add: min-width: 100%; lol (kinda works)
		fill.style.transform = `scaleX(${pct * 0.01}) scaleY(0.7)`;
		fill.style.background = pct > 80 ? "var(--green)" : pct > 50 ? "var(--amber)" : "var(--red)";
		fill.setAttribute("aria-valuenow", pct);
	}

	const fb = UI.displays.feedback;
	const winPct = winThreshold();

	// hold-at-95% was evaluated & shelved. Timer race condition (time expires during hold
	// before 500ms elapses) confirmed complexity cost. Flagged for lv7-12 when phase drift
	// and target instability add natural need for a confirmation window. See TODO.md.
	if (pct >= winPct) {
		Round._wasCloseSfx = false;
		if (Session.tutorialActive) {
			checkTutorial();
			return;
		}
		Round.won = true; // Don't freeze sliders during tutorial — step checks may not have passed yet
		_meterWinSlinkyT = 600;
		Round._lockAnimStart = performance.now();
		clearInterval(timerInterval);
		const comboMult = 1 + Round.combo * 0.1;
		const gain = Math.floor((CONFIG.BASE_REWARD + Math.ceil(Round.timeLeft * CONFIG.TIME_BONUS_RATE)) * comboMult);
		Round.combo++;
		dispatch({ type: "SCORE_ADD", payload: gain });
		showScorePop(gain);
		fb.textContent = `LOCKED IN +${gain} pts`;
		fb.className = "feedback win";
		fb.classList.remove("feedback-snap");
		void fb.offsetWidth;
		fb.classList.add("feedback-snap");
		flash("var(--green)");
		SFX.lock();
		spawnStamp("success");
		if (Round.combo === 5) spawnStamp("combo_5");
		else if (Round.combo === 3) spawnStamp("combo_3");
		else if (Round.combo === 2) spawnStamp("combo_2");
		if (navigator.vibrate) navigator.vibrate(100);
		setTimeout(() => nextRound(), 1800);
	} else if (pct >= CONFIG.CLOSE_PERCENTAGE && !Round._typePuzzle) {
		// NOTE: !Round._typePuzzle gives `Ghost` like archetype's feedback higher priority
		if (Session.tutorialActive) return;
		fb.textContent = "Getting close…";
		fb.className = "feedback close";
		fb.classList.remove("feedback-snap");
		void fb.offsetWidth;
		fb.classList.add("feedback-snap");
		if (!Round._wasCloseSfx) {
			SFX.close();
			Round._wasCloseSfx = true;
		}
	} else {
		if (Session.tutorialActive) return;
		if (Round._typePuzzle) {
			fb.textContent = targetSignal?.archetype === "Guide" ? "Select the highlighted waveform" : "Click to find the active waveform";
			fb.className = "feedback";
			fb.classList.remove("feedback-snap");
			Round._wasCloseSfx = false;
		} else {
			fb.textContent = "Match the target signal.";
			fb.className = "feedback";
			fb.classList.remove("feedback-snap");
			void fb.offsetWidth;
			fb.classList.add("feedback-snap");
			Round._wasCloseSfx = false;
		}
	}
	updateMixState();
}

// ─── INPUT HANDLERS (rAF-throttled) ──────────────────────────────────────────

function setText(el, v) {
	const s = String(v);
	if (el.__v === s) return;
	el.__v = s;
	el.textContent = s;
}
function setAria(el, v) {
	if (el.__a === v) return;
	el.__a = v;
	el.setAttribute("aria-valuetext", v);
}

function syncLabels() {
	for (const [param, slider] of Object.entries(UI.sliders)) {
		if (!slider) continue;
		const unit = slider.dataset.unit || "";
		const raw = +slider.value;
		const label = UI.labels[param];
		if (!label) continue;
		if (unit === "Hz") {
			setText(label, `${raw} Hz`);
			setAria(slider, `${raw} Hz`);
		} else if (unit === "°") {
			setText(label, `${raw}°`);
			setAria(slider, `${raw}°`);
		} else {
			setText(label, (raw / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION));
			setAria(slider, (raw / 10).toFixed(1));
		}
	}
	_refreshTabDisplay();
}

function scheduleRender() {
	if (Round._recomputeScheduled) return;
	Round._recomputeScheduled = true;
	requestAnimationFrame(() => {
		updateMeter();
		syncLabels();
		updateParamArrows();
		const now = Date.now();
		if (now - _lastSliderSfx > 80) {
			SFX.slider();
			_lastSliderSfx = now;
		}
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
	if (Round._typePuzzle) {
		if (btn.dataset.t !== targetSignal.type) {
			btn.classList.add("puzzle-wrong");
			btn.addEventListener("animationend", () => btn.classList.remove("puzzle-wrong"), { once: true });
			return;
		}
		// Correct type found — resolve the puzzle
		Round._typePuzzle = false;
		document.querySelectorAll(".type-btn").forEach(b => {
			b.classList.remove("puzzle-disabled");
			b.disabled = !LEVELS[Session.level].types.includes(b.dataset.t);
		});
		if (UI.archetypeName) {
			UI.archetypeName.textContent = targetSignal.archetype === "Guide" ? "✦ Guide" : "◇ Ghost";
			UI.archetypeName.classList.remove("hidden");
		}
	}
	document.querySelectorAll(".type-btn").forEach(b => void b.classList.remove("active"));
	btn.classList.add("active");
	yoursSignal.type = btn.dataset.t;
	invalidateMatchScore();
	if (Round._setTypeScheduled) return;
	Round._setTypeScheduled = true;
	requestAnimationFrame(() => {
		updateMeter();
		SFX.tick();
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

function buildTarget() {
	const lv = LEVELS[Session.level];

	// 40% chance: use a signal archetype (gives each round personality)
	let archetype = null;
	if (gameRand() < 0.4) {
		const isDebut = Session.level in _DEBUT_ARCHETYPES;
		const valid = ARCHETYPES.filter(a => a.levelMin <= Session.level && (!isDebut || _DEBUT_ARCHETYPES[Session.level].includes(a.name)));
		if (valid.length) archetype = gamePick(valid);
	}

	if (archetype) {
		const isDebut = Session.level in _DEBUT_ARCHETYPES && _DEBUT_ARCHETYPES[Session.level].includes(archetype.name);
		// Chaos jitter: on non-debut encounters, the archetype drifts ±1 to feel organic
		const j = () => (isDebut ? 0 : rng(-1, 1));
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
		freq: rng(1, 6),
		amp: rng(3, 10),
		phase: lv.phase ? _pickWeightedParam([0, 45, 90, 135, 180, 225, 270, 315], 2, 6, Session.level) : 0,
		dc: lv.dc ? _pickWeightedParam([-3, -2, -1, 0, 1, 2, 3], 3, 3, Session.level) : 0,
		harm: lv.harm ? _pickWeightedParam([0, 1, 2, 3, 4, 5], 5, 3, Session.level) : 0,
		noise: lv.noise ? rng(2, 6) : 0,
	};
}

function readSliders() {
	return {
		freq: +UI.sliders.freq.value,
		amp: +UI.sliders.amp.value,
		phase: +UI.sliders.phase.value,
		dc: +UI.sliders.dc.value,
		harm: +UI.sliders.harm.value,
		noise: +UI.sliders.noise.value,
	};
}

function applySignal(sig) {
	Object.assign(yoursSignal, sig);
	invalidateMatchScore();
}

function resetYours() {
	yoursSignal = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0, harm: 0, noise: 0 };
	_smoothPhase = yoursSignal.phase;
	["freq", "amp", "phase", "dc", "harm", "noise"].forEach(k => {
		const el = document.getElementById(`sl-${k}`);
		if (el) el.value = yoursSignal[k];
	});
	document.querySelectorAll(".type-btn").forEach(b => void b.classList.toggle("active", b.dataset.t === "sine"));
	invalidateMatchScore();
	recompute();
	_refreshTabDisplay();
}

// ─── UNIFIED DRAG CONTROLS ────────────────────────────────────────────────────

/**
 * Per-param config for the drag zone.
 * sensitivity: px of drag travel that spans the full [min, max] range.
 * fmt/unit: how to display the current value.
 */
const DRAG_PARAMS = [
	{ id: "freq", label: "Freq", unit: "Hz", min: 1, max: 8, step: 1, sensitivity: 120, fmt: v => String(Math.round(v)) },
	{ id: "amp", label: "Amp", unit: "", min: 1, max: 10, step: 0.1, sensitivity: 160, fmt: v => (v / 10).toFixed(2) },
	{ id: "phase", label: "Phase", unit: "°", min: 0, max: 360, step: 1, sensitivity: 200, fmt: v => String(Math.round(v)) },
	{ id: "dc", label: "DC", unit: "", min: -5, max: 5, step: 0.1, sensitivity: 160, fmt: v => (v / 10).toFixed(2) },
	{ id: "harm", label: "Harm", unit: "", min: 0, max: 10, step: 0.1, sensitivity: 160, fmt: v => (v / 10).toFixed(2) },
];

let _controlsCleanup = null;

/** Returns which DRAG_PARAMS are currently visible (not hidden/locked for this level). */
function _activeDragParams() {
	const lv = LEVELS[Session.level];
	return DRAG_PARAMS.filter(p => {
		if (p.id === "harm") return lv.harm;
		if (p.id === "phase") return true; // always shown; dimmed/locked until lv.phase
		if (p.id === "dc") return true; // always shown; dimmed/locked until lv.dc
		return true;
	});
}

/** SVG glyphs for each param — helps intuitively identify controls.
 *  Each glyph uses a faded reference path (offset down, with glow) to show
 *  "what the signal would look like without this parameter", and a solid
 *  path for the active/affected result. */
const PARAM_GLYPH = {
	freq: `<svg class="mpt-glyph" viewBox="0 0 14 14" aria-hidden="true"><path d="M0 7 Q2 3 3.5 7 T7 7 T10.5 7 T14 7" /></svg>`,

	amp: `<svg class="mpt-glyph" viewBox="0 0 60 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M0 34 Q15 28 30 34 T60 34" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
    <path d="M0 34 Q15 4 30 34 T60 34" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,

	phase: `<svg class="mpt-glyph" viewBox="0 0 60 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M0 26 Q15 6 30 26 T60 26" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
    <path d="M10 26 Q25 6 40 26 T70 26" stroke="currentColor" stroke-width="1.5"/>
    <line x1="2" y1="38" x2="14" y2="38" stroke="currentColor" stroke-width="1.2"/>
    <polyline points="11,34 15,38 11,42" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`,

	dc: `<svg class="mpt-glyph" viewBox="0 0 60 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <line x1="0" y1="30" x2="60" y2="30" stroke="currentColor" stroke-width="1" stroke-dasharray="3 2" opacity="0.3"/>
    <path d="M0 30 Q15 12 30 30 T60 30" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
    <path d="M0 18 Q15 0 30 18 T60 18" stroke="currentColor" stroke-width="1.5"/>
    <line x1="52" y1="28" x2="52" y2="20" stroke="currentColor" stroke-width="1.2"/>
    <polyline points="48,23 52,19 56,23" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`,

	harm: `<svg class="mpt-glyph" viewBox="0 0 60 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M0 28 Q15 8 30 28 T60 28" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
    <path d="M0 28 Q7 14 14 28 Q21 42 28 28 Q35 14 42 28 Q49 42 56 28 T60 28" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,
};

/**
 * initControls()
 * Builds the unified drag-control UI.
 * Called on init and after applyLevelUI.
 */
function initControls() {
	if (_controlsCleanup) {
		_controlsCleanup();
		_controlsCleanup = null;
	}

	// Remove existing UI if re-initialising
	const existing = document.getElementById("controls-wrap");
	if (existing) existing.remove();

	const lv = LEVELS[Session.level];
	const params = _activeDragParams();
	let activeParamIdx = 0;

	// ── BUILD DOM ─────────────────────────────────────────────────────────

	const wrap = document.createElement("div");
	wrap.id = "controls-wrap";

	// Inject glow filter for param glyph faded reference paths
	if (!document.getElementById("mpt-glow")) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.id = "mpt-glow-filter";
		svg.setAttribute("width", "0");
		svg.setAttribute("height", "0");
		svg.style.cssText = "position:absolute;overflow:hidden";
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
		filter.setAttribute("id", "mpt-glow");
		filter.setAttribute("x", "-50%");
		filter.setAttribute("y", "-50%");
		filter.setAttribute("width", "200%");
		filter.setAttribute("height", "200%");
		const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
		blur.setAttribute("stdDeviation", "0.45");
		filter.appendChild(blur);
		defs.appendChild(filter);
		svg.appendChild(defs);
		document.body.prepend(svg);
	}

	// Param tabs
	const tabsEl = document.createElement("div");
	tabsEl.className = "param-tabs";
	tabsEl.style.setProperty("--tab-count", params.length);

	params.forEach((p, i) => {
		const tab = document.createElement("button");
		tab.className = `param-tab${i === 0 ? " active" : ""}`;
		if (p.id === "phase" && !lv.phase && !Session.tutorialActive) tab.classList.add("locked");
		if (p.id === "dc" && !lv.dc && !Session.tutorialActive) tab.classList.add("locked");
		tab.dataset.paramIdx = i;
		tab.dataset.param = p.id;
		tab.innerHTML = `${PARAM_GLYPH[p.id]}<span class="mpt-label">${p.label}</span><span class="mpt-val" id="mpt-val-${p.id}"><span class="param-arrow" data-param="${p.id}"></span><span class="mpt-val-text">${_sliderFmt(p)}</span></span><span class="mpt-track" id="mpt-track-${p.id}" style="--pct:${_trackPct(p)}%"></span>`;
		tabsEl.appendChild(tab);
	});

	// Drag zone
	const dragZone = document.createElement("div");
	dragZone.className = "drag-zone";
	dragZone.setAttribute("aria-label", "Drag up to increase, down to decrease");
	dragZone.innerHTML = `
		<div class="drag-hint">drag up / down</div>
		<div class="drag-arrows">▲<br><br>▼</div>
		<div class="drag-label" id="drag-label-el">${params[0].label}</div>
		<div class="drag-value" id="drag-val-el"><span class="param-arrow" data-param="${params[0].id}"></span><span class="drag-val-text">${_sliderFmt(params[0])}</span></div>
		<div class="drag-unit"  id="drag-unit-el">${params[0].unit}</div>
		<div class="drag-track"><div class="drag-track-fill" id="drag-fill-el" style="height:${_trackPct(params[0])}%"></div></div>
	`;

	wrap.appendChild(tabsEl);
	wrap.appendChild(dragZone);

	// Insert before .action-row inside #screen-game
	const actionRow = document.querySelector("#screen-game .action-row");
	if (actionRow) {
		actionRow.parentElement.insertBefore(wrap, actionRow);
	}

	// ── HELPERS ───────────────────────────────────────────────────────────

	function _sliderVal(p) {
		const el = document.getElementById(`sl-${p.id}`);
		return el ? +el.value : p.min;
	}

	function _sliderFmt(p) {
		const v = _sliderVal(p);
		return p.fmt(v);
	}

	function _trackPct(p) {
		const v = _sliderVal(p);
		return (((v - p.min) / (p.max - p.min)) * 100).toFixed(1);
	}

	function _updateDragDisplay() {
		const p = params[activeParamIdx];
		const labelEl = document.getElementById("drag-label-el");
		const valueEl = document.getElementById("drag-val-el");
		const unitEl = document.getElementById("drag-unit-el");
		const fillEl = document.getElementById("drag-fill-el");
		if (labelEl) labelEl.textContent = p.label;
		if (valueEl) {
			const arrowEl = valueEl.querySelector(".param-arrow");
			if (arrowEl) arrowEl.dataset.param = p.id;
			const textEl = valueEl.querySelector(".drag-val-text");
			if (textEl) textEl.textContent = _sliderFmt(p);
		}
		if (unitEl) unitEl.textContent = p.unit;
		if (fillEl) fillEl.style.height = `${_trackPct(p)}%`;
		dragZone.setAttribute("aria-valuenow", _sliderVal(p));
		dragZone.setAttribute("aria-valuetext", `${_sliderFmt(p)} ${p.unit}`.trim());

		// Update all tab value readouts and progress tracks
		params.forEach(param => {
			const valEl = document.getElementById(`mpt-val-${param.id}`);
			if (valEl) {
				const textEl = valEl.querySelector(".mpt-val-text");
				if (textEl) textEl.textContent = _sliderFmt(param);
			}
			const trackEl = document.getElementById(`mpt-track-${param.id}`);
			if (trackEl) trackEl.style.setProperty("--pct", `${_trackPct(param)}%`);
		});

		// Toggle locked visual state on drag zone
		const activeTab = tabsEl.querySelector(`.param-tab[data-param="${params[activeParamIdx].id}"]`);
		dragZone.classList.toggle("locked", activeTab?.classList.contains("locked"));
	}

	// ── TAB INTERACTION ───────────────────────────────────────────────────

	function _onTabClick(e) {
		const tab = e.target.closest(".param-tab");
		if (!tab || tab.classList.contains("locked")) return;
		SFX.nav();
		activeParamIdx = +tab.dataset.paramIdx;
		tabsEl.querySelectorAll(".param-tab").forEach((t, i) => {
			t.classList.toggle("active", i === activeParamIdx);
		});
		const newP = params[activeParamIdx];
		dragZone.setAttribute("aria-valuemin", newP.min);
		dragZone.setAttribute("aria-valuemax", newP.max);
		_updateDragDisplay();
	}

	tabsEl.addEventListener("click", _onTabClick);

	// ── DRAG INTERACTION ──────────────────────────────────────────────────

	let _dragStartY = null;
	let _dragStartVal = null;

	function _activeTabLocked() {
		const activeTab = tabsEl.querySelector(`.param-tab[data-param="${params[activeParamIdx].id}"]`);
		return activeTab?.classList.contains("locked");
	}

	function _writeSlider(p, val) {
		const slider = document.getElementById(`sl-${p.id}`);
		if (slider && +slider.value !== val) {
			slider.value = val;
			recompute();
		}
	}

	function _onDragStart(clientY) {
		if (Round.won || _activeTabLocked()) return;
		_dragStartY = clientY;
		_dragStartVal = _sliderVal(params[activeParamIdx]);
	}

	function _onDragMove(clientY) {
		if (_dragStartY === null || Round.won || _activeTabLocked()) return;
		const p = params[activeParamIdx];
		const dy = _dragStartY - clientY;
		const range = p.max - p.min;
		const delta = (dy / p.sensitivity) * range;
		const raw = _dragStartVal + delta;
		const snapped = Math.round(raw / p.step) * p.step;
		const clamped = Math.min(p.max, Math.max(p.min, snapped));
		_writeSlider(p, clamped);
		_updateDragDisplay();
	}

	function _onDragEnd() {
		_dragStartY = null;
		_dragStartVal = null;
	}

	function _onPointerDown(e) {
		dragZone.setPointerCapture(e.pointerId);
		document.body.style.overflow = "hidden";
		_onDragStart(e.clientY);
	}
	function _onPointerMove(e) {
		_onDragMove(e.clientY);
	}
	function _onPointerUp() {
		document.body.style.overflow = "";
		_onDragEnd();
	}

	dragZone.addEventListener("pointerdown", _onPointerDown);
	dragZone.addEventListener("pointermove", _onPointerMove);
	dragZone.addEventListener("pointerup", _onPointerUp);
	dragZone.addEventListener("pointercancel", _onDragEnd);

	// ── KEYBOARD ─────────────────────────────────────────────────────────

	dragZone.setAttribute("tabindex", "0");
	dragZone.setAttribute("role", "slider");
	dragZone.setAttribute("aria-valuemin", params[activeParamIdx].min);
	dragZone.setAttribute("aria-valuemax", params[activeParamIdx].max);

	function _onKeyDown(e) {
		if (Round.won || _activeTabLocked()) return;
		const p = params[activeParamIdx];
		if (e.key === "ArrowUp") {
			e.preventDefault();
			_writeSlider(p, Math.min(p.max, _sliderVal(p) + p.step));
			_updateDragDisplay();
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			_writeSlider(p, Math.max(p.min, _sliderVal(p) - p.step));
			_updateDragDisplay();
		}
	}

	dragZone.addEventListener("keydown", _onKeyDown);

	// ── CLEANUP FN ────────────────────────────────────────────────────────

	_controlsCleanup = () => {
		tabsEl.removeEventListener("click", _onTabClick);
		dragZone.removeEventListener("pointerdown", _onPointerDown);
		dragZone.removeEventListener("pointermove", _onPointerMove);
		dragZone.removeEventListener("pointerup", _onPointerUp);
		dragZone.removeEventListener("pointercancel", _onDragEnd);
		dragZone.removeEventListener("keydown", _onKeyDown);
		document.body.style.overflow = "";
		wrap.remove();
	};

	// Initial display sync
	_updateDragDisplay();

	// Expose updater so applyLevelUI / resetYours can refresh tab values
	UI._refreshTabDisplay = _updateDragDisplay;
}

/** Refresh tab value readouts — called after resetYours and syncLabels. */
function _refreshTabDisplay() {
	if (typeof UI._refreshTabDisplay === "function") UI._refreshTabDisplay();
}

// ─── LEVEL UI ────────────────────────────────────────────────────────────────

function applyLevelUI() {
	if (Round._typePuzzle) return;
	const lv = LEVELS[Session.level];
	UI.labels.level.textContent = Session.postGameFreeplay ? "∞" : Session.level + 1;
	UI.displays.roundTotal.textContent = Session.postGameFreeplay ? "∞" : lv.rounds;
	UI.controls.phase.style.opacity = lv.phase ? "1" : ".3";
	UI.controls.dc.style.opacity = lv.dc ? "1" : ".3";
	UI.controls.harm.classList.toggle("hidden", !lv.harm);
	// Noise is atmosphere (tolerance band), not a puzzle param — always hidden
	UI.controls.noise.classList.add("hidden");
	UI.buttons.pwm.disabled = !lv.types.includes("pwm");
	UI.buttons.am.disabled = !lv.types.includes("am");
	// Rebuild tabs when level changes — param set may have changed
	initControls();
}

// ─── TIMER ───────────────────────────────────────────────────────────────────

function startTimer() {
	clearInterval(timerInterval);
	resetTensionFilter();
	const lv = LEVELS[Session.level];
	const grace = lv.grace && Round.roundNo === 1; // grace round: timeout advances, never kills
	// biome-ignore lint/suspicious/noAssignInExpressions: <quick obvious semantic assignment>
	const total = (Round.timeLeft = lv.time);
	const el = UI.displays.timer,
		ring = UI.timerRingFill,
		C = RENDER.TIMER_CIRC;

	ring.style.transition = "none";
	ring.style.strokeDashoffset = "0";
	const graceColor = grace ? (lv.graceColor ?? "var(--blue)") : null;
	ring.style.stroke = graceColor ?? "#f0690a";
	ring.style.transition = "stroke-dashoffset 1s linear, stroke 0.3s";

	// Grace theme: tint meter + scope-wrap to match the new param
	const meterFill = UI.displays.fill;
	if (meterFill) meterFill.style.background = graceColor ?? "";
	if (UI.scopeWrap) UI.scopeWrap.classList.toggle("grace-active", grace);

	el.textContent = Round.timeLeft;
	el.className = "timer-ring-label";
	if (grace) UI.displays.feedback.textContent = "Explore freely — no penalty this round.";

	const _timerStart = performance.now();
	const _totalMs = total * 1000;

	function _timerTick() {
		const elapsed = performance.now() - _timerStart;
		const remaining = Math.max(0, _totalMs - elapsed);
		Round.timeLeft = Math.ceil(remaining / 1000);

		ring.style.strokeDashoffset = C * (1 - Round.timeLeft / total);
		const urgent = !Session.assistDisableUrgent && !grace && Round.timeLeft <= 8;
		el.textContent = Round.timeLeft;
		el.className = urgent ? "timer-ring-label urgent" : "timer-ring-label";
		ring.style.stroke = grace ? (lv.graceColor ?? "var(--blue)") : urgent ? "#e85a4a" : "#f0690a";
		if (urgent) {
			const pct = Math.max(0, (Round.timeLeft - 1) / 7);
			const freq = 150 + pct * 2050;
			_tensionFilter.frequency.setValueAtTime(freq, actx().currentTime);
			const now = Date.now();
			if (now - Round._lastUrgentSfx > 500) {
				SFX.urgent();
				Round._lastUrgentSfx = now;
			}
		}
		if (UI.scopeWrap) UI.scopeWrap.classList.toggle("urgent", urgent);
		if (UI.canvas) UI.canvas.classList.toggle("urgent", urgent);
		if (UI.timerRingWrap) UI.timerRingWrap.classList.toggle("urgent", urgent);
		if (Round.timeLeft <= 0 && !Round.won) {
			if (grace) {
				UI.displays.feedback.textContent = "Time's up. Now it counts.";
			} else if (!Session.assistInfiniteTime) {
				gameOver();
			}
			return;
		}
		timerInterval = setTimeout(_timerTick, 100);
	}

	timerInterval = setTimeout(_timerTick, 100);
}

// ─── LOOP CONTROL ────────────────────────────────────────────────────────────

function startLoop() {
	if (animRaf !== null) {
		cancelAnimationFrame(animRaf);
		animRaf = null;
	}
	animRaf = requestAnimationFrame(loop);
}
function stopLoop() {
	Round._lockAnimStart = 0;
	if (animRaf !== null) {
		cancelAnimationFrame(animRaf);
		animRaf = null;
	}
}

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
	if (UI.scopeWrap) UI.scopeWrap.classList.remove("grace-active");
	const reveal = document.getElementById("target-reveal");
	if (reveal) reveal.classList.add("hidden");
	document.querySelectorAll(".type-btn").forEach(b => void b.classList.remove("puzzle-disabled", "puzzle-wrong"));
}

function enterLevel() {
	Round._revealedHints = new Set();
	UI.displays.hintLog.innerHTML = "";
	transitionBGM(BGM_STATE.GAMEPLAY);
	showScreen("game");
	targetSignal = buildTarget();
	if (UI.archetypeName) {
		UI.archetypeName.textContent = targetSignal.archetype ?? "";
		UI.archetypeName.classList.toggle("hidden", !targetSignal.archetype);
	}
	if (UI.displays.pbDisplay) {
		const save = loadSave();
		const pb = save.bestScores[Session.level] || 0;
		UI.displays.pbDisplay.textContent = pb > 0 ? pb : "—";
	}
	invalidateMatchScore();
	applyLevelUI();
	resetYours();
	if (targetSignal.archetype === "Guide" || targetSignal.archetype === "Ghost") {
		Round._typePuzzle = true;
		document.querySelectorAll(".type-btn").forEach(b => {
			b.disabled = false;
			b.classList.remove("active");
			b.classList.add("puzzle-disabled");
		});
		if (targetSignal.archetype === "Guide") {
			const correct = document.querySelector(`.type-btn[data-t="${targetSignal.type}"]`);
			if (correct) {
				correct.classList.remove("puzzle-disabled");
				correct.classList.add("active");
			}
		}
		if (UI.archetypeName) {
			UI.archetypeName.textContent = targetSignal.archetype === "Guide" ? "✦ Guide" : "🔒 ???";
			UI.archetypeName.classList.remove("hidden");
		}
	}
	const feedback = UI.displays.feedback;
	feedback.textContent = "Match the target signal.";
	feedback.className = "feedback";
	if (UI.scopeWrap) UI.scopeWrap.classList.remove("urgent");
	if (UI.canvas) UI.canvas.classList.remove("urgent");
	if (UI.timerRingWrap) UI.timerRingWrap.classList.remove("urgent");

	const lv = LEVELS[Session.level];
	if (!Session.freePlayActive && !lv.freeplay && !Session.tutorialActive) {
		const save = loadSave();
		const telemetry = (save.telemetry || []).filter(t => t.level === Session.level);
		if (telemetry.length >= 3) {
			let totalCompletion = 0;
			for (const t of telemetry) totalCompletion += lv.time - t.timeRemaining;
			const avgCompletion = totalCompletion / telemetry.length;
			const ratio = avgCompletion / lv.time;
			if (ratio < 0.6) {
				lv.time = Math.max(10, lv.time - 2);
			} else if (ratio > 0.9) {
				lv.time = Math.min(60, lv.time + 2);
			}
		}
	}

	if (!Session.postGameFreeplay) {
		startTimer();
	}
	startSignalPlayback();
	startLoop();
}

// ─── FREE-PLAY WARMUP ────────────────────────────────────────────────────────
function startFreePlay() {
	Session.freePlayActive = true;
	clearInterval(timerInterval);

	targetSignal = null; // null during freeplay by design — no match target needed
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
	Round.won = false;
	Round._lockAnimStart = 0;
	dispatch({ type: "ROUND_NEXT" });

	if (Session.postGameFreeplay) {
		enterLevel();
		return;
	}

	if (Session.level >= LEVELS.length) {
		dispatch({ type: "LEVEL_SET", payload: LEVELS.length - 1 });
		dispatch({ type: "ROUND_SET", payload: 1 });
		Session.postGameFreeplay = true;
		UI.displays.score.textContent = "∞";
		startFreePlay();
		const feedback = UI.displays.feedback;
		feedback.textContent = `All ${LEVELS.length} levels unlocked. Feel Free To Explore.`;
		feedback.className = "feedback close";
		return;
	}
	const lv = LEVELS[Session.level];
	if (Round.roundNo > lv.rounds) {
		recordLevelComplete(Session.level, Session.score - Session.levelStartScore);
		const nextLevel = Session.level + 1;
		if (nextLevel >= LEVELS.length) {
			victory();
			return;
		}
		dispatch({ type: "LEVEL_SET", payload: nextLevel });
		dispatch({ type: "ROUND_SET", payload: 1 });
		Session.levelStartScore = Session.score;
		if (Session.minigames) {
			runMiniGame(Session.level, () => {
				showLevelUpScreen();
			});
		} else {
			showLevelUpScreen();
		}
		return;
	}
	UI.displays.roundNo.textContent = Round.roundNo;

	if (lv.freeplay && Round.roundNo === 1) {
		startFreePlay();
		return;
	}

	enterLevel();
}

function showLevelUpScreen() {
	// Snapshot level stats before exitLevel() resets Round
	const runScore = Session.score - Session.levelStartScore;
	const levelRounds = Round.roundNo - 1;
	const combo = Round.combo;
	const hintsUsed = Round._hintsUsed;
	const skipsUsed = Round._skipsUsed;
	const timeLeft = Round.timeLeft;

	transitionBGM(BGM_STATE.MENU);
	exitLevel();
	UI.displays.luTitle.textContent = `LEVEL ${Session.level + 1}`;
	const lv = LEVELS[Session.level];

	let msg = "";
	if (hasPendingCeremony()) {
		msg = CEREMONIES[Session.level].luMsg;
	} else {
		const newParams = ["phase", "dc", "harm", "noise"].filter(k => lv[k]);
		const paramStr = newParams.length ? `New: ${newParams.join(", ")}.` : "";
		msg = paramStr;
	}

	const graceStr = lv.grace ? "First round has no time penalty." : "";
	const warmupStr = lv.freeplay ? "Free warmup round to explore." : "";
	const extras = [graceStr, warmupStr].filter(Boolean);
	if (extras.length) msg += (msg ? " " : "") + extras.join(" ");
	if (mgBonusPts > 0) msg += `${msg ? " " : ""}Minigame bonus: +${mgBonusPts} pts.`;

	UI.displays.luMsg.textContent = msg || "Good luck.";

	const save = loadSave();
	const bestScore = save.bestScores[Session.level] || 0;
	if (UI.displays.luScore) UI.displays.luScore.textContent = runScore;
	if (UI.displays.luBest) UI.displays.luBest.textContent = bestScore;
	if (UI.displays.luRounds) UI.displays.luRounds.textContent = levelRounds;
	if (UI.displays.luCombo) UI.displays.luCombo.textContent = combo;
	if (UI.displays.luTime) UI.displays.luTime.textContent = timeLeft > 0 ? `${timeLeft}s` : "—";
	if (UI.displays.luHints) UI.displays.luHints.textContent = hintsUsed;
	if (UI.displays.luSkips) UI.displays.luSkips.textContent = skipsUsed;

	showScreen("levelup");
	SFX.levelUp();
}

function hasPendingCeremony() {
	return Session.ceremonies && Session.level in CEREMONIES;
}

function showCeremony() {
	const c = CEREMONIES[Session.level];
	if (!c) {
		enterLevel();
		return;
	}
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
	enterLevel();
}

// ─── SETTINGS OVERLAY ─────────────────────────────────────────────────────────

function showSettings() {
	SFX.nav();
	const overlay = document.getElementById("settings-overlay");
	renderSettings();
	overlay.classList.remove("hidden");
	_prevBgmState = _bgmState;
	transitionBGM(BGM_STATE.SETTINGS);
}

function closeSettings() {
	SFX.back();
	document.getElementById("settings-overlay").classList.add("hidden");
	transitionBGM(_prevBgmState);
}

function renderSettings() {
	const save = loadSave();
	const s = save.settings;
	const sync = (id, on) => {
		const el = document.getElementById(id);
		if (!el) return;
		el.textContent = on ? "ON" : "OFF";
		el.classList.toggle("on", on);
		el.setAttribute("aria-checked", on);
	};
	sync("stg-bgm", !s.bgmMuted);
	sync("stg-sfx", !s.sfxMuted);
	sync("stg-ceremonies", s.ceremonies);
	sync("stg-shake", s.screenShake);
	sync("stg-minigames", s.minigames);
	sync("stg-disable-urgent", s.assistDisableUrgent);
	sync("stg-infinite-time", s.assistInfiniteTime);
	sync("stg-easy-match", s.assistEasyMatch);
	sync("stg-no-fail", s.assistNoFail);
	{
		const el = document.getElementById("stg-param-guide");
		if (el) {
			const labels = { off: "OFF", gradient: "GRAD", direct: "DIR" };
			const mode = s.assistParamGuide || "off";
			el.textContent = labels[mode] || "OFF";
			el.classList.toggle("on", mode !== "off");
			el.setAttribute("aria-checked", mode !== "off");
		}
	}
	sync("stg-free-guide", s.assistFreeGuide);
	{
		const el = document.getElementById("stg-free-guide");
		if (el) {
			el.disabled = s.assistParamGuide === "off";
			el.classList.toggle("disabled", s.assistParamGuide === "off");
		}
	}
	const bgmVol = document.getElementById("stg-bgm-vol");
	if (bgmVol) bgmVol.value = Math.round(s.bgmVolume * 100);
	const sfxVol = document.getElementById("stg-sfx-vol");
	if (sfxVol) sfxVol.value = Math.round(s.sfxVolume * 100);
}

function toggleSetting(key, sessionKey) {
	const save = loadSave();
	save.settings[key] = !save.settings[key];
	writeSave(save);
	if (sessionKey) Session[sessionKey] = save.settings[key];
	renderSettings();
}

function onSettingsVolChange(key, sessionKey, slider) {
	const val = parseInt(slider.value, 10) / 100;
	const save = loadSave();
	save.settings[key] = val;
	writeSave(save);
	if (sessionKey) Session[sessionKey] = val;
	if (key === "bgmVolume") {
		Session.volume = val;
		if (!Session.muted) MIX.bgm.gain.value = val;
	}
	if (key === "sfxVolume") {
		Session.sfxVolume = val;
		if (MIX.sfx) MIX.sfx.gain.value = val;
	}
}

function initSettingsOverlay() {
	document.getElementById("stg-bgm")?.addEventListener("click", () => {
		SFX.toggle(true);
		toggleMute();
	});
	document.getElementById("stg-sfx")?.addEventListener("click", () => {
		SFX.toggle(true);
		toggleSfxMute();
	});

	const bindToggle = (id, key, sessionKey) => {
		const el = document.getElementById(id);
		if (!el) return;
		el.addEventListener("click", () => {
			SFX.toggle(true);
			toggleSetting(key, sessionKey);
		});
	};
	bindToggle("stg-ceremonies", "ceremonies", "ceremonies");
	bindToggle("stg-shake", "screenShake", "screenShake");
	bindToggle("stg-minigames", "minigames", "minigames");
	bindToggle("stg-disable-urgent", "assistDisableUrgent", "assistDisableUrgent");
	bindToggle("stg-infinite-time", "assistInfiniteTime", "assistInfiniteTime");
	bindToggle("stg-easy-match", "assistEasyMatch", "assistEasyMatch");
	bindToggle("stg-no-fail", "assistNoFail", "assistNoFail");
	{
		const GUIDE_CYCLE = ["off", "gradient", "direct"];
		const el = document.getElementById("stg-param-guide");
		if (el)
			el.addEventListener("click", () => {
				SFX.toggle(true);
				const save = loadSave();
				const current = save.settings.assistParamGuide || "off";
				const next = GUIDE_CYCLE[(GUIDE_CYCLE.indexOf(current) + 1) % 3];
				save.settings.assistParamGuide = next;
				writeSave(save);
				Session.assistParamGuide = next;
				renderSettings();
			});
	}
	bindToggle("stg-free-guide", "assistFreeGuide", "assistFreeGuide");

	const bindSlider = (id, key, sessionKey) => {
		const el = document.getElementById(id);
		if (!el) return;
		el.addEventListener("input", () => onSettingsVolChange(key, sessionKey, el));
		el.addEventListener("change", () => onSettingsVolChange(key, sessionKey, el));
	};
	bindSlider("stg-bgm-vol", "bgmVolume", "volume");
	bindSlider("stg-sfx-vol", "sfxVolume", null);
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

function startVictoryFreeplay() {
	SFX.confirm();
	dispatch({ type: "LEVEL_SET", payload: LEVELS.length - 1 });
	dispatch({ type: "ROUND_SET", payload: 1 });
	Session.postGameFreeplay = true;
	UI.displays.score.textContent = "∞";
	showScreen("game");
	startLoop();
	nextRound();
}

function victory() {
	transitionBGM(BGM_STATE.VICTORY);
	exitLevel();
	UI.displays.victoryMsg.textContent = `All ${LEVELS.length} levels cleared with ${Session.score} pts. Legendary.`;
	showScreen("victory");
	SFX.levelUp();
}

function gameOver() {
	if (Session.assistNoFail) {
		UI.displays.feedback.textContent = "Assisted — signal lost, moving on.";
		UI.displays.feedback.className = "feedback close";
		exitLevel();
		setTimeout(() => nextRound(), 1200);
		return;
	}
	transitionBGM(BGM_STATE.GAMEOVER);
	exitLevel();
	flash("#ff4554");
	spawnStamp("fail");
	UI.displays.deadMsg.textContent = `Level ${Session.level + 1} · Round ${Round.roundNo} · ${Session.score} pts`;
	const t = targetSignal,
		lv = LEVELS[Session.level];
	const reveal = document.getElementById("target-reveal");
	if (reveal && t) {
		const parts = [`TYPE: ${t.type.toUpperCase()}`, `FREQ: ${t.freq} Hz`, `AMP: ${(t.amp / 10).toFixed(2)}`];
		if (lv.phase) parts.push(`PHASE: ${t.phase}°`);
		if (lv.dc) parts.push(`DC: ${(t.dc / 10).toFixed(2)}`);
		if (lv.harm) parts.push(`HARM: ${(t.harm / 10).toFixed(2)}`);
		reveal.textContent = parts.join("  ·  ");
		reveal.classList.remove("hidden");
	}
	showScreen("dead");
	SFX.fail();
	const gi = UI.gameInner;
	const g = UI.game;
	if (Session.screenShake) {
		gi.classList.add("shake");
		g.classList.add("shake");
		setTimeout(() => {
			gi.classList.remove("shake");
			g.classList.remove("shake");
		}, 500);
		if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
	}
}

/** Exits gameplay cleanly from any state. */
function goToMenu() {
	SFX.back();
	transitionBGM(BGM_STATE.MENU);
	exitLevel();
	if (Session.tutorialActive) {
		Session.tutorialActive = false;
		document.querySelectorAll(".tutorial-glow").forEach(el => void el.classList.remove("tutorial-glow"));
		UI.buttons.skipTut.classList.add("hidden");
	}
	Round.won = false;
	Session.freePlayActive = false;
	Session.postGameFreeplay = false;
	if (UI.buttons.freeplayReady) UI.buttons.freeplayReady.classList.add("hidden");
	if (UI.meterRow) UI.meterRow.style.opacity = "1";
	renderStartScreen();
	showScreen("start");
}

// ─── GAME ENTRY POINTS ────────────────────────────────────────────────────────

function startGame() {
	dispatch({ type: "SCORE_SET", payload: Session.levelStartScore });
	dispatch({ type: "ROUND_SET", payload: 0 });
	if (!lsGet("tutorialSeen") && !Session.tutorialActive) {
		startTutorial();
		return;
	}
	showScreen("game");
	startLoop();
	nextRound();
}

function restartGame() {
	SFX.reset();
	Round._lockAnimStart = 0;
	dispatch({ type: "SCORE_RESET" });
	dispatch({ type: "LEVEL_SET", payload: 0 });
	Session.postGameFreeplay = false;
	startGame();
}

function startTutorial() {
	transitionBGM(BGM_STATE.GAMEPLAY);
	SFX.nav();
	Round._lockAnimStart = 0;
	Session.tutorialActive = true;
	initControls();
	Session.tutorialStep = 0;
	dispatch({ type: "SCORE_RESET" });
	showScreen("game");
	startLoop();
	targetSignal = { type: "triangle", freq: 5, amp: 8, phase: 360, dc: 3, harm: 0, noise: 0 };
	invalidateMatchScore();
	dispatch({ type: "ROUND_SET", payload: 1 });
	UI.displays.roundTotal.textContent = 1;
	UI.controls.phase.style.opacity = "1";
	UI.controls.dc.style.opacity = "1";
	UI.controls.harm.classList.add("hidden");
	UI.controls.noise.classList.add("hidden");
	UI.buttons.pwm.disabled = false;
	UI.buttons.am.disabled = false;
	UI.buttons.skipTut.classList.remove("hidden");
	resetYours();
	recompute();
	showTutorialTask();
	startSignalPlayback();
}

// ─── TUTORIAL ────────────────────────────────────────────────────────────────

function showTutorialTask() {
	if (Session.tutorialStep >= TUTORIAL_TASKS.length) {
		endTutorial();
		return;
	}
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
	el.querySelectorAll("input, button").forEach(i => {
		i.disabled = true;
	});
	// Also lock the matching param tab
	const param = id.replace("ctrl-", "");
	const tab = document.querySelector(`.param-tab[data-param="${param}"]`);
	if (tab) {
		tab.classList.add("locked");
		tab.classList.remove("tutorial-glow");
		// Auto-select next unlocked tab
		const allTabs = document.querySelectorAll(".param-tab");
		const nextUnlocked = Array.from(allTabs).find(t => !t.classList.contains("locked"));
		if (nextUnlocked) nextUnlocked.click();
	}
}

function unlockAllTutorialControls() {
	document.querySelectorAll(".tutorial-done, .tutorial-glow, .param-tab.locked").forEach(el => {
		el.classList.remove("tutorial-done", "tutorial-glow", "locked");
		el.querySelectorAll("input, button").forEach(i => {
			i.disabled = false;
		});
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
	document.querySelectorAll(".tutorial-glow").forEach(el => void el.classList.remove("tutorial-glow"));
	const id = TUTORIAL_CONTROLS[Session.tutorialStep];
	if (id) {
		document.getElementById(id)?.classList.add("tutorial-glow");
		// Also glow the matching param tab
		const param = id.replace("ctrl-", "");
		const tab = document.querySelector(`.param-tab[data-param="${param}"]`);
		if (tab) tab.classList.add("tutorial-glow");
		UI.displays.feedback?.classList.add("tutorial-glow-text");
	}
}

function skipTutorial() {
	SFX.back();
	Session.tutorialActive = false;
	initControls();
	lsSet("tutorialSeen", "true");
	unlockAllTutorialControls();
	UI.buttons.skipTut.classList.add("hidden");
	stopSignalPlayback();
	const feedback = UI.displays.feedback;
	feedback.textContent = "Tutorial skipped. Click NEW GAME to start playing.";
	renderStartScreen();
	showScreen("start");
}

function endTutorial() {
	Session.tutorialActive = false;
	initControls();
	lsSet("tutorialSeen", "true");
	unlockAllTutorialControls();
	stopSignalPlayback();
	flash("var(--green)");
	SFX.lock();
	const feedback = UI.displays.feedback;
	feedback.textContent = "TUTORIAL COMPLETE!";
	feedback.className = "feedback win";
	setTimeout(() => {
		UI.buttons.skipTut.classList.add("hidden");
		renderStartScreen();
		showScreen("start");
	}, 1800);
}

// ─── HINTS / SKIP ────────────────────────────────────────────────────────────

function useHint() {
	if (!Round._revealedHints) Round._revealedHints = new Set();
	if (Round.won || (!Session.postGameFreeplay && Session.score < CONFIG.COST_HINT)) {
		SFX.hintBroke();
		spawnStamp("hint_broke");
		return;
	}
	const lv = LEVELS[Session.level];
	const hints = [`type: ${targetSignal.type}`, `freq: ${targetSignal.freq} Hz`, `amp: ${(targetSignal.amp / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)}`];
	if (lv.phase) hints.push(`phase: ${targetSignal.phase}°`);
	if (lv.dc && targetSignal.dc !== 0) hints.push(`dc: ${(targetSignal.dc / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)}`);
	if (lv.harm && targetSignal.harm > 0) hints.push(`harmonic: ${(targetSignal.harm / 10).toFixed(CONFIG.FIXED_STEPS_PRECISION)}`);
	const unrevealedIndices = hints.map((_, i) => i).filter(i => !Round._revealedHints.has(i));
	const feedback = UI.displays.feedback;
	if (unrevealedIndices.length === 0) {
		feedback.textContent = "all params revealed — use your eyes";
		feedback.className = "feedback close";
		SFX.hint();
		spawnStamp("hint");
		return;
	}
	if (!Session.postGameFreeplay) {
		dispatch({ type: "SCORE_DEDUCT", payload: CONFIG.COST_HINT });
	}
	Round._hintsUsed++;
	const idx = gamePick(unrevealedIndices);
	Round._revealedHints.add(idx);
	feedback.textContent = `hint: ${hints[idx]}`;
	feedback.className = "feedback close";
	const entry = document.createElement("div");
	entry.textContent = hints[idx];
	UI.displays.hintLog.appendChild(entry);
	SFX.hint();
	spawnStamp("hint");
}

function skipRound() {
	if (!Session.postGameFreeplay && Session.score < CONFIG.COST_SKIP) {
		SFX.skipBroke();
		spawnStamp("skip_broke");
		return;
	}
	if (!Session.postGameFreeplay) {
		dispatch({ type: "SCORE_DEDUCT", payload: CONFIG.COST_SKIP });
	}
	Round._skipsUsed++;
	SFX.skip();
	spawnStamp("skip");
	setTimeout(() => nextRound(), 600); /* delay */
}

// ── MINI-GAME ENGINE ────────────────────────────────────────────

const MINIGAMES = [
	{ id: "peak", name: "PEAK HIT", desc: "Tap the button each time the wave crests." },
	{ id: "needle", name: "NEEDLE STOP", desc: "Stop the needle inside the green zone." },
	{ id: "pulse", name: "PULSE TAP", desc: "Tap in sync with the pulse. Match the beat 4 times." },
	{ id: "noise", name: "NOISE FILTER", desc: "Mash the button to clear the static before time runs out." },
];

const MG_DIFFICULTY = [
	{ peakSpeed: 0.003, peakTarget: 3, needleBase: 0.35, needleLimit: 0.9, pulseWindow: 180, noiseDecay: 0.04 },
	{ peakSpeed: 0.004, peakTarget: 3, needleBase: 0.45, needleLimit: 1.1, pulseWindow: 150, noiseDecay: 0.035 },
	{ peakSpeed: 0.005, peakTarget: 4, needleBase: 0.55, needleLimit: 1.3, pulseWindow: 120, noiseDecay: 0.03 },
	{ peakSpeed: 0.006, peakTarget: 4, needleBase: 0.65, needleLimit: 1.5, pulseWindow: 100, noiseDecay: 0.025 },
];

// ── MINIGAME CONSTANTS ──────────────────────────────
const MG_PEAK_DURATION = 7000;
const MG_PEAK_THRESHOLD = 0.85;
const MG_PEAK_PERFECT_SCORE = 30;
const MG_PEAK_PARTIAL_MULT = 8;

const MG_NEEDLE_DURATION = 6000;
const MG_NEEDLE_MAX_TRIES = 3;
const MG_NEEDLE_GREEN_LO = 0.33;
const MG_NEEDLE_GREEN_HI = 0.67;
const MG_NEEDLE_SPEED_STEP = 0.15;
const MG_NEEDLE_BASE_SCORE = 10;
const MG_NEEDLE_PRECISION_MULT = 20;

const MG_PULSE_BPM = 90;
const MG_PULSE_TARGET = 4;
const MG_PULSE_DURATION = 10000;
const MG_PULSE_PERFECT_SCORE = 35;
const MG_PULSE_PARTIAL_MULT = 8;

const MG_NOISE_DURATION = 6500;
const MG_NOISE_PERFECT_SCORE = 40;
const MG_NOISE_REGEN_DELAY = 3000;
const MG_NOISE_REGEN_RATE = 0.0001;
const MG_NOISE_CLEAR_AT = 0.05;

let mgRaf = null,
	mgDone = false,
	mgOnDone = null,
	mgBonusPts = 0;
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

	if (mgRaf) {
		cancelAnimationFrame(mgRaf);
		mgRaf = null;
	}
	mgDrawIdle(mg);
}

function mgStart(cfg, mg) {
	const btn = $mg("mg-btn");
	btn.textContent = "...";
	btn.disabled = true;

	let c = 3;
	$mg("mg-status").textContent = `GET READY · ${c}`;
	const iv = setInterval(() => {
		c--;
		SFX.beep(c > 0 ? 660 : 880, 0.1, 0.15);
		if (c > 0) {
			$mg("mg-status").textContent = `GET READY · ${c}`;
		} else {
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
		case "peak":
			mgPeakStart(cfg);
			break;
		case "needle":
			mgNeedleStart(cfg);
			break;
		case "pulse":
			mgPulseStart(cfg);
			break;
		case "noise":
			mgNoiseStart(cfg);
			break;
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
	$mg("mg-status").className = `mg-status ${win ? "win" : "bad"}`;
	$mg("mg-bonus-tag").textContent = pts > 0 ? `+${pts} pts bonus carried to next level` : "no bonus this time";

	const btn = $mg("mg-btn");
	btn.textContent = "CONTINUE";
	btn.disabled = false;
	btn.className = "mg-action-btn";
	btn.onclick = () => {
		if (mgOnDone) mgOnDone();
	};

	if (win) {
		flash("#00ffb4");
		SFX.lock();
	} else {
		SFX.fail();
	}
}

// ── IDLE DRAW ─────────────────────────────────────

function mgDrawIdle(mg) {
	const c = $mg("mg-canvas");
	c.width = c.offsetWidth || 400;
	c.height = 110;
	const ctx = c.getContext("2d"),
		W = c.width,
		H = c.height;
	const t = Date.now() * 0.001;
	ctx.clearRect(0, 0, W, H);
	ctx.strokeStyle = "rgba(0,255,180,0.06)";
	ctx.lineWidth = 0.5;
	ctx.beginPath();
	ctx.moveTo(0, H / 2);
	ctx.lineTo(W, H / 2);
	ctx.stroke();
	ctx.beginPath();
	for (let x = 0; x < W; x++) {
		const y = H / 2 - fastSin((x / W) * Math.PI * 4 + t) * H * 0.3;
		x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
	}
	ctx.strokeStyle = "#00ffb4";
	ctx.lineWidth = 1.5;
	ctx.stroke();
	if (!mgDone) mgRaf = requestAnimationFrame(() => mgDrawIdle(mg));
}

// ── PEAK HIT ──────────────────────────────────────

function mgPeakStart(cfg) {
	const TARGET_HITS = cfg.peakTarget;
	let hits = 0,
		lastPeak = false,
		startT = Date.now();
	const duration = MG_PEAK_DURATION;
	let peakHitThisWindow = false;
	let missedTimeout = null;
	mgState = { hits: 0, canHit: false, flashUntil: 0 };

	const btn = $mg("mg-btn");
	btn.textContent = "HIT";
	btn.disabled = false;
	btn.onclick = () => {
		if (mgDone || !mgState.canHit) return;
		hits++;
		mgState.hits = hits;
		SFX.beep(880 + hits * 80, 0.1, 0.2);
		mgState.flashUntil = performance.now() + 80;
		$mg("mg-status").textContent = `HIT! ${hits}/${TARGET_HITS}`;
		$mg("mg-status").className = "mg-status win";
		peakHitThisWindow = true;
		mgState.canHit = false;
		if (hits >= TARGET_HITS) {
			mgFinish(MG_PEAK_PERFECT_SCORE, "PERFECT TIMING!", true);
			return;
		}
	};

	$mg("mg-bar-wrap").style.display = "block";

	function tick() {
		if (mgDone) return;
		const now = Date.now(),
			elapsed = now - startT;
		const timeLeft = Math.max(0, (duration - elapsed) / duration);
		$mg("mg-bar").style.width = `${timeLeft * 100}%`;
		$mg("mg-bar").style.background = timeLeft > 0.4 ? "#00ffb4" : "#ff4554";

		if (elapsed > duration) {
			const pts = mgState.hits >= TARGET_HITS ? MG_PEAK_PERFECT_SCORE : mgState.hits * MG_PEAK_PARTIAL_MULT;
			mgFinish(pts, mgState.hits >= TARGET_HITS ? "PERFECT!" : `Missed some peaks. +${mgState.hits * MG_PEAK_PARTIAL_MULT} pts`, mgState.hits >= TARGET_HITS);
			return;
		}

		const c = $mg("mg-canvas");
		c.width = c.offsetWidth || 400;
		c.height = 110;
		const ctx = c.getContext("2d"),
			W = c.width,
			H = c.height;
		const t = now * cfg.peakSpeed;
		const waveY = fastSin(t);
		const isPeak = waveY > MG_PEAK_THRESHOLD;

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

		ctx.strokeStyle = "rgba(0,255,180,0.06)";
		ctx.lineWidth = 0.5;
		ctx.beginPath();
		ctx.moveTo(0, H / 2);
		ctx.lineTo(W, H / 2);
		ctx.stroke();
		ctx.fillStyle = "rgba(0,255,180,0.06)";
		ctx.fillRect(0, 0, W, H * 0.2);
		ctx.font = "8px Share Tech Mono";
		ctx.fillStyle = "rgba(0,255,180,0.4)";
		ctx.fillText("PEAK ZONE", 4, 12);

		ctx.beginPath();
		for (let x = 0; x < W; x++) {
			const wt = (x / W) * Math.PI * 6 + t - Math.PI * 3;
			const y = H / 2 - fastSin(wt) * H * 0.38;
			x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
		}
		ctx.strokeStyle = isPeak ? "#ffb830" : "#00ffb4";
		ctx.lineWidth = isPeak ? 2.5 : 1.5;
		if (isPeak) {
			ctx.shadowColor = "#ffb830";
			ctx.shadowBlur = 10;
		}
		ctx.stroke();
		ctx.shadowBlur = 0;

		const dotY = H / 2 - waveY * H * 0.38;
		ctx.beginPath();
		ctx.arc(W * 0.5, dotY, 5, 0, Math.PI * 2);
		ctx.fillStyle = isPeak ? "#ffb830" : "rgba(0,255,180,0.5)";
		ctx.fill();

		mgState.canHit = isPeak;

		// NOW! visible for full peak window
		if (isPeak && !lastPeak && !mgDone) {
			peakHitThisWindow = false;
			if (missedTimeout) {
				clearTimeout(missedTimeout);
				missedTimeout = null;
			}
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
	const duration = MG_NEEDLE_DURATION;
	let baseSpeed = cfg.needleBase;
	const speedLimit = cfg.needleLimit;
	const GREEN_LO = MG_NEEDLE_GREEN_LO,
		GREEN_HI = MG_NEEDLE_GREEN_HI;
	let stopped = false;
	let needlePos = 0;
	let tryNo = 0,
		bestPts = 0;
	const MAX_TRIES = MG_NEEDLE_MAX_TRIES;
	let phaseOffset = gameRand() * Math.PI * 2;

	const btn = $mg("mg-btn");
	btn.textContent = "STOP";
	btn.disabled = false;

	btn.onclick = () => {
		if (stopped || mgDone) return;
		const inZone = needlePos >= GREEN_LO && needlePos <= GREEN_HI;
		SFX.beep(inZone ? 880 : 220, 0.1, inZone ? 0.15 : 0.1);
		const precision = inZone ? 1 - Math.abs(needlePos - 0.5) / 0.17 : 0;
		const pts = inZone ? Math.round(MG_NEEDLE_BASE_SCORE + precision * MG_NEEDLE_PRECISION_MULT) : 0;
		if (pts > bestPts) bestPts = pts;
		tryNo++;
		if (tryNo >= MAX_TRIES || inZone) {
			stopped = true;
			mgFinish(bestPts, bestPts > 0 ? `LOCKED! +${bestPts} pts` : "MISSED THE ZONE", bestPts > 0);
		} else {
			baseSpeed = Math.min(speedLimit, baseSpeed + MG_NEEDLE_SPEED_STEP);
			phaseOffset = gameRand() * Math.PI * 2;
			started = Date.now();
			btn.textContent = "STOP";
			btn.disabled = false;
			$mg("mg-status").textContent = `TRY ${tryNo + 1} OF ${MAX_TRIES}`;
			$mg("mg-status").className = "mg-status amber";
		}
	};

	function tick() {
		if (stopped || mgDone) return;
		const now = Date.now();
		const t = (now - started) * 0.001;
		const difficultyCurve = 0.1;
		const speed = Math.min(speedLimit, baseSpeed + t * difficultyCurve);
		const fDrift = 0.04;
		const drift = fastSin(t * 0.7) * fDrift;
		let raw = fastSin(t * (speed + drift) * Math.PI * 2 + phaseOffset);
		const k = 0.6;
		raw = Math.tanh(raw * (1 + k)) / Math.tanh(1 + k);
		if (gameRand() < 0.5) {
			raw += 0.03 * fastSin(t * 6);
		}
		needlePos = 0.5 + 0.5 * raw;

		const c = $mg("mg-canvas");
		c.width = c.offsetWidth || 400;
		c.height = 110;
		const ctx = c.getContext("2d"),
			W = c.width,
			H = c.height;
		ctx.clearRect(0, 0, W, H);

		const trackY = H * 0.6,
			trackH = 8;
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
			ctx.beginPath();
			ctx.moveTo(x, trackY - 4);
			ctx.lineTo(x, trackY + trackH + 4);
			ctx.stroke();
		}

		const nx = W * needlePos;
		const inZone = needlePos >= GREEN_LO && needlePos <= GREEN_HI;

		ctx.strokeStyle = inZone ? "#ffb830" : "#ff4554";
		ctx.lineWidth = 2.5;
		if (inZone) {
			ctx.shadowColor = "#ffb830";
			ctx.shadowBlur = 8 + 6 * Math.sin(now * 0.005);
		}
		ctx.beginPath();
		ctx.moveTo(nx, trackY - 20);
		ctx.lineTo(nx, trackY + trackH + 6);
		ctx.stroke();
		ctx.shadowBlur = 0;

		ctx.beginPath();
		ctx.arc(nx, trackY - 22, 5, 0, Math.PI * 2);
		ctx.fillStyle = inZone ? "#ffb830" : "#ff4554";
		ctx.fill();

		const speedPct = Math.min(1, (speed - 0.6) / 0.8);
		ctx.font = "9px Share Tech Mono";
		ctx.fillStyle = `rgba(255,69,84,${speedPct.toFixed(2)})`;
		ctx.fillText(`SPEED: ${speed.toFixed(2)}x`, 4, 16);

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
	const BPM = MG_PULSE_BPM,
		BEAT_MS = 60000 / BPM;
	const TARGET = MG_PULSE_TARGET;
	const WINDOW = cfg.pulseWindow;
	let hits = 0,
		startT = Date.now(),
		lastBeatT = Date.now(),
		beatCount = 0;
	let flashOn = false;
	let offBeatMsgTimeout = null;

	const btn = $mg("mg-btn");
	btn.textContent = "TAP";
	btn.disabled = false;
	btn.onclick = () => {
		if (mgDone) return;
		const now = Date.now();
		const sinceBeat = Math.abs(now - lastBeatT);
		const onBeat = sinceBeat < WINDOW;
		if (onBeat) {
			hits++;
			SFX.beep(660, 0.08, 0.2);
			$mg("mg-status").textContent = `ON BEAT! ${hits}/${TARGET}`;
			$mg("mg-status").className = "mg-status win";
			if (hits >= TARGET) {
				mgFinish(MG_PULSE_PERFECT_SCORE, "PERFECT RHYTHM!", true);
			}
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
		const now = Date.now(),
			elapsed = now - startT;
		if (elapsed > MG_PULSE_DURATION && !mgDone) {
			mgFinish(hits * MG_PULSE_PARTIAL_MULT + beatCount, `Time's up. +${hits * MG_PULSE_PARTIAL_MULT + beatCount} pts`, false);
			return;
		}
		const sinceLastBeat = now - lastBeatT;
		if (sinceLastBeat >= BEAT_MS) {
			lastBeatT = now;
			beatCount++;
			SFX.beep(440, 0.05, 0.08);
			flashOn = true;
			setTimeout(() => {
				flashOn = false;
			}, 80);
		}
		const beatPhase = sinceLastBeat / BEAT_MS;
		const inWindow = sinceLastBeat < WINDOW || sinceLastBeat > BEAT_MS - WINDOW;

		const c = $mg("mg-canvas");
		c.width = c.offsetWidth || 400;
		c.height = 110;
		const ctx = c.getContext("2d"),
			W = c.width,
			H = c.height;
		ctx.clearRect(0, 0, W, H);

		// Contracting ring
		const ring = Math.max(0, (1 - beatPhase) * W * 0.45);
		const alpha = Math.max(0, 1 - beatPhase);
		ctx.strokeStyle = `rgba(0,255,180,${(alpha * 0.5).toFixed(2)})`;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(W / 2, H / 2, ring, 0, Math.PI * 2);
		ctx.stroke();

		ctx.strokeStyle = inWindow ? "rgba(255,184,48,0.5)" : "rgba(90,112,96,0.2)";
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.arc(W / 2, H / 2, 30, 0, Math.PI * 2);
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(W / 2, H / 2, flashOn ? 14 : 8, 0, Math.PI * 2);
		ctx.fillStyle = flashOn ? "#ffb830" : "rgba(0,255,180,0.6)";
		if (flashOn) {
			ctx.shadowColor = "#ffb830";
			ctx.shadowBlur = 20;
		}
		ctx.fill();
		ctx.shadowBlur = 0;

		for (let i = 0; i < TARGET; i++) {
			ctx.beginPath();
			ctx.arc(W / 2 - (TARGET - 1) * 14 + i * 28, H - 20, 5, 0, Math.PI * 2);
			ctx.fillStyle = i < hits ? "#00ffb4" : "#1a2020";
			ctx.fill();
			ctx.strokeStyle = i < hits ? "#00ffb4" : "#333";
			ctx.lineWidth = 1;
			ctx.stroke();
		}

		ctx.font = "9px Share Tech Mono";
		ctx.fillStyle = "rgba(90,112,96,0.6)";
		ctx.fillText(`BPM: ${BPM}`, 4, 14);

		mgRaf = requestAnimationFrame(tick);
	}
	tick();
}

// ── NOISE FILTER ──────────────────────────────────

function mgNoiseStart(cfg) {
	let noise = 1.0,
		startT = Date.now();
	const duration = MG_NOISE_DURATION;
	let mashes = 0;
	const DECAY = cfg.noiseDecay;
	let bursts = [];
	let shakeUntil = 0;
	let noiseCleared = false;

	const btn = $mg("mg-btn");
	btn.textContent = "CLEAR";
	btn.disabled = false;
	btn.onclick = () => {
		if (mgDone) return;
		noise = Math.max(0, noise - DECAY);
		mashes++;
		SFX.beep(200 + mashes * 10, 0.04, 0.08, "square");

		const c = $mg("mg-canvas");
		const W = c.offsetWidth || 400;
		bursts.push({ x: gameRand() * W, y: gameRand() * 110, start: performance.now() });
		shakeUntil = performance.now() + 100;

		if (noise < 0.1 && !noiseCleared) {
			noiseCleared = true;
			mgState._noiseFlashUntil = performance.now() + 120;
			SFX.beep(1047, 0.15, 0.25);
		}

		if (noise <= MG_NOISE_CLEAR_AT) {
			mgFinish(MG_NOISE_PERFECT_SCORE, "SIGNAL CLEAR!", true);
		}
	};

	$mg("mg-bar-wrap").style.display = "block";

	function tick() {
		if (mgDone) return;
		const pn = performance.now();
		const elapsed = Date.now() - startT;
		const regen = elapsed < MG_NOISE_REGEN_DELAY ? 0 : MG_NOISE_REGEN_RATE;
		noise = Math.min(1, noise + regen);
		const timeLeft = Math.max(0, 1 - elapsed / duration);
		$mg("mg-bar").style.width = `${timeLeft * 100}%`;
		$mg("mg-bar").style.background = timeLeft > 0.4 ? "#00ffb4" : "#ff4554";

		if (elapsed > duration && !mgDone) {
			const pts = noise < 0.3 ? 20 : noise < 0.6 ? 10 : 0;
			mgFinish(pts, noise < 0.15 ? `Mostly clear. +${pts} pts` : `Static remains. +${pts} pts`, noise < 0.3);
			return;
		}

		const c = $mg("mg-canvas");
		c.width = c.offsetWidth || 400;
		c.height = 110;
		const ctx = c.getContext("2d"),
			W = c.width,
			H = c.height;
		const shaking = pn < shakeUntil;

		ctx.save();
		if (shaking) {
			ctx.translate(2 * (gameRand() - 0.5), 2 * (gameRand() - 0.5));
		}

		ctx.clearRect(-5, -5, W + 10, H + 10);

		// Clean sine with emergent opacity/lineWidth
		const cleanAlpha = noise < 0.5 ? 0.3 + (1 - noise * 2) * 0.7 : 0;
		const cleanLineWidth = noise < 0.5 ? 1.5 + (1 - noise * 2) * 1.5 : 0;
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
				const amp = (gameRand() - 0.5) * H * 0.7 * noise;
				const y = H / 2 + amp;
				ctx.beginPath();
				ctx.moveTo(x, H / 2);
				ctx.lineTo(x, y);
				ctx.strokeStyle = `hsl(${140 + gameRand() * 40},60%,${40 + gameRand() * 20}%)`;
				ctx.lineWidth = 1.5;
				ctx.stroke();
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
				ctx.beginPath();
				ctx.moveTo(b.x, b.y);
				ctx.lineTo(b.x + dx, b.y + dy);
				ctx.stroke();
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
		ctx.fillText(`NOISE: ${pct}%`, 4, 14);

		$mg("mg-status").textContent = noise < 0.15 ? "Almost clear!" : noise < 0.4 ? "Keep going..." : "Mash harder!";
		$mg("mg-status").className = `mg-status${noise < 0.15 ? " win" : noise < 0.4 ? " amber" : ""}`;

		mgRaf = requestAnimationFrame(tick);
	}
	tick();
}

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

	const smallViewport = matchMedia("(max-width: 640px)").matches || navigator.maxTouchPoints > 0;

	/* 
		Current evidence from your browser + your machine:

		classic for      clear winner
		forEach          second
		for...of         last

		For your game code specifically:

		document
			.querySelectorAll('[filter="url(#logoGlowSoft)"]')
			.forEach(n=>void n.removeAttribute("filter"));

		is compact, but if this runs frequently:

		const nodes =
			document.querySelectorAll(
				'[filter="url(#logoGlowSoft)"]'
			);

		for(let i=0;i<nodes.length;i++)
			nodes[i].removeAttribute("filter");

		is now empirically justified rather than folklore-based.
	*/
	if (smallViewport) {
		// TEMPNOTE: Delete it. Since we completely deleted the <filter
		// id="logoGlowSoft"> from the HTML, this code is now doing a heavy DOM
		// query for an element that doesn't exist. You can delete that if block
		// and the long comment above it.
		//
		// document.querySelectorAll('[filter="url(#logoGlowSoft)"]').forEach(n => void n.removeAttribute("filter"));
	}

	const scale = smallViewport ? 0.5 : 1;
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
		cream: styles.getPropertyValue("--cream").trim(),
		coral: styles.getPropertyValue("--coral").trim(),
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
	window.addEventListener("blur", () => {
		_logoLastTime = 0;
		_logoElapsedTime = 0;
		_lastLogoFrame = 0;
	});

	function draw(ts) {
		const dt = Math.min(ts - _logoLastTime, RENDER.DT_MAX);
		_logoElapsedTime += dt;
		_logoLastTime = ts;

		const frameInterval = smallViewport ? 50 : 33;
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
		const t = RENDER.FRAME_INDEPENDENT ? _logoElapsedTime * RENDER.LOGO_SPEED : ts * RENDER.LOGO_SPEED;

		ctx.clearRect(0, 0, W, H);

		const step = smallViewport ? Math.round(1 / scale) : 1;
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
_prefetchBGM(BGM_POOL.menu[0]).then(() => {
	for (let i = 1; i < BGM_POOL.menu.length; i++) _prefetchBGM(BGM_POOL.menu[i]);
});
renderStartScreen();
showScreen("start");

// Old assumption:
//  game math expensive
//
// Current reality:
//  browser systems expensive
//
// Canvas capture and DOM writes are now your engine. Everything else is noise.

// /**
//  * 🛰️ ZENITH STEALTH LOADER
//  * Listens for "zenith" and dynamically imports/runs the audit suite.
//  * NOTE: Currently perf-zenith.js is in root dir. SUGGESTION: /js/debug/perf-zenith.js
//  */
(() => {
	// --- BRIDGE FOR ZENITH AUDIT ---
	Object.assign(window, { matchScore, buildTarget, syncLabels, readSliders, drawWave, fastSin, _sfxNote });

	let buffer = "";
	const secret = "zenith";
	window.addEventListener("keydown", function loader(e) {
		if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
		buffer = (buffer + e.key.toLowerCase()).slice(-secret.length);

		if (buffer === secret) {
			if (window.perfAudit) {
				window.perfAudit.runAll();
				return;
			}

			const s = document.createElement("script");
			s.src = `/perf-zenith.js?v=${Date.now()}`;
			s.onload = () => {
				window.perfAudit.runAll();
			};
			document.head.appendChild(s);
		}
	});
})();

/**
 * 🛰 STEALTH PERF LOADER
 *
 * Type:
 *
 * deepscan
 *
 * Dynamically loads perf-deepscan.js
 * and runs diagnostics.
 */
(() => {
	Object.assign(window, { matchScore, buildTarget, syncLabels, readSliders, drawWave, fastSin, _sfxNote });
	let buffer = "";
	const secret = "deepscan";
	window.addEventListener("keydown", async e => {
		if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
		buffer = (buffer + e.key.toLowerCase()).slice(-secret.length);

		if (buffer !== secret) return;

		if (window.perfAuditDeepScan) {
			await perfAuditDeepScan.runAll();
			return;
		}
		const s = document.createElement("script");
		s.src = `/perf-deepscan.js?v=${Date.now()}`;
		s.onload = async () => {
			await perfAuditDeepScan.runAll();
		};
		document.head.appendChild(s);
	});
})();
// ─── RESPONSIVE CONTROL MODE ─────────────────────────────────────────────────
initControls();

// New audit interpretation:
//
// Final hierarchy
// Replay Capture     65.3ms
// syncLabels          0.22ms
// drawWave            0.05ms
// readSliders         0.01ms
// matchScore          ~0
//
// You effectively have one real bottleneck and one medium one.
