# Mixed Signals — Roadmap

> "Audit files" is quite broad. Could you clarify what kind of audit you're looking for?
> - Security audit — secrets, vulnerabilities, dependency issues
> - Code quality audit — linting, type errors, dead code, anti-patterns
> - Dependency audit — outdated packages, unused deps, license compliance
> - File structure audit — large files, orphaned files, naming conventions
> - Something else — please specify

## P0 — Compact controls (CSS only) ✓

Target: `@media (max-width: 640px)` at `style.css:217`

- [x] `.param-list` gap: 10px → 6px
- [x] `.ctrl` gap: 4px → 2px
- [x] `.slider-meta` padding: `0 14px` → `0 10px`
- [x] `.slider-row` padding: `0 14px` → `0 10px`
- [x] `.slider-meta label` font-size: 10px → 9px
- [x] `.slider-val` font-size: 10px → 9px, padding: `3px 8px` → `2px 6px`
- [x] `.timer-ring-wrap` top/right: `6px 10px` → `4px 6px`
- [x] `.action-row` margin-top inside media query: 16px → 10px
- [x] `#game` padding inside media query: `16px 12px` → `12px 10px`
- [x] Keep scope height 120px, thumb 28px — touch targets unchanged
- [x] No layout reshuffling, no component moves

---

## P1A — Lifecycle extraction (main.js + index.html) ✓

### New functions (~line 1870)

- [x] `exitLevel()` — shared teardown: `_lockAnimStart = 0` + `clearInterval` + `stopLoop` + `stopSignalPlayback` + `won = false`
- [x] `enterLevel()` — shared round setup: `showScreen("game")` + `buildTarget` + `invalidateMatchScore` + `applyLevelUI` + `resetYours` + `startTimer` + `startSignalPlayback` + `startLoop`

### Refactored call sites

- [x] `goToMenu()` → `exitLevel(); [tutorial cleanup + render]`
- [x] `gameOver()` → `exitLevel(); flash; spawnStamp; showScreen("dead"); SFX.fail();`
- [x] `victory()` → `exitLevel(); [victory UI];`
- [x] `showLevelUpScreen()` → `exitLevel(); [level up UI]; SFX.levelUp();`
- [x] `nextRound()`, `continueLevel()`, `endFreePlay()` → use `enterLevel()` for setup
- [x] `startFreePlay()` → stays mostly as-is (no lifecycle needed)

### Inline onclick → addEventListener

- [x] `#pb-target`, `#pb-yours`, `#pb-ab` — `setPlaybackMode` listeners
- [x] `.type-btn` (×6) — delegated `setType` listener on `#type-btns`
- [x] `.param-list` sliders — delegated `recompute` listener
- [x] `#menu-btn` → `goToMenu`
- [x] `#skip-tut` → `skipTutorial`
- [x] `#btn-freeplay-ready` → `endFreePlay`
- [x] BGM mute via settings toggle `#stg-bgm` → `toggleMute()`
- [x] `.sys-btn` hint/skip → `useHint` / `skipRound`
- [x] Remove `onclick` attributes from `index.html`

### Verify

- [x] No lingering sound after lock, menu, game over
- [x] No controls active after lock
- [x] No timer continuation after transition

---

## P1B — Audio-assisted beating (main.js) ✓

Architecture:

```
target osc ──┐
              ├── beatingMixGain ── pointerGateGain ── limiter ──► destination
yours osc  ──┘
                    ▲                    ▲
              always 1          pointerdown: 0→vol
                                pointerup: vol→0
```

- [x] Create `_beatingMix` + `_pointerGate` gain nodes
- [x] Route channel `masterGain`s to `_beatingMix` instead of limiter directly
- [x] `_pointerGate.gain` starts at 0 (silent), opens on scope touch
- [x] Pointer handlers on `#c-overlay`: `pointerdown` ramps gate on, `pointerup`/`pointerleave` ramps off
- [x] Add `PB.BEAT_VOL`, `PB.GATE_ATTACK`, `PB.GATE_RELEASE` constants
- [x] Default listening mode is beating (both channels audible on touch)
- [x] Beating bus low-pass filter set at 3000 Hz

---

## P1C — SFX mute toggle ✓

- [x] Add SFX mute toggle to settings (`#stg-sfx`) + `toggleSfxMute()` function
- [x] Independent `sfxMuted` state + `toggleSfxMute()` function
- [x] All SFX functions check `sfxMuted` instead of `muted`

---

## P2 — Learning + personality ✓

- [x] Unlock ceremonies — screen on first encounter of new param
- [x] Signal archetypes — authored named signals (heartbeat, sonar, reactor…)
- [x] Grace theme system — visual theme per level matching new param
- [x] Micro replay — brief replay of the lock-in moment

---

## P3 — Emotional layer

