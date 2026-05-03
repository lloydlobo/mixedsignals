# Changelog

All notable changes to Mixed Signals.

## [Unreleased]

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
