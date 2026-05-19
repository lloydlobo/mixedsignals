# PERF

--- SUMMARY ---

## Optimization Blueprint: "Stop Auditing, Start Executing"

Current status: **Math is solved.** The bottleneck is now **DOM churn** and **scheduling spikes**.

---

### Phase 1: Offload Replay (The "Hitch" Killer)

Don't optimize the capture; move it out of the interaction path. Use a double `requestAnimationFrame` (RAF) inside an idle period to ensure the transition finishes before the CPU spike.

```javascript
function scheduleReplay() {
    const run = () => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => replayCapture());
        });
    };
    window.requestIdleCallback ? requestIdleCallback(run, {timeout: 5000}) : setTimeout(run, 750);
}
// Replace captureReplay() with scheduleReplay()

```

---

### Phase 2: DOM Write Suppression

`syncLabels()` is your biggest cost ($0.22\text{ms}$). Querying is slow, but **writing** to the DOM is slower. Use a cache and a "dirty check" to only update text when it actually changes.

**1. Create a Cache:**

```javascript
const UI_CACHE = {};
function cacheUI() {
    document.querySelectorAll("[data-param]").forEach(el => {
        const p = el.dataset.param;
        UI_CACHE[p] = { slider: el, label: document.querySelector(`[data-for="${p}"]`) };
    });
}

```

**2. Smart Writers:**

```javascript
const setText = (el, v) => { if (el.__v !== v) { el.textContent = v; el.__v = v; } };
const setAria = (el, v) => { if (el.__a !== v) { el.ariaValueText = v; el.__a = v; } };

```

---

### Phase 3: Dirty Flags (Collapse Needless Work)

Stop running logic every frame. Only execute if a value actually changed.

```javascript
const DIRTY = { signal: true, ui: true };

// In input listeners:
DIRTY.signal = true; DIRTY.ui = true;

// In frame loop:
function frame() {
    if (DIRTY.signal) { drawWave(); DIRTY.signal = false; }
    if (DIRTY.ui) { syncLabels(); DIRTY.ui = false; }
    requestAnimationFrame(frame);
}

```

---

### Phase 4: Cleanup & Final Audit

* **Delete duplicate `matchScore()`:** Keep the unrolled version ($d0...d3$); delete the other to prevent parse/maintenance overhead.
* **Cache Static Elements:** Move `.scope-wrap`, `.timer-ring-wrap`, and `#c-overlay` into your `UI_CACHE` during init. Stop searching for them in `setInterval`.
* **Skip Micro-Math:** Do **not** inline `sample()` or optimize `readSliders`. At $0.01\text{ms}$–$0.05\text{ms}$, you are chasing noise.

---

### Success Metrics

| Metric           | Before          | After                   |
| ---------------- | --------------- | ----------------------- |
| **Replay Hitch** | Severe Spike    | Negligible              |
| **`syncLabels`** | $0.22\text{ms}$ | $\approx 0.05\text{ms}$ |
| **Long Frames**  | > 0             | 0                       |

**Next Step:** Open `syncLabels()`, apply the cache, and implement `setText`. Stop when you hit the **0.05ms** mark.

---

## Original PERF Plan

Stop auditing, start executing. Profile converged. **Current reality:**
`Game logic: negligible`, `Rendering/Memory: excellent`, `Frame cadence: stable`, `Replay: severe spike`, `DOM sync: medium cost`.

### Phase 1 — Remove replay from interaction path

Hide it. Don't make it fast.
**Current:** `Win → capture replay → show transition`.
**Change:** `Win → show transition → idle → capture replay`.
**Code:**

```js
function scheduleReplay(){
    const run=()=>{replayCapture();};
    if(window.requestIdleCallback){requestIdleCallback(run,{timeout:3000});return;}
    setTimeout(run,500);
}

```

**Replace:** `captureReplay()` with `scheduleReplay()`. **Expected:** player hitch disappears.

### Phase 2 — Audit `syncLabels()`

Biggest sustained cost. Look for `querySelector`, `getElementById`, `textContent`, `style`, `aria` in loops.
**Bad:** `freqLabel.textContent=freq;` (every frame).
**Fix:**

```js
function setText(el,v){
   const s=String(v);
   if(el.textContent===s)return;
   el.textContent=s;
}

```

