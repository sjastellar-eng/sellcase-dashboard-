// app.js
(() => {
  const API_BASE = "https://sellcase-backend.onrender.com";

  // ---------- helpers ----------
  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setStatus(el, text, isError = false) {
    if (!el) return;
    el.className = isError ? "error" : "";
    el.textContent = text;
  }

  function requireEl(id) {
    const el = $(id);
    if (!el) throw new Error(`HTML element #${id} not found (check id in index.html)`);
    return el;
  }

  function getAuthHeaderIfAny() {
    // Optional: if you add <input id="authToken"> in HTML, it will be used automatically
    const tokenEl = $("authToken");
    const token = tokenEl ? String(tokenEl.value || "").trim() : "";
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  async function fetchJson(url, extraHeaders = {}) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...getAuthHeaderIfAny(),
        ...extraHeaders,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}\n${text}`);
    }
    return await res.json();
  }

  // ---------- 1) Top search queries ----------
  async function loadTopQueries() {
    const statusEl = $("status");
    const tbody = $("tbody");

    try {
      if (!statusEl || !tbody) {
        // If top queries section isn't present - don't fail the whole app
        return;
      }

      setStatus(statusEl, "JS loaded. Fetching top queries...");

      const url = `${API_BASE}/analytics/top-search-queries?days=30&limit=50`;
      const data = await fetchJson(url);

      if (!Array.isArray(data) || data.length === 0) {
        setStatus(statusEl, "No data yet (empty array).");
        tbody.innerHTML = "";
        return;
      }

      setStatus(statusEl, `Loaded ${data.length} rows.`);
      tbody.innerHTML = "";

      for (const item of data) {
        const c = item.category || {};
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${escapeHtml(item.query ?? "")}</td>
          <td>${escapeHtml(item.count ?? 0)}</td>
          <td>${escapeHtml(c.name ?? "-")}</td>
          <td>${
            typeof c.confidence === "number"
              ? escapeHtml(c.confidence.toFixed(2))
              : escapeHtml(c.confidence ?? "-")
          }</td>
          <td>${escapeHtml(c.source ?? "-")}</td>
        `;

        tbody.appendChild(tr);
      }
    } catch (err) {
      if (statusEl) {
        setStatus(
          statusEl,
          "Front-end error:\n" +
            String(err) +
            "\n\nЕсли тут CORS — нужно добавить CORSMiddleware на бэкенде.",
          true
        );
      }
    }
  }

  // ---------- 2) Market history ----------
  async function loadMarketHistory() {
    const mhStatus = $("mhStatus");

    try {
      // Required elements for Market History section
      const mhTbody = requireEl("mhTbody");
      const projectIdEl = requireEl("projectId");
      const limitEl = requireEl("mhLimit");
      const offsetEl = requireEl("mhOffset");
      const onlyValidEl = requireEl("mhOnlyValid");

      const projectId = Number(projectIdEl.value || 0);
      const limit = Number(limitEl.value || 10);
      const offset = Number(offsetEl.value || 0);
      const onlyValid = Boolean(onlyValidEl.checked);

      if (!projectId) {
        setStatus(mhStatus, "Project ID is required", true);
        return;
      }

      setStatus(mhStatus, "Loading market history...");
      mhTbody.innerHTML = "";

      const url =
        `${API_BASE}/olx/projects/${encodeURIComponent(projectId)}/market/history` +
        `?limit=${encodeURIComponent(limit)}` +
        `&offset=${encodeURIComponent(offset)}` +
        `&only_valid=${encodeURIComponent(onlyValid)}`;

      const data = await fetchJson(url);

      // supports both: array OR { total, limit, offset, items: [...] }
      const items = Array.isArray(data) ? data : (data.items || []);
      const total = Array.isArray(data) ? items.length : (data.total ?? items.length);
      const lim = Array.isArray(data) ? limit : (data.limit ?? limit);
      const off = Array.isArray(data) ? offset : (data.offset ?? offset);

      setStatus(mhStatus, `Loaded ${items.length} items (total=${total}, limit=${lim}, offset=${off}).`);

      if (!items.length) return;

      for (const it of items) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(it.taken_at ?? "")}</td>
          <td>${escapeHtml(it.items_count ?? "")}</td>
          <td>${escapeHtml(it.median_price ?? "")}</td>
          <td>${escapeHtml(it.p25_price ?? "")}</td>
          <td>${escapeHtml(it.p75_price ?? "")}</td>
        `;
        mhTbody.appendChild(tr);
      }
    } catch (err) {
      setStatus(
        mhStatus,
        "MarketHistory error:\n" +
          String(err) +
          "\n\nЕсли 401/403 — нужен Authorization Bearer token (можно добавить input#authToken).",
        true
      );
    }
  }

  // ---------- wire up ----------
  // Top queries: auto
  loadTopQueries();

  // Market history: button + auto try (if section exists)
  const mhLoadBtn = $("mhLoadBtn");
  if (mhLoadBtn) mhLoadBtn.addEventListener("click", loadMarketHistory);

  // Optional: auto-load market history if the section exists
  if ($("mhStatus") && $("mhTbody") && $("projectId")) {
    loadMarketHistory().catch(() => {});
  }
})();
