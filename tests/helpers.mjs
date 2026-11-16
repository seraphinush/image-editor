import { expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "./png.mjs";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

export function ensureFixtures() {
  fs.mkdirSync(fixturesDir, { recursive: true });
  writeSolid("red-100.png", 100, 100, [220, 40, 40, 255]);
  writeSolid("blue-200x150.png", 200, 150, [40, 80, 220, 255]);
  writeSolid("green-50x300.png", 50, 300, [40, 180, 80, 255]);
  writeSolid("tiny-8.png", 8, 8, [255, 200, 0, 255]);
  writeSolid("large-800x600.png", 800, 600, [120, 40, 160, 255]);
  writeGradient("gradient-60.png", 60, 40);
}

function writeSolid(name, w, h, rgba) {
  const file = path.join(fixturesDir, name);
  if (fs.existsSync(file)) return file;
  fs.writeFileSync(file, PNG.encode(w, h, () => rgba));
  return file;
}

function writeGradient(name, w, h) {
  const file = path.join(fixturesDir, name);
  if (fs.existsSync(file)) return file;
  fs.writeFileSync(
    file,
    PNG.encode(w, h, (x) => [Math.round((x / (w - 1)) * 255), 40, 200, 255]),
  );
  return file;
}

export function fixture(...names) {
  ensureFixtures();
  return names.map((n) => path.join(fixturesDir, n));
}

export async function openApp(page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {}
  });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (/fonts\.googleapis|fonts\.gstatic|unpkg\.com|esm\.run/.test(u)) return route.abort();
    return route.continue();
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__imageEditorTest);
}

export async function snap(page) {
  return page.evaluate(() => window.__imageEditorTest.snapshot());
}

export async function sample(page, x, y) {
  return page.evaluate(({ x, y }) => window.__imageEditorTest.sample(x, y), { x, y });
}

export async function addImages(page, files) {
  // Add one file at a time so onload order matches the given list (parallel FileList races).
  for (let i = 0; i < files.length; i++) {
    const before = await page.evaluate(() => window.__imageEditorTest.snapshot().layers.length);
    await page.setInputFiles("#fileInput", files[i]);
    await page.waitForFunction((n) => window.__imageEditorTest.snapshot().layers.length === n, before + 1);
  }
}

async function pressDock(page, name) {
  const dock = page.locator(`[data-dock="${name}"]`);
  if ((await dock.getAttribute("aria-pressed")) === "true") return dock;
  // Parent .tool-dock uses pointer-events:none; Playwright scroll-into-view can
  // mis-hit overlapping stage/panel chrome, so force the dock button click.
  await dock.click({ force: true });
  await expect(dock).toHaveAttribute("aria-pressed", "true");
  return dock;
}

export async function openAutomation(page) {
  await pressDock(page, "automation");
  await expect(page.locator('[data-tool-panel="automation"]')).toBeVisible();
}

export async function openTransform(page) {
  await pressDock(page, "transform");
}

export async function openFrame(page) {
  await pressDock(page, "frame");
}

export async function openLayout(page) {
  await pressDock(page, "layout");
}

export async function recordOn(page) {
  await openAutomation(page);
  const btn = page.locator("#recordSeries");
  if ((await btn.getAttribute("aria-pressed")) !== "true") await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
}

export async function recordOff(page) {
  await openAutomation(page);
  const btn = page.locator("#recordSeries");
  if ((await btn.getAttribute("aria-pressed")) === "true") await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "false");
}

export async function saveTemplate(page, name) {
  await openAutomation(page);
  page.once("dialog", async (d) => {
    await d.accept(name);
  });
  await page.locator("#saveSeries").click();
  await page.waitForFunction((n) => window.__imageEditorTest.snapshot().templates.some((t) => t.name === n), name);
}

export async function applyTemplate(page, name) {
  await openAutomation(page);
  const select = page.locator("#templateSelect");
  const value = await page.evaluate((n) => {
    const t = window.__imageEditorTest.snapshot().templates.find((x) => x.name === n);
    return t?.id || "";
  }, name);
  await select.selectOption(value);
  await page.locator("#applySeries").click();
  await page.waitForFunction(() => !window.__imageEditorTest.snapshot().applyingSeries);
}

export async function scalePercent(page, value) {
  await openFrame(page);
  await page.locator("#scalePercent").click();
  await page.locator("#scaleValue").fill(String(value));
  await page.locator("#scaleBtn").click();
}

export async function scalePixels(page, value) {
  await openFrame(page);
  await page.locator("#scalePixels").click();
  await page.locator("#scaleValue").fill(String(value));
  await page.locator("#scaleBtn").click();
}

export async function cropLeft(page, amount) {
  await openFrame(page);
  await page.locator("#cropAmount").fill(String(amount));
  await page.locator('[data-crop="left"]').click();
}

export async function placeCell(page, col, row) {
  await openLayout(page);
  const gridBtn = page.locator("#layoutGridBtn");
  if ((await gridBtn.getAttribute("aria-pressed")) !== "true") await gridBtn.click();
  await expect(page.locator("#layoutOverlay")).toBeVisible();
  await page.locator(`#layoutOverlay [data-place-col="${col}"][data-place-row="${row}"]`).click();
}

export async function setCanvasSize(page, w, h) {
  await openFrame(page);
  // Aspect lock mirrors W↔H on input; unlock for independent sizes.
  const lockBtn = page.locator("#lockBtn");
  if ((await lockBtn.getAttribute("title"))?.includes("Unlock")) await lockBtn.click();
  await page.locator("#canvasW").fill(String(w));
  await page.locator("#canvasH").fill(String(h));
  await page.locator("#resizeBtn").click();
  await page.waitForFunction(({ w, h }) => {
    const c = window.__imageEditorTest.snapshot().canvas;
    return c.width === w && c.height === h;
  }, { w, h });
}

export async function selectAll(page) {
  await page.locator("#selectAll").click();
}

export async function selectLayersByIndex(page, indexes) {
  // Click cards to build selection: first click selects one; subsequent add.
  const cards = page.locator("#layers .image-card");
  const count = await cards.count();
  // Clear to single first then adjust via evaluate for reliability
  await page.evaluate((idxs) => {
    const s = window.__imageEditorTest.snapshot();
    const ids = idxs.map((i) => s.layers[i]?.id).filter(Boolean);
    // Drive UI selection by dispatching clicks is flaky; mutate via card clicks:
    return ids;
  }, indexes);
  // Use card clicks: deselect-all pattern then multi-select
  if (count === 0) return;
  await cards.nth(indexes[0]).click();
  for (const i of indexes.slice(1)) {
    const id = await cards.nth(i).getAttribute("data-id");
    const selected = await cards.nth(i).evaluate((el) => el.classList.contains("is-selected"));
    if (!selected) await cards.nth(i).click();
    await expect(cards.nth(i)).toHaveClass(/is-selected/);
    void id;
  }
}

export function nearly(a, b, tol = 1) {
  return Math.abs(a - b) <= tol;
}

export function expectNear(actual, expected, tol = 1) {
  expect(Math.abs(actual - expected), `${actual} ≉ ${expected}`).toBeLessThanOrEqual(tol);
}
