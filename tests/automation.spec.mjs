import { test, expect } from "@playwright/test";
import {
  addImages,
  applyTemplate,
  cropLeft,
  expectNear,
  fixture,
  openApp,
  openAutomation,
  openFrame,
  openTransform,
  placeCell,
  recordOff,
  recordOn,
  saveTemplate,
  scalePercent,
  scalePixels,
  selectAll,
  setCanvasSize,
  snap,
  sample,
} from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

async function statusText(page) {
  return page.locator("#status").innerText();
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("A1 empty apply warns", async ({ page }) => {
  await openAutomation(page);
  const s = await snap(page);
  expect(s.layers).toHaveLength(0);
  expect(s.canvas).toEqual({ width: 500, height: 500 });
  await expect(page.locator("#applySeries")).toBeDisabled();
});

test("A2 empty recording save warns", async ({ page }) => {
  await recordOn(page);
  await recordOff(page);
  let warned = "";
  page.once("dialog", async (d) => {
    warned = "prompted";
    await d.dismiss();
  });
  await page.locator("#saveSeries").click();
  await expect.poll(statusText.bind(null, page)).toMatch(/Record at least one/i);
  expect(warned).toBe("");
  expect((await snap(page)).templates).toHaveLength(0);
});

test("A3 save while recording warns", async ({ page }) => {
  const [red] = fixture("red-100.png");
  await addImages(page, [red]);
  await recordOn(page);
  await scalePercent(page, 50);
  await openAutomation(page);
  await page.locator("#saveSeries").click();
  await expect.poll(statusText.bind(null, page)).toMatch(/Stop recording before saving/i);
  expect((await snap(page)).templates).toHaveLength(0);
  await recordOff(page);
});

test("A4 cancel mid-recording clears unsaved steps", async ({ page }) => {
  const [red] = fixture("red-100.png");
  await addImages(page, [red]);
  await recordOn(page);
  await scalePercent(page, 50);
  expect((await snap(page)).recordedSteps.length).toBeGreaterThan(0);
  await recordOff(page);
  await recordOn(page);
  expect((await snap(page)).recordedSteps).toHaveLength(0);
  await recordOff(page);
  expect((await snap(page)).templates).toHaveLength(0);
});

test("A5 single image scale+place apply", async ({ page }) => {
  const [red] = fixture("red-100.png");
  await addImages(page, [red]);
  await recordOn(page);
  await scalePercent(page, 50);
  await placeCell(page, 1, 1);
  await recordOff(page);
  await saveTemplate(page, "half-center");
  await page.locator("#undoBtn").click();
  await page.locator("#undoBtn").click();
  let s = await snap(page);
  expect(s.layers[0].w).toBe(100);
  await applyTemplate(page, "half-center");
  s = await snap(page);
  expect(s.layers[0].w).toBe(50);
  expect(s.layers[0].h).toBe(50);
  expectNear(s.layers[0].x, Math.round((s.canvas.width - 50) / 2));
  expectNear(s.layers[0].y, Math.round((s.canvas.height - 50) / 2));
});

test("A6 zero crop not recorded", async ({ page }) => {
  const [red] = fixture("red-100.png");
  await addImages(page, [red]);
  await recordOn(page);
  await cropLeft(page, 0);
  const s = await snap(page);
  expect(s.recordedSteps.filter((st) => st.type === "crop")).toHaveLength(0);
  await recordOff(page);
});

test("A7 record on one apply to others", async ({ page }) => {
  const files = fixture("red-100.png", "blue-200x150.png", "green-50x300.png");
  await addImages(page, [files[0]]);
  await recordOn(page);
  await scalePercent(page, 50);
  await recordOff(page);
  await saveTemplate(page, "half");
  await page.locator("#undoBtn").click();
  await addImages(page, [files[1], files[2]]);
  const before = await snap(page);
  expect(before.layers).toHaveLength(3);
  await page.evaluate(() => {
    const s = window.__imageEditorTest.snapshot();
    window.__imageEditorTest.setSelected([s.layers[1].id, s.layers[2].id]);
  });
  await applyTemplate(page, "half");
  const after = await snap(page);
  expect(after.layers[0].w).toBe(before.layers[0].w);
  expect(after.layers[1].w).toBe(Math.round(before.layers[1].w * 0.5));
  expect(after.layers[2].w).toBe(Math.round(before.layers[2].w * 0.5));
  expect(after.layers).toHaveLength(3);
});

test("A8 apply place to all selected", async ({ page }) => {
  const files = fixture("red-100.png", "blue-200x150.png", "tiny-8.png");
  await addImages(page, files);
  await recordOn(page);
  await placeCell(page, 2, 2);
  await recordOff(page);
  await saveTemplate(page, "br");
  await selectAll(page);
  await applyTemplate(page, "br");
  const s = await snap(page);
  for (const l of s.layers) {
    expect(l.x).toBe(s.canvas.width - l.w);
    expect(l.y).toBe(s.canvas.height - l.h);
  }
});

test("A9 place respects new canvas size", async ({ page }) => {
  const [red] = fixture("red-100.png");
  await addImages(page, [red]);
  await recordOn(page);
  await placeCell(page, 1, 1);
  await recordOff(page);
  await saveTemplate(page, "center");
  await setCanvasSize(page, 800, 450);
  await applyTemplate(page, "center");
  const s = await snap(page);
  expect(s.canvas).toEqual({ width: 800, height: 450 });
  expectNear(s.layers[0].x, Math.round((800 - s.layers[0].w) / 2));
  expectNear(s.layers[0].y, Math.round((450 - s.layers[0].h) / 2));
});

test("A10 portrait and landscape scale", async ({ page }) => {
  const files = fixture("blue-200x150.png", "green-50x300.png");
  await addImages(page, [files[0]]);
  await recordOn(page);
  await scalePercent(page, 50);
  await recordOff(page);
  await saveTemplate(page, "half2");
  await page.locator("#undoBtn").click();
  await addImages(page, [files[1]]);
  await selectAll(page);
  await applyTemplate(page, "half2");
  const s = await snap(page);
  expect(s.layers[0].w).toBe(100);
  expect(s.layers[0].h).toBe(75);
  expect(s.layers[1].w).toBe(25);
  expect(s.layers[1].h).toBe(150);
});

test("A11 undo redo around apply", async ({ page }) => {
  const [red] = fixture("red-100.png");
  await addImages(page, [red]);
  await recordOn(page);
  await scalePercent(page, 50);
  await recordOff(page);
  await saveTemplate(page, "half3");
  await page.locator("#undoBtn").click();
  const original = await snap(page);
  await applyTemplate(page, "half3");
  expect((await snap(page)).layers[0].w).toBe(50);
  await page.locator("#undoBtn").click();
  expect((await snap(page)).layers[0].w).toBe(original.layers[0].w);
  await page.locator("#redoBtn").click();
  expect((await snap(page)).layers[0].w).toBe(50);
});

test("A12 re-run compounds scale", async ({ page }) => {
  const [red] = fixture("red-100.png");
  await addImages(page, [red]);
  await recordOn(page);
  await scalePercent(page, 50);
  await recordOff(page);
  await saveTemplate(page, "half4");
  await page.locator("#undoBtn").click();
  await applyTemplate(page, "half4");
  await applyTemplate(page, "half4");
  expect((await snap(page)).layers[0].w).toBe(25);
});

test("A13 delete template", async ({ page }) => {
  const [red] = fixture("red-100.png");
  await addImages(page, [red]);
  await recordOn(page);
  await scalePercent(page, 80);
  await recordOff(page);
  await saveTemplate(page, "to-delete");
  await openAutomation(page);
  const id = await page.evaluate(() => window.__imageEditorTest.snapshot().templates.find((t) => t.name === "to-delete").id);
  await page.locator("#templateSelect").selectOption(id);
  await page.locator("#deleteTemplate").click();
  const s = await snap(page);
  expect(s.templates.find((t) => t.name === "to-delete")).toBeFalsy();
  await expect(page.locator("#applySeries")).toBeDisabled();
});

test("A14 flip recorded and replayed", async ({ page }) => {
  const [grad] = fixture("gradient-60.png");
  await addImages(page, [grad]);
  await recordOn(page);
  await openTransform(page);
  await page.locator("#flipHBtn").click();
  await page.waitForFunction(() => window.__imageEditorTest.snapshot().recordedSteps.some((s) => s.type === "transform"));
  await recordOff(page);
  await saveTemplate(page, "flip-h");
  const afterFlip = await snap(page);
  const lx = afterFlip.layers[0].x + 2;
  const ly = afterFlip.layers[0].y + Math.floor(afterFlip.layers[0].h / 2);
  const flipped = await sample(page, lx, ly);
  await page.locator("#undoBtn").click();
  const originalLeft = await sample(page, lx, ly);
  expect(flipped[0]).not.toBe(originalLeft[0]);
  await applyTemplate(page, "flip-h");
  const again = await sample(page, lx, ly);
  expectNear(again[0], flipped[0], 2);
  expectNear(again[2], flipped[2], 2);
});

test("A15 large and small pixel scale", async ({ page }) => {
  const files = fixture("tiny-8.png", "large-800x600.png");
  await addImages(page, [files[0]]);
  await recordOn(page);
  await scalePixels(page, 40);
  await recordOff(page);
  await saveTemplate(page, "to-40");
  await page.locator("#undoBtn").click();
  await addImages(page, [files[1]]);
  await selectAll(page);
  await applyTemplate(page, "to-40");
  const s = await snap(page);
  expectNear(s.layers[0].w, 40, 1);
  expectNear(s.layers[1].w, 40, 1);
  expect(s.layers[0].w).toBeGreaterThanOrEqual(1);
  expect(s.layers[1].h).toBeGreaterThanOrEqual(1);
});

test("A16 apply re-entry guard", async ({ page }) => {
  const [grad] = fixture("gradient-60.png");
  await addImages(page, [grad]);
  await recordOn(page);
  await openTransform(page);
  await page.locator("#flipHBtn").click();
  await page.waitForFunction(() => window.__imageEditorTest.snapshot().recordedSteps.length > 0);
  await recordOff(page);
  await saveTemplate(page, "flip-guard");
  await openAutomation(page);
  const id = await page.evaluate(() => window.__imageEditorTest.snapshot().templates.find((t) => t.name === "flip-guard").id);
  await page.locator("#templateSelect").selectOption(id);
  await page.locator("#applySeries").click();
  await page.locator("#applySeries").click();
  await page.waitForFunction(() => !window.__imageEditorTest.snapshot().applyingSeries);
  expect((await snap(page)).layers).toHaveLength(1);
});

test("A17 multi image copy composite", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const files = fixture("red-100.png", "blue-200x150.png");
  await addImages(page, files);
  await setCanvasSize(page, 400, 300);
  await page.evaluate(() => {
    const s = window.__imageEditorTest.snapshot();
    window.__imageEditorTest.setSelected([s.layers[0].id]);
  });
  await placeCell(page, 0, 2);
  await page.evaluate(() => {
    const s = window.__imageEditorTest.snapshot();
    window.__imageEditorTest.setSelected([s.layers[1].id]);
  });
  await placeCell(page, 2, 0);
  const before = await snap(page);
  expect(before.layers).toHaveLength(2);
  expect(before.layers[0].x).toBe(0);
  expect(before.layers[0].y).toBe(before.canvas.height - before.layers[0].h);
  expect(before.layers[1].x).toBe(before.canvas.width - before.layers[1].w);
  expect(before.layers[1].y).toBe(0);
  const redPx = await sample(page, before.layers[0].x + 10, before.layers[0].y + 10);
  const bluePx = await sample(page, before.layers[1].x + 10, before.layers[1].y + 10);
  expect(redPx[0]).toBeGreaterThan(150);
  expect(bluePx[2]).toBeGreaterThan(150);
  await page.locator("#copyBtn").click();
  await expect.poll(statusText.bind(null, page)).toMatch(/copied|Clipboard/i);
  const clip = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const img = items.find((i) => i.types.includes("image/png"));
    if (!img) return null;
    const blob = await img.getType("image/png");
    const buf = new Uint8Array(await blob.arrayBuffer());
    return { size: buf.length, widthHint: blob.size };
  });
  expect(clip?.size).toBeGreaterThan(100);
  const after = await snap(page);
  expect(after.layers).toHaveLength(2);
  expect(after.canvas).toEqual(before.canvas);
});

