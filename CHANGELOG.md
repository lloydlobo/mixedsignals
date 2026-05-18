# Changelog

All notable changes to Mixed Signals.

## [Unreleased]

### Features
- Signal archetypes: 10 authored named presets (heartbeat, sonar, reactor, bell, thump, etc.) appear as targets with 40% chance, shown in scope badge
- Grace theme system: per-level accent color (blue, amber, coral, green, dim) tints meter fill and scope-wrap during safe rounds
- Micro replay: freeze-frame scroll capture on lock with expanding radar ring emanations from scope center
- Debut-archetype filter and weighted parameter selection for new mechanics on introduction levels
- Chaos jitter (±1) on archetype re-encounters for organic variation
- Mini-game engine with 4 games (Peak Hit, Needle Stop, Pulse Tap, Noise Filter) across 3 polish phases
- Settings overlay with ceremonies, screen shake, and audio controls (BGM/SFX volume, mute)
- Assist mode toggles: infinite time, easy match (88% win threshold), no-fail mode
- Persistent hint system — each purchase reveals a new unrevealed parameter, accumulates as a row overlay
- Background music prefetcher with fetch + blob URL cache for instant playback on first click
- Reveal target signal parameters on game over screen
- Keyboard shortcuts: 1-6 for waveform types, Escape for overlays
- SFX volume slider independent of BGM volume
- Urgent-cue toggle to disable heartbeat SFX during countdown
- Toggle for bonus rounds (minigames) in settings, default off
- Two new music tracks: "Neon Nebula" (Databend), "Modern Chillout Future Calm" (Oleksandr Stepanov)
- One new music track: "Lazy Day Stylish Futuristic Chill" (Oleksandr Stepanov)
- Click sounds on all silent UI buttons
- Tension filter sweep: lowpass sweeps from 2200→150Hz during urgent countdown
- Stamp feedback system with animated overlays for game interactions (lock, fail, skip, hint)
- Enhance audio channel with warm analog-feel sound effects, melodic lock variants
- Improve tutorial clarity with updated messaging, glow effects, and better text contrast

### Performance
- Remove vibratoLfo (2 always-running oscillators) and saturator (WaveShaper with 4x oversampling) from audio graph
- Cache AudioContext reference in updateMixState instead of calling actx() every frame
- Halve drawWave canvas path operations during slider drag (step 2→4 when recompute scheduled)
- Remove scope glow CSS pulse animations that forced continuous GPU repaints on mobile
- Prefetch BGM tracks in background via fetch — game never blocks on audio load

### Fixes
- Show "CONTINUE (FREEPLAY)" instead of "CONTINUE (LV 8)" after all levels beaten
- Show "∞" for level label during post-game freeplay instead of max-level number
- Stop signal playback when level up screen is displayed
- Prevent slider adjustments after game lock-in
- Prevent sliders from freezing during tutorial when winning
- Replace silent fake targetSignal (`amp: 0`) with proper `null` during freeplay
- Add missing BGM transition when navigating to level select and on settings key merge
- Defer BGM start to first user interaction instead of page load (autoplay policy)
- Prevent AM/sine false positives in scoring with type-mismatch win threshold guard
- Reduce NOISE_TOLERANCE_PER_UNIT from 1.8 to 1.2 for better difficulty curve
- Adjust SFX gain levels and durations across all sound effects
- Needle minigame: 3 tries with random reposition, SFX on stop; noise: fix regrowth rate
- Lower saturator drive from k=15 to k=2.5 to avoid audible distortion

### Refactoring
- Deduplicate initUI DOM lookups with collect() helper (~35 LoC saved)
- Consolidate render constants (scroll, timing, lock duration, timer circumference) into RENDER namespace
- Streamline sound effects with shared _sfxNote() config helper and extract makeRand() factory
- Migrate bare module-level globals into Round/Session lifecycle objects with documented reset() boundaries
- State-machine BGM with per-pool track pools and no-repeat selection
- 5-pass refactor: dispatch owns score/level/round writes, BUTTON_ACTIONS table, scoped RNG, SAMPLERS lookup, data-attr sliders

### Documentation
- Add manual test checklist for browser and settings overlay (CHECKLIST.md)
- Add bug fix log (FIXES.md)
- Add 53 unit tests for signal math, scoring, dispatch, persistence, and RNG (mixed-signals.test.js)
- Add P5 test health section to TODO with two options for preventing constant drift

## [0.5.0] - 2026-05-11

### Features
- Add interactive tutorial with step-by-step guidance and visual cues
- Enhance scoring system with dynamic time-based bonuses
- Enhance timer UI with animated ring and urgent state indication
- Add animated logo oscilloscope and redesigned start screen with new SVG logo
- Add freeplay warmup and grace periods for new levels
- Implement noise tolerance in game mechanics with visual atmosphere cue
- Implement musical octave tuning for frequency adjustments
- Implement waveform loudness normalization and shared dynamics compressor
- Add background music tracks with track selection and shuffle logic
- Enhance color palette with predefined waveform colors and alternating wave colors per round
- Add canvas resize observer for efficient dimension updates
- Add localStorage helper functions for safer data handling
- Enhance accessibility with aria labels on buttons and range inputs
- Add frame-independent game loop with improved timing precision

