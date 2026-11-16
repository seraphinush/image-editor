# Automation feature test cases

Reusable checklist for the record → save template → apply series flow (plus copy/merge interactions).
Automated coverage: `tests/automation.spec.mjs` (`npm test` from `tests/`).

Last full run: **2026-11-16**

## How automation works (reference)

1. Open **Automation** dock (`data-dock="automation"`).
2. **Record** (`#recordSeries`): toggles recording; while on, crop / scale / place / move / flip / rotate append steps.
3. **Stop**, then **Save** (`#saveSeries`) names a template into `localStorage` (`image-editor-templates`).
4. **Apply** (`#applySeries`) runs the selected template’s steps on selected layers (or the active layer).
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

---

## Bugs found this run

| ID | Severity | Root cause | Fix |
|----|----------|------------|-----|
| B1 | Medium | Crop with amount `0` still called `recordStep`, polluting templates | Only `recordStep` when amount `> 0` (`app.js` crop handler) |
| B2 | High | Flip/rotate were never recorded / not replayable | Record `{type:"transform",mode}`; async `applyStepToLayer` + guarded apply |
| B3 | High | Merge removed layers via live `selected` after async dialog/encode | Remove by snapshotted `mergedIds` from the merge group |
| B4 | Low | Double-click Apply during async transform apply could overlap | `applyingSeries` guard + disable Apply until finished |
| B5 | Medium | `.empty-state { inset:0 }` captured pointer events over the stage, fighting mobile dock clicks in automation | `pointer-events: none` on `.empty-state`, `auto` on `.empty-state-card` (`styles.css`) |

**Suite result:** `npx playwright test` in `tests/` → **44 passed** (22 cases × desktop + mobile Chromium) on 2026-11-16.
