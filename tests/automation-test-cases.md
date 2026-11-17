# Automation feature test cases

Reusable checklist for the record → save template → apply series flow (plus copy/merge interactions).
Automated coverage: `tests/automation.spec.mjs` (`npm test` from `tests/`).

Last full run: **2026-11-16**

## How automation works (reference)

1. Open **Automation** dock (`data-dock="automation"`).
2. **Record** (`#recordSeries`): toggles recording; while on, crop / scale / place / move / flip / rotate append steps.
3. **Stop**, then **Save** (`#saveSeries`) names a template into `localStorage` (`image-editor-templates`).
4. **Apply** (`#applySeries`) runs the selected template’s steps on every selected layer.
5. **Copy** exports the composite canvas PNG to the clipboard; **Merge** H/V combines selected layers in **images-list order**.

---

## Cases

### A1 — Empty state: apply with no images
- **Steps:** Open automation; with no images, choose/apply if possible.
- **Expected:** Warning to select/add images; canvas unchanged (500×500 empty).
- **Last result:** PASS — 2026-11-16

### A2 — Empty recording save
- **Steps:** Start record → stop with no transforms → Save.
- **Expected:** Warn “Record at least one transformation first.”; no template added.
- **Last result:** PASS — 2026-11-16

### A3 — Save while still recording
- **Steps:** Start record → perform a crop → Save without stopping.
- **Expected:** Warn “Stop recording before saving”; template not saved yet.
- **Last result:** PASS — 2026-11-16

### A4 — Cancel mid-recording (stop with zero keep)
- **Steps:** Start record → stop immediately (0 steps) OR start → transform → stop without save → start again.
- **Expected:** Second start clears unsaved steps; no template unless saved.
- **Last result:** PASS — 2026-11-16

### A5 — Single image: record scale + place, apply once
- **Steps:** Add 100×100 red PNG; record scale 50% + place center; save; undo to original; apply template.
- **Expected:** Layer becomes 50×50 and centered on canvas.
- **Last result:** PASS — 2026-11-16

### A6 — Single image: crop recording ignores amount 0
- **Steps:** Record; crop left with amount 0; stop.
- **Expected:** No crop step recorded.
- **Last result:** PASS — 2026-11-16

### A7 — Record on one image, apply to multiple others
- **Steps:** Record scale 50% on image A; save; add B and C; select B+C; apply.
- **Expected:** Only B and C scale; A unchanged; no duplicates.
- **Last result:** PASS — 2026-11-16

### A8 — Multiple images selected during apply (all targets)
- **Steps:** Three images; select all; apply place bottom-right template.
- **Expected:** Each selected layer ends at bottom-right for current canvas size.
- **Last result:** PASS — 2026-11-16

### A9 — Different canvas ratios / sizes
- **Steps:** Record place center on 500×500; change canvas to 16:9 (or set W/H); apply to image.
- **Expected:** Center uses new canvas dimensions.
- **Last result:** PASS — 2026-11-16

### A10 — Portrait vs landscape source images
- **Steps:** Apply percent-scale template to wide and tall images.
- **Expected:** Both scale by the same factor; aspect preserved.
- **Last result:** PASS — 2026-11-16

### A11 — Undo / redo around apply
- **Steps:** Apply template; Undo; Redo.
- **Expected:** Undo restores pre-apply geometry; redo re-applies result.
- **Last result:** PASS — 2026-11-16

### A12 — Re-run template (compounding)
- **Steps:** Apply 50% scale template twice to one image.
- **Expected:** Second run scales again (~25% of original).
- **Last result:** PASS — 2026-11-16

### A13 — Delete template
- **Steps:** Save a template; delete it; confirm select empties / apply disabled.
- **Expected:** Template removed from select and localStorage.
- **Last result:** PASS — 2026-11-16

### A14 — Flip/rotate are recorded and replayed
- **Steps:** Record flip-H on image; save; undo; apply.
- **Expected:** Pixel mirror matches a manual flip.
- **Last result:** PASS — 2026-11-16

### A15 — Large and small images
- **Steps:** Apply pixel-width scale (e.g. to 40px) on 8×8 and 800×600 images.
- **Expected:** Both end near width 40; min size ≥ 1; no crash.
- **Last result:** PASS — 2026-11-16

### A16 — Mid-apply re-entry guard
- **Steps:** Start apply on a template that includes transform; click Apply again immediately.
- **Expected:** Second click warns / is ignored; single coherent result.
- **Last result:** PASS — 2026-11-16

### A17 — Multiple images then COPY composite
- **Steps:** Two differently colored images placed without full overlap; apply a no-op or place template; Copy.
- **Expected:** Clipboard PNG matches canvas composite (both colors present; correct canvas size); layer count unchanged.
- **Last result:** PASS — 2026-11-16

