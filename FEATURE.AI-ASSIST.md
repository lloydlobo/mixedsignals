# Feature Game AI Assist modes and goodies

## Context

> Yes. Celeste is the right reference — assist mode is offered without judgment, clearly labeled, and the game never withholds it from players who need it. The distinction Celeste makes is transparency: assist features are visually distinct from normal play, not hidden.
> 
> So: both, with clear separation.
> 
> - **In-round arrows** — always on, no cost, but only show direction not magnitude. You still have to do the tuning work.
> - **Assist mode toggle** — in Settings alongside the others, labeled `Param Guide`. When off, arrows are subtle (dim, small). When on, arrows are brighter and also show a rough magnitude hint ("a little" / "a lot").
> 
> That respects both players. The arrows alone don't remove challenge — they remove *aimlessness*. The magnitude hint is the meaningful assist.
> 
> ---
> 
> Now, one more thing to confirm before I write code. The gradient probe needs to temporarily mutate `yoursSignal`. I want to verify `applySignal` and `readSliders` don't interfere — let me check how `yoursSignal` gets written.Good. `applySignal` is just `Object.assign(yoursSignal, sig) + invalidateMatchScore()`. The probe can safely mutate and restore `yoursSignal` directly without touching the DOM or sliders — `readSliders()` only flows *into* `yoursSignal`, never the other way.
> 
> Here's the plan, stated precisely before any code:
> 
> ---
> 
> **`paramGradient()`** — pure function, no side effects on game state
> 
> ```
> for each active param:
>   save = yoursSignal[param]
>   probe yoursSignal[param] = save + step
>   invalidateMatchScore() → scoreUp = matchScore()
>   restore, invalidate
>   probe yoursSignal[param] = save - step  
>   invalidateMatchScore() → scoreDown = matchScore()
>   restore, invalidate
>   
>   dir = scoreUp > scoreDown ? +1 : scoreDown > scoreUp ? -1 : 0
>   magnitude = max(scoreUp, scoreDown) - currentScore  (0.0–1.0 range)
>   
>   if both probes worse than current → dir = 0 (already at local optimum)
> ```
> 
> Probe steps match slider resolution: freq=1, amp=0.5, phase=5, dc=0.5, harm=0.5.
> 
> **UI** — injected into each `.slider-val` span, alongside the existing value readout. One `<span class="param-arrow">` per param. CSS handles dim/bright based on `assistParamGuide` session flag.
> 
> **Timing** — called inside `scheduleRender()`, after `updateMeter()`. Already rAF-throttled, so no extra scheduling needed.
> 
> **New session flag** — `assistParamGuide: false` added to `DEFAULT_SETTINGS` and `Session`, wired to a new toggle `#stg-param-guide` in the Settings overlay alongside the existing assist toggles.
> 
> ---
> 
> The changes touch four places: `main.js` (gradient fn + scheduleRender + Session + DEFAULT_SETTINGS), `index.html` (arrow spans + settings toggle), `style.css` (arrow styling). Minimal and targeted.
> 
> Shall I write it?
> 
> ---
> 
> Sure. I’m also tempted to make the score useful for more than just bragging rights. Could we add another optional setting for players to enable the existing gated hint economy? That lets them decide how they want to play and set their own difficulty. I’m also thinking of adding a speedrun leaderboard later. 

---

> Good instinct. The score becoming a resource — not just a trophy — gives it weight. Every hint purchase already costs 25 pts; extending that logic to the assist arrows is consistent with the existing economy, not a new system.
> 
> Let me nail down the exact design before writing anything.

---

## IMPLEMENTATION PLAN

**Two new settings, independent toggles:**

`assistParamGuide` — shows directional arrows on sliders. Always available, no cost per-frame. The Celeste layer.

`assistScoreGated` — when ON, the param guide arrows are only visible while `Session.score >= CONFIG.COST_HINT` (25 pts). If score drops below that threshold, arrows dim out. The player is implicitly spending *potential* score by leaning on the guide — not a hard deduction, just an opportunity cost signal. Keeps the leaderboard meaningful without punishing new players.

