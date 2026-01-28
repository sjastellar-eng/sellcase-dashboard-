/* SellCase Dashboard (Light SaaS UI)
 * - Auth: /auth/register (JSON), /auth/login (form-url-encoded), /auth/me (Bearer)
 * - Projects: GET /olx/projects/
 * - Market: GET /olx/projects/{id}/market/history?limit=&offset=&only_valid=
 * - Queries: GET /analytics/top-search-queries-with-category, /analytics/top-search-queries
 *
 * Designed to be resilient to small schema differences.
 */

(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // --- Storage keys
  const S = {
    token: "sellcase_token",
    apiBase: "sellcase_api_base",
    lastProjectId: "sellcase_last_project_id",
    lastMetric: "sellcase_chart_metric",
  };

  // --- Elements
  const apiDot = $("#apiDot");
  const apiText = $("#apiText");
  const btnLogout = $("#btnLogout");

  const viewMarket = $("#viewMarket");
  const viewQueries = $("#viewQueries");
  const viewProjects = $("#viewProjects");
  const viewAccount = $("#viewAccount");

  const selProject = $("#selProject");
  const inpLimit = $("#inpLimit");
  const inpOffset = $("#inpOffset");
  const chkOnlyValid = $("#chkOnlyValid");
  const btnLoadMarket = $("#btnLoadMarket");
  const btnPrev = $("#btnPrev");
  const btnNext = $("#btnNext");
  const marketMsg = $("#marketMsg");
  const marketTbody = $("#marketTbody");

  const kpiLastMedian = $("#kpiLastMedian");
  const kpiLastMedianSub = $("#kpiLastMedianSub");
  const kpiDeltaMedian = $("#kpiDeltaMedian");
  const kpiDeltaMedianSub = $("#kpiDeltaMedianSub");
  const kpiSpread = $("#kpiSpread");
  const kpiSpreadSub = $("#kpiSpreadSub");
  const kpiItems = $("#kpiItems");
  const kpiItemsSub = $("#kpiItemsSub");

  const chartCanvas = $("#chart");

  const inpApiBase = $("#inpApiBase");
  const inpTokenManual = $("#inpTokenManual");
  const btnSaveAdvanced = $("#btnSaveAdvanced");
  const btnClearToken = $("#btnClearToken");

  const inpQlimit = $("#inpQlimit");
  const selQmode = $("#selQmode");
  const btnLoadQueries = $("#btnLoadQueries");
  const queriesMsg = $("#queriesMsg");
  const queriesTbody = $("#queriesTbody");
  const qHeadRow = $("#qHeadRow");

  const btnReloadProjects = $("#btnReloadProjects");
  const projectsMsg = $("#projectsMsg");
  const projectsTbody = $("#projectsTbody");

  const authEmail = $("#authEmail");
  const authPass = $("#authPass");
  const authName = $("#authName");
  const btnLogin = $("#btnLogin");
  const btnRegister = $("#btnRegister");
  const authMsg = $("#authMsg");
  const meBox = $("#meBox");

  const btnDiag = $("#btnDiag");
  const diagBox = $("#diagBox");

  // --- State
  const state = {
    token: localStorage.getItem(S.token) || "",
    apiBase: localStorage.getItem(S.apiBase) || "",
    me: null,
    projects: [],
    marketRows: [],
    chartMetric: localStorage.getItem(S.lastMetric) || "median",
  };

  // --- Helpers
  function apiBase() {
    const manual = (state.apiBase || "").trim();
    if (manual) return manual.replace(/\/+$/, "");
    return location.origin.replace(/\/+$/, "");
  }

  function setApiStatus(ok, text) {
    apiDot.classList.remove("ok", "bad");
    apiDot.classList.add(ok ? "ok" : "bad");
    apiText.textContent = text;
  }

  function showNote(el, text, kind = "note") {
    el.classList.remove("hide");
    el.classList.remove("warn", "danger");
    if (kind === "warn") el.classList.add("warn");
    if (kind === "danger") el.classList.add("danger");
    el.textContent = text;
  }
  function hideNote(el) {
    el.classList.add("hide");
    el.textContent = "";
  }

  function fmtNum(x) {
    if (x === null || x === undefined || x === "") return "—";
    const n = Number(x);
    if (!Number.isFinite(n)) return String(x);
    return n.toLocaleString("uk-UA");
  }
  function fmtMoney(x) {
    if (x === null || x === undefined) return "—";
    const n = Number(x);
    if (!Number.isFinite(n)) return String(x);
    return n.toLocaleString("uk-UA");
  }
  function fmtISO(iso) {
    if (!iso) return "—";
    // Keep it simple: show YYYY-MM-DD HH:MM
    const s = String(iso);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    return m ? `${m[1]} ${m[2]}` : s;
  }

  function authHeader() {
    const t = (state.token || "").trim();
    if (!t) return {};
    // If user pasted without "Bearer", add it
    const hasBearer = /^Bearer\s+/i.test(t);
    return { Authorization: hasBearer ? t : `Bearer ${t}` };
  }

  async function apiFetch(path, opts = {}) {
    const url = apiBase() + path;
    const headers = {
      ...(opts.headers || {}),
      ...authHeader(),
    };

    const res = await fetch(url, {
      ...opts,
      headers,
    });

    const ctype = res.headers.get("content-type") || "";
    let body = null;
    if (ctype.includes("application/json")) {
      try { body = await res.json(); } catch { body = null; }
    } else {
      try { body = await res.text(); } catch { body = null; }
    }

    if (!res.ok) {
      const msg = typeof body === "string" ? body : (body?.detail || body?.message || JSON.stringify(body));
      const err = new Error(`HTTP ${res.status}: ${msg || "Request failed"}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  function setToken(t) {
    state.token = (t || "").trim();
    if (state.token) localStorage.setItem(S.token, state.token);
    else localStorage.removeItem(S.token);
    inpTokenManual.value = state.token;
    btnLogout.classList.toggle("hide", !state.token);
  }

  // --- Routing
  function setActiveRoute(route) {
    const map = {
      "#/market": viewMarket,
      "#/queries": viewQueries,
      "#/projects": viewProjects,
      "#/account": viewAccount,
    };
    Object.values(map).forEach(v => v.classList.remove("active"));
    (map[route] || viewMarket).classList.add("active");

    $$(".tab").forEach(btn => {
      const isActive = btn.dataset.route === route;
      btn.setAttribute("aria-current", isActive ? "page" : "false");
    });
  }

  function currentRoute() {
    const h = location.hash || "#/market";
    if (h.startsWith("#/")) return h;
    return "#/market";
  }

  function go(route) {
    location.hash = route;
  }

  // --- Init navigation
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => go(btn.dataset.route));
  });
  window.addEventListener("hashchange", () => setActiveRoute(currentRoute()));

  // --- Server health
  async function checkHealth() {
    try {
      await apiFetch("/health");
      setApiStatus(true, "сервер онлайн");
    } catch (e) {
      setApiStatus(false, "сервер недоступний");
    }
  }

  // --- Auth / Me
  async function loadMe() {
    if (!state.token) {
      state.me = null;
      meBox.className = "note warn";
      meBox.textContent = "Увійдіть, щоб побачити профіль.";
      return;
    }
    try {
      const me = await apiFetch("/auth/me");
      state.me = me;
      meBox.className = "note";
      meBox.textContent = `Ви увійшли як: ${me?.email || "—"}  ·  ID: ${me?.id ?? "—"}`;
    } catch (e) {
      state.me = null;
      meBox.className = "note danger";
      meBox.textContent = `Не вдалося завантажити профіль: ${e.message}`;
    }
  }

  async function login(email, password) {
    // Swagger screenshot shows x-www-form-urlencoded with fields username/password.
    const data = new URLSearchParams();
    data.set("username", email);
    data.set("password", password);
    data.set("grant_type", "password");

    const body = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: data.toString(),
    });

    // Expected: {access_token, token_type, user_id}
    const token = body?.access_token || body?.token || body?.jwt || "";
    if (!token) throw new Error("Бек не повернув токен (access_token).");
    const tokenType = body?.token_type || "bearer";
    const full = /^bearer$/i.test(tokenType) ? `Bearer ${token}` : token;
    setToken(full);
    return body;
  }

  async function register(email, full_name, password) {
    // Swagger shows JSON body: {email, full_name, password}
    const body = await apiFetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name, password }),
    });
    return body;
  }

  // --- Projects
  function projectLabel(p) {
    const id = p?.id ?? p?.project_id ?? p?.projectId ?? "";
    const name = p?.name || p?.title || p?.query || p?.keyword || "";
    if (name) return `${name} (ID ${id})`;
    return `Проєкт ID ${id}`;
  }

  function extractProjectId(p) {
    return p?.id ?? p?.project_id ?? p?.projectId ?? null;
  }

  function fillProjectSelect() {
    selProject.innerHTML = "";

    if (state.projects.length > 0) {
      state.projects.forEach(p => {
        const id = extractProjectId(p);
        const opt = document.createElement("option");
        opt.value = String(id);
        opt.textContent = projectLabel(p);
        selProject.appendChild(opt);
      });
    }

    // Fallback option: manual ID
    const optManual = document.createElement("option");
    optManual.value = "__manual__";
    optManual.textContent = "Ввести ID вручну…";
    selProject.appendChild(optManual);

    // Restore last selected
    const last = localStorage.getItem(S.lastProjectId);
    if (last && [...selProject.options].some(o => o.value === String(last))) {
      selProject.value = String(last);
    } else if (state.projects.length > 0) {
      selProject.value = String(extractProjectId(state.projects[0]));
    } else {
      selProject.value = "__manual__";
    }
  }

  async function loadProjects() {
    hideNote(projectsMsg);
    try {
      const body = await apiFetch("/olx/projects/");
      // could be {items:[...]} or just [...]
      const items = Array.isArray(body) ? body : (body?.items || body?.projects || []);
      state.projects = items || [];
      fillProjectSelect();
      renderProjectsTable();
      if (state.projects.length === 0) {
        showNote(projectsMsg, "Поки що немає проєктів. Створіть проєкт у бекенді або через endpoint POST /olx/projects/ (зараз у фронті ми це не показуємо, щоб не плодити зайвих полів).", "warn");
      } else {
        showNote(projectsMsg, `Знайдено проєктів: ${state.projects.length}.`, "note");
      }
    } catch (e) {
      showNote(projectsMsg, `Не вдалося завантажити проєкти: ${e.message}`, "danger");
      state.projects = [];
      fillProjectSelect();
      renderProjectsTable();
    }
  }

  function renderProjectsTable() {
    projectsTbody.innerHTML = "";
    for (const p of state.projects) {
      const tr = document.createElement("tr");
      const id = extractProjectId(p);
      const name = p?.name || p?.title || p?.query || "—";
      const details = Object.keys(p || {}).slice(0, 6).map(k => `${k}: ${String(p[k])}`).join(" · ");
      tr.innerHTML = `
        <td class="mono">${id ?? "—"}</td>
        <td>${escapeHtml(String(name))}</td>
        <td class="small">${escapeHtml(details || "—")}</td>
      `;
      projectsTbody.appendChild(tr);
    }
  }

  // --- Market
  function normalizeMarketRows(body) {
    // body can be: array OR {items:[...], total: N} OR {data:[...]}
    const rows = Array.isArray(body) ? body : (body?.items || body?.data || body?.rows || []);
    // normalize fields
    return (rows || []).map(r => ({
      taken_at: r?.taken_at || r?.takenAt || r?.ts || r?.time || r?.created_at || r?.createdAt,
      items_count: r?.items_count ?? r?.itemsCount ?? r?.count ?? r?.n,
      median: r?.median ?? r?.p50 ?? r?.m,
      p25: r?.p25 ?? r?.q25 ?? r?.low,
      p75: r?.p75 ?? r?.q75 ?? r?.high,
    }));
  }

  function getSelectedProjectId() {
    const v = selProject.value;
    if (v === "__manual__") {
      const manual = prompt("Введіть Project ID (число):");
      if (!manual) return null;
      const id = String(manual).trim();
      if (!id) return null;
      localStorage.setItem(S.lastProjectId, id);
      // Keep select at manual but remember id
      return id;
    }
    localStorage.setItem(S.lastProjectId, v);
    return v;
  }

  async function loadMarket() {
    hideNote(marketMsg);

    const pid = getSelectedProjectId();
    if (!pid) return;

    const limit = Math.max(1, Number(inpLimit.value || 30));
    const offset = Math.max(0, Number(inpOffset.value || 0));
    const onlyValid = chkOnlyValid.checked ? "true" : "false";

    try {
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        only_valid: onlyValid,
      });

      const body = await apiFetch(`/olx/projects/${encodeURIComponent(pid)}/market/history?` + qs.toString());
      const rows = normalizeMarketRows(body);

      state.marketRows = rows;
      renderMarket(rows);
      showNote(marketMsg, `Завантажено точок: ${rows.length}.`, "note");
    } catch (e) {
      // if 401/403, suggest going to account
      const isAuth = e.status === 401 || e.status === 403;
      showNote(
        marketMsg,
        isAuth
          ? `Потрібна авторизація (HTTP ${e.status}). Перейдіть у “Акаунт”, увійдіть і повторіть.`
          : `Не вдалося завантажити ринок: ${e.message}`,
        isAuth ? "warn" : "danger"
      );
      state.marketRows = [];
      renderMarket([]);
    }
  }

  function renderMarket(rows) {
    // Table
    marketTbody.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${escapeHtml(fmtISO(r.taken_at))}</td>
        <td>${fmtNum(r.items_count)}</td>
        <td>${fmtMoney(r.median)}</td>
        <td>${fmtMoney(r.p25)}</td>
        <td>${fmtMoney(r.p75)}</td>
      `;
      marketTbody.appendChild(tr);
    }

    // KPI
    if (!rows.length) {
      kpiLastMedian.textContent = "—";
      kpiLastMedianSub.textContent = "—";
      kpiDeltaMedian.textContent = "—";
      kpiDeltaMedianSub.textContent = "—";
      kpiSpread.textContent = "—";
      kpiSpreadSub.textContent = "—";
      kpiItems.textContent = "—";
      kpiItemsSub.textContent = "—";
      drawChart([], state.chartMetric);
      return;
    }

    const last = rows[0];          // assume backend returns DESC (newest first); if not, still okay
    const prev = rows[1] || null;

    const spread = (Number(last.p75) || 0) - (Number(last.p25) || 0);
    const delta = prev ? (Number(last.median) || 0) - (Number(prev.median) || 0) : null;

    kpiLastMedian.textContent = fmtMoney(last.median);
    kpiLastMedianSub.textContent = `Оновлено: ${fmtISO(last.taken_at)}`;

    kpiDeltaMedian.textContent = delta === null ? "—" : (delta >= 0 ? `+${fmtMoney(delta)}` : `${fmtMoney(delta)}`);
    kpiDeltaMedianSub.textContent = prev ? `Порівняння з: ${fmtISO(prev.taken_at)}` : "Недостатньо даних";

    kpiSpread.textContent = fmtMoney(spread);
    kpiSpreadSub.textContent = `P75: ${fmtMoney(last.p75)} · P25: ${fmtMoney(last.p25)}`;

    kpiItems.textContent = fmtNum(last.items_count);
    kpiItemsSub.textContent = "Кількість оголошень у вибірці";

    drawChart(rows, state.chartMetric);
  }

  // --- Simple line chart (canvas)
  function drawChart(rows, metric) {
    const canvas = chartCanvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // background
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    const pad = { l: 38, r: 14, t: 14, b: 26 };

    // if no data
    if (!rows || rows.length < 2) {
      ctx.fillStyle = "#5b667a";
      ctx.font = "13px system-ui";
      ctx.fillText("Немає даних для графіка", pad.l, pad.t + 18);
      return;
    }

    // We want oldest -> newest left->right
    const data = [...rows].reverse().map(r => {
      const v = Number(r[metric]);
      return Number.isFinite(v) ? v : null;
    }).filter(v => v !== null);

    if (data.length < 2) {
      ctx.fillStyle = "#5b667a";
      ctx.font = "13px system-ui";
      ctx.fillText("Немає даних для графіка", pad.l, pad.t + 18);
      return;
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = (max - min) || 1;

    const W = rect.width - pad.l - pad.r;
    const H = rect.height - pad.t - pad.b;

    function x(i) {
      return pad.l + (i / (data.length - 1)) * W;
    }
    function y(v) {
      return pad.t + (1 - (v - min) / span) * H;
    }

    // grid
    ctx.strokeStyle = "rgba(230,234,243,1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const lines = 4;
    for (let i = 0; i <= lines; i++) {
      const yy = pad.t + (i / lines) * H;
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + W, yy);
    }
    ctx.stroke();

    // axis labels (min/max)
    ctx.fillStyle = "#5b667a";
    ctx.font = "12px system-ui";
    ctx.fillText(fmtMoney(max), 10, pad.t + 12);
    ctx.fillText(fmtMoney(min), 10, pad.t + H);

    // line
    ctx.strokeStyle = "rgba(47,107,255,.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const xx = x(i);
      const yy = y(data[i]);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();

    // points
    ctx.fillStyle = "rgba(47,107,255,.95)";
    for (let i = 0; i < data.length; i++) {
      const xx = x(i);
      const yy = y(data[i]);
      ctx.beginPath();
      ctx.arc(xx, yy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Queries
  async function loadQueries() {
    hideNote(queriesMsg);
    queriesTbody.innerHTML = "";

    const limit = Math.max(1, Number(inpQlimit.value || 50));
    const mode = selQmode.value;

    try {
      let body;
      if (mode === "with_category") {
        body = await apiFetch(`/analytics/top-search-queries-with-category?limit=${encodeURIComponent(limit)}`);
      } else {
        body = await apiFetch(`/analytics/top-search-queries?limit=${encodeURIComponent(limit)}`);
      }

      const rows = Array.isArray(body) ? body : (body?.items || body?.data || []);
      renderQueries(rows, mode);
      showNote(queriesMsg, `Завантажено: ${rows.length}`, "note");
    } catch (e) {
      showNote(queriesMsg, `Не вдалося завантажити запити: ${e.message}`, "danger");
    }
  }

  function renderQueries(rows, mode) {
    // Head can remain same; we try best-effort mapping
    queriesTbody.innerHTML = "";
    for (const r of rows) {
      const query = r?.query || r?.text || r?.q || r?.keyword || "—";
      const count = r?.count ?? r?.items_count ?? r?.n ?? "—";
      const category = r?.category || r?.category_name || r?.cat || "—";
      const conf = r?.confidence ?? r?.score ?? r?.prob ?? "—";
      const src = r?.source || r?.src || "—";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(String(query))}</td>
        <td>${fmtNum(count)}</td>
        <td>${escapeHtml(String(category))}</td>
        <td>${escapeHtml(String(conf))}</td>
        <td>${escapeHtml(String(src))}</td>
      `;
      queriesTbody.appendChild(tr);
    }
  }

  // --- Advanced settings
  function loadAdvancedUI() {
    inpApiBase.value = state.apiBase;
    inpTokenManual.value = state.token;
  }

  btnSaveAdvanced.addEventListener("click", () => {
    state.apiBase = (inpApiBase.value || "").trim();
    if (state.apiBase) localStorage.setItem(S.apiBase, state.apiBase);
    else localStorage.removeItem(S.apiBase);

    // token manual (optional)
    const t = (inpTokenManual.value || "").trim();
    if (t) setToken(t);

    checkHealth();
  });

  btnClearToken.addEventListener("click", () => {
    setToken("");
    loadMe();
  });

  // --- Market controls
  btnLoadMarket.addEventListener("click", loadMarket);
  btnPrev.addEventListener("click", () 
