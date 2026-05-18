type Waveform = "sine" | "square" | "sawtooth" | "triangle" | "pwm" | "am";

interface Signal {
    type: Waveform;
    freq: number;
    amp: number;
    phase: number;
    dc: number;
    harm: number;
    noise: number;
    archetype?: string;
}

interface Level {
    rounds: number;
    time: number;
    types: Waveform[];
    phase: boolean;
    dc: boolean;
    harm: boolean;
    noise: boolean;
    grace?: boolean;
    freeplay?: boolean;
    graceColor?: string;
}

interface SaveSettings {
    bgmMuted: boolean;
    sfxMuted: boolean;
    bgmVolume: number;
    sfxVolume: number;
    ceremonies: boolean;
    screenShake: boolean;
    minigames: boolean;
    assistDisableUrgent: boolean;
    assistInfiniteTime: boolean;
    assistEasyMatch: boolean;
    assistNoFail: boolean;
}

interface SaveData {
    highestLevel: number;
    bestScores: number[];
    seenCeremonies: number[];
    settings?: SaveSettings;
}

type Screen = "start" | "dead" | "levelup" | "levelselect" | "game" | "minigame";

type PlaybackMode = "off" | "target" | "yours" | "ab";

type StampType = "hint" | "skip" | "fail" | "success" | "hint_broke" | "skip_broke";

interface Channel {
    osc: OscillatorNode | null;
    modOsc: OscillatorNode | null;
    carGain: GainNode | null;
    modGain: GainNode | null;
    ampGain: GainNode | null;
    masterGain: GainNode | null;
    filter: BiquadFilterNode | null;
    type: string;
}

interface Archetype {
    name: string;
    type: Waveform;
    freq: number;
    amp: number;
    phase: number;
    dc: number;
    harm: number;
    levelMin: number;
}

interface Ceremony {
    tag: string;
    color: string;
    title: string;
    desc: string;
}

interface Action {
    type: string;
    payload?: any;
}

interface TutorialTask {
    text: string;
    check: () => boolean;
}

interface SliderValues {
    freq: number;
    amp: number;
    phase: number;
    dc: number;
    harm: number;
    noise: number;
}

interface RoundState {
    roundNo: number;
    timeLeft: number;
    won: boolean;
    _lockAnimStart: number;
    _lockScrollPos: number;
    _lastPct: number;
    _recomputeScheduled: boolean;
    _setTypeScheduled: boolean;
    _lastUrgentSfx: number;
    _wasCloseSfx: boolean;
    _revealedHints: Set<string> | null;
    reset(): void;
}

interface SessionState {
    score: number;
    levelStartScore: number;
    level: number;
    freePlayActive: boolean;
    tutorialStep: number;
    tutorialActive: boolean;
    muted: boolean;
    sfxMuted: boolean;
    volume: number;
    screenShake: boolean;
    minigames: boolean;
    ceremonies: boolean;
    assistDisableUrgent: boolean;
    assistInfiniteTime: boolean;
    assistEasyMatch: boolean;
    assistNoFail: boolean;
    sfxVolume: number;
    postGameFreeplay: boolean;
}

interface BgmPool {
    menu: string[];
    gameplay: string[];
    result: null;
}

interface BgmState {
    MENU: string;
    GAMEPLAY: string;
    RESULT: string;
}

interface WaveColors {
    target: string;
    yours: string;
}

interface RenderConfig {
    DT_MAX: number;
    FRAME_INDEPENDENT: boolean;
    SCROLL_BASE_MS: number;
    SCROLL_MIN_MS: number;
    SCROLL_EASE_EXP: number;
    SCROLL_EASE_FACTOR: number;
    LOCK_MS: number;
    TIMER_CIRC: number;
    LOGO_SPEED: number;
}

interface PbConfig {
    TARGET_VOL: number;
    YOURS_VOL: number;
    FADE: number;
    TC: number;
    BEAT_VOL: number;
    GATE_ATTACK: number;
    GATE_RELEASE: number;
}

