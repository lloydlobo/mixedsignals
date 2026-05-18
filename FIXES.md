# Bug Fixes & Polish

## Fix 1 — NEW GAME starts at level 1

- **File:** `index.html:84`
- **Change:** `onclick="startGame()"` → `onclick="restartGame()"`
- **Why:** `restartGame()` resets `level = 0`, score, etc. `startGame()` does not, so after beating all levels it resumes at level 7 instead of a fresh start.

## Fix 2 — Continue button label after all levels beaten

- **File:** `main.js:264` in `renderStartScreen()`
- **Change:**
  ```js
  // Before:
  if (hasProgress) continueBtn.textContent = `CONTINUE (LV ${save.highestLevel + 1})`;

  // After:
  if (hasProgress) {
    const nextLv = save.highestLevel + 1;
    continueBtn.textContent = nextLv > LEVELS.length
      ? "CONTINUE (FREEPLAY)"
      : `CONTINUE (LV ${nextLv})`;
  }
  ```
- **Why:** After completing all 7 levels, `save.highestLevel = 7`, showing "CONTINUE (LV 8)" — misleading since no LV 8 exists.

## Fix 3 — Level label shows ∞ in post-game freeplay

- **File:** `main.js`

### 3a — Add state variable (near line 82)
```js
let postGameFreeplay = false;
```

### 3b — Set flag in post-game freeplay branch of `nextRound()` (~line 1646)
```js
postGameFreeplay = true;
```

### 3c — Check flag in `applyLevelUI()` (line 1517)
```js
// Before:
UI.labels.level.textContent = level + 1;

// After:
UI.labels.level.textContent = postGameFreeplay ? "∞" : level + 1;
```

### 3d — Reset flag in `goToMenu()` (~line 1725)
```js
postGameFreeplay = false;
```

### 3e — Reset flag in `restartGame()` (line 1741)
```js
postGameFreeplay = false;
```

- **Why:** Post-game freeplay shows "7" for the level label — confusing since there are only 7 levels.
- **Note:** Warmup freeplay (LV1, LV6 READY screen) still shows the normal level number.
