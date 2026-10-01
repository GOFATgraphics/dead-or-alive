import { DESK } from "../src/config.js";
import { createEditor } from "./editor.js";
import { renderAnalytics } from "./analytics.js";

(() => {
  const $ = (id) => document.getElementById(id);
  const COLORS = { DEAD: "#d92d33", COPE: "#c26a05", ALIVE: "#138a43" };
  const SENTENCES = {
    DEAD: "A stranger cannot tell what is being sold before they scroll.",
    COPE: "A stranger cannot tell who this is for before they scroll.",
    ALIVE: "A stranger can name the product, the buyer, and the reason to pay before they scroll.",
  };

  const session = {
    get() { try { return sessionStorage.getItem("doa.key") || ""; } catch (_) { return ""; } },
    set(v) { try { v ? sessionStorage.setItem("doa.key", v) : sessionStorage.removeItem("doa.key"); } catch (_) {} },
  };

  let key = session.get();
  let orders = [];
  let view = "open";
  let current = null;

  $("queue").textContent = DESK.queueOpen
    ? "Queue is open. To close it, set queueOpen to false in src/config.js and deploy."
    : "Queue is closed. To open it, set queueOpen to true in src/config.js and deploy.";

  // Unlock

  const unlock = $("unlock");
  unlock.addEventListener("submit", (e) => {
    e.preventDefault();
    key = String(new FormData(unlock).get("key") || "");
    openDesk();
  });
  $("lock").addEventListener("click", () => {
    key = "";
    session.set("");
    orders = [];
    $("desk-nav").hidden = true;
    document.querySelectorAll(".pane, #board, #composer").forEach((p) => (p.hidden = true));
    unlock.hidden = false;
  });

  // The key alone opens the desk. Orders, analytics, and email each work once their service is connected.
  let setup = {};
  async function openDesk() {
    const alert = unlock.querySelector("[role=alert]");
    alert.hidden = true;
    try {
      const r = await fetch("/api/session", { headers: { "x-admin-key": key }, cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Error ${r.status}.`);
      setup = data.setup || {};
    } catch (err) {
      alert.hidden = false;
      alert.textContent = err.message === "Not available." ? "The desk is off: the admin key isn't set up in Vercel yet." : err.message || "Could not open the desk.";
      if (/key/i.test(String(err.message))) session.set("");
      return;
    }
    session.set(key);
    unlock.hidden = true;
    $("desk-nav").hidden = false;
    renderSetup();
    showPane(pane);
  }

  let pane = "orders";
  function showPane(name) {
    pane = name;
    document.querySelectorAll(".desk-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pane === name)));
    $("board").hidden = name !== "orders";
    $("composer").hidden = name !== "orders" || !current;
    $("pane-analytics").hidden = name !== "analytics";
    $("pane-setup").hidden = name !== "setup";
    if (name === "orders") load();
    if (name === "analytics") loadAnalytics();
  }
  document.querySelectorAll(".desk-tabs button").forEach((b) => b.addEventListener("click", () => showPane(b.dataset.pane)));

  // Analytics

  let days = 30;
  document.querySelectorAll(".range-tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      days = Number(b.dataset.days);
      document.querySelectorAll(".range-tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      loadAnalytics();
    })
  );
  $("an-refresh").addEventListener("click", () => loadAnalytics());
  async function loadAnalytics() {
    const body = $("an-body");
    body.classList.add("loading"); // keep the last render while new numbers load
    try {
      const r = await fetch(`/api/analytics?days=${days}`, { headers: { "x-admin-key": key }, cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Error ${r.status}.`);
      const notes = $("an-notes");
      notes.replaceChildren(...(data.notes || []).map((n) => Object.assign(document.createElement("li"), { textContent: n })));
      renderAnalytics(body, data);
    } catch (err) {
      body.replaceChildren(Object.assign(document.createElement("p"), { className: "alert", textContent: err.message || "Could not load analytics." }));
    } finally {
      body.classList.remove("loading");
    }
  }

  // Setup

  function renderSetup() {
    const items = [
      ["Admin key", true, "Set. You're in."],
      ["Polar", setup.polar, setup.polar ? "Orders and revenue load from Polar." : "Add POLAR_ACCESS_TOKEN (Polar → Settings → Developers, scope orders:read)."],
      ["Checkout link", !!(DESK.polarVerdictUrl || "").trim(), (DESK.polarVerdictUrl || "").trim() ? "The homepage form sends people to Polar." : "Paste the Polar checkout link into polarVerdictUrl in src/config.js."],
      ["Stamp storage", setup.blob, setup.blob ? "Published stamps are saved to Vercel Blob." : "Connect a Blob store in Vercel → Storage. It adds BLOB_READ_WRITE_TOKEN."],
      ["Email", setup.email, setup.email ? "Customers get their link by email." : "Add RESEND_API_KEY and MAIL_FROM. Until then, use Draft email."],
      ["Visitor analytics", setup.analytics, setup.analytics ? "Visits and clicks are being counted." : "Add Upstash Redis from the Vercel Marketplace (Storage → Upstash). It adds KV_REST_API_URL and KV_REST_API_TOKEN."],
      ["Site address", setup.siteUrl, setup.siteUrl ? "Links and share previews use SITE_URL." : "Optional: set SITE_URL to your domain. Vercel's production domain is used until then."],
      ["Contact email", setup.contact, setup.contact ? "Shown on the privacy and terms pages." : "Set CONTACT_EMAIL so the privacy and terms pages show it."],
      ["Queue limit", true, `The form closes when ${setup.queueLimit || 10} paid pages are waiting. Change with QUEUE_LIMIT.`],
    ];
    $("setup-list").replaceChildren(
      ...items.map(([name, ok, text]) => {
        const li = document.createElement("li");
        li.className = ok ? "ok" : "todo";
        const badge = Object.assign(document.createElement("span"), { className: "setup-badge", textContent: ok ? "Connected" : "Missing" });
        const title = Object.assign(document.createElement("strong"), { textContent: name });
        const p = Object.assign(document.createElement("p"), { textContent: text });
        li.append(badge, title, p);
        return li;
      })
    );
  }
  $("refresh").addEventListener("click", load);

  async function load() {
    let data;
    try {
      const r = await fetch("/api/orders", { headers: { "x-admin-key": key }, cache: "no-store" });
      data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Error ${r.status}.`);
    } catch (err) {
      showBoardError(err.message || "Could not load orders.");
      return;
    }
    orders = data.orders || [];
    $("board-alert").hidden = !data.warning;
    $("board-alert").textContent = data.warning || "";
    if (current) current = orders.find((o) => o.id === current.id) || current;
    render();
  }

  function showBoardError(message) {
    $("board-alert").hidden = false;
    $("board-alert").textContent = message;
  }

  // Order list

  document.querySelectorAll(".view-tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      view = b.dataset.view;
      document.querySelectorAll(".view-tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      render();
    })
  );

  function render() {
    const list = $("orders");
    const shown = orders.filter((o) =>
      view === "all" ? true : view === "done" ? o.resultUrl : !o.resultUrl && o.status !== "refunded"
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
      const stamp = o.verdict ? `<a class="word ${o.verdict.toLowerCase()}" href="${o.resultUrl}" target="_blank" rel="noopener">${o.verdict}</a>` : "";
      li.innerHTML = `
        <div class="meta"><span></span><span></span>${stamp}</div>
        <a class="page" target="_blank" rel="noopener noreferrer"></a>
        <div class="who"><span></span><button type="button" class="link">Stamp</button></div>`;
      const [whenEl, productEl] = li.querySelectorAll(".meta span");
      whenEl.textContent = when;
      productEl.textContent = [o.product, o.status && o.status !== "paid" ? o.status : ""].filter(Boolean).join(" · ");
      const a = li.querySelector(".page");
      // Only a checked URL becomes a link. Anything else is shown as plain text to look at, not click.
      a.textContent = o.pageUrl || (o.pageUrlRaw ? `Unusable URL: ${o.pageUrlRaw}` : "(no page URL)");
      if (o.pageUrl) a.href = o.pageUrl;
      else a.removeAttribute("target");
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
    editor.reset();
    canvas.hidden = true;
    $("drop").hidden = false;
    $("c-target").textContent = "— " + (o.pageUrl || o.email || o.id);
    const v = o.verdict || "DEAD";
    showPublished(o.resultUrl ? { url: o.resultUrl, note: "Already published. Publishing again replaces it." } : null);
    document.querySelector(`input[name=verdict][value=${v}]`).checked = true;
    sentence.value = SENTENCES[v];
    $("composer").hidden = false;
    render();
    $("composer").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.querySelectorAll("input[name=verdict]").forEach((r) =>
    r.addEventListener("change", () => {
      if (Object.values(SENTENCES).includes(sentence.value.trim()) || !sentence.value.trim()) sentence.value = SENTENCES[verdict()];
      editor.draw();
    })
  );
  sentence.addEventListener("input", () => editor.draw());

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
      try { await Promise.all([document.fonts.load('500 20px "IBM Plex Mono"'), document.fonts.load('500 20px "Plus Jakarta Sans"')]); } catch (_) {}
      drop.hidden = true;
      canvas.hidden = false;
      editor.setImage(img);
    };
    img.src = url;
  }

  const editor = createEditor(canvas, { verdict, sentence: () => sentence.value, onChange: syncTools });

  function syncTools() {
    $("undo").disabled = !editor.canUndo;
    $("redo").disabled = !editor.canRedo;
    $("remove").disabled = !editor.hasSelection;
    $("tools").hidden = !editor.hasImage;
  }
  document.querySelectorAll("[data-tool]").forEach((b) =>
    b.addEventListener("click", () => {
      editor.setTool(b.dataset.tool);
      document.querySelectorAll("[data-tool]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    })
  );
  document.querySelectorAll("[data-size]").forEach((b) =>
    b.addEventListener("click", () => {
      editor.setSize(Number(b.dataset.size));
      document.querySelectorAll("[data-size]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    })
  );
  $("undo").addEventListener("click", () => editor.undo());
  $("redo").addEventListener("click", () => editor.redo());
  $("remove").addEventListener("click", () => editor.remove());
  $("clear-ring").addEventListener("click", () => editor.clear());
  $("replace").addEventListener("click", () => $("file").click());
  canvas.addEventListener("pointerup", syncTools);

  function slug() {
    try { return new URL(current.pageUrl).hostname.replace(/^www\./, ""); } catch (_) { return current ? current.id : "stamp"; }
  }

  $("download").addEventListener("click", () => {
    if (!editor.hasImage) return alertComposer("Add a screenshot first.");
    editor.exportWith((c) => c.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${slug()}-${verdict().toLowerCase()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png"));
  });

  $("email").addEventListener("click", () => {
    if (!current) return;
    const v = verdict();
    const subject = `${v} — ${slug()}`;
    const tail = current.resultUrl ? `See your stamp: ${current.resultUrl}` : "The circled screenshot is attached.";
    const body = `${current.pageUrl}\n\n${v}. ${sentence.value.trim()}\n\n${tail}\n\n— DEAD OR ALIVE`;
    location.href = `mailto:${encodeURIComponent(current.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  function showPublished(info) {
    const el = $("published");
    el.hidden = !info;
    if (!info) return;
    el.replaceChildren();
    if (info.url) {
      const a = document.createElement("a");
      a.href = info.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = info.url;
      el.append(a, document.createElement("br"));
    }
    const note = document.createElement("span");
    note.textContent = info.note;
    note.className = info.error ? "alert" : "";
    el.append(note);
  }

  // JPEG keeps the upload under the server's size limit.
  function jpeg() {
    return editor.exportWith((c) => {
      for (const q of [0.88, 0.8, 0.7, 0.6]) {
        const data = c.toDataURL("image/jpeg", q);
        if (data.length < 5_000_000) return data;
      }
      return c.toDataURL("image/jpeg", 0.5);
    });
  }

  const publishBtn = $("publish");
  publishBtn.addEventListener("click", async () => {
    if (!current) return;
    if (!editor.hasImage) return alertComposer("Add a screenshot first.");
    if (!sentence.value.trim()) return showPublished({ note: "Write the sentence first.", error: true });
    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing…";
    try {
      const r = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": key },
        body: JSON.stringify({
          orderId: current.id,
          email: current.email,
          pageUrl: current.pageUrl,
          verdict: verdict(),
          sentence: sentence.value.trim(),
          image: jpeg(),
          sendEmail: $("send-email").checked,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Error ${r.status}.`);
      current.resultUrl = data.url;
      current.verdict = verdict();
      const note = data.emailed
        ? `Published. Emailed ${current.email}.`
        : $("send-email").checked
          ? `Published. Not emailed: ${data.emailError || "no email on the order."} Use Draft email.`
          : "Published. Not emailed.";
      showPublished({ url: data.url, note, error: !data.emailed && $("send-email").checked });
      render();
    } catch (err) {
      showPublished({ note: err.message || "Could not publish.", error: true });
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = "Publish verdict";
    }
  });

  function alertComposer(message) {
    drop.querySelector("span").textContent = message;
  }

  if (key) openDesk();
})();
