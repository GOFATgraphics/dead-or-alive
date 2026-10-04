// The stamp editor: screenshot, marker circles and scribbles, the stamp, and the sentence strip.
// Marks can be selected, moved, resized, deleted, undone. The stamp can be dragged.

const COLORS = { DEAD: "#d92d33", COPE: "#c26a05", ALIVE: "#138a43" };
const PAPER = "#ffffff";
const INK = "#12132a";
const W = 1200;
const HANDLE = 12;
const FONT = '"IBM Plex Mono", ui-monospace, monospace';
const SANS = '"Plus Jakarta Sans", system-ui, sans-serif';

export function createEditor(canvas, { verdict, sentence, onChange = () => {} }) {
  const ctx = canvas.getContext("2d");
  let image = null;
  let tool = "circle"; // "circle" | "pen"
  let size = 6;
  let marks = []; // { type: "ellipse", x, y, w, h, seed, size } | { type: "pen", points: [[x, y]], size }
  let stamp = null; // { x, y } centre, null = default corner
  let selected = -1; // index into marks, or "stamp"
  let past = [];
  let future = [];
  let drag = null;
  let clean = false; // true while rendering for export

  const snapshot = () => JSON.stringify({ marks, stamp });
  function restore(s) {
    const o = JSON.parse(s);
    marks = o.marks;
    stamp = o.stamp;
    selected = -1;
  }
  function commit(before) {
    if (before === snapshot()) return;
    past.push(before);
    if (past.length > 100) past.shift();
    future = [];
    onChange();
  }

  // Layout: the screenshot scaled to width W, then a strip with the sentence.
  function layout() {
    const shotH = Math.round(image.naturalHeight * (W / image.naturalWidth));
    const pad = 32;
    const font = 26;
    ctx.font = `500 ${font}px ${SANS}`;
    const lines = wrap(sentence().trim(), W - pad * 2);
    return { shotH, pad, font, lines, h: shotH + pad * 2 + lines.length * font * 1.5 };
  }

  function wrap(text, max) {
    const lines = [];
    let line = "";
    for (const w of text.split(/\s+/).filter(Boolean)) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > max && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  const markColor = () => (verdict() === "ALIVE" ? COLORS.ALIVE : COLORS.DEAD);

  // A marker circle: a little wobbly, overshoots where the pen started.
  function ellipsePath(m) {
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    const rx = Math.max(Math.abs(m.w) / 2, 2), ry = Math.max(Math.abs(m.h) / 2, 2);
    const start = -2.2 + (m.seed % 1) * 0.6;
    const turn = Math.PI * 2 * 1.07;
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const t = start + (turn * i) / 90;
      const k = 1 + 0.035 * Math.sin(3 * t + m.seed * 7) + 0.04 * (i / 90);
      const x = cx + rx * k * Math.cos(t), y = cy + ry * k * Math.sin(t);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
  }

  function penPath(m) {
    const p = m.points;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
      ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my);
    }
    const last = p[p.length - 1];
    ctx.lineTo(last[0], last[1]);
  }

  function bounds(m) {
    if (m.type === "ellipse") {
      const x = Math.min(m.x, m.x + m.w), y = Math.min(m.y, m.y + m.h);
      return { x, y, w: Math.abs(m.w), h: Math.abs(m.h) };
    }
    const xs = m.points.map((p) => p[0]), ys = m.points.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  function stampBox(L) {
    const v = verdict();
    const fontSize = 44;
    ctx.font = `500 ${fontSize}px ${FONT}`;
    const spacing = fontSize * 0.14;
    const textW = [...v].reduce((a, ch) => a + ctx.measureText(ch).width, 0) + spacing * (v.length - 1);
    const w = textW + fontSize * 0.9, h = fontSize * 1.5;
    const c = stamp || { x: W - w / 2 - 36, y: L.shotH - h / 2 - 36 };
    return { v, fontSize, spacing, textW, w, h, x: c.x, y: c.y };
  }

  function drawStamp(L) {
    const s = stampBox(L);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    ctx.strokeStyle = ctx.fillStyle = COLORS[s.v];
    ctx.lineWidth = 8;
    ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
    ctx.font = `500 ${s.fontSize}px ${FONT}`;
    ctx.textBaseline = "middle";
    let cx = -s.textW / 2;
    for (const ch of s.v) {
      ctx.fillText(ch, cx, 2);
      cx += ctx.measureText(ch).width + s.spacing;
    }
    ctx.restore();
  }

  function selection(box, handles) {
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.strokeRect(box.x - 8, box.y - 8, box.w + 16, box.h + 16);
    ctx.setLineDash([]);
    if (handles)
      for (const [hx, hy] of corners(box)) {
        ctx.fillStyle = PAPER;
        ctx.fillRect(hx - HANDLE, hy - HANDLE, HANDLE * 2, HANDLE * 2);
        ctx.strokeRect(hx - HANDLE, hy - HANDLE, HANDLE * 2, HANDLE * 2);
      }
    ctx.restore();
  }

  const corners = (b) => [
    [b.x - 8, b.y - 8],
    [b.x + b.w + 8, b.y - 8],
    [b.x - 8, b.y + b.h + 8],
    [b.x + b.w + 8, b.y + b.h + 8],
  ];

  function draw() {
    if (!image) return;
    const L = layout();
    canvas.width = W;
    canvas.height = L.h;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, L.h);
    ctx.drawImage(image, 0, 0, W, L.shotH);

    ctx.save();
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = markColor();
    for (const m of marks) {
      ctx.lineWidth = m.size;
      m.type === "ellipse" ? ellipsePath(m) : penPath(m);
      ctx.stroke();
    }
    ctx.restore();

    drawStamp(L);

    ctx.fillStyle = "#e6e3f1";
    ctx.fillRect(0, L.shotH, W, 2);
    ctx.fillStyle = INK;
    ctx.font = `500 ${L.font}px ${SANS}`;
    ctx.textBaseline = "top";
    L.lines.forEach((line, i) => ctx.fillText(line, L.pad, L.shotH + L.pad + i * L.font * 1.5));

    if (clean) return;
    if (selected === "stamp") {
      const s = stampBox(L);
      selection({ x: s.x - s.w / 2 - 6, y: s.y - s.h / 2 - 12, w: s.w + 12, h: s.h + 24 }, false);
    } else if (marks[selected]) selection(bounds(marks[selected]), marks[selected].type === "ellipse");
  }

  // Hit testing, topmost first: handles of the selected circle, the stamp, then marks.
  function hit(p) {
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const tol = 10 * scale;
    const m = marks[selected];
    if (m && m.type === "ellipse") {
      const i = corners(bounds(m)).findIndex(([hx, hy]) => Math.abs(p.x - hx) <= HANDLE + tol / 2 && Math.abs(p.y - hy) <= HANDLE + tol / 2);
      if (i >= 0) return { kind: "handle", corner: i };
    }
    const s = stampBox(layout());
    if (Math.abs(p.x - s.x) <= s.w / 2 + 6 && Math.abs(p.y - s.y) <= s.h / 2 + 12) return { kind: "stamp" };
    for (let i = marks.length - 1; i >= 0; i--) {
      const k = marks[i];
      const band = Math.max(k.size, 6) + tol * 1.5;
      if (k.type === "ellipse") {
        const b = bounds(k);
        const rx = b.w / 2, ry = b.h / 2;
        if (rx < 1 || ry < 1) continue;
        const d = Math.hypot((p.x - b.x - rx) / rx, (p.y - b.y - ry) / ry);
        if (Math.abs(d - 1) * Math.min(rx, ry) <= band) return { kind: "mark", index: i };
      } else if (k.points.some(([x, y]) => Math.hypot(p.x - x, p.y - y) <= band)) return { kind: "mark", index: i };
    }
    return null;
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!image) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    const p = point(e);
    const before = snapshot();
    const h = hit(p);
    if (h && h.kind === "handle") {
      const b = bounds(marks[selected]);
      const [ox, oy] = [h.corner % 2 ? b.x : b.x + b.w, h.corner < 2 ? b.y + b.h : b.y];
      drag = { mode: "resize", before, ox, oy };
    } else if (h && h.kind === "stamp") {
      const s = stampBox(layout());
      selected = "stamp";
      drag = { mode: "stamp", before, dx: p.x - s.x, dy: p.y - s.y };
    } else if (h && h.kind === "mark") {
      selected = h.index;
      drag = { mode: "move", before, last: p };
    } else if (tool === "pen") {
      marks.push({ type: "pen", points: [[p.x, p.y]], size });
      selected = marks.length - 1;
      drag = { mode: "pen", before };
    } else {
      marks.push({ type: "ellipse", x: p.x, y: p.y, w: 0, h: 0, seed: Math.random() * 10, size });
      selected = marks.length - 1;
      drag = { mode: "ellipse", before, ox: p.x, oy: p.y };
    }
    draw();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!image) return;
    const p = point(e);
    if (!drag) {
      const h = hit(p);
      canvas.style.cursor = !h ? "crosshair" : h.kind === "handle" ? (h.corner === 0 || h.corner === 3 ? "nwse-resize" : "nesw-resize") : "move";
      return;
    }
    const m = marks[selected];
    if (drag.mode === "ellipse" || drag.mode === "resize") {
      m.x = drag.ox;
      m.y = drag.oy;
      m.w = p.x - drag.ox;
      m.h = p.y - drag.oy;
    } else if (drag.mode === "pen") {
      const last = m.points[m.points.length - 1];
      if (Math.hypot(p.x - last[0], p.y - last[1]) > 3) m.points.push([p.x, p.y]);
    } else if (drag.mode === "move") {
      const dx = p.x - drag.last.x, dy = p.y - drag.last.y;
      if (m.type === "ellipse") {
        m.x += dx;
        m.y += dy;
      } else m.points = m.points.map(([x, y]) => [x + dx, y + dy]);
      drag.last = p;
    } else if (drag.mode === "stamp") {
      stamp = { x: p.x - drag.dx, y: p.y - drag.dy };
    }
    draw();
  });

  function endDrag() {
    if (!drag) return;
    const m = marks[selected];
    // A click without a drag makes no mark.
    if (drag.mode === "ellipse" && Math.abs(m.w) < 8 && Math.abs(m.h) < 8) {
      marks.pop();
      selected = -1;
    } else if (drag.mode === "pen" && m.points.length < 2) {
      marks.pop();
      selected = -1;
    } else if (m && m.type === "ellipse") {
      const b = bounds(m);
      Object.assign(m, b);
    }
    commit(drag.before);
    drag = null;
    draw();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if ((e.key === "Delete" || e.key === "Backspace") && selected !== -1) {
      e.preventDefault();
      api.remove();
    } else if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? api.redo() : api.undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      api.redo();
    } else if (e.key === "Escape") {
      selected = -1;
      draw();
    }
  });

  const api = {
    get hasImage() {
      return !!image;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get hasSelection() {
      return selected !== -1;
    },
    setImage(img) {
      image = img;
      marks = [];
      stamp = null;
      selected = -1;
      past = [];
      future = [];
      draw();
      onChange();
    },
    // Circles from the AI draft. Boxes are in thousandths of the screenshot.
    // They are the starting point, not an edit, so history stays empty.
    setBoxes(boxes) {
      if (!image) return;
      const shotH = layout().shotH;
      marks = boxes
        .filter((b) => b.w > 0 && b.h > 0)
        .map((b, i) => ({
          type: "ellipse",
          x: (b.x / 1000) * W - 12,
          y: (b.y / 1000) * shotH - 10,
          w: (b.w / 1000) * W + 24,
          h: (b.h / 1000) * shotH + 20,
          seed: 0.37 + i * 0.29,
          size,
        }));
      draw();
      onChange();
    },
    reset() {
      image = null;
      marks = [];
      stamp = null;
      selected = -1;
      past = [];
      future = [];
      onChange();
    },
    setTool(t) {
      tool = t;
    },
    setSize(s) {
      size = s;
      if (typeof selected === "number" && marks[selected]) {
        const before = snapshot();
        marks[selected].size = s;
        commit(before);
      }
      draw();
    },
    undo() {
      if (!past.length) return;
      future.push(snapshot());
      restore(past.pop());
      draw();
      onChange();
    },
    redo() {
      if (!future.length) return;
      past.push(snapshot());
      restore(future.pop());
      draw();
      onChange();
    },
    remove() {
      const before = snapshot();
      if (selected === "stamp") stamp = null;
      else if (marks[selected]) marks.splice(selected, 1);
      selected = -1;
      commit(before);
      draw();
    },
    clear() {
      const before = snapshot();
      marks = [];
      stamp = null;
      selected = -1;
      commit(before);
      draw();
    },
    draw,
    // Runs fn with a clean render (no selection boxes), then restores the editing view.
    exportWith(fn) {
      clean = true;
      draw();
      try {
        return fn(canvas);
      } finally {
        clean = false;
        draw();
      }
    },
  };
  return api;
}
