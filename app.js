// app.js
(() => {
  const API_BASE = "https://sellcase-backend.onrender.com";

  // UI refs
  const appBadge = document.getElementById("appBadge");

  const projectIdEl = document.getElementById("projectId");
  const limitEl = document.getElementById("mhLimit");
  const offsetEl = document.getElementById("mhOffset");
  const onlyValidEl = document.getElementById("mhOnlyValid");
  const tokenEl = document.getElementById("authToken");

  const btnLoad = document.getElementById("mhLoadBtn");
  const btnPrev = document.getElementById("mhPrevBtn");
  const btnNext = document.getElementById("mhNextBtn");

  const mhStatus = document.getElementById("mhStatus");
  const mhMeta = document.getElementById("mhMeta");
  const mhTbody = document.getElementById("mhTbody");

  // KPI refs
  const k_lastMedian = document.getElementById("k_lastMedian");
  const k_lastMedianS = document.getElementById("k_lastMedianS");
  const k_deltaMedian = document.getElementById("k_deltaMedian");
  const k_deltaMedianS = document.getElementById("k_deltaMedianS");
  const k_spread = document.getElementById("k_spread");
  const k_spreadS = document.getElementById("k_spreadS");
  const k_items = document.getElementById("k_items");
  const k_itemsS = document.getElementById("k_itemsS");

  const mhInsights = document.getElementById("mhInsights");

  // Chart
  let chart;

  function setBadge(text, isError = false) {
    appBadge.textContent = text;
    appBadge.style.borderColor = isError ? "rgba(255,107,107,.35)" : "rgba(255,255,255,.10)";
    appBadge.style.color = isError ? "rgba(255,107,107,.95)" : "rgba(230,234,242,.72)";
    appBadge.style.background = isError ? "rgba(255,107,107,.10)" : "rgba(255,255,255,.06)";
  }

  function setStatus(text, isError = false) {
    mhStatus.textContent = text;
    mhStatus.className = "status" + (isError ? " error" : "");
  }

  function normToken(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    if (s.toLowerCase().startsWith("bearer ")) return s; // already has Bearer
    // user may paste only jwt
    return "Bearer " + s;
  }

  function safeNum(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function fmtMoneyUAH(n) {
    if (n === null || n === undefined) return "—";
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    // no currency sign to avoid confusion; you can add ₴ later if needed
    return v.toLocaleString("uk-UA");
  }

  function fmtPct(n) {
    if (n === null || n === undefined) return "—";
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return sign + v.toFixed(1) + "%";
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderInsights(cards) {
    mhInsights.innerHTML = "";
    for (const c of cards) {
      const el = document.createElement("div");
      el.className = "ins";
      el.innerHTML = `
        <div class="t">${escapeHtml(c.title)}</div>
        <div class="d">${escapeHtml(c.body)}</div>
      `;
      mhInsights.appendChild(el);
    }
  }

  function buildRuleInsights(items) {
    // items are chronological (old -> new) ideally; if not, we'll use as received.
    if (!items || items.length === 0) {
      return [{
        title: "Нет данных",
        body: "Пустой массив точек. Попробуй only_valid=false или увеличь limit."
      }];
    }

    const last = items[items.length - 1];
    const prev = items.length >= 2 ? items[items.length - 2] : null;

    const lastMedian = safeNum(last.median_price);
    const prevMedian = prev ? safeNum(prev.median_price) : null;

    const lastP25 = safeNum(last.p25_price);
    const lastP75 = safeNum(last.p75_price);

    const spread = (lastP75 !== null && lastP25 !== null) ? (lastP75 - lastP25) : null;

    const cards = [];

    // Trend card
    if (lastMedian !== null && prevMedian !== null && prevMedian !== 0) {
      const deltaPct = ((lastMedian - prevMedian) / prevMedian) * 100;
      const dir = deltaPct > 2 ? "Рост" : (deltaPct < -2 ? "Падение" : "Стабильно");
      cards.push({
        title: `Тренд: ${dir}`,
        body: `Последняя медиана: ${fmtMoneyUAH(lastMedian)}. Изменение к предыдущей точке: ${fmtPct(deltaPct)}.`
      });
    } else {
      cards.push({
        title: "Тренд",
        body: "Недостаточно валидных точек (median) для сравнения. Увеличь limit или отключи only_valid."
      });
    }

    // Volatility / spread
    if (spread !== null) {
      const spreadPct = lastMedian ? (spread / lastMedian) * 100 : null;
      let level = "Низкая";
      if (spreadPct !== null) {
        if (spreadPct > 45) level = "Высокая";
        else if (spreadPct > 25) level = "Средняя";
      }
      cards.push({
        title: `Разброс цен: ${level}`,
        body: `p25=${fmtMoneyUAH(lastP25)}, p75=${fmtMoneyUAH(lastP75)} → спред ${fmtMoneyUAH(spread)} (${spreadPct !== null ? fmtPct(spreadPct) : "—"} от медианы).`
      });
    } else {
      cards.push({
        title: "Разброс цен",
        body: "p25/p75 отсутствуют — включи only_valid=false или проверь сбор данных."
      });
    }

    // Liquidity / items_count
    const itemsCount = safeNum(last.items_count);
    if (itemsCount !== null) {
      let msg = "Нормальная выборка.";
      if (itemsCount < 20) msg = "Мало объявлений — метрики могут быть шумными.";
      else if (itemsCount > 80) msg = "Много объявлений — метрики стабильнее.";
      cards.push({
        title: "Объём рынка",
        body: `Объявлений в последней точке: ${itemsCount}. ${msg}`
      });
    } else {
      cards.push({
        title: "Объём рынка",
        body: "items_count отсутствует в последней точке."
      });
    }

    // Action suggestion
    if (lastMedian !== null && spread !== null) {
      const midLow = lastMedian - spread * 0.15;
      const midHigh = lastMedian + spread * 0.15;
      cards.push({
        title: "Рекомендация (MVP)",
        body: `Для быстрых продаж тестируй цену в коридоре около медианы: ~${fmtMoneyUAH(Math.round(midLow))} – ${fmtMoneyUAH(Math.round(midHigh))}.`
      });
    } else {
      cards.push({
        title: "Рекомендация (MVP)",
        body: "Сначала добьёмся стабильных валидных median/p25/p75, затем добавим умные рекомендации."
      });
    }

    return cards;
  }

  function updateKpis(items, meta) {
    const last = items.length ? items[items.length - 1] : null;
    const prev = items.length >= 2 ? items[items.length - 2] : null;

    const lastMedian = last ? safeNum(last.median_price) : null;
    const prevMedian = prev ? safeNum(prev.median_price) : null;

    const lastP25 = last ? safeNum(last.p25_price) : null;
    const lastP75 = last ? safeNum(last.p75_price) : null;

    const spread = (lastP75 !== null && lastP25 !== null) ? (lastP75 - lastP25) : null;

    const itemsCount = last ? safeNum(last.items_count) : null;

    k_lastMedian.textContent = fmtMoneyUAH(lastMedian);
    k_lastMedianS.textContent = last ? `taken_at: ${last.taken_at || "—"}` : "—";

    // delta median
    let deltaPct = null;
    if (lastMedian !== null && prevMedian !== null && prevMedian !== 0) {
      deltaPct = ((lastMedian - prevMedian) / prevMedian) * 100;
    }
    k_deltaMedian.textContent = deltaPct !== null ? fmtPct(deltaPct) : "—";
    k_deltaMedian.className = "v " + (deltaPct > 0 ? "up" : (deltaPct < 0 ? "down" : "flat"));
    k_deltaMedianS.textContent = prev ? `prev median: ${fmtMoneyUAH(prevMedian)}` : "—";

    // spread
    k_spread.textContent = fmtMoneyUAH(spread);
    k_spreadS.textContent = (lastP25 !== null && lastP75 !== null) ? `p25 ${fmtMoneyUAH(lastP25)} • p75 ${fmtMoneyUAH(lastP75)}` : "—";

    // items
    k_items.textContent = itemsCount !== null ? String(itemsCount) : "—";
    k_itemsS.textContent = meta ? `total=${meta.total} • limit=${meta.limit} • offset=${meta.offset}` : "—";
  }

  function renderTable(items) {
    mhTbody.innerHTML = "";
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
  }

  function renderChart(items) {
    const labels = items.map(x => (x.taken_at || "").replace("T", " ").replace("Z", ""));
    const median = items.map(x => safeNum(x.median_price));
    const p25 = items.map(x => safeNum(x.p25_price));
    const p75 = items.map(x => safeNum(x.p75_price));

    const ctx = document.getElementById("mhChart");
    const data = {
      labels,
      datasets: [
        { label: "median", data: median, spanGaps: true, tension: 0.25 },
        { label: "p25", data: p25, spanGaps: true, tension: 0.25 },
        { label: "p75", data: p75, spanGaps: true, tension: 0.25 },
      ]
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "rgba(230,234,242,.75)" } },
        tooltip: { intersect: false, mode: "index" }
      },
      scales: {
        x: {
          ticks: { color: "rgba(230,234,242,.55)", maxTicksLimit: 6 },
          grid: { color: "rgba(255,255,255,.06)" }
        },
        y: {
          ticks: { color: "rgba(230,234,242,.55)" },
          grid: { color: "rgba(255,255,255,.06)" }
        }
      }
    };

    if (chart) chart.destroy();
    chart = new Chart(ctx, { type: "line", data, options });
  }

  async function loadMarketHistory() {
    const projectId = Number(projectIdEl.value || 0);
    const limit = Number(limitEl.value || 30);
    const offset = Number(offsetEl.value || 0);
    const onlyValid = !!onlyValidEl.checked;

    if (!projectId) {
      setStatus("Project ID обязателен", true);
      setBadge("Error", true);
      return;
    }

    const url =
      `${API_BASE}/olx/projects/${encodeURIComponent(projectId)}/market/history` +
      `?limit=${encodeURIComponent(limit)}` +
      `&offset=${encodeURIComponent(offset)}` +
      `&only_valid=${encodeURIComponent(onlyValid)}`;

    const token = normToken(tokenEl.value);

    setBadge("Loading…");
    setStatus("Loading market history…");
    mhMeta.textContent = `project=${projectId}`;

    try {
      const headers = { accept: "application/json" };
      if (token) headers["Authorization"] = token;

      const res = await fetch(url, { method: "GET", headers });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}\n${text}`);
      }

      const data = await res.json();
      // ожидаем формат: { total, limit, offset, items: [...] }
      const items = Array.isArray(data) ? data : (data.items || []);
      const meta = {
        total: data.total ?? items.length,
        limit: data.limit ?? limit,
        offset: data.offset ?? offset
      };

      mhMeta.textContent = `total=${meta.total} • limit=${meta.limit} • offset=${meta.offset}`;
      setStatus(`Loaded ${items.length} items (total=${meta.total}, limit=${meta.limit}, offset=${meta.offset}).`);
      setBadge("OK");

      // render
      renderTable(items);
      renderChart(items);
      updateKpis(items, meta);
      renderInsights(buildRuleInsights(items));

      // enable paging
      btnPrev.disabled = meta.offset <= 0;
      btnNext.disabled = (meta.offset + meta.limit) >= meta.total;

    } catch (err) {
      setBadge("Error", true);
      setStatus(
        "MarketHistory error:\n" + String(err) +
        "\n\nЕсли 401/403 — нужен Authorization Bearer token (вставь JWT в поле Token).",
        true
      );
      renderInsights([{
        title: "Ошибка загрузки",
        body: "Проверь токен/права доступа и Project ID. Если хочешь — сделаем автоматический логин и хранение токена."
      }]);
    }
  }

  // Paging buttons
  function pagePrev() {
    const limit = Number(limitEl.value || 30);
    const cur = Number(offsetEl.value || 0);
    const next = Math.max(0, cur - limit);
    offsetEl.value = String(next);
    loadMarketHistory();
  }

  function pageNext() {
    const limit = Number(limitEl.value || 30);
    const cur = Number(offsetEl.value || 0);
    offsetEl.value = String(cur + limit);
    loadMarketHistory();
  }

  // Wire
  btnLoad.addEventListener("click", loadMarketHistory);
  btnPrev.addEventListener("click", pagePrev);
  btnNext.addEventListener("click", pageNext);

  // Enter to load
  [projectIdEl, limitEl, offsetEl, tokenEl].forEach(el => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loadMarketHistory();
    });
  });

  // Init
  setBadge("Ready");
  setStatus("Готово. Вставь токен и нажми Load.");
})();