- [x] Score expression — combo streaks, tiered stamps
- [x] Tension amplification — timer <10s: scope glow shift
- [x] Tension amplification — timer <10s: filter sweep (low-pass 2200→150 Hz over ~7s)

---

## P4 — Structural

- [x] Inline migration — verify no remaining `onclick` in HTML
- [x] Telemetry — `{level, attempts, hints, timeRemaining, lockPercent}` → localStorage
- [x] Difficulty tuning — adjust `LEVELS` timing/rounds from telemetry data

---

## P5 — Test health

**Option B — Self-validating tests** (minimal, 1 file only)
- [x] Add validation in `mixed-signals.test.js` that reads `main.js` source by regex and asserts `CONFIG`, `LEVELS.length` and other shared constants match the test file's inline copies. Catches silent drift without extracting modules.

---

## P6 — Codebase hygiene (from audit)

### High priority

- [ ] Extract shared constants (`CONFIG`, `LEVELS`, `CEREMONIES`, `ARCHETYPES`, `BGM_POOL`, `SAMPLERS`, `DEFAULT_SETTINGS`, `SAVE_KEY`, `smoothstep`, `sigmoid`, `dispatch`) into `const.js` — eliminates test/main.js drift
- [x] Delete stale `_archive/` directory (42 files, 2.8 MB)
- [ ] Add `package.json` with lint (ESLint) and typecheck (`tsc --noEmit` / JSDoc) scripts
- [x] Remove `window._testMG` debug global from production code
- [ ] Resolve `wrangler.jsonc` schema reference (`$schema` points to `node_modules/wrangler/config-schema.json` which doesn't exist locally)
- [x] Consume `gamePick` — replace `valid[rng(0, valid.length-1)]` (buildTarget, l.2347) and `unrevealedIndices[rng(0, unrevealedIndices.length-1)]` (useHint, l.3033) with `gamePick(valid)` / `gamePick(unrevealedIndices)`
- [x] Consume `mgBonusPts` — read in `showLevelUpScreen()` (~l.2658), append bonus amount to `UI.displays.luMsg` text
- [x] Consume `beatCount` — use in `mgFinish()` scoring formula (~ll.3509, 3534) for accuracy-based rewards (ratio of `hits` to total `beatCount`)

### Medium priority

- [x] Remove empty `resources/image/` directory
- [x] Replace `Math.random()` calls in minigames (`mgNeedleStart` phaseOffset, noise bursts) with seeded game RNG for determinism
- [x] Replace remaining `Math.random()` calls in rendering (`loop` spring, `showScorePop` squish) with seeded RNG
- [x] Fix `postGameFreeplay` — unlimited rounds, infinite timer, free hints/skips
- [x] Sync `types.d.ts` with `main.js` — `toggleMute`, `toggleSfxMute`, `SaveSettings`, `SessionState`, `normalizePhase`, logo scope vars
- [x] Show per-level stats (score, best, rounds, combo, hints, skips) on level-up screen
- [ ] Add keyboard focus indicators — buttons with `outline: none` have no visible focus fallback
- [ ] Prune stale git branches (20 branches — 10 local + 10 remote, several unmerged)

### Low priority

- [ ] Check `--text-mute` (#4a4438) contrast against `--bg` (#1c1915) — may fail WCAG AA
- [ ] Extract minigame magic numbers (`BPM: 90`, `MAX_TRIES: 3`, noise regen `0.0001`) into named constants
- [ ] Add JSDoc types to `applySignal`, `scheduleRender`, `syncLabels`, `readSliders`

---

## P7 — Recent additions (from CHANGELOG, not originally tracked)

### Settings & controls

- [x] Full settings overlay with ceremonies, screen shake, and audio controls (BGM/SFX volume, mute)
- [x] Keyboard shortcuts: 1-6 for waveform types, Escape for overlays
- [x] SFX volume slider independent of BGM volume

### Assist & accessibility

- [x] Assist mode toggles: infinite time, easy match (88% win threshold), no-fail
- [x] Urgent-cue toggle to disable heartbeat SFX during countdown
- [x] Toggle for bonus rounds (minigames) in settings, default off

### Mini-games

- [x] Mini-game engine with 4 games (Peak Hit, Needle Stop, Pulse Tap, Noise Filter)

### Hints & feedback

- [x] Persistent hint system — each purchase reveals a new unrevealed parameter, accumulates as a row overlay
- [x] Stamp feedback system with animated overlays for lock, fail, skip, hint
- [x] Click sounds on all silent UI buttons

### Game feel & polish

- [x] Target signal parameters revealed on game over screen
- [x] BGM prefetcher with fetch + blob URL cache for instant playback
- [x] Debut-archetype filter + weighted param selection + chaos jitter on re-encounter
- [x] Audio channel: warm analog-feel sound effects, melodic lock variants
- [x] Tutorial clarity improvements (glow effects, contrast, step locking)