async function confirmYes(page) {
  await expect(page.locator("#confirm")).toBeVisible();
  await page.locator("#confirmYes").click();
}

test("A18 merge horizontally after automation", async ({ page }) => {
  const files = fixture("red-100.png", "blue-200x150.png");
  await addImages(page, files);
  await recordOn(page);
  await placeCell(page, 0, 0);
  await recordOff(page);
  await saveTemplate(page, "tl");
  await selectAll(page);
  await applyTemplate(page, "tl");
  // selectAll toggles — ensure both stay selected after apply
  await page.evaluate(() => {
    const s = window.__imageEditorTest.snapshot();
    window.__imageEditorTest.setSelected(s.layers.map((l) => l.id));
  });
  await page.locator("#mergeH").click();
  await confirmYes(page);
  await page.waitForFunction(() => window.__imageEditorTest.snapshot().layers.length === 1);
  const s = await snap(page);
  expect(s.layers).toHaveLength(1);
  expect(s.canvas.width).toBe(300);
  expect(s.canvas.height).toBe(150);
  expect(s.layers[0].name).toMatch(/Merged 2/);
  const left = await sample(page, 10, 75);
  const right = await sample(page, 150, 75);
  expect(left[0]).toBeGreaterThan(150);
  expect(right[2]).toBeGreaterThan(150);
});

