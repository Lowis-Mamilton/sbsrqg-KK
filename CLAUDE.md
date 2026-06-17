# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

幸運公式產生器 ("Lucky Formula Generator") — a single-page PWA (Traditional Chinese, `lang="zh-Hant"`) for elementary-school math practice. It generates a random 3-digit target number plus three "lucky" tokens (a digit A, a ×/÷ operator B, a +/− operator C), then computes reference arithmetic formulas using those tokens that evaluate as close as possible to the target.

## Architecture

Everything lives in `index.html` — styles, markup, and all JS logic are inline in one file. There are no build tools, package manager, or test framework; this is plain HTML/CSS/JS served as static files.

- `index.html` — entire app (UI + formula-generation engine)
- `sw.js` — service worker that cache-first serves `./`, `index.html`, `manifest.json`, and the icons for offline PWA use
- `manifest.json` — PWA manifest
- `icons/` — PWA icons (192x192, 512x512)

### Formula-generation pipeline (in `index.html`'s `<script>`)

1. `generateLuckAndTarget()` picks a random target (100–999), lucky digit A (0–9), lucky operator B (`*`/`/`), lucky operator C (`+`/`-`).
2. `findExactFormula` tries to find an exact match: `findExactN3` brute-forces all 3-number combinations (including A) with operators B and C in both orders; if none found, `findExactN4` does a bounded/limited 4-number search (capped via `maxChecks`) since full 4-number search is too large.
3. If no exact formula exists, `findBestApproxBase` randomly samples 3-or-4-number/operator combinations, scores them by absolute error to target, then `refineFormula` does local hill-climbing (swap one number or one non-lucky operator at a time) on the top candidates to minimize error further.
4. `produceFiveFromBase` takes the best formula and mutates it (changing one non-lucky number or operator at a time, within a ±10 neighborhood plus random extras) to generate 5 distinct formulas total, all sorted by error ascending, capping accepted error at 30.
5. UI renders the 5 formulas with their computed value and error in `fillRows`.

### Key invariants enforced throughout

- **Token uniqueness** (`tokensUnique`): within a single formula, no number token may repeat, no operator may repeat, and no individual digit/character across all number tokens may repeat (e.g. `12` and `21` together are invalid since both reuse digits 1 and 2).
- Lucky tokens A, B, C must always appear in the generated formula — A as one of the numbers, B and C as two of the operators.
- Division by zero is guarded in `safeEval` via regex before calling `Function(...)` to evaluate the expression string.
- The number pool (`NUM_POOL`) is single digits 0–9 plus two-digit numbers 10–99.

### Two entry points into the pipeline

- `regenerate()` — used by the "重新抽題" (re-draw) button; picks a fresh random target/lucky tokens.
- `regenerateCustom(target, luckA, luckB, luckC)` — used by the "手動改題" (manual edit) modal; takes user-supplied values (validated inline: target 100–999, A 0–9) and runs the same exact→approx→produce-five pipeline.

## Running locally

No build step. Serve the directory with any static file server, e.g.:

```
python -m http.server 8080
```

Then open `http://localhost:8080/`. Service worker registration requires serving over HTTP(S) (not `file://`).
