try {
  const savedTheme = localStorage.getItem("image-editor-theme") || "dark";
  const dark = savedTheme === "dark" || (savedTheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch {
  document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function bootEditor() {
  const imagesPanel = document.querySelector("#imagesPanel"),
    imagesPanelToggle = document.querySelector("#toggleImages");
  let imagesCollapsed = false;
  try {
    imagesCollapsed = localStorage.getItem("image-editor-images-collapsed") === "true";
  } catch {}
  function setImagesCollapsed(collapsed) {
    imagesCollapsed = collapsed;
    imagesPanel.classList.toggle("is-collapsed", collapsed);
    const label = `${collapsed ? "Expand" : "Collapse"} images panel`;
    imagesPanelToggle.setAttribute("aria-expanded", String(!collapsed));
    imagesPanelToggle.setAttribute("aria-label", label);
    imagesPanelToggle.title = label;
    try {
      localStorage.setItem("image-editor-images-collapsed", String(collapsed));
    } catch {}
  }
  imagesPanelToggle.addEventListener("click", () => setImagesCollapsed(!imagesCollapsed));
  setImagesCollapsed(imagesCollapsed);
  // Two frames so the restored state paints before transitions are enabled.
  requestAnimationFrame(() => requestAnimationFrame(() => imagesPanel.classList.add("is-animated")));
  (() => {
    const $ = (s) => document.querySelector(s),
      canvas = $("#canvas"),
      ctx = canvas.getContext("2d"),
      stage = $("#stage"),
      overflowCanvas = $("#overflowCanvas"),
      overflowCtx = overflowCanvas.getContext("2d"),
      layersEl = $("#layers"),
      fileInput = $("#fileInput");
    let layers = [],
      selected = new Set(),
      activeId = null,
      lock = true,
      drag = null,
      hand = true,
      idSeed = 0,
      recording = false,
      recordedSteps = [],
      templates = [],
      undoStack = [],
      redoStack = [];
    try {
      templates = JSON.parse(localStorage.getItem("image-editor-templates") || "[]");
      if (!Array.isArray(templates)) templates = [];
    } catch {
      templates = [];
    }
    const themeQuery = matchMedia("(prefers-color-scheme: dark)"),
      themeToggle = document.querySelector(".theme-toggle");
    let themeMode = "dark";
    try {
      themeMode = localStorage.getItem("image-editor-theme") || "dark";
    } catch {}
    if (!["system", "light", "dark"].includes(themeMode)) themeMode = "system";
    themeToggle.innerHTML = '<button class="button icon-only" id="themeModeToggle" type="button" aria-label="Cycle color theme"></button>';
    const themeButton = $("#themeModeToggle"),
      themeIcons = {
        light: '<span class="material-symbols outlined" aria-hidden="true">light_mode</span>',
        system: '<span class="material-symbols outlined" aria-hidden="true">desktop_windows</span>',
        dark: '<span class="material-symbols outlined" aria-hidden="true">dark_mode</span>',
      };
    function applyTheme() {
      const dark = themeMode === "dark" || (themeMode === "system" && themeQuery.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]').content = dark ? "#1a1a1a" : "#eeede9";
      themeButton.innerHTML = themeIcons[themeMode];
      themeButton.title = `Theme: ${themeMode}. Click to switch to ${themeMode === "system" ? "light" : themeMode === "light" ? "dark" : "system"}.`;
      themeButton.setAttribute("aria-label", themeButton.title);
    }
    themeButton.addEventListener("click", () => {
      themeMode = themeMode === "system" ? "light" : themeMode === "light" ? "dark" : "system";
      try {
        localStorage.setItem("image-editor-theme", themeMode);
      } catch {}
      applyTheme();
    });
    if (themeQuery.addEventListener)
      themeQuery.addEventListener("change", () => {
        if (themeMode === "system") applyTheme();
      });
    else
      themeQuery.addListener(() => {
        if (themeMode === "system") applyTheme();
      });
    applyTheme();
    function say(message) {
      const el = $("#status");
      el.textContent = message;
      el.classList.add("is-visible");
      clearTimeout(say.timer);
      say.timer = setTimeout(() => el.classList.remove("is-visible"), 2200);
    }
    function recordStep(step) {
      if (recording) recordedSteps.push(step);
    }
    function captureState() {
      return { width: canvas.width, height: canvas.height, layers: layers.map(({ thumb, ...layer }) => ({ ...layer })), selected: [...selected], activeId };
    }
    function updateHistoryButtons() {
      const undo = $("#undoBtn"),
        redo = $("#redoBtn");
      if (undo) undo.disabled = !undoStack.length;
      if (redo) redo.disabled = !redoStack.length;
    }
    function pushHistory(state = captureState()) {
      undoStack.push(state);
      if (undoStack.length > 60) undoStack.shift();
      redoStack = [];
      updateHistoryButtons();
    }
    function restoreState(state) {
      canvas.width = state.width;
      canvas.height = state.height;
      layers = state.layers.map((layer) => ({ ...layer }));
      selected = new Set(state.selected);
      activeId = state.activeId;
      drawList();
      render();
      updateHistoryButtons();
    }
    $("#undoBtn").onclick = () => {
      if (!undoStack.length) return;
      redoStack.push(captureState());
      restoreState(undoStack.pop());
    };
    $("#redoBtn").onclick = () => {
      if (!redoStack.length) return;
      undoStack.push(captureState());
      restoreState(redoStack.pop());
    };
    updateHistoryButtons();
    function active() {
      return layers.find((x) => x.id === activeId);
    }
    function fitCanvas() {
      const stageEl = $("#stage"),
        inner = stageEl.querySelector(".canvas-frame"),
        cs = getComputedStyle(stageEl);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight),
        padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = stageEl.clientWidth - padX,
        availH = stageEl.clientHeight - padY;
      if (availW < 8 || availH < 8) return;
      const scale = Math.min(1, availW / canvas.width, availH / canvas.height);
      inner.style.width = canvas.width * scale + "px";
      inner.style.height = canvas.height * scale + "px";
      drawOverflow();
    }
    function drawOverflow() {
      const ratio = devicePixelRatio || 1,
        w = Math.round(stage.clientWidth * ratio),
        h = Math.round(stage.clientHeight * ratio);
      if (overflowCanvas.width !== w || overflowCanvas.height !== h) {
        overflowCanvas.width = w;
        overflowCanvas.height = h;
      }
      overflowCtx.setTransform(1, 0, 0, 1, 0, 0);
      overflowCtx.clearRect(0, 0, w, h);
      const stageRect = stage.getBoundingClientRect(),
        rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scale = rect.width / canvas.width;
      overflowCtx.setTransform(ratio * scale, 0, 0, ratio * scale, (rect.left - stageRect.left) * ratio, (rect.top - stageRect.top) * ratio);
      for (const l of layers) {
        if (l.visible === false) continue;
        overflowCtx.globalAlpha = (l.opacity ?? 1) * 0.6;
        overflowCtx.drawImage(l.img, l.sx, l.sy, l.sw, l.sh, l.x, l.y, l.w, l.h);
      }
      overflowCtx.globalAlpha = 1;
      overflowCtx.setTransform(1, 0, 0, 1, 0, 0);
      overflowCtx.globalCompositeOperation = "source-atop";
      overflowCtx.fillStyle = "rgb(0 0 0 / 0.6)";
      overflowCtx.fillRect(0, 0, w, h);
      overflowCtx.globalCompositeOperation = "source-over";
    }
    function render(options = {}) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const l of layers) {
        if (l.sizeEl) l.sizeEl.textContent = `${l.w} × ${l.h} px`;
        if (l.visible === false) continue;
        ctx.save();
        ctx.globalAlpha = l.opacity ?? 1;
        ctx.drawImage(l.img, l.sx, l.sy, l.sw, l.sh, l.x, l.y, l.w, l.h);
        ctx.restore();
      }
      $("#empty").style.display = layers.length ? "none" : "flex";
      $("#count").textContent = layers.length;
      $("#canvasW").value = canvas.width;
      $("#canvasH").value = canvas.height;
      if (canvas.dataset.fitW !== String(canvas.width) || canvas.dataset.fitH !== String(canvas.height)) {
        canvas.dataset.fitW = String(canvas.width);
        canvas.dataset.fitH = String(canvas.height);
        fitCanvas();
      } else drawOverflow();
      if (options.skipThumbs) return;
      for (const l of layers) {
        const c = l.thumb;
        if (c) {
          const b = c.getContext("2d");
          c.width = 112;
          c.height = 68;
          b.clearRect(0, 0, c.width, c.height);
          const ratio = Math.min(108 / l.w, 64 / l.h);
          b.drawImage(l.img, l.sx, l.sy, l.sw, l.sh, (108 - l.w * ratio) / 2, (64 - l.h * ratio) / 2, l.w * ratio, l.h * ratio);
        }
      }
    }
    function drawList() {
      layersEl.innerHTML = "";
      if (!layers.length) {
        layersEl.innerHTML = '<li class="image-list-empty">Pasted and added images will appear here.</li>';
        return;
      }
      for (const l of layers) {
        const card = document.createElement("li");
        const hidden = l.visible === false;
        card.className = "image-card" + (selected.has(l.id) ? " is-selected" : "") + (hidden ? " is-hidden" : "");
        card.innerHTML = `<div class="image-card-thumb"><canvas width="112" height="68"></canvas></div><div class="image-card-info"><p class="image-card-name" title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</p><p class="image-card-size"></p></div><button class="image-card-visibility" type="button" aria-pressed="${hidden ? "false" : "true"}" title="${hidden ? "Show on canvas" : "Hide on canvas"}"><span class="material-symbols outlined" aria-hidden="true">${hidden ? "visibility_off" : "visibility"}</span></button><button class="image-card-remove" type="button" title="Remove image" aria-label="Remove image"><span class="material-symbols outlined" aria-hidden="true">close</span></button>`;
        l.thumb = card.querySelector("canvas");
        l.sizeEl = card.querySelector(".image-card-size");
        l.sizeEl.textContent = `${l.w} × ${l.h} px`;
        card.addEventListener("click", (e) => {
          const touch = matchMedia("(max-width: 700px), (pointer: coarse)").matches;
          if (e.shiftKey || e.metaKey || e.ctrlKey || touch) {
            if (selected.has(l.id)) {
              if (selected.size > 1) selected.delete(l.id);
            } else selected.add(l.id);
            if (!selected.size) selected.add(l.id);
          } else {
            selected.clear();
            selected.add(l.id);
          }
          activeId = l.id;
          drawList();
        });
        card.title = matchMedia("(max-width: 700px), (pointer: coarse)").matches
          ? "Tap to select. Tap a selected image again to remove it."
          : "Shift-click to select more than one image";
        card.querySelector(".image-card-visibility").addEventListener("click", (e) => {
          e.stopPropagation();
          pushHistory();
          l.visible = l.visible === false;
          drawList();
          render();
        });
        card.querySelector(".image-card-remove").addEventListener("click", (e) => {
          e.stopPropagation();
          pushHistory();
          layers = layers.filter((x) => x.id !== l.id);
          selected.delete(l.id);
          if (activeId === l.id) activeId = layers.at(-1)?.id ?? null;
          drawList();
          render();
        });
        layersEl.append(card);
      }
      render();
    }
    function escapeHtml(s) {
      return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }
    function addImage(img, name = "image", skipHistory = false) {
      if (!skipHistory) pushHistory();
      const w = img.naturalWidth,
        h = img.naturalHeight;
      const l = {
        id: ++idSeed,
        img,
        name,
        sx: 0,
        sy: 0,
        sw: img.naturalWidth,
        sh: img.naturalHeight,
        w,
        h,
        x: Math.round((canvas.width - w) / 2),
        y: Math.round((canvas.height - h) / 2),
      };
      layers.push(l);
      selected.clear();
      selected.add(l.id);
      activeId = l.id;
      drawList();
      render();
    }
    function loadFile(file) {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file),
        img = new Image();
      img.onload = () => {
        addImage(img, file.name);
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        say("Could not open that image.");
      };
      img.src = url;
    }
    function open() {
      fileInput.click();
    }
    $("#openBtn").onclick = open;
    $("#emptyOpen").onclick = open;
    fileInput.onchange = () => {
      for (const f of fileInput.files) loadFile(f);
      fileInput.value = "";
    };
    document.addEventListener("paste", (e) => {
      for (const item of e.clipboardData?.items ?? [])
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) loadFile(f);
        }
    });
    stage.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    stage.addEventListener("drop", (e) => {
      e.preventDefault();
      for (const f of e.dataTransfer.files) loadFile(f);
    });
    $("#handBtn").onclick = () => {
      hand = !hand;
      $("#handBtn").setAttribute("aria-pressed", String(hand));
      stage.style.cursor = hand ? "grab" : "default";
    };
    const setIcon = (selector, symbol, title, iconClass = "material-symbols outlined") => {
      const el = $(selector);
      el.innerHTML = `<span class="${iconClass}" aria-hidden="true">${symbol}</span>`;
      el.title = title;
      el.setAttribute("aria-label", title);
    };
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === "h") {
        if (!hand) $("#handBtn").click();
        e.preventDefault();
      } else if (key === "c") {
        $("#cropAmount").focus();
        $("#cropAmount").select();
        e.preventDefault();
      }
    });
    canvas.draggable = false;
    stage.style.cursor = "grab";
    canvas.addEventListener("dragstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    function canvasPoint(e) {
      const rect = canvas.getBoundingClientRect(),
        sx = rect.width ? canvas.width / rect.width : 1,
        sy = rect.height ? canvas.height / rect.height : 1;
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    }
    let dragFrame = 0;
    function endDrag() {
      if (dragFrame) {
        cancelAnimationFrame(dragFrame);
        dragFrame = 0;
      }
      if (!drag) return;
      const l = layers.find((q) => q.id === drag.id);
      if (l && drag.pending) {
        l.x = drag.startLayerX + (drag.pending.x - drag.x);
        l.y = drag.startLayerY + (drag.pending.y - drag.y);
      }
      if (l && (Math.round(l.x) !== Math.round(drag.startLayerX) || Math.round(l.y) !== Math.round(drag.startLayerY))) {
        l.x = Math.round(l.x);
        l.y = Math.round(l.y);
        pushHistory(drag.beforeState);
        recordStep({ type: "move", dx: l.x - drag.startLayerX, dy: l.y - drag.startLayerY });
      }
      drag = null;
      stage.style.cursor = hand ? "grab" : "default";
      render();
    }
    stage.addEventListener(
      "pointerdown",
      (e) => {
        if (!hand) return;
        e.preventDefault();
        const p = canvasPoint(e);
        const hit = [...layers].reverse().find((l) => l.visible !== false && p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h);
        if (!hit) return;
        if (!selected.has(hit.id)) {
          selected.clear();
          selected.add(hit.id);
          activeId = hit.id;
          drawList();
        }
        drag = { id: hit.id, x: p.x, y: p.y, startLayerX: hit.x, startLayerY: hit.y, beforeState: captureState(), pointerId: e.pointerId };
        try {
          stage.setPointerCapture(e.pointerId);
        } catch {}
        stage.style.cursor = "grabbing";
      },
      { passive: false },
    );
    stage.addEventListener(
      "pointermove",
      (e) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        e.preventDefault();
        drag.pending = canvasPoint(e);
        if (dragFrame) return;
        dragFrame = requestAnimationFrame(() => {
          dragFrame = 0;
          if (!drag?.pending) return;
          const l = layers.find((q) => q.id === drag.id);
          if (!l) return;
          l.x = drag.startLayerX + (drag.pending.x - drag.x);
          l.y = drag.startLayerY + (drag.pending.y - drag.y);
          render({ skipThumbs: true });
        });
      },
      { passive: false },
    );
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    document.querySelectorAll("[data-crop]").forEach(
      (b) =>
        (b.onclick = () => {
          const l = active(),
            d = b.dataset.crop,
            x = Math.max(0, +$("#cropAmount").value || 0),
            y = x;
          if (!l) {
            say("Choose an image first.");
            return;
          }
          if (x) pushHistory();
          if (d === "left") {
            const cut = Math.min(x, l.w - 1),
              src = (cut * l.sw) / l.w;
            l.sx += src;
            l.sw -= src;
            l.x += cut;
            l.w -= cut;
          }
          if (d === "right") {
            const cut = Math.min(x, l.w - 1);
            l.sw -= (cut * l.sw) / l.w;
            l.w -= cut;
          }
          if (d === "top") {
            const cut = Math.min(y, l.h - 1),
              src = (cut * l.sh) / l.h;
            l.sy += src;
            l.sh -= src;
            l.y += cut;
            l.h -= cut;
          }
          if (d === "bottom") {
            const cut = Math.min(y, l.h - 1);
            l.sh -= (cut * l.sh) / l.h;
            l.h -= cut;
          }
          recordStep({ type: "crop", edge: d, amount: x });
          render();
        }),
    );
    $("#scaleBtn").onclick = () => {
      const v = Math.max(1, +$("#scaleValue").value || 100),
        l = active(),
        unit = $("#scaleUnit").value;
      if (!l) {
        say("Choose an image first.");
        return;
      }
      pushHistory();
      const factor = unit === "percent" ? v / 100 : v / l.w;
      const cx = l.x + l.w / 2,
        cy = l.y + l.h / 2;
      l.w = Math.max(1, Math.round(l.w * factor));
      l.h = Math.max(1, Math.round(l.h * factor));
      l.x = Math.round(cx - l.w / 2);
      l.y = Math.round(cy - l.h / 2);
      recordStep({ type: "scale", value: v, unit });
      render();
    };
    function setLock(value) {
      lock = value;
      setIcon("#lockBtn", lock ? "lock" : "lock_open_right", lock ? "Unlock aspect ratio" : "Lock aspect ratio");
    }
    $("#lockBtn").onclick = () => setLock(!lock);
    let resize = null,
      resizeFrame = 0;
    function applyResize() {
      resizeFrame = 0;
      if (!resize?.pending) return;
      const { corner, pending } = resize,
        west = corner.includes("w"),
        north = corner.includes("n"),
        dx = ((pending.x - resize.x) / resize.scale) * 2 * (west ? -1 : 1),
        dy = ((pending.y - resize.y) / resize.scale) * 2 * (north ? -1 : 1),
        w = Math.max(1, Math.round(resize.w + dx)),
        h = Math.max(1, Math.round(resize.h + dy));
      if (w === canvas.width && h === canvas.height) return;
      for (const [l, x, y] of resize.positions) {
        l.x = west ? x + (w - resize.w) : x;
        l.y = north ? y + (h - resize.h) : y;
      }
      canvas.width = w;
      canvas.height = h;
      render({ skipThumbs: true });
    }
    function endResize() {
      if (!resize) return;
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      applyResize();
      if (canvas.width !== resize.w || canvas.height !== resize.h) pushHistory(resize.beforeState);
      resize = null;
      render();
    }
    document.querySelectorAll(".resize-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        resize = {
          corner: handle.dataset.corner,
          x: e.clientX,
          y: e.clientY,
          w: canvas.width,
          h: canvas.height,
          scale: rect.width / canvas.width || 1,
          positions: layers.map((l) => [l, l.x, l.y]),
          beforeState: captureState(),
        };
        setLock(false);
        try {
          handle.setPointerCapture(e.pointerId);
        } catch {}
      });
      handle.addEventListener("pointermove", (e) => {
        if (!resize) return;
        e.preventDefault();
        resize.pending = { x: e.clientX, y: e.clientY };
        if (!resizeFrame) resizeFrame = requestAnimationFrame(applyResize);
      });
      handle.addEventListener("pointerup", endResize);
      handle.addEventListener("pointercancel", endResize);
    });
    $("#canvasW").oninput = () => {
      if (lock) $("#canvasH").value = $("#canvasW").value;
    };
    $("#canvasH").oninput = () => {
      if (lock) $("#canvasW").value = $("#canvasH").value;
    };
    $("#resizeBtn").onclick = () => {
      const w = Math.max(1, +$("#canvasW").value || 1),
        h = Math.max(1, +$("#canvasH").value || 1);
      pushHistory();
      canvas.width = w;
      canvas.height = h;
      render();
    };
    $("#fitImageBtn").onclick = () => {
      const chosen = layers.filter((l) => selected.has(l.id)),
        visible = layers.filter((l) => l.visible !== false),
        use = chosen.length ? chosen : visible.length ? visible : layers;
      if (!use.length) {
        say("Add an image first.");
        return;
      }
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const l of use) {
        minX = Math.min(minX, l.x);
        minY = Math.min(minY, l.y);
        maxX = Math.max(maxX, l.x + l.w);
        maxY = Math.max(maxY, l.y + l.h);
      }
      const dx = Math.round(minX),
        dy = Math.round(minY);
      pushHistory();
      for (const l of layers) {
        l.x -= dx;
        l.y -= dy;
      }
      canvas.width = Math.max(1, Math.round(maxX - minX));
      canvas.height = Math.max(1, Math.round(maxY - minY));
      render();
    };
    document.querySelectorAll("[data-align]").forEach(
      (b) =>
        (b.onclick = () => {
          const l = active();
          if (!l) return;
          pushHistory();
          const d = b.dataset.align;
          if (d === "center" || d === "horizontal") l.x = Math.round((canvas.width - l.w) / 2);
          if (d === "center" || d === "vertical") l.y = Math.round((canvas.height - l.h) / 2);
          recordStep({ type: "align", mode: d });
          render();
        }),
    );
    document.querySelectorAll("[data-edge]").forEach(
      (b) =>
        (b.onclick = () => {
          const l = active();
          if (!l) return;
          pushHistory();
          const d = b.dataset.edge;
          if (d === "left") l.x = 0;
          if (d === "right") l.x = canvas.width - l.w;
          if (d === "top") l.y = 0;
          if (d === "bottom") l.y = canvas.height - l.h;
          recordStep({ type: "edge", edge: d });
          render();
        }),
    );
    function merge(direction) {
      const group = layers.filter((l) => selected.has(l.id));
      if (group.length < 2) {
        say(
          matchMedia("(max-width: 700px), (pointer: coarse)").matches
            ? "Tap each image to select it. Tap a selected image again to remove it."
            : "Select at least two images to merge (Shift-click images).",
        );
        return;
      }
      const vertical = direction === "v",
        width = vertical ? Math.max(...group.map((l) => l.w)) : group.reduce((a, l) => a + l.w, 0),
        height = vertical ? group.reduce((a, l) => a + l.h, 0) : Math.max(...group.map((l) => l.h));
      const out = document.createElement("canvas");
      out.width = width;
      out.height = height;
      const c = out.getContext("2d");
      let offset = 0;
      for (const l of group) {
        if (vertical) {
          c.drawImage(l.img, l.sx, l.sy, l.sw, l.sh, Math.round((width - l.w) / 2), offset, l.w, l.h);
          offset += l.h;
        } else {
          c.drawImage(l.img, l.sx, l.sy, l.sw, l.sh, offset, Math.round((height - l.h) / 2), l.w, l.h);
          offset += l.w;
        }
      }
      const img = new Image();
      img.onload = () => {
        pushHistory();
        layers = layers.filter((l) => !selected.has(l.id));
        addImage(img, `Merged ${group.length} images`, true);
        say(`Merged ${group.length} images.`);
      };
      img.src = out.toDataURL("image/png");
    }
    $("#mergeH").onclick = () => merge("h");
    $("#mergeV").onclick = () => merge("v");
    $("#selectAll").onclick = () => {
      selected = new Set(layers.map((l) => l.id));
      drawList();
    };
    function refreshTemplates() {
      const select = $("#templateSelect"),
        previous = select.value;
      select.innerHTML = "";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = templates.length ? "Choose template" : "No saved templates";
      select.append(empty);
      for (const item of templates) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.name} (${item.steps.length})`;
        select.append(option);
      }
      if (templates.some((t) => t.id === previous)) select.value = previous;
      $("#applySeries").disabled = !select.value;
      $("#deleteTemplate").disabled = !select.value;
    }
    function storeTemplates() {
      try {
        localStorage.setItem("image-editor-templates", JSON.stringify(templates));
      } catch {
        say("Could not save templates in this browser.");
      }
      refreshTemplates();
    }
    function applyStepToLayer(layer, step) {
      if (step.type === "crop") {
        const x = Math.max(0, step.amount || 0),
          edge = step.edge;
        if (edge === "left") {
          const cut = Math.min(x, layer.w - 1),
            source = (cut * layer.sw) / layer.w;
          layer.sx += source;
          layer.sw -= source;
          layer.x += cut;
          layer.w -= cut;
        } else if (edge === "right") {
          const cut = Math.min(x, layer.w - 1);
          layer.sw -= (cut * layer.sw) / layer.w;
          layer.w -= cut;
        } else if (edge === "top") {
          const cut = Math.min(x, layer.h - 1),
            source = (cut * layer.sh) / layer.h;
          layer.sy += source;
          layer.sh -= source;
          layer.y += cut;
          layer.h -= cut;
        } else if (edge === "bottom") {
          const cut = Math.min(x, layer.h - 1);
          layer.sh -= (cut * layer.sh) / layer.h;
          layer.h -= cut;
        }
      } else if (step.type === "scale") {
        const factor = step.unit === "percent" ? step.value / 100 : step.value / layer.w,
          cx = layer.x + layer.w / 2,
          cy = layer.y + layer.h / 2;
        layer.w = Math.max(1, Math.round(layer.w * factor));
        layer.h = Math.max(1, Math.round(layer.h * factor));
        layer.x = Math.round(cx - layer.w / 2);
        layer.y = Math.round(cy - layer.h / 2);
      } else if (step.type === "align") {
        if (step.mode === "center" || step.mode === "horizontal") layer.x = Math.round((canvas.width - layer.w) / 2);
        if (step.mode === "center" || step.mode === "vertical") layer.y = Math.round((canvas.height - layer.h) / 2);
      } else if (step.type === "edge") {
        if (step.edge === "left") layer.x = 0;
        if (step.edge === "right") layer.x = canvas.width - layer.w;
        if (step.edge === "top") layer.y = 0;
        if (step.edge === "bottom") layer.y = canvas.height - layer.h;
      } else if (step.type === "move") {
        layer.x += step.dx;
        layer.y += step.dy;
      }
    }
    $("#recordSeries").onclick = () => {
      recording = !recording;
      if (recording) {
        recordedSteps = [];
        $("#recordSeries").classList.add("is-recording");
        $("#recordSeries").setAttribute("aria-pressed", "true");
        setIcon("#recordSeries", "stop", "Stop recording transformation series", "material-symbols filled");
        say("Recording transformations.");
      } else {
        $("#recordSeries").classList.remove("is-recording");
        $("#recordSeries").setAttribute("aria-pressed", "false");
        setIcon("#recordSeries", "radio_button_checked", "Start recording a transformation series");
        say(`Stopped recording: ${recordedSteps.length} step${recordedSteps.length === 1 ? "" : "s"}.`);
      }
    };
    $("#saveSeries").onclick = () => {
      if (recording) {
        say("Stop recording before saving the series.");
        return;
      }
      if (!recordedSteps.length) {
        say("Record at least one transformation first.");
        return;
      }
      const name = prompt("Name this transformation template:");
      if (!name?.trim()) return;
      templates.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), steps: recordedSteps.map((step) => ({ ...step })) });
      storeTemplates();
      $("#templateSelect").value = templates.at(-1).id;
      refreshTemplates();
      say("Transformation template saved.");
    };
    $("#templateSelect").onchange = refreshTemplates;
    $("#applySeries").onclick = () => {
      const template = templates.find((t) => t.id === $("#templateSelect").value);
      if (!template) return;
      let targets = layers.filter((layer) => selected.has(layer.id));
      if (!targets.length && active()) targets = [active()];
      if (!targets.length) {
        say("Select one or more images first.");
        return;
      }
      pushHistory();
      for (const layer of targets) for (const step of template.steps) applyStepToLayer(layer, step);
      render();
      say(`Applied “${template.name}” to ${targets.length} image${targets.length === 1 ? "" : "s"}.`);
    };
    $("#deleteTemplate").onclick = () => {
      const id = $("#templateSelect").value;
      if (!id) return;
      const template = templates.find((t) => t.id === id);
      templates = templates.filter((t) => t.id !== id);
      storeTemplates();
      say(`Deleted “${template?.name || "template"}”.`);
    };
    refreshTemplates();
    async function blob() {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const exportCtx = exportCanvas.getContext("2d");
      exportCtx.fillStyle = "#fff";
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      exportCtx.drawImage(canvas, 0, 0);
      return new Promise((resolve) => exportCanvas.toBlob(resolve, "image/png"));
    }
    $("#copyBtn").onclick = async () => {
      if (!layers.length) {
        say("Add an image first.");
        return;
      }
      const b = await blob();
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
        say("Image copied to clipboard.");
      } catch {
        say("Clipboard access was blocked. Try downloading the PNG.");
      }
    };
    $("#downloadBtn").onclick = async () => {
      const b = await blob();
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "image-editor.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    let listDrag = null,
      suppressListClick = false;
    layersEl.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch" || e.button !== 0 || e.target.closest("button")) return;
      listDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: layersEl.scrollLeft, top: layersEl.scrollTop, moved: false };
    });
    layersEl.addEventListener("pointermove", (e) => {
      if (!listDrag || e.pointerId !== listDrag.id) return;
      const dx = e.clientX - listDrag.x,
        dy = e.clientY - listDrag.y;
      if (!listDrag.moved) {
        if (Math.hypot(dx, dy) < 5) return;
        listDrag.moved = true;
        layersEl.setPointerCapture(e.pointerId);
        layersEl.classList.add("is-dragging");
      }
      layersEl.scrollLeft = listDrag.left - dx;
      layersEl.scrollTop = listDrag.top - dy;
    });
    const endListDrag = (e) => {
      if (!listDrag || e.pointerId !== listDrag.id) return;
      if (listDrag.moved) {
        suppressListClick = true;
        setTimeout(() => (suppressListClick = false));
      }
      layersEl.classList.remove("is-dragging");
      listDrag = null;
    };
    layersEl.addEventListener("pointerup", endListDrag);
    layersEl.addEventListener("pointercancel", endListDrag);
    layersEl.addEventListener(
      "click",
      (e) => {
        if (!suppressListClick) return;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
    new ResizeObserver(fitCanvas).observe($("#stage"));
    render();
  })();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootEditor);
else bootEditor();