test("A19 merge vertically after automation", async ({ page }) => {
  const files = fixture("red-100.png", "blue-200x150.png");
  await addImages(page, files);
  await page.evaluate(() => {
    const s = window.__imageEditorTest.snapshot();
    window.__imageEditorTest.setSelected(s.layers.map((l) => l.id));
  });
  await page.locator("#mergeV").click();
  await confirmYes(page);
  await page.waitForFunction(() => window.__imageEditorTest.snapshot().layers.length === 1);
  const s = await snap(page);
  expect(s.layers).toHaveLength(1);
  expect(s.canvas.width).toBe(200);
  expect(s.canvas.height).toBe(250);
  const top = await sample(page, 100, 10);
  const bottom = await sample(page, 100, 160);
  expect(top[0]).toBeGreaterThan(150);
  expect(bottom[2]).toBeGreaterThan(150);
});

test("A20 merge snapshot ignores selection change during confirm", async ({ page }) => {
  const files = fixture("red-100.png", "blue-200x150.png", "green-50x300.png");
  await addImages(page, files);
  const beforeIds = await page.evaluate(() => window.__imageEditorTest.snapshot().layers.map((l) => l.id));
  await page.evaluate((ids) => window.__imageEditorTest.setSelected(ids), beforeIds.slice(0, 2));
  await page.locator("#mergeH").click();
  await expect(page.locator("#confirm")).toBeVisible();
  // Change live selection while dialog is open; merge must still use the snapshotted A+B group.
  await page.evaluate((id) => window.__imageEditorTest.setSelected([id]), beforeIds[2]);
  await confirmYes(page);
  await page.waitForFunction(() => window.__imageEditorTest.snapshot().layers.some((l) => /Merged 2/.test(l.name)));
  const s = await snap(page);
  const names = s.layers.map((l) => l.name);
  expect(names.some((n) => /Merged 2/.test(n))).toBe(true);
  expect(names.some((n) => n.includes("green"))).toBe(true);
  expect(s.layers.length).toBe(2);
  expect(s.canvas.width).toBe(300);
  expect(s.canvas.height).toBe(150);
});