**Use:** `setText(freqLabel,freq);` for labels, meters, progress, aria. **Goal:** write only when changed. **Expected:** $0.22\text{ms} \to 0.05\text{--}0.08\text{ms}$.

### Phase 3 — Introduce dirty flags

**Current:** `frame → read → sync → draw`.
**Convert:**

```js
let signalDirty=true, uiDirty=true;
slider.addEventListener("input",()=>{signalDirty=true;uiDirty=true;});
function frame(){
   if(signalDirty){drawWave();signalDirty=false;}
   if(uiDirty){syncLabels();uiDirty=false;}
   requestAnimationFrame(frame);
}

```

### Phase 4 — Event flow

`readSliders()` ($0.01\text{ms}$) is polling. Move to:

```js
sliderFreq.addEventListener("input",e=>{yoursSignal.freq=+e.target.value;});

```

Inputs wake state; frames should not wake inputs.

### Phase 5 — Reaudit

Run `deepscan`. Target: `Replay: hidden`, `syncLabels: 0.05ms`, `drawWave: unchanged`, `longFrames: 0`. Stop before entering "$0.01\text{ms}$ territory." **Action:** Inspect `syncLabels()`.

---

## Targeted Bottlenecks

Profiler says: **Stop micro-optimizing math.** Attack **DOM + scheduling + allocation churn.**

### 1) `syncLabels()` Cache

Stop DOM searches every frame.

```js
const LABEL_CACHE={};
function cacheLabels(){
 document.querySelectorAll("[data-param]").forEach(el=>{
     const p=el.dataset.param;
     LABEL_CACHE[p]={slider:el,label:document.querySelector(`[data-for="${p}"]`)};
 });
}

```

**New `syncLabels()`:** Iterate `LABEL_CACHE`, calculate `text`, use `if(label.textContent!==text)label.textContent=text;`.

### 2) Timer Loop Queries

Inside `startTimer()`, `setInterval()` queries `.scope-wrap`, `#c-overlay`, etc. Move to `UI` cache during `initUI()` and toggle cached refs instead.

### 3) `showScorePop()` Allocation

Stop `createElement` on every score.
**Fix:** Create one `SCORE_POP` div at startup. In `showScorePop(points)`, update `textContent`, toggle `.show` class, and use `void SCORE_POP.offsetWidth` to trigger animation.

### 4) `drawWave()` repeated `sample()`

`sample()` destructures `sig` hundreds of times. **Fix:** Unpack `freq`, `phase`, `amp`, etc., once at top of `drawWave` and inline waveform evaluation.

### 5) Duplicate `matchScore()`

Delete one of the two declarations. Keep the manually unrolled one ($d0...d3$).

### 6) Array Allocations

In hints, stop `...(lv.phase?[...]:[])`. **Fix:** `const hints=[]; hints.push(...); if(lv.phase) hints.push(...);`.

---

## Revised Execution Order

1. **Replay scheduling** 2. **DOM write suppression** 3. **UI dirty boundaries** 4. **DOM cache cleanup** 5. **Allocation cleanup** 6. **STOP**.

### Revised Phase 1 (Replay)

Use double RAF to push past transition paint:

```js
function scheduleReplay(){
    const run=()=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>{replayCapture();});});};
    if(window.requestIdleCallback){requestIdleCallback(run,{timeout:5000});return;}
    setTimeout(run,750);
}

```

### Revised Phase 2 (Suppression)

DOM writes ($>$ query cost). Use:

```js
function setText(el,v){const s=String(v); if(el.__v===s)return; el.__v=s; el.textContent=s;}
function setAria(el,v){if(el.__a===v)return; el.__a=v; el.ariaValueText=v;}

```

### Revised Phase 3 (Dirty Flags)

Use source ownership: `const DIRTY={signal:true,ui:true};`. Update flags in input listeners; check in `frame()`.

### Revised Phase 4-7 Notes

* **Slider polling:** No longer urgent ($0.01\text{ms}$).
* **Inline `sample()`:** Stale recommendation ($0.05\text{ms}$ is fine).
* **Duplicate `matchScore`:** Still important for correctness.
* **Score popup:** Only pool if rapid combo chains occur.

**New Priority:** 1. `scheduleReplay()` 2. `setText/setAria` 3. `DIRTY` flags 4. Remove duplicate `matchScore` 5. Cache DOM refs. **STOP.**
