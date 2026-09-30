(() => {
  const $ = (id) => document.getElementById(id);
  const COLORS = { DEAD: "#9d1c1c", COPE: "#8a5a00", ALIVE: "#1d6b3a" };
  const SENTENCES = {
    DEAD: "A stranger cannot tell what is being sold before they scroll.",
    COPE: "A stranger cannot tell who this is for before they scroll.",
    ALIVE: "A stranger can name the product, the buyer, and the reason to pay before they scroll.",
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };
  const session = {
    get() { try { return sessionStorage.getItem("doa.key") || ""; } catch (_) { return ""; } },
    set(v) { try { v ? sessionStorage.setItem("doa.key", v) : sessionStorage.removeItem("doa.key"); } catch (_) {} },
  };

  let key = session.get();
  let orders = [];
  let view = "open";
  let current = null;
  let image = null;
  let ring = null;
  let done = store.get("doa.done", {});

  $("queue").textContent = window.DESK && window.DESK.queueOpen
    ? "Queue is open. To close it, set queueOpen to false in desk.js and deploy."
    : "Queue is closed. To open it, set queueOpen to true in desk.js and deploy.";

  // Unlock

  const unlock = $("unlock");
  unlock.addEventListener("submit", (e) => {
    e.preventDefault();
    key = String(new FormData(unlock).get("key") || "");
    load();
  });
  $("lock").addEventListener("click", () => {
    key = "";
    session.set("");
    orders = [];
    $("board").hidden = true;
    $("composer").hidden = true;
    unlock.hidden = false;
  });
  $("refresh").addEventListener("click", load);

  async function load() {
    const alert = unlock.querySelector("[role=alert]");
    alert.hidden = true;
    let data;
    try {
      const r = await fetch("/api/orders", { headers: { "x-admin-key": key }, cache: "no-store" });
      data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Error ${r.status}.`);
    } catch (err) {
      if ($("board").hidden) {
        alert.hidden = false;
        alert.textContent = err.message || "Could not load orders.";
      } else {
        showBoardError(err.message || "Could not load orders.");
      }
      if (/key/i.test(String(err.message))) session.set("");
      return;
    }
    session.set(key);
    orders = data.orders || [];
    unlock.hidden = true;
    $("board").hidden = false;
    $("board-alert").hidden = true;
    render();
  }

  function showBoardError(message) {
    $("board-alert").hidden = false;
    $("board-alert").textContent = message;
  }

  // Order list

  document.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      view = b.dataset.view;
      document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      render();
    })
  );

  function render() {
    const list = $("orders");
    const shown = orders.filter((o) =>
      view === "all" ? true : view === "done" ? done[o.id] : !done[o.id] && o.status !== "refunded"
    );
    list.replaceChildren();
    if (!shown.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = view === "open" ? "Desk is clear." : "Nothing here.";
      list.append(li);
      return;
    }
    for (const o of shown) {
      const li = document.createElement("li");
      li.className = "order" + (current && current.id === o.id ? " on" : "");
      const when = o.createdAt ? new Date(o.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
      const stamp = done[o.id] ? `<span class="word ${done[o.id].toLowerCase()}">${done[o.id]}</span>` : "";
      li.innerHTML = `
        <div class="meta"><span></span><span></span>${stamp}</div>
        <a class="page" target="_blank" rel="noopener noreferrer"></a>
        <div class="who"><span></span><button type="button" class="link">Stamp</button></div>`;
      const [whenEl, productEl] = li.querySelectorAll(".meta span");
      whenEl.textContent = when;
      productEl.textContent = [o.product, o.status && o.status !== "paid" ? o.status : ""].filter(Boolean).join(" · ");
      const a = li.querySelector(".page");
      a.textContent = o.pageUrl || "(no page URL)";
      if (/^https?:\/\//i.test(o.pageUrl)) a.href = o.pageUrl;
      li.querySelector(".who span").textContent = o.email || "(no email)";
      li.querySelector(".who button").addEventListener("click", () => open(o));
      list.append(li);
    }
  }

  // Composer

  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const sentence = $("sentence");

  function verdict() {
    return document.querySelector("input[name=verdict]:checked").value;
  }

  function open(o) {
    current = o;
    image = null;
    ring = null;
    canvas.hidden = true;
    $("drop").hidden = false;
    $("c-target").textContent = "— " + (o.pageUrl || o.email || o.id);
    const v = done[o.id] || "DEAD";
    document.querySelector(`input[name=verdict][value=${v}]`).checked = true;
    sentence.value = SENTENCES[v];
    $("composer").hidden = false;
    render();
    $("composer").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.querySelectorAll("input[name=verdict]").forEach((r) =>
    r.addEventListener("change", () => {
      if (Object.values(SENTENCES).includes(sentence.value.trim()) || !sentence.value.trim()) sentence.value = SENTENCES[verdict()];
      draw();
    })
  );
  sentence.addEventListener("input", draw);

  $("file").addEventListener("change", (e) => e.target.files[0] && loadImage(e.target.files[0]));
  const drop = $("drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
    if (f) loadImage(f);
  });
  document.addEventListener("paste", (e) => {
    if ($("composer").hidden) return;
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((x) => x.type.startsWith("image/"));
    if (item) { e.preventDefault(); loadImage(item.getAsFile()); }
  });

  function loadImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      image = img;
      ring = null;
      try { await Promise.all([document.fonts.load('500 20px "IBM Plex Mono"'), document.fonts.load('20px "IBM Plex Mono"')]); } catch (_) {}
      drop.hidden = true;
      canvas.hidden = false;
      draw();
    };
    img.src = url;
  }

  // Layout: the screenshot scaled to width W, then a strip with the sentence.
  const W = 1200;
  function layout() {
    const s = W / image.naturalWidth;
    const shotH = Math.round(image.naturalHeight * s);
    const pad = 32;
    const font = 26;
    ctx.font = `${font}px "IBM Plex Mono", ui-monospace, monospace`;
    const lines = wrap(sentence.value.trim(), W - pad * 2);
    const stripH = pad * 2 + lines.length * font * 1.5;
    return { shotH, pad, font, lines, stripH, h: shotH + stripH };
  }

  function wrap(text, max) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function draw() {
    if (!image) return;
    const L = layout();
    canvas.width = W;
    canvas.height = L.h;
    const v = verdict();
    const color = COLORS[v];

    ctx.fillStyle = "#f3efe6";
    ctx.fillRect(0, 0, W, L.h);
    ctx.drawImage(image, 0, 0, W, L.shotH);

    if (ring) {
      const x = Math.min(ring.x0, ring.x1), y = Math.min(ring.y0, ring.y1);
      const w = Math.abs(ring.x1 - ring.x0), h = Math.abs(ring.y1 - ring.y0);
      ctx.strokeStyle = v === "ALIVE" ? COLORS.ALIVE : COLORS.DEAD;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 1), Math.max(h / 2, 1), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Stamp, bottom right of the screenshot, tilted like the specimens.
    const size = 44;
    ctx.save();
    ctx.font = `500 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
    const spacing = size * 0.14;
    const textW = [...v].reduce((a, ch) => a + ctx.measureText(ch).width, 0) + spacing * (v.length - 1);
    const bw = textW + size * 0.9, bh = size * 1.5;
    ctx.translate(W - bw / 2 - 36, L.shotH - bh / 2 - 36);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.fillStyle = "rgba(243, 239, 230, 0.85)";
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = 8;
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.textBaseline = "middle";
    let cx = -textW / 2;
    for (const ch of v) { ctx.fillText(ch, cx, 2); cx += ctx.measureText(ch).width + spacing; }
    ctx.restore();

    // Sentence strip.
    ctx.fillStyle = "#d9d2c5";
    ctx.fillRect(0, L.shotH, W, 2);
    ctx.fillStyle = "#1a1814";
    ctx.font = `${L.font}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textBaseline = "top";
    L.lines.forEach((line, i) => ctx.fillText(line, L.pad, L.shotH + L.pad + i * L.font * 1.5));
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  }
  canvas.addEventListener("pointerdown", (e) => {
    const p = point(e);
    ring = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    canvas.setPointerCapture(e.pointerId);
    draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ring || !canvas.hasPointerCapture(e.pointerId)) return;
    const p = point(e);
    ring.x1 = p.x;
    ring.y1 = p.y;
    draw();
  });
  $("clear-ring").addEventListener("click", () => { ring = null; draw(); });

  function slug() {
    try { return new URL(current.pageUrl).hostname.replace(/^www\./, ""); } catch (_) { return current ? current.id : "stamp"; }
  }

  $("download").addEventListener("click", () => {
    if (!image) return alertComposer("Add a screenshot first.");
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${slug()}-${verdict().toLowerCase()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  });

  $("email").addEventListener("click", () => {
    if (!current) return;
    const v = verdict();
    const subject = `${v} — ${slug()}`;
    const body = `${current.pageUrl}\n\n${v}. ${sentence.value.trim()}\n\nThe circled screenshot is attached.\n\n— DEAD OR ALIVE`;
    location.href = `mailto:${encodeURIComponent(current.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  $("done").addEventListener("click", () => {
    if (!current) return;
    done[current.id] = verdict();
    store.set("doa.done", done);
    render();
  });

  function alertComposer(message) {
    drop.querySelector("span").textContent = message;
  }

  if (key) load();
})();