test("A21 mobile record save apply (runs on both projects)", async ({ page }) => {
  const [red] = fixture("red-100.png");
  await addImages(page, [red]);
  await recordOn(page);
  await scalePercent(page, 50);
  await recordOff(page);
  await saveTemplate(page, "mobile-half");
  await page.locator("#undoBtn").click();
  await applyTemplate(page, "mobile-half");
  expect((await snap(page)).layers[0].w).toBe(50);
});

test("A22 merge then copy smoke", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const files = fixture("red-100.png", "blue-200x150.png");
  await addImages(page, files);
  await page.evaluate(() => {
    const s = window.__imageEditorTest.snapshot();
    window.__imageEditorTest.setSelected(s.layers.map((l) => l.id));
  });
  await page.locator("#mergeH").click();
  await confirmYes(page);
  await page.waitForFunction(() => window.__imageEditorTest.snapshot().layers.length === 1);
  const s = await snap(page);
  expect(s.canvas.width).toBe(300);
  await page.locator("#copyBtn").click();
  await expect.poll(statusText.bind(null, page)).toMatch(/copied|Clipboard/i);
});

test("A23 portrait pair fit, 9:16, invert, place left, reorder, copy", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const start = await snap(page);
  expect(start.layers).toHaveLength(0);
  expect(start.canvas).toEqual({ width: 500, height: 500 });
  await expect(page.locator("#ratioCurrent")).toHaveText("1:1");

  const [imageA, imageB] = fixture("a-1300x2131.png", "b-1300x2131.png");
  await page.setInputFiles("#fileInput", [imageA, imageB]);
  await page.waitForFunction(() => window.__imageEditorTest.snapshot().layers.length === 2);
  const loaded = await snap(page);
  expect(loaded.layers.map((l) => l.name)).toEqual(["a-1300x2131.png", "b-1300x2131.png"]);
  expect(loaded.selected).toEqual(loaded.layers.map((l) => l.id));
  expect(loaded.layers.every((l) => l.w === 1300 && l.h === 2131)).toBe(true);
  const domOrder = () => page.locator("#layers .image-card .image-card-name").allTextContents();
  expect(await domOrder()).toEqual(["a-1300x2131.png", "b-1300x2131.png"]);
  // First card is the top layer, so A covers the default canvas.
  const covered = await sample(page, 250, 250);
  expect(covered[0]).toBeGreaterThan(150);
  expect(covered[2]).toBeLessThan(80);

  await openFrame(page);
  await page.locator("#fitImageBtn").click();
  await page.waitForFunction(() => {
    const c = window.__imageEditorTest.snapshot().canvas;
    return c.width === 1300 && c.height === 2131;
  });

  await page.locator("#ratioBtn").click();
  await page.getByRole("menuitemradio", { name: "9:16" }).click();
  await page.waitForFunction(() => {
    const c = window.__imageEditorTest.snapshot().canvas;
    return c.width === 1198 && c.height === 2131;
  });
  await expect(page.locator("#ratioCurrent")).toHaveText("9:16");
  await page.keyboard.press("Escape");

  await page.locator("#invertRatioBtn").click();
  await page.waitForFunction(() => {
    const c = window.__imageEditorTest.snapshot().canvas;
    return c.width === 1300 && c.height === 731;
  });
  await expect(page.locator("#ratioCurrent")).toHaveText("16:9");

  await placeCell(page, 0, 1);
  const placed = await snap(page);
  const active = placed.layers.find((l) => l.id === placed.activeId);
  expect(active.name).toBe("b-1300x2131.png");
  expect(active.x).toBe(0);

  const cards = page.locator("#layers .image-card");
  await cards.nth(1).scrollIntoViewIfNeeded();
  const from = await cards.nth(1).boundingBox();
  const to = await cards.nth(0).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 6, to.y + 6, { steps: 16 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const names = window.__imageEditorTest.snapshot().layers.map((l) => l.name);
    return names[0] === "b-1300x2131.png" && names[1] === "a-1300x2131.png";
  });
  expect(await domOrder()).toEqual(["b-1300x2131.png", "a-1300x2131.png"]);
  const onTop = await sample(page, 10, 10);
  expect(onTop[2]).toBeGreaterThan(150);
  expect(onTop[0]).toBeLessThan(80);

  await page.locator("#copyBtn").click();
  await expect.poll(statusText.bind(null, page)).toMatch(/copied|Clipboard/i);
  const copied = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find((entry) => entry.types.includes("image/png"));
    const blob = await item.getType("image/png");
    const bitmap = await createImageBitmap(blob);
    const board = document.createElement("canvas");
    board.width = bitmap.width;
    board.height = bitmap.height;
    const g = board.getContext("2d");
    g.drawImage(bitmap, 0, 0);
    const px = g.getImageData(10, 10, 1, 1).data;
    return {
      width: bitmap.width,
      height: bitmap.height,
      px: [px[0], px[1], px[2], px[3]],
      live: window.__imageEditorTest.sample(10, 10),
    };
  });
  expect(copied.width).toBe(1300);
  expect(copied.height).toBe(731);
  expect(copied.px).toEqual(copied.live);
});