These are orthogonal:

| `paramGuide` | `scoreGated` | Result |
|---|---|---|
| OFF | any | No arrows ever |
| ON | OFF | Arrows always visible (Celeste mode) |
| ON | ON | Arrows visible only while score ≥ 25 |

---

**Leaderboard note** — for the future speedrun board, the telemetry item already in TODO (`{level, attempts, hints, timeRemaining, lockPercent}`) should probably also record `assistParamGuide` and `assistScoreGated` so runs can be filtered by assist configuration. Worth keeping in mind when you wire localStorage later, but not our problem today.

---

That's the full scope. Four files touched, same as before. Writing now.Good. I have everything I need. Writing the three diffs now.Good. Now I have the full picture. Writing all three diffs.

**`main.js`** — three additions: `paramGradient()`, two new flags in `DEFAULT_SETTINGS` + `Session`, two new `bindToggle` calls in settings init, and one `updateParamArrows()` call inside `scheduleRender`.

**`index.html`** — arrow spans inside each `.slider-val`, two new settings rows.

**`style.css`** — arrow styling.

---

**`main.js` — diff 1: DEFAULT_SETTINGS**

```js
// BEFORE
const DEFAULT_SETTINGS = () => ({ bgmMuted: false, sfxMuted: false, bgmVolume: 0.4, sfxVolume: 0.4, ceremonies: true, screenShake: true, minigames: false, assistDisableUrgent: false, assistInfiniteTime: false, assistEasyMatch: false, assistNoFail: false });

// AFTER
const DEFAULT_SETTINGS = () => ({ bgmMuted: false, sfxMuted: false, bgmVolume: 0.4, sfxVolume: 0.4, ceremonies: true, screenShake: true, minigames: false, assistDisableUrgent: false, assistInfiniteTime: false, assistEasyMatch: false, assistNoFail: false, assistParamGuide: false, assistScoreGated: false });
```

**`main.js` — diff 2: Session**

```js
// BEFORE
    assistNoFail: false,

// AFTER
    assistNoFail: false,
    assistParamGuide: false,
    assistScoreGated: false,
```

**`main.js` — diff 3: bindToggle calls** (after the existing `stg-no-fail` line)

```js
// BEFORE
    bindToggle("stg-no-fail", "assistNoFail", "assistNoFail");

// AFTER
    bindToggle("stg-no-fail", "assistNoFail", "assistNoFail");
    bindToggle("stg-param-guide", "assistParamGuide", "assistParamGuide");
    bindToggle("stg-score-gated", "assistScoreGated", "assistScoreGated");
```

**`main.js` — diff 4: `paramGradient()` and `updateParamArrows()`** — new functions, placed after `invalidateMatchScore()`:

