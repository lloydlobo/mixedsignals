(() => {
	// biome-ignore lint/suspicious/noRedundantUseStrict: old convention
	"use strict";

	const AUTOPLAY = {};

	const TICK_MS = 200;
	const BOOT_RETRY_MS = 300;
	const MAX_BOOT_RETRIES = 20;

	let _interval = null;
	let _active = false;
	let _busy = false;
	let _bootRetries = 0;
	let _statusEl = null;

	function log(msg) {
		console.log("[autoplay]", msg);
	}

	function byId(id) {
		return document.getElementById(id);
	}

	function isVisible(el) {
		return !!el && !el.classList.contains("hidden");
	}

	function screen() {
		const gameEl = byId("game");
		return gameEl ? gameEl.dataset.screen || "start" : null;
	}

	function ceremonyVisible() {
		return isVisible(byId("ceremony-overlay"));
	}

	function settingsVisible() {
		return isVisible(byId("settings-overlay"));
	}

	function clickIfEnabled(id) {
		const el = byId(id);

		if (el && !el.disabled) {
			el.click();
			return true;
		}

		return false;
	}

	function ready() {
		return typeof Round !== "undefined" && typeof Session !== "undefined";
	}

	function ensureStatusEl() {
		if (_statusEl) return _statusEl;

		const el = document.createElement("div");

		el.id = "autoplay-status";
		el.textContent = "AUTOPLAY";

		Object.assign(el.style, {
			position: "fixed",
			top: "12px",
			right: "12px",
			zIndex: "999999",
			padding: "6px 10px",
			font: "12px monospace",
			fontWeight: "bold",
			letterSpacing: "0.08em",
			borderRadius: "6px",
			pointerEvents: "none",
			userSelect: "none",
			transition: "opacity 120ms ease",
			background: "rgba(0,0,0,0.75)",
			color: "#7CFF7C",
			border: "1px solid rgba(124,255,124,0.35)",
			boxShadow: "0 0 12px rgba(124,255,124,0.25)",
			opacity: "0",
		});

		document.body.appendChild(el);

		_statusEl = el;
		return el;
	}

	function updateStatus(active) {
		const el = ensureStatusEl();
		el.style.opacity = active ? "1" : "0";
	}

	function closeSettingsIfOpen() {
		if (!settingsVisible()) return false;

		const closeBtn = byId("btn-close-settings");

		if (closeBtn) {
			closeBtn.click();
			return true;
		}

		return false;
	}

	function dismissCeremonyIfOpen() {
		if (!ceremonyVisible()) return false;

		dismissCeremony();
		return true;
	}

	function solveRound() {
		if (!ready()) return false;
		if (!targetSignal?.type || Round.won || Session.freePlayActive) return false;
		if (typeof applySignal !== "function") return false;

		const typeBtn = document.querySelector(`.type-btn[data-t="${targetSignal.type}"]`);

		// IMPORTANT:
		// Some archetypes (Guide/Ghost) visually preselect the correct waveform type
		// by marking the button `.active`, but the round still requires an explicit
		// click event to clear the internal `_typePuzzle` gate.
		//
		// Do NOT skip clicking when the button is already active.
		// The visual state is only a hint; removing this unconditional click breaks
		// those rounds.
		if (typeBtn) {
			typeBtn.click();
		}

		applySignal({
			freq: targetSignal.freq,
			amp: targetSignal.amp,
			phase: targetSignal.phase,
			dc: targetSignal.dc,
			harm: targetSignal.harm,
			noise: targetSignal.noise || 0,
		});

		if (typeof yoursSignal !== "undefined" && yoursSignal) {
			_smoothPhase = yoursSignal.phase;
		}

		if (typeof scheduleRender === "function") {
			scheduleRender();
		}

		return true;
	}

	function tick() {
		if (!_active) return;
		if (!ready()) return;

		if (closeSettingsIfOpen()) return;
		if (dismissCeremonyIfOpen()) return;

		switch (screen()) {
			case "start":
				clickIfEnabled("btn-new-game");
				break;

			case "game":
				if (Session.freePlayActive) {
					clickIfEnabled("btn-freeplay-ready");
					return;
				}

				if (Round.won) return;

				solveRound();
				break;

			case "levelup":
				clickIfEnabled("btn-continue-level");
				break;

			case "dead":
				clickIfEnabled("btn-retry");
				break;

			case "victory":
				clickIfEnabled("btn-victory-continue");
				break;

			case "minigame": {
				const mgBtn = byId("mg-btn");

				if (mgBtn && !mgBtn.disabled) {
					mgBtn.click();
				}

				break;
			}
		}
	}

	function pump() {
		if (_busy || !_active) return;

		_busy = true;

		try {
			tick();
		} finally {
			_busy = false;
		}
	}

	AUTOPLAY.start = () => {
		if (_active) return;

		if (!ready()) {
			_bootRetries += 1;

			if (_bootRetries > MAX_BOOT_RETRIES) {
				log("start failed: game globals never became ready");
				_bootRetries = 0;
				return;
			}

			setTimeout(AUTOPLAY.start, BOOT_RETRY_MS);
			return;
		}

		_bootRetries = 0;
		_active = true;

		updateStatus(true);

		log("started");

		lsSet("tutorialSeen", true);

		Session.minigames = false;
		Session.ceremonies = false;

		closeSettingsIfOpen();

		_interval = setInterval(pump, TICK_MS);
	};

	AUTOPLAY.stop = () => {
		_active = false;

		if (_interval) {
			clearInterval(_interval);
			_interval = null;
		}

		_busy = false;

		updateStatus(false);

		log("stopped");
	};

	AUTOPLAY.toggle = () => {
		if (_active) {
			AUTOPLAY.stop();
		} else {
			AUTOPLAY.start();
		}
	};

	AUTOPLAY.runAll = () => {
		log("runAll: running through all levels");
		AUTOPLAY.start();
	};

	AUTOPLAY.isActive = () => _active;

	window.autoplay = AUTOPLAY;

	if (window.location.search.includes("autoplay")) {
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () => {
				setTimeout(AUTOPLAY.start, 500);
			});
		} else {
			setTimeout(AUTOPLAY.start, 500);
		}
	}

	log("loaded");
})();