### Performance
- Replace buffer-based signal sampling with direct procedural sampling for scoring and rendering
- Cache DOM references and match score to reduce reflows
- Throttle recompute() to 16ms to fix input overprocessing
- Reduce SAMPLE_BUFFER_SIZE to 256 with tradeoff documentation

### Fixes
- Correct strokeStyle syntax in drawGrid function
- Fix fastSin LUT interpolation for negative angles
- Ensure animRaf is properly nullified after canceling animation frame
- Optimize oscillator creation in fail sound effect
- Update victory message and level counts (5→7) to reflect total levels
- Prevent unstyled timer digits at round start
- Remove loop attribute from background music audio element

### Refactoring
- Replace buffer-based signals with direct procedural sampling
- Reorganize audio controls and update scope labels
- Cache DOM/canvas/matchScore and remove dead code

### Documentation
- Update credits section with contributor corrections, additions, and special thanks
- Restructure credits section for improved readability and organization
- Update music attribution in README and index.html
- Update tutorial messages to use dynamic win percentage

## [0.4.0] - 2026-05-04

### Performance
- Implement fast sine approximation to speed up signal sampling
- Replace `Math.random` with xoshiro128+ PRNG; add support for multiple PRNG options (Xorshift32, SFC32, etc.)
- Optimize core signal sampling function for improved accuracy and speed
- Switch to pre-computed sample buffers to eliminate redundant per-sample calls
- Refactor signal drawing logic for better rendering performance and code clarity
- Add PRNG selection guide to compare speed/quality tradeoffs during pre-release testing

### Performance Impact (Guesstimated, Pre-Benchmark)
- ~5-10x faster per-frame rendering by replacing per-pixel `sample()` calls with pre-computed buffer lookups
- ~3-5x faster signal rebuilds (slider adjustments, level init) via fast sine approximation and Xorshift32 PRNG
- More consistent frame timing by moving sampling work off the critical render path

## [0.3.0] - 2026-05-03

### Game Juice (Feedback & Polish)
- Add screen shake effects (heavy on game over, light on score pop)
- Add floating score pop animation with "+points" display
- Add haptic feedback for button interactions and game events
- Reverse scroll direction for target/yours signals to move right

### CRT Visual Updates
- Update wave colors to classic CRT palette (phosphor green for target, amber for yours)
- Enhance oscilloscope overlay with improved blending and dynamic line width
- Restructure HTML/CSS to add shake wrapper for visual effects

### Audio Updates
- Update default BGM volume to 0.4 for improved audio balance
- Add BGM fade-out logic on game over (placeholder with planned high-pass filter improvement)
- Enhance visual feedback with improved oscilloscope overlay and line styling

## [0.2.0] - 2026-05-02

### UI
- Reskin game screen as oscilloscope-style hardware device
  - Game container styled as handheld device shell with asymmetric border-radius, drop shadow, and power LED
  - HUD (topbar, meter, scope, feedback) wrapped in LCD bezel frame
  - Wave selector buttons restyled with SVG waveform icons and chunky hardware aesthetic
  - Sliders restructured with compact labels, value readouts, and icon glyphs
  - Hint/Skip buttons restyled as angled action buttons
  - Removed `.mode-btn`, `.hw-slider-group`, and hidden compatibility containers in favor of reusing existing `.type-btn` and `.ctrl` class names

### Features
- Add background music with mute toggle and volume persistence
- Add sound effects for all game interactions (slider ticks, lock-in, fail, hint, level up, urgent timer)
- Switch to float step values for amplitude/DC/harmonic/noise sliders with adjusted match threshold
- Update credits section with contributor list and music attribution
- Add Cloudflare Workers deployment configuration

### Fixes
- Prevent text selection when dragging mouse over game UI
- Prevent timer from triggering game over after player has already won a round
- Enable noise rendering on player's waveform during visualization
- Correct target signal property reference in hint function
- Correct property reference for signal frequency in `resetYours`
- Add missing timer styles and urgency pulse animation
- Retain score on level retry; reset fully on restart
- Correct variable name for target signal DC offset in hint function

### Refactoring
- Simplify reskin by reusing existing class names
- Add JSDoc documentation across all game logic functions
- Refactor signal property names for consistency

### Documentation
- Add acknowledgment for initial game idea
- Add AI assistance acknowledgments
- Update README

## [0.1.0] - 2026-04-28

### Initial Release
- Core gameplay: match waveform parameters to target signal
- 5 difficulty levels with progressive parameter unlocks (phase, DC offset, harmonic, noise)
- 6 waveform types: sine, square, sawtooth, triangle, PWM, AM
- Real-time similarity scoring with match percentage meter
- Hint and skip system with point costs
- Speed bonus for fast lock-ins
- Timer with urgency visual/audio cues
- CRT-style scanline overlay

## [0.1.0-alpha] - 2026-04-20

### Pre-release
- Initial HTML and JavaScript files for Mixed Signals game
- Refactor game structure and styles
- Basic game functionality implementation