interface MgState {
    hits?: number;
    canHit?: boolean;
    flashUntil?: number;
    _noiseFlashUntil?: number;
}

declare var CONFIG: Readonly<{
    FIXED_STEPS_PRECISION: 2;
    TIME_BONUS_RATE: 0.8;
    BASE_REWARD: 100;
    COST_HINT: 25;
    COST_SKIP: 130;
    WIN_PERCENTAGE: 95;
    CLOSE_PERCENTAGE: 75;
    NOISE_TOLERANCE_PER_UNIT: 1.2;
}>;

declare var WAVE_COLORS: WaveColors;
declare var LEVELS: Level[];
declare var CEREMONIES: Record<number, Ceremony>;
declare var ARCHETYPES: Archetype[];
declare var TUTORIAL_TASKS: TutorialTask[];
declare var TUTORIAL_CONTROLS: string[];
declare var BGM_STATE: BgmState;
declare var BGM_POOL: BgmPool;
declare var RENDER: RenderConfig;
declare var PB: PbConfig;
declare var WAVEFORM_GAIN: Record<Waveform, number>;
declare var SCORE_SAMPLES: 96;
declare var AudioCtx: (typeof AudioContext) | null;
declare var SAVE_KEY: string;
declare var BUTTON_ACTIONS: Record<string, Function>;

declare var targetSignal: Signal;
declare var yoursSignal: Signal;
declare var timerInterval: ReturnType<typeof setInterval> | null;
declare var animRaf: number | null;
declare var Round: RoundState;
declare var Session: SessionState;
declare var UI: Record<string, any>;
declare var gameRand: () => number;
declare var stampRand: () => number;
declare var _pbMode: PlaybackMode;
declare var _cachedMatchScore: number;
declare var _matchScoreDirty: boolean;
declare var _chTarget: Channel;
declare var _chYours: Channel;
declare var _canvas: HTMLCanvasElement;
declare var _ctx: CanvasRenderingContext2D;
declare var _canvasW: number;
declare var _elapsedTime: number;
declare var _lastTime: DOMHighResTimeStamp;
declare var _playbackActive: boolean;
declare var _activeStamp: HTMLElement | null;
declare var _limiter: DynamicsCompressorNode | null;
declare var _pointerGate: GainNode | null;
declare var _tensionFilter: BiquadFilterNode | null;
declare var _clarityFilter: BiquadFilterNode | null;
declare var _lastClarity: number;
declare var _actx: AudioContext | null;
declare var _lastSliderSfx: number;
declare var MIX: Record<string, AudioNode | null>;
declare var mgRaf: number | null;
declare var mgDone: boolean;
declare var mgOnDone: (() => void) | null;
declare var mgBonusPts: number;
declare var mgState: MgState;
declare var _logoScopeRAF: number | null;

declare function showScreen(screen: Screen): void;
declare function currentScreen(): Screen;
declare function initUI(): void;
declare function initEvents(): void;
declare function initCanvas(): void;
declare function initAudio(): void;
declare function initLogoScope(): void;
declare function initSettingsOverlay(): void;

declare function dispatch(action: Action): void;

declare function loadSave(): SaveData;
declare function writeSave(data: SaveData): void;
declare function recordLevelComplete(completedLevel: number, runScore: number): void;
declare function freshSave(): SaveData;

declare function renderStartScreen(): void;
declare function showLevelSelect(): void;
declare function continueSave(): void;
declare function startLevelFromSelect(selectedLevel: number): void;

declare function startGame(): void;
declare function restartGame(): void;
declare function goToMenu(): void;
declare function continueLevel(): void;
declare function startTutorial(): void;
declare function skipTutorial(): void;
declare function endTutorial(): void;
declare function startFreePlay(): void;
declare function endFreePlay(): void;
declare function victory(): void;
declare function gameOver(): void;
declare function showCeremony(): void;
declare function dismissCeremony(): void;
declare function showLevelUpScreen(): void;
declare function enterLevel(): void;
declare function exitLevel(): void;
declare function nextRound(): void;
declare function hasPendingCeremony(): boolean;

