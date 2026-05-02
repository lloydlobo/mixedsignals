# Changelog

All notable changes to Mixed Signals.

## [Unreleased]

### Fixes
- Prevent text selection when dragging mouse over game UI
- Prevent timer from triggering game over after player has already won a round
- Enable noise rendering on player's waveform during visualization

## [0.3.0] - 2026-05-02

### UI
- Reskin game screen as oscilloscope-style hardware device
  - Game container styled as handheld device shell with asymmetric border-radius, drop shadow, and power LED
  - HUD (topbar, meter, scope, feedback) wrapped in LCD bezel frame
  - Wave selector buttons restyled with SVG waveform icons and chunky hardware aesthetic
  - Sliders restructured with compact labels, value readouts, and icon glyphs
  - Hint/Skip buttons restyled as angled action buttons
  - Removed `.mode-btn`, `.hw-slider-group`, and hidden compatibility containers in favor of reusing existing `.type-btn` and `.ctrl` class names

## [0.2.0] - 2025

### Features
- Add background music with mute toggle and volume persistence
- Add sound effects for all game interactions (slider ticks, lock-in, fail, hint, level up, urgent timer)
- Switch to float step values for amplitude/DC/harmonic/noise sliders with adjusted match threshold
- Update credits section with contributor list and music attribution
- Add Cloudflare Workers deployment configuration

### Fixes
- Correct target signal property reference in hint function
- Correct property reference for signal frequency in `resetYours`
- Add missing timer styles and urgency pulse animation
- Retain score on level retry; reset fully on restart
- Correct variable name for target signal DC offset in hint function

### Refactoring
- Add JSDoc documentation across all game logic functions
- Refactor signal property names for consistency

### Documentation
- Add acknowledgment for initial game idea
- Update README

### Initial Release
- Core gameplay: match waveform parameters to target signal
- 5 difficulty levels with progressive parameter unlocks (phase, DC offset, harmonic, noise)
- 6 waveform types: sine, square, sawtooth, triangle, PWM, AM
- Real-time similarity scoring with match percentage meter
- Hint and skip system with point costs
- Speed bonus for fast lock-ins
- Timer with urgency visual/audio cues
- CRT-style scanline overlay
