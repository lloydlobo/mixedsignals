(() => {
	// biome-ignore lint/suspicious/noRedundantUseStrict: old convention
	"use strict";

	const AUTOPLAY = {};
	let _interval = null;
	let _active = false;

	function log(msg) {
		console.log("[autoplay]", msg);
	}

	function screen() {
		const g = document.getElementById("game");
		return g ? g.dataset.screen || "start" : null;
	}

	function ceremonyVisible() {
		const co = document.getElementById("ceremony-overlay");
		return co && !co.classList.contains("hidden");
	}

	function click(id) {
		const el = document.getElementById(id);
		if (el && !el.disabled) {
			el.click();
			return true;
		}
		return false;
	}

	function solveRound() {
		if (!targetSignal?.type || Round.won || Session.freePlayActive) return false;

		const typeBtn = document.querySelector(`.type-btn[data-t="${targetSignal.type}"]`);
		// Always click even if .active — Guide/Ghost archetypes mark the correct
		// button as active (visual hint) but setType() must still fire to resolve
		// the _typePuzzle lock. Calling setType on the active type is a no-op.
		if (typeBtn) typeBtn.click();

		applySignal({
			freq: targetSignal.freq,
			amp: targetSignal.amp,
			phase: targetSignal.phase,
			dc: targetSignal.dc,
			harm: targetSignal.harm,
			noise: targetSignal.noise || 0,
		});
		_smoothPhase = yoursSignal.phase;
		scheduleRender();

		return true;
	}

	function tick() {
		if (!_active) return;
		if (typeof Round === "undefined" || typeof Session === "undefined") return;

		const so = document.getElementById("settings-overlay");
		if (so && !so.classList.contains("hidden")) {
			const closeBtn = document.getElementById("btn-close-settings");
			if (closeBtn) closeBtn.click();
			return;
		}

		if (ceremonyVisible()) {
			dismissCeremony();
			return;
		}

		switch (screen()) {
			case "start":
				click("btn-new-game");
				break;

			case "game":
				if (Session.freePlayActive) {
					click("btn-freeplay-ready");
					return;
				}
				if (Round.won) return;
				solveRound();
				break;

			case "levelup":
				click("btn-continue-level");
				break;

			case "dead":
				click("btn-retry");
				break;

			case "victory":
				click("btn-victory-continue");
				break;

			case "minigame": {
				const mgBtn = document.getElementById("mg-btn");
				if (mgBtn && !mgBtn.disabled) mgBtn.click();
				break;
			}
		}
	}

	AUTOPLAY.start = () => {
		if (_active) return;
		if (typeof Round === "undefined") {
			setTimeout(AUTOPLAY.start, 300);
			return;
		}

		_active = true;
		log("started");

		lsSet("tutorialSeen", true);
		Session.minigames = false;
		Session.ceremonies = false;

		const so = document.getElementById("settings-overlay");
		if (so && !so.classList.contains("hidden")) {
			closeSettings();
		}

		_interval = setInterval(tick, 200);
	};

	AUTOPLAY.stop = () => {
		_active = false;
		if (_interval) {
			clearInterval(_interval);
			_interval = null;
		}
		log("stopped");
	};

	AUTOPLAY.toggle = () => {
		if (_active) AUTOPLAY.stop();
		else AUTOPLAY.start();
	};

	AUTOPLAY.runAll = () => {
		log("runAll: running through all levels");
		AUTOPLAY.start();
	};

	AUTOPLAY.isActive = () => _active;

	window.autoplay = AUTOPLAY;

	if (window.location.search.includes("autoplay")) {
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () => setTimeout(AUTOPLAY.start, 500));
		} else {
			setTimeout(AUTOPLAY.start, 500);
		}
	}

	log("loaded");
})();

/* 

Changes
autoplay.js (new, 157 lines) — Self-contained autoplay module with a 200ms polling loop that:
- Start screen → clicks "NEW GAME"
- Game screen → reads targetSignal, clicks correct type button, copies all params via applySignal()
- Freeplay → clicks "READY"
- Level-up → clicks "CONTINUE"
- Dead screen → clicks "RETRY"
- Victory → clicks "CONTINUE"
- Minigame → clicks the action button
- Ceremony overlay → auto-dismisses
- Settings overlay → auto-closes
index.html — Added <script src="autoplay.js" defer></script> after main.js
main.js (line 5003) — Added "bot" stealth key listener (same pattern as zenith/deepscan)
Usage
Method	How
URL param	index.html?autoplay — auto-starts on load
Stealth key	Type b, o, t in-game to toggle
Console	autoplay.start(), .stop(), .toggle(), .runAll()
The game's own updateMeter() detects the 100% match and triggers the win flow naturally (1800ms lock animation → nextRound()), so the autoplay just sets the answer and the game handles the rest. Real-time timer means scoring reflects actual time bonuses.

*/