declare function showSettings(): void;
declare function closeSettings(): void;
declare function renderSettings(): void;

declare function useHint(): void;
declare function skipRound(): void;

declare function showTutorialTask(): void;
declare function lockControl(stepIndex: number): void;
declare function unlockAllTutorialControls(): void;
declare function checkTutorial(): void;
declare function highlightControl(): void;

declare function spawnStamp(type: StampType): void;

declare function makeRand(seed?: number): () => number;
declare function rng(lo: number, hi: number): number;

declare function actx(): AudioContext;
declare function createMixGraph(): void;
declare function initBeatingBus(): void;
declare function resetTensionFilter(): void;
declare function duckTarget(): void;
declare function updateMixState(): void;
declare function getLimiter(): DynamicsCompressorNode;

declare function freqToHz(freq: number): number;

declare function _emptyChannel(): Channel;
declare function _buildChannel(ch: Channel, sig: Signal): void;
declare function _updateChannel(ch: Channel, sig: Signal): void;
declare function _destroyChannel(ch: Channel): void;
declare function _setVol(ch: Channel, vol: number): void;
declare function _fadeOutChannel(ch: Channel): void;

declare function startSignalPlayback(): void;
declare function stopSignalPlayback(): void;
declare function setPlaybackMode(mode: PlaybackMode): void;
declare function updateYoursPlayback(): void;
declare function _updatePlaybackUI(): void;
declare function setVolume(v: number): void;
declare function toggleMute(sfx?: boolean): void;
declare function startMusic(): void;

declare function sample(sig: Signal, t: number, addNoise: boolean): number;
declare function matchScore(): number;
declare function invalidateMatchScore(): void;
declare function winThreshold(): number;

declare function buildTarget(): Signal;
declare function readSliders(): SliderValues;
declare function applySignal(sig: Partial<SliderValues>): void;
declare function resetYours(): void;

declare function applyLevelUI(): void;
declare function startTimer(): void;
declare function startLoop(): void;
declare function stopLoop(): void;

declare function updateMeter(): void;
declare function recompute(): void;
declare function scheduleRender(): void;
declare function setType(btn: HTMLElement): void;
declare function syncLabels(): void;

declare function drawWave(sig: Signal, color: string, W: number, H: number, scroll: number, lineW: number): void;
declare function loop(ts: DOMHighResTimeStamp): void;
declare function flash(color: string): void;
declare function showScorePop(points: number): void;

declare function runMiniGame(completedLevel: number, onDone: () => void): void;
declare function mgStart(cfg: any, mg: any): void;
declare function mgLaunch(cfg: any, mg: any): void;
declare function mgFinish(pts: number, msg: string, win: boolean): void;
declare function mgDrawIdle(mg: any): void;
declare function mgPeakStart(cfg: any): void;
declare function mgNeedleStart(cfg: any): void;
declare function mgPulseStart(cfg: any): void;
declare function mgNoiseStart(cfg: any): void;

declare function lsGet(key: string, fallback?: any): string | null;
declare function lsSet(key: string, value: string): void;
declare function _bgmSrc(filename: string): string;
declare function _prefetchBGM(filename: string): Promise<void>;
declare function _playFromPool(pool: string[], stateKey: string): void;
declare function transitionBGM(state: string): void;

declare function _warmNote(ac: AudioContext, freq: number, startTime: number, gain: number, duration: number, detune?: number): void;
declare function _sfxNote(opts: Record<string, any>): void;

declare var SFX: Record<string, Function>;
declare function onSettingsVolChange(key: string, sessionKey: string | null, slider: HTMLInputElement): void;
declare function toggleSetting(key: string, sessionKey: string): void;