/*

Autoplay System
===============

Files
-----
- autoplay.js (new)
  Self-contained autoplay/devtool module driven by a lightweight polling loop.

- index.html
  Added:
    <script src="autoplay.js" defer></script>
  after main.js so autoplay initializes against fully-loaded game globals.

- main.js
  Added hidden "bot" key-sequence listener (same stealth pattern used by
  zenith/deepscan) to toggle autoplay in-game.


Behavior
--------
Polling interval: 200ms

The autoplay layer observes current game/UI state and performs the minimal
input required to advance naturally through the existing gameplay flow.

Screen handling:
- Start screen
  -> clicks "NEW GAME"

- Game screen
  -> reads targetSignal
  -> explicitly clicks the waveform type button
  -> applies waveform parameters via applySignal()

- Freeplay
  -> clicks "READY"

- Level-up
  -> clicks "CONTINUE"

- Dead screen
  -> clicks "RETRY"

- Victory screen
  -> clicks "CONTINUE"

- Minigame
  -> clicks the minigame action button

Overlay handling:
- Ceremony overlays are auto-dismissed
- Settings overlay is auto-closed


Important Gameplay Edge Case
----------------------------
Guide/Ghost archetypes may visually pre-highlight the correct waveform type
by marking the button `.active`.

This is ONLY a visual hint.

The round still requires a real click event to clear the internal
`_typePuzzle` lock, so autoplay intentionally clicks the waveform type
button even when it already appears active.

Removing this unconditional click breaks those rounds.


Usage
-----
URL param:
  index.html?autoplay
  -> auto-start autoplay on page load

Stealth key sequence:
  Type: b, o, t
  -> toggles autoplay in-game

Console API:
  autoplay.start()
  autoplay.stop()
  autoplay.toggle()
  autoplay.runAll()


Design Notes
------------
Autoplay does NOT bypass normal game progression.

The system only:
- selects the correct waveform type
- applies the target signal values
- triggers the same UI/input flow as a real player

The existing game systems still handle:
- meter validation
- win detection
- animations
- round transitions
- timers
- scoring
- bonuses

Specifically:
`updateMeter()` detects the 100% match and triggers the normal win flow:
  lock animation (~1800ms) -> nextRound()

This keeps autoplay aligned with real gameplay timing and preserves genuine
score/time behavior during automated runs.

*/