```js
// ─── PARAM GRADIENT ASSIST ───────────────────────────────────────────────────

/**
 * For each active param, probes matchScore() ±1 step to determine which
 * direction improves the match. Returns a map of param → { dir, magnitude }.
 * dir: +1 (increase), -1 (decrease), 0 (optimal or type mismatch).
 * magnitude: score delta of the better probe (0.0–1.0).
 * Pure — restores yoursSignal state fully before returning.
 */
const GRADIENT_STEPS = { freq: 1, amp: 0.5, phase: 5, dc: 0.5, harm: 0.5 };

function paramGradient() {
    if (!targetSignal || Round.won || Session.freePlayActive) return null;
    const base = matchScore();
    const result = {};

    for (const [param, step] of Object.entries(GRADIENT_STEPS)) {
        const saved = yoursSignal[param];

        yoursSignal[param] = saved + step;
        _matchScoreDirty = true;
        const scoreUp = matchScore();

        yoursSignal[param] = saved - step;
        _matchScoreDirty = true;
        const scoreDown = matchScore();

        yoursSignal[param] = saved;
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

/**
 * Reads paramGradient() and updates .param-arrow spans in the DOM.
 * Respects assistParamGuide and assistScoreGated session flags.
 * No-ops when guide is off, round is won, or type is mismatched.
 */
function updateParamArrows() {
    const arrows = document.querySelectorAll(".param-arrow");
    const guideOn = Session.assistParamGuide;
    const affordable = !Session.assistScoreGated || Session.score >= CONFIG.COST_HINT;

    if (!guideOn || !affordable || Round.won || !targetSignal || Session.freePlayActive) {
        arrows.forEach(el => { el.textContent = ""; el.className = "param-arrow"; });
        return;
    }

    const gradient = paramGradient();
    if (!gradient) { arrows.forEach(el => { el.textContent = ""; }); return; }

    // Type mismatch — suppress all arrows, type button is the only meaningful move
    if (yoursSignal.type !== targetSignal.type) {
        arrows.forEach(el => { el.textContent = ""; el.className = "param-arrow"; });
        return;
    }

    arrows.forEach(el => {
        const param = el.dataset.param;
        const g = gradient[param];
        if (!g) return;

        if (g.dir === 0) {
            el.textContent = "·";
            el.className = "param-arrow arrow-ok";
        } else {
            el.textContent = g.dir > 0 ? "↑" : "↓";
            // magnitude buckets: subtle vs strong nudge
            const strong = g.magnitude > 0.05;
            el.className = "param-arrow " + (strong ? "arrow-strong" : "arrow-soft");
        }
    });
}
```

**`main.js` — diff 5: call inside `scheduleRender`**

```js
// BEFORE
    requestAnimationFrame(() => {
        updateMeter();
        syncLabels();

// AFTER
    requestAnimationFrame(() => {
        updateMeter();
        syncLabels();
        updateParamArrows();
```

---

**`index.html` — diff 1: arrow spans inside each `.slider-val`**

Each existing `<span class="slider-val"><b id="lbl-freq" ...>` gets a sibling `<span>` inserted *inside* the `.slider-val`:

```html
<!-- freq — BEFORE -->
<span class="slider-val"><b id="lbl-freq" data-for="freq">1 Hz</b></span>

<!-- freq — AFTER -->
<span class="slider-val"><span class="param-arrow" data-param="freq"></span><b id="lbl-freq" data-for="freq">1 Hz</b></span>
```

Same pattern for `amp`, `phase`, `dc`, `harm`. (`noise` stays hidden and ungated — skip it.)

**`index.html` — diff 2: two new settings rows** (after `stg-no-fail` row)

```html
                    <div class="settings-row">
                        <span>Param guide</span>
                        <button class="settings-toggle" id="stg-param-guide">OFF</button>
                    </div>
                    <div class="settings-row">
                        <span>Score-gated guide</span>
                        <button class="settings-toggle" id="stg-score-gated">OFF</button>
                    </div>
```

---

**`style.css` — diff: arrow rules** (append after `.param-glyph` block)

```css
/* ─── PARAM GRADIENT ARROWS ─────────────────────────────────────── */
.param-arrow {
    display: inline-block;
    font-size: 9px;
    line-height: 1;
    margin-inline-end: 3px;
    vertical-align: middle;
    color: transparent;          /* invisible by default */
    transition: color .15s, opacity .15s;
    user-select: none;
    pointer-events: none;
}

.param-arrow.arrow-ok     { color: var(--green);    opacity: 0.45; }
.param-arrow.arrow-soft   { color: var(--amber);    opacity: 0.55; }
.param-arrow.arrow-strong { color: var(--cream);    opacity: 0.90; }

/* score-gated: when guide is on but score is insufficient,
   caller already clears textContent — no extra CSS needed */
```

---

That's the full set. Five diffs in `main.js`, two in `index.html`, one in `style.css`. No new files, no structural changes. The gradient runs inside the existing rAF budget, probing 96 samples × 10 times per frame when active — still well under 1ms on any device that can run the game.

One thing to verify after wiring: open DevTools, toggle param guide on, and confirm `updateParamArrows` isn't being called when `Round.won === true`. The guard is there but worth a quick eye-check given how many paths set `won`.