# Manual Test Checklist

## Browser Manual Test Checklist

Load the game from an HTTP server (`python3 -m http.server`) and run through:

| Scenario             | What to check                                                   |
|----------------------|-----------------------------------------------------------------|
| Start screen         | Continue button visibility, unlock message                      |
| NEW GAME → tutorial  | All 6 tutorial steps complete, controls lock, skip works        |
| HINT / SKIP          | Score deducts, stamp appears, hint shows correct target info    |
| Playback buttons     | TARGET / YOURS / A/B toggle correctly, active class applied     |
| MUTE                 | Toggle works, BGM stops/resumes, channels silence               |
| MENU                 | Returns to start, no lingering sounds/timer                     |
| Level up             | Shows correct level info, CONTINUE button works                 |
| Level select         | Grid renders, locked/unlocked states correct                    |
| Game Over            | Screen shows, shake animation, RETRY works                      |
| Freeplay             | READY button shows, meter dims, timer shows ∞                   |
| Sliders              | Values update labels, waveform redraws, SFX plays               |
| Type buttons         | Sine/Saw/Square/Tri/PWM/AM select correctly                     |

## Browser DevTools Checks

- Open Console — zero errors on every screen transition
- Network tab — no 404s on assets
- Elements panel — verify `data-screen` attribute changes correctly on `#game`


## Settings overlay checks

Bug bash first. Always. New overlays and pause/resume logic touching timers and audio are exactly the kind of thing that breaks in edge cases you don't anticipate until you play it.

Specifically worth testing:

- Open settings mid-round, close it — does the timer resume from where it left off or reset?
- Open settings during freeplay warmup — does it resume correctly without starting a timer?
- Open settings during the lock animation (just won a round, waiting for `nextRound`) — does closing it cause a double `nextRound`?
- Open settings on the dead/levelup/levelselect screens — does the resume logic incorrectly try to restart gameplay?
- BGM and SFX toggles in the overlay — do they stay in sync with the underlying state after open/close cycles?
- Screen shake and ceremony toggles — do they persist across a full page reload?

Play through at least one full level transition including a minigame before calling it stable. Then wire SFX volume — it's a small change with clear scope.

### Assist mode

Test the three toggles in sequence:

- Easy match ON → start a round → confirm win triggers around 55% without reaching the "Getting close" zone
- Infinite time ON → let the timer hit zero → confirm the game continues and the ring stays at zero without crashing
- No fail ON, Infinite time OFF → let the timer expire → confirm "Assisted — signal lost, moving on." appears and nextRound fires after 1200ms
- All three ON together → confirm nothing conflicts
- Toggle all three OFF → confirm normal game behavior is fully restored
- Reload the page with toggles in various states → confirm they persist correctly

Report what breaks.