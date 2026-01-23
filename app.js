// app.js
(() => {
  const API_BASE = "https://sellcase-backend.onrender.com";

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function fmtNum(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("uk-UA");
  }

  function fmtDelta(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    const sign = x > 0 ? "+" : "";
    return sign + x.toLocaleString("uk-UA");
  }

  function normalizeBearer(raw) {
    const t = String(raw ?? "").trim();
    if (!t) return "";
    if (/^bearer\s+/i.test(t)) return t;
    return "Bearer " + t;
  }

  function setStatus(el, text, kind) {
    el.className = "status" + (kind ? " " + kind : "");
    el.textContent = text;
  }

  // ---------- theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const btn = $("themeBtn");
    btn.textContent = theme === "dark" ? "🌙 Темна" : "🌞 Світла";
  }

  function initTheme() {
    const saved = localStorage.getItem("theme") || "light";
    applyTheme(saved);
    $("themeBtn").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "light";
      const next = cur === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      applyTheme(next);
    });
  }

  // ---------- health ----------
  async function checkHealth() {
    const dot = $("healthDot");
    const text = $("healthText");
    try {
      const res = await fetch(`${API_BASE}/health`, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dot.className = "dot ok";
      text.textContent = "Сервер онлайн";
    } catch (e) {
      dot.className = "dot bad";
      text.textContent = "Сервер недоступний";
    }
  }

  // ---------- market history state ----------
  let lastMeta = { total: 0, limit: 30, offset: 0 };

  function updateNavButtons() {
    const limit = lastMeta.limit || 30;
    const offset = lastMeta.offset || 0;
    const total = lastMeta.total || 0;
    $("mhPrevBtn").disabled = offset <= 0;
    $("mhNextBtn").disabled = offset + limit >= total;
  }

  function computeKpis(items) {
    // items already in server order (usually newest first). We'll use:
    // last = items[0], prev = items[1]
    const last = items?.[0];
    const prev = items?.[1];

    const lastMedian = Number(last?.median_price);
    const prevMedian = Number(prev?.median_price);
    const deltaMedian = (Number.isFinite(lastMedian) && Number.isFinite(prevMedian)) ? (lastMedian - prevMedian) : NaN;

    const spread = Number(last?.p75_price) - Number(last?.p25_price);
    const itemsCount = Number(last?.items_count);

    $("kpiLastMedian").textContent = fmtNum(lastMedian);
    $("kpiLastMedianSub").textContent = last?.taken_at ? `оновлено: ${last.taken_at}` : "—";

    $("kpiDeltaMedian").textContent = fmtDelta(deltaMedian);
    $("kpiDeltaMedianSub").textContent = Number.isFinite(deltaMedian) ? "порівняно з попереднім знімком" : "—";

    $("kpiSpread").textContent = Number.isFinite(spread) ? fmtNum(spread) : "—";
    $("kpiSpreadSub").textContent = "для останнього знімка";

    $("kpiItems").textContent = fmtNum(itemsCount);
    $("kpiItemsSub").textContent = "в останньому знімку";
  }

  function renderTable(items) {
    const tbody = $("mhTbody");
    tbody.innerHTML = "";
    for (const it of (items || [])) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(it.taken_at)}</td>
        <td>${escapeHtml(it.items_count)}</td>
        <td>${escapeHtml(it.median_price)}</td>
        <td>${escapeHtml(it.p25_price)}</td>
        <td>${escapeHtml(it.p75_price)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  async function loadMarketHistory() {
    const mhStatus = $("mhStatus");

    const projectId = Number($("projectId").value || 0);
    const limit = Number($("mhLimit").value || 30);
    const offset = Number($("mhOffset").value || 0);
    const onlyValid = $("mhOnlyValid").checked;

    if (!projectId) {
      setStatus(mhStatus, "Помилка: вкажи проєкт (тимчасово числом).", "error");
      return;
    }

    const url =
      `${API_BASE}/olx/projects/${encodeURIComponent(projectId)}/market/history` +
      `?limit=${encodeURIComponent(limit)}` +
      `&offset=${encodeURIComponent(offset)}` +
      `&only_valid=${encodeURIComponent(onlyValid)}`;

    const rawToken = $("authToken").value;
    const auth = normalizeBearer(rawToken);

    try {
      setStatus(mhStatus, "Завантаження…", "");
      $("mhTbody").innerHTML = "";

      const headers = { accept: "application/json" };
      if (auth) headers["Authorization"] = auth;

      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}\n${text}`);
      }

      const data = await res.json();

      // expected: { total, limit, offset, items: [...] }
      const items = Array.isArray(data) ? data : (data.items || []);
      const total = Number(data.total ?? items.length);
      const gotLimit = Number(data.limit ?? limit);
      const gotOffset = Number(data.offset ?? offset);

      lastMeta = { total, limit: gotLimit, offset: gotOffset };
      updateNavButtons();

      if (!items.length) {
        computeKpis([]);
        setStatus(mhStatus, `Немає даних. (total=${total})`, "ok");
        return;
      }

      computeKpis(items);
      renderTable(items);

      setStatus(
        mhStatus,
        `Завантажено ${items.length} записів (усього=${total}, ліміт=${gotLimit}, зсув=${gotOffset}).`,
        "ok"
      );

    } catch (err) {
      const msg = String(err);
      const hint =
        msg.includes("HTTP 401") || msg.includes("HTTP 403")
          ? "\n\nСхоже, потрібна авторизація. Встав JWT у поле “Токен (JWT)” (можна без 'Bearer')."
          : "";
      setStatus(mhStatus, "Помилка завантаження:\n" + msg + hint, "error");
      updateNavButtons();
    }
  }

  // ---------- init ----------
  function initMarketHistory() {
    $("mhLoadBtn").addEventListener("click", () => loadMarketHistory());

    $("mhPrevBtn").addEventListener("click", () => {
      const limit = Number($("mhLimit").value || 30);
      const offset = Number($("mhOffset").value || 0);
      const nextOffset = Math.max(0, offset - limit);
      $("mhOffset").value = String(nextOffset);
      loadMarketHistory();
    });

    $("mhNextBtn").addEventListener("click", () => {
      const limit = Number($("mhLimit").value || 30);
      const offset = Number($("mhOffset").value || 0);
      const nextOffset = offset + limit;
      $("mhOffset").value = String(nextOffset);
      loadMarketHistory();
    });

    // UX: Enter on inputs loads
    ["projectId","mhLimit","mhOffset","authToken"].forEach((id) => {
      $(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") loadMarketHistory();
      });
    });

    updateNavButtons();
  }

  initTheme();
  checkHealth();
  initMarketHistory();
})();
