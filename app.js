// app.js
(() => {
  const API_BASE = "https://sellcase-backend.onrender.com";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);

  const fmtNum = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("uk-UA");
  };

  const fmtISO = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("uk-UA", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function buildAuthHeader() {
    const raw = ($("authToken")?.value || "").trim();
    if (!raw) return null;
    // принимаем "Bearer xxx" или просто "xxx"
    const value = raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
    return value;
  }

  async function apiFetch(path, { auth = false } = {}) {
    const headers = { accept: "application/json" };
    if (auth) {
      const token = buildAuthHeader();
      if (token) headers["Authorization"] = token;
    }

    const res = await fetch(`${API_BASE}${path}`, { method: "GET", headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${text ? `\n${text}` : ""}`);
    }
    return res.json();
  }

  // ---------- tabs/router ----------
  function setActiveTab(tab) {
    document.querySelectorAll(".tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });

    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    const page = $(`page-${tab}`);
    if (page) page.classList.add("active");

    // обновляем hash чтобы можно было открыть ссылкой
    if (location.hash !== `#${tab}`) location.hash = `#${tab}`;
  }

  function initTabs() {
    document.querySelectorAll(".tab").forEach((b) => {
      b.addEventListener("click", () => setActiveTab(b.dataset.tab));
    });

    const fromHash = (location.hash || "").replace("#", "");
    if (fromHash) setActiveTab(fromHash);
    window.addEventListener("hashchange", () => {
      const t = (location.hash || "").replace("#", "");
      if (t) setActiveTab(t);
    });
  }

  // ---------- API health ----------
  async function checkApiHealth() {
    const dot = $("apiDot");
    const text = $("apiStatusText");
    const kpiServer = $("kpiServer");

    try {
      // мягкая проверка: попробуем быстрый endpoint
      await apiFetch("/analytics/top-search-queries?days=1&limit=1");
      dot.classList.add("ok");
      dot.classList.remove("bad");
      text.textContent = "Сервер онлайн";
      if (kpiServer) kpiServer.textContent = "Онлайн";
    } catch (e) {
      dot.classList.remove("ok");
      dot.classList.add("bad");
      text.textContent = "Сервер недоступний";
      if (kpiServer) kpiServer.textContent = "Офлайн";
    }
  }

  // ---------- QUERIES ----------
  async function loadTopQueries() {
    const statusEl = $("status");
    const tbody = $("tbody");
    const btn = $("qReloadBtn");

    if (!statusEl || !tbody) return;

    const setStatus = (msg, isErr = false) => {
      statusEl.textContent = msg;
      statusEl.style.color = isErr ? "#7f1d1d" : "";
    };

    try {
      if (btn) btn.disabled = true;
      setStatus("Завантажуємо…");
      tbody.innerHTML = "";

      // при необходимости меняй days/limit на бэкенде
      const data = await apiFetch("/analytics/top-search-queries?days=30&limit=50");

      if (!Array.isArray(data) || data.length === 0) {
        setStatus("Поки що немає даних.");
        return;
      }

      setStatus(`Завантажено: ${data.length}`);
      for (const item of data) {
        const c = item.category || {};
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(item.query)}</td>
          <td class="nowrap">${escapeHtml(item.count ?? 0)}</td>
          <td>${escapeHtml(c.name ?? "—")}</td>
          <td class="nowrap">${typeof c.confidence === "number" ? c.confidence.toFixed(2) : "—"}</td>
          <td>${escapeHtml(c.source ?? "—")}</td>
        `;
        tbody.appendChild(tr);
      }
    } catch (err) {
      tbody.innerHTML = "";
      setStatus(`Помилка завантаження.\n${String(err)}`, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ---------- MARKET HISTORY ----------
  function setMarketStatus(msg, type = "info") {
    const box = $("mhStatus");
    if (!box) return;

    // перерисуем как alert
    const badge = box.querySelector(".badge");
    const title = box.querySelector("div > div:nth-child(1)");
    const text = box.querySelector("div > div:nth-child(2)");

    box.classList.remove("error");

    if (type === "error") {
      box.classList.add("error");
      if (badge) badge.textContent = "⚠️";
      if (title) title.textContent = "Помилка";
    } else if (type === "ok") {
      if (badge) badge.textContent = "✅";
      if (title) title.textContent = "Готово";
    } else {
      if (badge) badge.textContent = "📌";
      if (title) title.textContent = "Статус";
    }

    if (text) text.textContent = msg;
  }

  function updateKpisFromItems(items) {
    const last = items?.[0] || null;
    const prev = items?.[1] || null;

    const lastMedian = last?.median_price;
    const prevMedian = prev?.median_price;

    $("kpiLastMedian").textContent = fmtNum(lastMedian);
    $("kpiMedian").textContent = fmtNum(lastMedian); // dashboard KPI mirror

    const delta =
      Number.isFinite(Number(lastMedian)) && Number.isFinite(Number(prevMedian))
        ? Number(lastMedian) - Number(prevMedian)
        : null;

    $("kpiDeltaMedian").textContent = delta === null ? "—" : `${delta >= 0 ? "+" : ""}${fmtNum(delta)}`;

    const spread =
      Number.isFinite(Number(last?.p75_price)) && Number.isFinite(Number(last?.p25_price))
        ? Number(last.p75_price) - Number(last.p25_price)
        : null;

    $("kpiSpread").textContent = spread === null ? "—" : fmtNum(spread);

    $("kpiItemsCount").textContent = fmtNum(last?.items_count);
    $("kpiItems").textContent = fmtNum(last?.items_count); // dashboard KPI mirror
    $("kpiLastLoad").textContent = last?.taken_at ? fmtISO(last.taken_at) : "—";
  }

  function renderMarketTable(items) {
    const tbody = $("mhTbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    for (const it of items) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="nowrap">${escapeHtml(fmtISO(it.taken_at))}</td>
        <td class="nowrap">${escapeHtml(fmtNum(it.items_count))}</td>
        <td class="nowrap">${escapeHtml(fmtNum(it.median_price))}</td>
        <td class="nowrap">${escapeHtml(fmtNum(it.p25_price))}</td>
        <td class="nowrap">${escapeHtml(fmtNum(it.p75_price))}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  async function loadMarketHistory() {
    const projectId = Number($("projectId")?.value || 0);
    const limit = Number($("mhLimit")?.value || 30);
    const offset = Number($("mhOffset")?.value || 0);
    const onlyValid = !!$("mhOnlyValid")?.checked;

    if (!projectId) {
      setMarketStatus("Будь ласка, вкажи проєкт (число).", "error");
      return;
    }

    // endpoint: /olx/projects/{projectId}/market/history?limit=..&offset=..&only_valid=..
    const path =
      `/olx/projects/${encodeURIComponent(projectId)}/market/history` +
      `?limit=${encodeURIComponent(limit)}` +
      `&offset=${encodeURIComponent(offset)}` +
      `&only_valid=${encodeURIComponent(onlyValid)}`;

    try {
      setMarketStatus("Завантажуємо дані ринку…", "info");

      // market history может требовать auth: включаем auth=true,
      // но если токена нет — запрос всё равно уйдёт без Authorization
      const data = await apiFetch(path, { auth: true });

      // ожидаем формат: { total, limit, offset, items:[...] } или массив
      const items = Array.isArray(data) ? data : (data.items || []);
      const total = (Array.isArray(data) ? items.length : (data.total ?? items.length));

      if (!items.length) {
        renderMarketTable([]);
        updateKpisFromItems([]);
        setMarketStatus("Немає даних для відображення. Спробуй інший проєкт або зніми фільтр “валідні точки”.", "info");
        return;
      }

      // сортируем по времени DESC чтобы "последний" был первым
      items.sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at)));

      renderMarketTable(items);
      updateKpisFromItems(items);

      setMarketStatus(`Завантажено ${items.length} зрізів (усього: ${total}).`, "ok");
    } catch (err) {
      renderMarketTable([]);
      updateKpisFromItems([]);
      const msg = String(err);

      // подсказка если 401/403
      if (msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
        setMarketStatus(
          "Доступ обмежено. Додай токен у “Додатково” (токен доступу) і повтори.",
          "error"
        );
      } else {
        setMarketStatus(`Не вдалося завантажити дані.\n${msg}`, "error");
      }
    }
  }

  function initMarketControls() {
    const loadBtn = $("mhLoadBtn");
    const prevBtn = $("mhPrevBtn");
    const nextBtn = $("mhNextBtn");

    if (loadBtn) loadBtn.addEventListener("click", loadMarketHistory);

    if (prevBtn) prevBtn.addEventListener("click", () => {
      const el = $("mhOffset");
      const v = Math.max(0, Number(el.value || 0) - Number($("mhLimit").value || 30));
      el.value = String(v);
      loadMarketHistory();
    });

    if (nextBtn) nextBtn.addEventListener("click", () => {
      const el = $("mhOffset");
      const v = Math.max(0, Number(el.value || 0) + Number($("mhLimit").value || 30));
      el.value = String(v);
      loadMarketHistory();
    });
  }

  // ---------- init ----------
  function init() {
    initTabs();

    $("qReloadBtn")?.addEventListener("click", loadTopQueries);

    initMarketControls();

    // первичная проверка API
    checkApiHealth();
    setInterval(checkApiHealth, 30000);

    // автозагрузка “Попит”
    loadTopQueries();
  }

  init();
})();
