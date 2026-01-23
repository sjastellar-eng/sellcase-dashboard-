// app.js
(() => {
  const API_BASE = "https://sellcase-backend.onrender.com";
  const statusEl = document.getElementById("status");
  const tbody = document.getElementById("tbody");

  // 1) Проверка что JS реально загрузился
  statusEl.textContent = "JS loaded. Fetching data…";

  async function loadTopQueries() {
    const url = `${API_BASE}/analytics/top-search-queries?days=30&limit=50`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "accept": "application/json" }
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}\n${text}`);
      }

      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        statusEl.textContent = "No data yet (empty array). Add searches via /search/log and refresh.";
        tbody.innerHTML = "";
        return;
      }

      statusEl.textContent = `Loaded ${data.length} rows.`;
      tbody.innerHTML = "";

      for (const item of data) {
        const c = item.category || {};
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${escapeHtml(item.query ?? "")}</td>
          <td>${item.count ?? 0}</td>
          <td>${escapeHtml(c.name ?? "-")}</td>
          <td>${typeof c.confidence === "number" ? c.confidence.toFixed(2) : "-"}</td>
          <td>${escapeHtml(c.source ?? "-")}</td>
        `;

        tbody.appendChild(tr);
      }
    } catch (err) {
      statusEl.className = "error";
      statusEl.textContent =
        "Front-end error:\n" +
        String(err) +
        "\n\nЕсли тут CORS — нужно добавить CORSMiddleware на бэкенде (ниже дам код).";
    }
  }


  async function loadMarketHistory() {
  const mhStatus = document.getElementById("mhStatus");
  const mhTbody = document.getElementById("mhTbody");

  const projectId = Number(document.getElementById("projectId").value || 0);
  const limit = Number(document.getElementById("mhLimit").value || 10);
  const offset = Number(document.getElementById("mhOffset").value || 0);
  const onlyValid = document.getElementById("mhOnlyValid").checked;

  if (!projectId) {
    mhStatus.textContent = "Project ID is required";
    mhStatus.className = "error";
    return;
  }

  const url =
    `${API_BASE}/olx/projects/${projectId}/market/history` +
    `?limit=${encodeURIComponent(limit)}` +
    `&offset=${encodeURIComponent(offset)}` +
    `&only_valid=${encodeURIComponent(onlyValid)}`;

  try {
    mhStatus.className = "";
    mhStatus.textContent = "Loading market history...";
    mhTbody.innerHTML = "";

    // важно: если endpoint требует авторизацию — добавь Authorization как ты делал в swagger
    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        // "Authorization": "Bearer <TOKEN>",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}\n${text}`);
    }

    const data = await res.json();

    // ожидаем формат: { total, limit, offset, items: [...] }
    const items = Array.isArray(data) ? data : (data.items || []);
    const total = data.total ?? items.length;

    mhStatus.textContent = `Loaded ${items.length} items (total=${total}, offset=${data.offset ?? offset}, limit=${data.limit ?? limit})`;

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
    mhStatus.className = "error";
    mhStatus.textContent =
      "MarketHistory error:\n" + String(err) +
      "\n\nЕсли 401/403 — нужен Authorization Bearer token.\nЕсли CORS — нужно разрешить домен фронта на бэкенде.";
  }
  
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  loadTopQueries();
})();
