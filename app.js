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
