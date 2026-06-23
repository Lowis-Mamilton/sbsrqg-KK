# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

幸運公式產生器 ("Lucky Formula Generator") — a single-page PWA (Traditional Chinese, `lang="zh-Hant"`) that generates practice problems for 步步為營, a 國小高年級 (upper elementary) math competition. It draws a random 3-digit target number plus three "lucky" tokens (a digit A, a ×/÷ operator B, a +/− operator C), then searches for arithmetic formulas that satisfy the competition's formula rules and equal the target exactly, ranked to use as many "blocks" (cubes) as possible for maximum score.

The official rules are in `rules/步步為營rules.pdf` (also duplicated under `icons/`) — read this PDF, not just the paraphrase below, before changing scoring or formula-legality logic.

## Architecture

Everything lives in `index.html` — styles, markup, and all JS logic are inline in one `<script>` block. There are no build tools, package manager, or test framework; this is plain HTML/CSS/JS served as static files.

- `index.html` — entire app (UI + formula-search engine)
- `sw.js` — service worker that cache-first serves `./`, `index.html`, `manifest.json`, and the icons for offline PWA use
- `manifest.json` — PWA manifest
- `icons/` — PWA icons (192×192, 512×512)
- `rules/步步為營rules.pdf` — authoritative competition rules (target/lucky-token ranges, formula legality, scoring formula, physical cube-pile composition)

### Arithmetic engine (`evalArith` / `safeEval`)

Expressions are evaluated by a hand-written recursive-descent parser (`evalArith`), never `Function()`/`eval`. It enforces elementary-school-friendly intermediate results, not just standard operator precedence:

- **Division must be exact**: at every `*`/`/` step, a non-integer quotient (or division by zero) immediately fails the whole expression (returns `NaN`). Results are rounded to the nearest integer afterward to avoid float drift.
- **Subtraction can never go negative mid-expression**: at every `+`/`-` step in the same precedence level, the running left-hand value must be `>=` the right-hand operand, or the expression fails. This rejects formulas a 國小 student couldn't compute by simple step-by-step arithmetic, even if the final result is non-negative.
- `safeEval` additionally rejects expressions starting/ending with an operator and rejects an overall negative final result.

Any change to formula-legality rules should go through `evalArith`/`safeEval`, not be bolted on as a post-hoc filter — the search/hill-climbing code relies on `safeEval` returning `NaN` to prune invalid candidates during the search itself.

### Formula-search pipeline: two-tier fallback

`searchFormulas(target, luckA, luckB, luckC, opts)` is the single entry point. It tries a strict tier first and fills any remaining slots from a looser one, returning up to 5 results:

1. **Tier 0 — `searchFullConstraintFormulas`** (preferred): finds formulas that use all ten digits 0–9 exactly once (forcing exactly five two-digit numbers), all four operators (`+ - * /`) exactly once, exactly one *meaningful* parenthesis pair (removing it must change the result), and compute to **exactly** the target. It works by fixing a "structure" (one of the 24 operator orderings × 9 valid parenthesis spans = 216 combinations, via `ALL_STRUCTURES`) and hill-climbing (`hillClimbDigits`) over digit-pair swaps to drive the error to zero for that structure — far more effective than randomly sampling digit groupings. Results from this tier always use all 16 blocks (max bonus, 145 points) and are marked `fullyCompliant: true`.
2. **Tier 1 — `searchApproxFormulas`** (fallback, fills any slots Tier 0 couldn't): the older score-maximizing search — `randomInit` (random 3–5 number/operator combos, weighted toward 5 numbers) + `hillClimb` (swap one number/operator at a time, always moving to the highest-`rankOf` neighbor) + `finalizeFormula` (tries adding one parenthesis pair as a final polish, kept only if it changes the value and improves the rank). It prefers an exact match but will settle for the closest approximate value if no exact formula exists at all.
3. `searchFormulas` returns `{ list, fullyCompliant }`, where `fullyCompliant` is only `true` if every entry in `list` came from Tier 0. The UI currently doesn't surface this flag — `regenerate()`/`regenerateCustom()` just render whatever `list` comes back.

### Ranking: `rankOf`, not raw score

`rankOf(f)` is the comparator used throughout `hillClimb`/`hillClimbDigits`/`finalizeFormula`/sorting: an exact match (`error < EPS`) always outranks any non-exact formula regardless of score, and among exact matches, more blocks wins. Only when nothing exact has been found does it fall back to comparing `scoreFor(error, blocks)`. Get this comparator right before touching any search loop — replacing it with plain score comparison undoes the "always prefer exact, then maximize blocks" behavior.

### Scoring (`countBlocks` / `bonusForBlocks` / `scoreFor`)

Per the official rules: 誤差值 = |target − computed value|; 得分 = 100 − 誤差值 (only when positive); plus a block-count bonus starting at 8 blocks (+5), scaling +5 per additional block up to 16 blocks (+45 cap). A "block" is one physical cube: each digit of a number token, each operator, and a parenthesis pair counts as 2.

### Key invariants enforced throughout

- **Token uniqueness** (`tokensUnique`): within a single formula, no number token may repeat, no operator may repeat, and no individual digit across all number tokens may repeat (e.g. `12` and `21` together are invalid since both reuse digits 1 and 2). Tier 0 enforces this implicitly since it partitions all ten distinct digits.
- Lucky tokens A, B, C must always appear — A as one of the numbers/digits, B and C as two of the operators. In Tier 0 this is automatic (A is one of 0–9, and B/C are two of the four operators which are all used).
- No leading zero on two-digit numbers (`digitsToNums` returns `null` if a pair starts with `'0'`).
- The number pool for Tier 1 (`NUM_POOL`) is single digits 0–9 plus two-digit numbers 10–99.
- A parenthesis pair is only ever accepted if it wraps a strict sub-range (never the whole expression, via `parenVariants`) and actually changes the computed value vs. the unparenthesized form — avoids trivially gaming the block-count bonus or the "must use brackets" rule with a no-op bracket.

### Two entry points into the pipeline

- `regenerate()` — used by the "重新抽題" (re-draw) button; picks a fresh random target/lucky tokens via `generateLuckAndTarget()`.
- `regenerateCustom(target, luckA, luckB, luckC)` — used by the "手動改題" (manual edit) modal; takes user-supplied values (validated inline: target 100–999, A 0–9) and runs the same `searchFormulas` pipeline.

Both call `fillRows(list)` to render the 5 rows (left: expression + value + 誤差/方塊/加分 meta line; right: total score).

## Running locally

No build step. Serve the directory with any static file server, e.g.:

```
python -m http.server 8080
```

Then open `http://localhost:8080/`. Service worker registration requires serving over HTTP(S) (not `file://`).

## Testing changes

There is no test framework. To validate search/scoring logic changes without the UI: extract the `<script>` body up to (but not including) the trailing `initFiveRows(); regenerate();` auto-run calls, stub `document`/`navigator` as plain objects (`const navigator = {};` — no `serviceWorker` key, so the service-worker registration block is skipped), append a `module.exports = {...}` line exposing the functions you need (e.g. `searchFormulas`, `searchFullConstraintFormulas`, `generateLuckAndTarget`), and run it under Node — e.g. loop `generateLuckAndTarget()` + `searchFormulas(...)` a few dozen times and assert on `fullyCompliant`, digit-set completeness, and timing. For UI verification, serve locally and check in a browser (or via a headless-browser screenshot) at both desktop and the `max-width:600px`/`max-width:380px` mobile breakpoints.
