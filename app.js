(() => {
  // === CONFIG ===
  const API_BASE = "https://sellcase-backend.onrender.com";

  // === STORAGE KEYS ===
  const KEY_TOKEN = "sellcase_token";
  const KEY_TOKEN_TYPE = "sellcase_token_type";
  const KEY_EMAIL = "sellcase_email";
  const KEY_PROJECT_ID = "sellcase_project_id";
  const KEY_LIMIT = "sellcase_limit";

  // === ELEMENTS ===
  const apiDot = document.getElementById("apiDot");
  const apiText = document.getElementById("apiText");
  const btnLogout = document.getElementById("btnLogout");
  const btnLogout2 = document.getElementById("btnLogout2");

  const screenAuth = document.getElementById("screenAuth");
  const screenApp = document.getElementById("screenApp");

  // Tabs/routes
  const tabMarket = document.getElementById("tab-market");
  const tabQueries = document.getElementById("tab-queries");
  const tabAccount = document.getElementById("tab-account");

  const pageMarket = document.getElementById("pageMarket");
  const pageSide = document.getElementById("pageSide");
  const pageQueries = document.getElementById("pageQueries");
  const pageAccount = document.getElementById("pageAccount");

  // Auth UI
  const btnShowLogin = document.getElementById("btnShowLogin");
  const btnShowRegister = document.getElementById("btnShowRegister");
  const boxLogin = document.getElementById("boxLogin");
  const boxRegister = document.getElementById("boxRegister");
  const authError = document.getElementById("authError");
  const authHint = document.getElementById("authHint");

  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const btnLogin = document.getElementById("btnLogin");

  const regName = document.getElementById("regName");
  const regEmail = document.getElementById("regEmail");
  const regPassword = document.getElementById("regPassword");
  const btnRegister = document.getElementById("btnRegister");

  // Market UI
  const projectIdEl = document.getElementById("projectId");
  const limitEl = document.getElementById("limit");
  const offsetEl = document.getElementById("offset");
  const onlyValidEl = document.getElementById("onlyValid");
  const btnLoadMarket = document.getElementById("btnLoadMarket");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const marketStatus = document.getElementById("marketStatus");
  const marketError = document.getElementById("marketError");
  const marketTbody = document.getElementById("marketTbody");

  const kpiLastMedian = document.getElementById("kpiLastMedian");
  const kpiLastTime = document.getElementById("kpiLastTime");
  const kpiDeltaMedian = document.getElementById("kpiDeltaMedian");
  const kpiDeltaHint = document.getElementById("kpiDeltaHint");
  const kpiSpread = document.getElementById("kpiSpread");
  const kpiSpreadHint = document.getElementById("kpiSpreadHint");
  const kpiItems = document.getElementById("kpiItems");
  const kpiItemsHint = document.getElementById("kpiItemsHint");

  const chart = document.getElementById("chart");
  const chartMeta = document.getElementById("chartMeta");
  const ctx = chart.getContext("2d");

  // Queries UI
  const btnLoadQueries = document.getElementById("btnLoadQueries");
  const queriesStatus = document.getElementById("queriesStatus");
  const queriesError = document.getElementById("queriesError");
  const queriesTbody = document.getElementById("queriesTbody");

  // Account UI
  const meInfo = document.getElementById("meInfo");

  // === HELPERS ===
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function setApiStatus(ok, text) {
    apiDot.classList.toggle("ok", !!ok);
    apiText.textContent = text;
  }

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function setError(el, msg) {
    if (!msg) { hide(el); el.textContent = ""; return; }
    el.textContent = msg;
    show(el);
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatMoneyUA(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "—";
    return num.toLocaleString("uk-UA");
  }

  function formatDateTimeUA(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("uk-UA", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
  }

  function getToken() {
    return localStorage.getItem(KEY_TOKEN) || "";
  }
  function getTokenType() {
    return localStorage.getItem(KEY_TOKEN_TYPE) || "bearer";
  }
  function setToken(token, type="bearer") {
    localStorage.setItem(KEY_TOKEN, token);
    localStorage.setItem(KEY_TOKEN_TYPE, type);
  }
  function clearToken() {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_TOKEN_TYPE);
  }

  function setLoggedInUI(isLoggedIn) {
    if (isLoggedIn) {
      hide(screenAuth);
      show(screenApp);
      show(btnLogout);
    } else {
      show(screenAuth);
      hide(screenApp);
      hide(btnLogout);
    }
  }

  function selectTab(route) {
    const setSel = (tab, on) => tab.setAttribute("aria-selected", on ? "true" : "false");
    setSel(tabMarket, route === "#market");
    setSel(tabQueries, route === "#queries");
    setSel(tabAccount, route === "#account");

    // pages
    const showMarket = route === "#market";
    const showQueries = route === "#queries";
    const showAccount = route === "#account";

    // Market page состоит из двух карточек (левая + правая)
    pageMarket.classList.toggle("hidden", !showMarket);
    pageSide.classList.toggle("hidden", !showMarket);

    pageQueries.classList.toggle("hidden", !showQueries);
    pageAccount.classList.toggle("hidden", !showAccount);
  }

  function routeTo(hash) {
    const allowed = ["#market", "#queries", "#account"];
    const h = allowed.includes(hash) ? hash : "#market";
    location.hash = h;
  }

  function ensureAuthOrRedirect() {
    const token = getToken();
    if (!token) {
      setLoggedInUI(false);
      routeTo("#market");
      return false;
    }
    setLoggedInUI(true);
    return true;
  }

  async function apiFetch(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    headers["accept"] = headers["accept"] || "application/json";

    const token = getToken();
    if (token) {
      const type = getTokenType();
      headers["authorization"] = `${(type || "bearer").charAt(0).toUpperCase() + (type || "bearer").slice(1)} ${token}`;
      // На всякий случай: многие бэки ожидают строго "Bearer"
      headers["authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}\n${text || res.statusText}`);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res.text();
  }

  // === API STATUS PING ===
  async function checkServer() {
    // Мы не знаем точно /health. Делаем "мягкую" проверку:
    // 1) пробуем открыть docs (часто есть), 2) fallback: лёгкий GET на корень.
    try {
      await fetch(`${API_BASE}/docs`, { method: "GET" });
      setApiStatus(true, "Сервер онлайн");
      return;
    } catch (_) {}
    try {
      await fetch(`${API_BASE}/`, { method: "GET" });
      setApiStatus(true, "Сервер онлайн");
      return;
    } catch (_) {}
    setApiStatus(false, "Сервер недоступний");
  }

  // === AUTH ===
  function showAuthMode(mode) {
    setError(authError, "");
    if (mode === "login") {
      btnShowLogin.classList.add("primary");
      btnShowRegister.classList.remove("primary");
      boxLogin.classList.remove("hidden");
      boxRegister.classList.add("hidden");
      authHint.textContent = "Введіть email і пароль.";
    } else {
      btnShowRegister.classList.add("primary");
      btnShowLogin.classList.remove("primary");
      boxRegister.classList.remove("hidden");
      boxLogin.classList.add("hidden");
      authHint.textContent = "Створіть акаунт, потім ми увійдемо автоматично.";
    }
  }

  async function login(email, password) {
    // OAuth2 password flow: form-url-encoded
    const body = new URLSearchParams();
    body.set("grant_type", "password");
    body.set("username", email);
    body.set("password", password);

    const res = await fetch(`${API_BASE}/auth/token`, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Не вдалося увійти.\nHTTP ${res.status}\n${t}`);
    }

    const data = await res.json();
    if (!data || !data.access_token) {
      throw new Error("Сервер не повернув токен доступу.");
    }

    setToken(data.access_token, data.token_type || "bearer");
    localStorage.setItem(KEY_EMAIL, email);
    return data;
  }

  async function register(full_name, email, password) {
    const payload = { email, full_name, password };
    const data = await apiFetch("/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return data;
  }

  function logout() {
    clearToken();
    setLoggedInUI(false);
    meInfo.textContent = "—";
  }

  // === MVP DATA: QUERIES ===
  async function loadTopQueries() {
    setError(queriesError, "");
    queriesStatus.textContent = "Завантаження…";
    queriesTbody.innerHTML = "";

    try {
      const data = await apiFetch("/analytics/top-search-queries?days=30&limit=50", { method: "GET" });
      const rows = Array.isArray(data) ? data : [];
      queriesStatus.textContent = rows.length ? `Знайдено: ${rows.length}` : "Поки що немає даних.";

      for (const item of rows) {
        const c = item.category || {};
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(item.query ?? "")}</td>
          <td>${escapeHtml(item.count ?? "")}</td>
          <td>${escapeHtml(c.name ?? "—")}</td>
          <td>${escapeHtml(typeof c.confidence === "number" ? c.confidence.toFixed(2) : "—")}</td>
          <td>${escapeHtml(c.source ?? "—")}</td>
        `;
        queriesTbody.appendChild(tr);
      }
      setApiStatus(true, "Сервер онлайн");
    } catch (err) {
      setError(queriesError, String(err));
      queriesStatus.textContent = "Помилка завантаження.";
      if (String(err).includes("401") || String(err).includes("403")) {
        logout();
      }
      setApiStatus(false, "Проблема з API");
    }
  }

  // === MVP DATA: MARKET HISTORY ===
  function resetMarketUI() {
    marketTbody.innerHTML = "";
    kpiLastMedian.textContent = "—";
    kpiLastTime.textContent = "—";
    kpiDeltaMedian.textContent = "—";
    kpiDeltaHint.textContent = "—";
    kpiSpread.textContent = "—";
    kpiSpreadHint.textContent = "—";
    kpiItems.textContent = "—";
    kpiItemsHint.textContent = "—";
    chartMeta.textContent = "—";
    drawChart([], [], [], []);
  }

  function drawChart(labels, median, p25, p75, metaText = "") {
    // Простая отрисовка: линии, авто-скейл
    const W = chart.width;
    const H = chart.height;

    ctx.clearRect(0, 0, W, H);

    // фон
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = "rgba(15,23,42,.08)";
    ctx.lineWidth = 1;
    for (let i=1;i<=4;i++){
      const y = (H/5)*i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const series = [
      { name:"P25", data:p25, stroke:"rgba(16,185,129,.95)" },
      { name:"Медіана", data:median, stroke:"rgba(37,99,235,.95)" },
      { name:"P75", data:p75, stroke:"rgba(15,23,42,.65)" }
    ];

    const all = [...median, ...p25, ...p75].filter(x => Number.isFinite(x));
    if (all.length < 2) {
      // подпись
      ctx.fillStyle = "rgba(100,116,139,.9)";
      ctx.font = "14px system-ui";
      ctx.fillText("Немає даних для графіка.", 14, 28);
      return;
    }

    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min) * 0.08 || 1;
    const yMin = min - pad;
    const yMax = max + pad;

    const n = Math.max(median.length, p25.length, p75.length);
    const x = (i) => 14 + (W - 28) * (n === 1 ? 0 : i / (n - 1));
    const y = (v) => {
      const t = (v - yMin) / (yMax - yMin);
      return (H - 18) - t * (H - 36);
    };

    // draw series
    for (const s of series) {
      const pts = s.data.map((v, i) => ({x:x(i), y:y(v)})).filter(p => Number.isFinite(p.y));
      if (pts.length < 2) continue;

      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i=1;i<pts.length;i++){
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }

    // legend
    ctx.font = "12px system-ui";
    ctx.fillStyle = "rgba(100,116,139,.95)";
    ctx.fillText(`Діапазон: ${formatMoneyUA(Math.round(yMin))} – ${formatMoneyUA(Math.round(yMax))}`, 14, H - 6);

    if (metaText) chartMeta.textContent = metaText;
  }

  function computeKpis(items) {
    // items: [{taken_at, items_count, median_price, p25_price, p75_price}]
    if (!items || items.length === 0) return;

    const last = items[0];                 // у нас часто последние идут сверху; но неизвестно
    const sorted = [...items].sort((a,b) => new Date(a.taken_at) - new Date(b.taken_at));
    const newest = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    const lastMedian = Number(newest.median_price);
    const lastP25 = Number(newest.p25_price);
    const lastP75 = Number(newest.p75_price);
    const lastItems = Number(newest.items_count);

    kpiLastMedian.textContent = Number.isFinite(lastMedian) ? formatMoneyUA(Math.round(lastMedian)) : "—";
    kpiLastTime.textContent = `Оновлено: ${formatDateTimeUA(newest.taken_at)}`;

    if (prev) {
      const prevMedian = Number(prev.median_price);
      const delta = (Number.isFinite(lastMedian) && Number.isFinite(prevMedian)) ? (lastMedian - prevMedian) : NaN;
      if (Number.isFinite(delta)) {
        const sign = delta > 0 ? "+" : "";
        kpiDeltaMedian.textContent = `${sign}${formatMoneyUA(Math.round(delta))}`;
        const pct = prevMedian ? (delta / prevMedian) * 100 : null;
        kpiDeltaHint.textContent = pct ? `Зміна ~${pct.toFixed(1)}% від попередньої точки` : "Зміна від попередньої точки";
      } else {
        kpiDeltaMedian.textContent = "—";
        kpiDeltaHint.textContent = "—";
      }
    } else {
      kpiDeltaMedian.textContent = "—";
      kpiDeltaHint.textContent = "Недостатньо точок для порівняння";
    }

    const spread = (Number.isFinite(lastP75) && Number.isFinite(lastP25)) ? (lastP75 - lastP25) : NaN;
    kpiSpread.textContent = Number.isFinite(spread) ? formatMoneyUA(Math.round(spread)) : "—";
    kpiSpreadHint.textContent = Number.isFinite(spread) ? "Вищий розкид = більше “розкидані” ціни" : "—";

    kpiItems.textContent = Number.isFinite(lastItems) ? formatMoneyUA(Math.round(lastItems)) : "—";
    kpiItemsHint.textContent = Number.isFinite(lastItems) ? "Обсяг пропозиції в моменті" : "—";
  }

  async function loadMarketHistory() {
    setError(marketError, "");
    marketStatus.textContent = "Завантаження…";
    marketTbody.innerHTML = "";

    const projectId = Number(projectIdEl.value);
    const limit = Number(limitEl.value || 30);
    const offset = Number(offsetEl.value || 0);
    const onlyValid = !!onlyValidEl.checked;

    if (!projectId || projectId < 1) {
      setError(marketError, "Будь ласка, вкажи ID проєкту.");
      marketStatus.textContent = "—";
      return;
    }

    // persist user prefs
    localStorage.setItem(KEY_PROJECT_ID, String(projectId));
    localStorage.setItem(KEY_LIMIT, String(limit));

    try {
      const url =
        `/olx/projects/${encodeURIComponent(projectId)}/market/history` +
        `?limit=${encodeURIComponent(limit)}` +
        `&offset=${encodeURIComponent(offset)}` +
        `&only_valid=${encodeURIComponent(onlyValid)}`;

      const data = await apiFetch(url, { method: "GET" });

      // ожидаем { total, limit, offset, items: [...] } или массив
      const items = Array.isArray(data) ? data : (data.items || []);
      const total = (data && typeof data.total === "number") ? data.total : items.length;

      marketStatus.textContent = `Показано: ${items.length} (усього: ${total})`;
      setApiStatus(true, "Сервер онлайн");

      // table rows (сортируем по времени по убыванию)
      const sorted = [...items].sort((a,b) => new Date(b.taken_at) - new Date(a.taken_at));

      for (const it of sorted) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(formatDateTimeUA(it.taken_at))}</td>
          <td>${escapeHtml(it.items_count ?? "—")}</td>
          <td>${escapeHtml(formatMoneyUA(it.median_price))}</td>
          <td>${escapeHtml(formatMoneyUA(it.p25_price))}</td>
          <td>${escapeHtml(formatMoneyUA(it.p75_price))}</td>
        `;
        marketTbody.appendChild(tr);
      }

      computeKpis(items);

      // chart data (по возрастанию времени)
      const asc = [...items].sort((a,b) => new Date(a.taken_at) - new Date(b.taken_at));
      const labels = asc.map(x => x.taken_at);
      const med = asc.map(x => Number(x.median_price));
      const p25 = asc.map(x => Number(x.p25_price));
      const p75 = asc.map(x => Number(x.p75_price));

      drawChart(labels, med, p25, p75, `${items.length} точок • проєкт #${projectId}`);

      // nav buttons
      btnPrev.disabled = offset <= 0;
      btnNext.disabled = offset + limit >= total;

    } catch (err) {
      setError(marketError, String(err));
      marketStatus.textContent = "Помилка завантаження.";
      resetMarketUI();

      if (String(err).includes("401") || String(err).includes("403")) {
        // token invalid -> logout
        logout();
      }
      setApiStatus(false, "Проблема з API");
    }
  }

  // === INIT DEFAULTS ===
  function loadPrefs() {
    const p = localStorage.getItem(KEY_PROJECT_ID);
    const l = localStorage.getItem(KEY_LIMIT);
    if (p) projectIdEl.value = p;
    if (l) limitEl.value = l;

    if (!limitEl.value) limitEl.value = "30";
    if (!offsetEl.value) offsetEl.value = "0";
    onlyValidEl.checked = true;
  }

  // === ROUTING ===
  function onHashChange() {
    const ok = ensureAuthOrRedirect();
    if (!ok) return;

    const hash = location.hash || "#market";
    selectTab(hash);

    // eager load per page (optional)
    if (hash === "#queries") {
      loadTopQueries().catch(()=>{});
    }
    if (hash === "#account") {
      const email = localStorage.getItem(KEY_EMAIL) || "—";
      meInfo.textContent = `Email: ${email}`;
    }
  }

  // === EVENTS ===
  tabMarket.addEventListener("click", () => routeTo("#market"));
  tabQueries.addEventListener("click", () => routeTo("#queries"));
  tabAccount.addEventListener("click", () => routeTo("#account"));
  window.addEventListener("hashchange", onHashChange);

  btnShowLogin.addEventListener("click", () => showAuthMode("login"));
  btnShowRegister.addEventListener("click", () => showAuthMode("register"));

  btnLogin.addEventListener("click", async () => {
    setError(authError, "");
    authHint.textContent = "Вхід…";
    btnLogin.disabled = true;
    try {
      const email = (loginEmail.value || "").trim();
      const password = loginPassword.value || "";
      if (!email || !password) throw new Error("Вкажи email і пароль.");
      await login(email, password);
     