### A18 — Multiple images MERGED horizontally after automation
- **Steps:** Automate/place two images; select both; Merge H; confirm.
- **Expected:** One layer; canvas width = sum of widths; height = max height; list order left→right; no duplicate leftovers of merged sources.
- **Last result:** PASS — 2026-11-16

### A19 — Multiple images MERGED vertically after automation
- **Steps:** Same as A18 with Merge V.
- **Expected:** Height = sum; width = max; top→bottom follows list order; sources removed.
- **Last result:** PASS — 2026-11-16

### A20 — Merge uses snapshotted group (selection change during confirm)
- **Steps:** Select A+B; open merge confirm; change selection to only C before confirming; confirm.
- **Expected:** Still merges A+B (original group); C remains; no wrong deletions.
- **Last result:** PASS — 2026-11-16

### A21 — Mobile viewport: record / save / apply
- **Steps:** iPhone-sized viewport; open automation dock; record scale; save; apply.
- **Expected:** Same geometric result as desktop.
- **Last result:** PASS — 2026-11-16

### A22 — Desktop + mobile: merge + copy smoke
- **Steps:** On both viewports, two images → merge H → copy (or download fallback check).
- **Expected:** Merged dimensions correct; copy succeeds or documents clipboard grant.
- **Last result:** PASS — 2026-11-16

### A23 — Portrait pair: fit, 9:16, place left, reorder, copy
- **Steps:** Defaults (500×500, ratio 1:1). Add A then B, both 500×800 (wider than 9:16), in one pick so both stay selected and A is first in the images list. Frame → fit canvas to image. Frame → ratio 9:16 (presets stay 1:1, 3:4, 9:16). Layout → place grid → middle left. Drag B to the front of the images list (top on desktop, left on mobile). Copy.
- **Expected:** List order starts A, B and A is the visible top layer. After fit the canvas is 500×800. 9:16 crops straight to 450×800 and the ratio stays 9:16. Middle left shifts every selected image to the left edge. Moving B to the front of the list puts B on top of the canvas. The copied PNG is 450×800 and matches that canvas.
- **Last result:** PASS — 2026-11-17 (desktop and mobile)

### A24 — Layout place uses the images selection
- **Steps:** Add red 100×100 and blue 200×150 in one pick so both stay selected. Layout → place grid → top left. Then select only blue. Layout → place grid → bottom right.
- **Expected:** With both selected, both move to (0, 0). With only blue selected, red stays at (0, 0) and blue moves to the bottom-right corner of the canvas.
- **Last result:** PASS — 2026-11-17 (desktop and mobile)

### A25 — Scale and crop use the images selection
- **Steps:** Add red 100×100 and blue 200×150 in one pick so both stay selected. Scale 50%. Crop left by 10px. Select only red. Scale 200%.
- **Expected:** Both images scale and crop together while selected. After only red is selected, red scales again and blue keeps its earlier size.
- **Last result:** PASS — 2026-11-17 (desktop and mobile)

### A26 — Canvas drag moves only the hit layer
- **Steps:** Add red, blue, and green in one pick (all selected, stacked at center). Drag the stack. Park the first list image at top-left. Select all again. Drag the remaining stack at center.
- **Expected:** First drag moves only the first list image (topmost). After it is parked aside, the next drag moves only the second list image (now topmost in the stack). The other layers stay put.
- **Last result:** PASS — 2026-11-17 (desktop and mobile)

### A27 — Keyboard shortcuts
- **Steps:** Add red 100×100. Scale 50%. Press Ctrl+Z, then Ctrl+Shift+Z. Undo again, press F. Press V then H. Press 3, 1, 4, 2. Focus the scale field and press V and 3.
- **Expected:** Undo/redo restore sizes. F fits the canvas to 100×100. V opens the place grid on the Layout dock; H returns to the hand tool. Dock keys 1–4 select Frame, Layout, Transform, Automation. Shortcuts do nothing while typing in the scale field.
- **Last result:** PASS — 2026-11-17 (desktop and mobile)

---

## Bugs found this run

| ID | Severity | Root cause | Fix |
|----|----------|------------|-----|
| B1 | Medium | Crop with amount `0` still called `recordStep`, polluting templates | Only `recordStep` when amount `> 0` (`app.js` crop handler) |
| B2 | High | Flip/rotate were never recorded / not replayable | Record `{type:"transform",mode}`; async `applyStepToLayer` + guarded apply |
| B3 | High | Merge removed layers via live `selected` after async dialog/encode | Remove by snapshotted `mergedIds` from the merge group |
| B4 | Low | Double-click Apply during async transform apply could overlap | `applyingSeries` guard + disable Apply until finished |
| B5 | Medium | `.empty-state { inset:0 }` captured pointer events over the stage, fighting mobile dock clicks in automation | `pointer-events: none` on `.empty-state`, `auto` on `.empty-state-card` (`styles.css`) |

**Suite result:** `npx playwright test` in `tests/` → **54 passed** (27 cases × desktop + mobile Chromium) on 2026-11-17.
