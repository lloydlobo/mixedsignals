# Mixed Signals — Roadmap

## P0 — Compact controls (CSS only) ✓

Target: `@media (max-width: 640px)` at `style.css:224`

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

### New functions (~line 1515)

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
- [x] `#mute-btn` → `toggleMute`
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
- [x] Filter lowered 1800 → 800 Hz for warmer tone

---

## P1C — SFX mute toggle ✓

- [x] Add `#sfx-btn` button to HTML
- [x] Independent `sfxMuted` state + `toggleSfxMute()` function
- [x] All SFX functions check `sfxMuted` instead of `muted`

---

## P2 — Learning + personality

- [x] Unlock ceremonies — screen on first encounter of new param
- [x] Signal archetypes — authored named signals (heartbeat, sonar, reactor…)
- [x] Grace theme system — visual theme per level matching new param
- [x] Micro replay — brief replay of the lock-in moment

---

## P3 — Emotional layer

- [ ] Score expression — combo streaks, tiered stamps
- [x] Tension amplification — timer <10s: scope glow shift
- [x] Tension amplification — timer <10s: filter sweep (low-pass 2200→150 Hz over 8s)

---

## P4 — Structural

- [x] Inline migration — verify no remaining `onclick` in HTML
- [ ] Telemetry — `{level, attempts, hints, timeRemaining, lockPercent}` → localStorage
- [ ] Difficulty tuning — adjust `LEVELS` timing/rounds from telemetry data
