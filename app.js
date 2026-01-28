/* SellCase SaaS Frontend (app.js)
 * Працює з бекендом:
 *  - GET  /health
 *  - POST /auth/register        (JSON: {email, full_name, password})
 *  - POST /auth/login           (x-www-form-urlencoded: username, password, grant_type=password)
 *  - GET  /auth/me              (Bearer token)
 *  - GET  /olx/projects/        (Bearer token)
 *  - GET  /olx/projects/{id}/market/history?limit=&offset=&only_valid=
 *  - GET  /analytics/top-search-queries?limit=
 *  - GET  /analytics/top-search-queries-with-category?limit=
 *
 * UI: українська, без “MVP”, без технічних слів для користувача.
 * Навігація: працює і з #/market і з #market.
 */

(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // -----------------------
  // Storage
  // -----------------------
  const S = {
    token: "sellcase_token",
    apiBase: "sellcase_api_base",
    lastProjectId: "sellcase_last_project_id",
    chartMetric: "sellcase_chart_metric", // typical | cheap | expensive
  };

  const state = {
    token: localStorage.getItem(S.token) || "",
    apiBase: localStorage.getItem(S.apiBase) || "",
    me: null,
    projects: [],
    marketRows: [],
    totalMarket: null,
    metric: localStorage.getItem(S.chartMetric) || "typical",
  };

  // -----------------------
  // Safe DOM helpers (не падаем, если id чуть другой)
  // -----------------------
  function pick(...ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  // Views (секції)
  const viewMarket   = pick("viewMarket", "screenMarket", "marketView");
  const viewQueries  = pick("viewQueries", "screenQueries", "queriesView");
  const viewProjects = pick("viewProjects", "screenProjects", "projectsView");
  const viewAccount  = pick("viewAccount", "screenAccount", "accountView");

  // Nav tabs (будь-які елементи з data-route)
  const navItems = $$("[data-route]");

  // Status
  const apiDot  = pick("apiDot");
  const apiText = pick("apiText");
  const btnLogout = pick("btnLogout");

  // Market controls
  const selProject  = pick("selProject", "projectSelect");
  const inpLimit    = pick("inpLimit", "limit");
  const inpOffset   = pick("inpOffset", "offset");
  const chkOnlyValid = pick("chkOnlyValid", "onlyValid");
  const btnLoadMarket = pick("btnLoadMarket", "btnMarketLoad");
  const btnPrev = pick("btnPrev", "btnPrevPage");
  const btnNext = pick("btnNext", "btnNextPage");
  const marketMsg = pick("marketMsg", "msgMarket");
  const marketTbody = pick("marketTbody", "tblMarketBody");

  // KPI
  const kpiTypical = pick("kpiLastMedian", "kpiTypicalPrice");
  const kpiTypicalSub = pick("kpiLastMedianSub", "kpiTypicalSub");
  const kpiDelta = pick("kpiDeltaMedian", "kpiDeltaTypical");
  const kpiDeltaSub = pick("kpiDeltaMedianSub", "kpiDeltaSub");
  const kpiRange = pick("kpiSpread", "kpiRange");
  const kpiRangeSub = pick("kpiSpreadSub", "kpiRangeSub");
  const kpiItems = pick("kpiItems", "kpiItemsCount");
  const kpiItemsSub = pick("kpiItemsSub", "kpiItemsSub");

  // Chart
  const chartCanvas = pick("chart", "marketChart");
  const chips = $$("[data-metric]"); // якщо є

  // Queries
  const inpQlimit = pick("inpQlimit", "qLimit");
  const selQmode  = pick("selQmode", "qMode");
  const btnLoadQueries = pick("btnLoadQueries", "btnQueriesLoad");
  const queriesMsg = pick("queriesMsg", "msgQueries");
  const queriesTbody = pick("queriesTbody", "tblQueriesBody");

  // Projects
  const btnReloadProjects = pick("btnReloadProjects", "btnProjectsReload");
  const projectsMsg = pick("projectsMsg", "msgProjects");
  const projectsTbody = pick("projectsTbody", "tblProjectsBody");

  // Account/auth
  const authEmail = pick("authEmail", "loginEmail");
  const authPass  = pick("authPass", "loginPassword");
  const authName  = pick("authName", "registerName");
  const btnLogin  = pick("btnLogin", "btnDoLogin");
  const btnRegister = pick("btnRegister", "btnDoRegister");
  const authMsg = pick("authMsg", "msgAuth");
  const meBox = pick("meBox", "meInfo");

  // Advanced (optional)
  const inpApiBase = pick("inpApiBase", "apiBase");
  const inpTokenManual = pick("inpTokenManual", "tokenManual");
  const btnSaveAdvanced = pick("btnSaveAdvanced", "btnSaveSettings");
  const btnClearToken = pick("btnClearToken", "btnClearToken");

  // -----------------------
  // Text / UX
  // -----------------------
  const UX = {
    explainAuthNeeded:
      "Ви не увійшли в систему. Перейдіть у «Акаунт», увійдіть і повторіть дію.",
    explainAccessDenied:
      "Немає доступу до даних. Перевірте, чи ви увійшли в акаунт, або спробуйте увійти знову.",
  };

  function showNote(el, text, kind = "note") {
    if (!el) return;
    el.classList.remove("hide");
    el.classList.remove("warn", "danger");
    if (kind === "warn") el.classList.add("warn");
    if (kind === "danger") el.classList.add("danger");
    el.textContent = text;
  }
  function hideNote(el) {
    if (!el) return;
    el.classList.add("hide");
    el.textContent = "";
  }

  function setApiStatus(ok, text) {
    if (!apiDot || !apiText) return;
    apiDot.classList.remove("ok", "bad");
    apiDot.classList.add(ok ? "ok" : "bad");
    apiText.textContent = text;
  }

  function fmtNum(x) {
    if (x === null || x === undefined || x === "") return "—";
    const n = Number(x);
    if (!Number.isFinite(n)) return String(x);
    return n.toLocaleString("uk-UA");
  }
  function fmtMoney(x) {
    if (x === null || x === undefined || x === "") return "—";
    const n = Number(x);
    if (!Number.isFinite(n)) return String(x);
    return n.toLocaleString("uk-UA");
  }
  function fmtISO(iso) {
    if (!iso) return "—";
    const s = String(iso);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    return m ? `${m[1]} ${m[2]}` : s;
  }
  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // -----------------------
  // API
  // -----------------------
  function apiBase() {
    const manual = (state.apiBase || "").trim();
    if (manual) return manual.replace(/\/+$/, "");
    return location.origin.replace(/\/+$/, "");
  }

  function authHeader() {
    const t = (state.token || "").trim();
    if (!t) return {};
    return { Authorization: /^Bearer\s+/i.test(t) ? t : `Bearer ${t}` };
  }

  async function apiFetch(path, opts = {}) {
    const url = apiBase() + path;

    const headers = {
      ...(opts.headers || {}),
      ...authHeader(),
    };

    const res = await fetch(url, { ...opts, headers });

    const ctype = res.headers.get("content-type") || "";
    let body = null;
    if (ctype.includes("application/json")) {
      try { body = await res.json(); } catch { body = null; }
    } else {
      try { body = await res.text(); } catch { body = null; }
    }

    if (!res.ok) {
      const msg =
        typeof body === "string"
          ? body
          : (body?.detail || body?.message || JSON.stringify(body));
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

    if (inpTokenManual) inpTokenManual.value = state.token;
    if (btnLogout) btnLogout.classList.toggle("hide", !state.token);
  }

  // -----------------------
  // Router (надійний)
  // -----------------------
  function normalizeHash(raw) {
    const h = (raw || "").trim();
    if (!h || h === "#") return "#/market";
    if (h === "#market") return "#/market";
    if (h === "#queries") return "#/queries";
    if (h === "#projects") return "#/projects";
    if (h === "#account") return "#/account";
    if (h.startsWith("#/")) return h;
    if (h.startsWith("#")) return "#/" + h.slice(1);
    return "#/market";
  }

  function showView(route) {
    const views = [viewMarket, viewQueries, viewProjects, viewAccount].filter(Boolean);
    views.forEach((v) => {
      v.style.display = "none";
      v.classList.remove("active");
      v.setAttribute("aria-hidden", "true");
    });

    const map = {
      "#/market": viewMarket,
      "#/queries": viewQueries,
      "#/projects": viewProjects,
      "#/account": viewAccount,
    };
    const target = map[route] || viewMarket || views[0];
    if (!target) return;
    target.style.display = "block";
    target.classList.add("active");
    target.setAttribute("aria-hidden", "false");
  }

  function setActiveNav(route) {
    navItems.forEach((el) => {
      const r = normalizeHash(el.getAttribute("data-route"));
      const active = r === route;
      el.setAttribute("aria-current", active ? "page" : "false");
      el.classList.toggle("active", active);
    });
  }

  function renderRoute() {
    const route = normalizeHash(location.hash);
    if (location.hash !== route) {
      history.replaceState(null, "", route);
    }
    showView(route);
    setActiveNav(route);
  }

  document.addEventListener("click", (e) => {
    const item = e.target.closest("[data-route]");
    if (!item) return;
    e.preventDefault();
    const r = normalizeHash(item.getAttribute("data-route"));
    location.hash = r;
    renderRoute();
  });

  window.addEventListener("hashchange", renderRoute);

  // -----------------------
  // Health
  // -----------------------
  async function checkHealth() {
    try {
      await apiFetch("/health");
      setApiStatus(true, "сервер працює");
    } catch {
      setApiStatus(false, "сервер недоступний");
    }
  }

  // -----------------------
  // Auth / Me
  // -----------------------
  async function loadMe() {
    if (!meBox) return;
    if (!state.token) {
      meBox.className = "note warn";
      meBox.textContent = "Ви ще не увійшли. Увійдіть, щоб бачити дані та проєкти.";
      return;
    }
    try {
      const me = await apiFetch("/auth/me");
      state.me = me;
      meBox.className = "note";
      meBox.textContent = `Ви увійшли як: ${me?.email || "—"} · ID: ${me?.id ?? "—"}`;
    } catch (e) {
      meBox.className = "note danger";
      meBox.textContent = `Не вдалося завантажити профіль: ${e.message}`;
    }
  }

  async function login(email, password) {
    const data = new URLSearchParams();
    data.set("username", email);
    data.set("password", password);
    data.set("grant_type", "password");

    const body = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: data.toString(),
    });

    const token = body?.access_token || body?.token || body?.jwt || "";
    if (!token) throw new Error("Бек не повернув access_token.");
    const tokenType = body?.token_type || "bearer";
    const full = /^bearer$/i.test(tokenType) ? `Bearer ${token}` : token;
    setToken(full);
    return body;
  }

  async function register(email, full_name, password) {
    return apiFetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name, password }),
    });
  }

  // -----------------------
  // Projects
  // -----------------------
  function extractProjectId(p) {
    return p?.id ?? p?.project_id ?? p?.projectId ?? null;
  }

  function projectTitle(p) {
    const id = extractProjectId(p);
    const name = p?.name || p?.title || p?.query || p?.keyword || "";
    return name ? `${name} (ID ${id})` : `Проєкт ID ${id}`;
  }

  function fillProjectSelect() {
    if (!selProject) return;
    selProject.innerHTML = "";

    if (state.projects.length > 0) {
      for (const p of state.projects) {
        const id = extractProjectId(p);
        const opt = document.createElement("option");
        opt.value = String(id);
        opt.textContent = projectTitle(p);
        selProject.appendChild(opt);
      }
    } else {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Немає проєктів (перейдіть у «Проєкти»)";
      selProject.appendChild(opt);
    }

    const last = localStorage.getItem(S.lastProjectId);
    if (last && [...selProject.options].some((o) => o.value === String(last))) {
      selProject.value = String(last);
    }
  }

  function renderProjectsTable() {
    if (!projectsTbody) return;
    projectsTbody.innerHTML = "";
    for (const p of state.projects) {
      const tr = document.createElement("tr");
      const id = extractProjectId(p);
      const name = p?.name || p?.title || p?.query || "—";
      const details = Object.keys(p || {}).slice(0, 6)
        .map((k) => `${k}: ${String(p[k])}`).join(" · ");

      tr.innerHTML = `
        <td class="mono">${escapeHtml(String(id ?? "—"))}</td>
        <td>${escapeHtml(String(name))}</td>
        <td class="small">${escapeHtml(details || "—")}</td>
      `;
      projectsTbody.appendChild(tr);
    }
  }

  async function loadProjects() {
    hideNote(projectsMsg);

    if (!state.token) {
      state.projects = [];
      fillProjectSelect();
      renderProjectsTable();
      showNote(projectsMsg, UX.explainAuthNeeded, "warn");
      return;
    }

    try {
      const body = await apiFetch("/olx/projects/");
      const items = Array.isArray(body) ? body : (body?.items || body?.projects || []);
      state.projects = items || [];
      fillProjectSelect();
      renderProjectsTable();
      if (state.projects.length) {
        showNote(projectsMsg, `Знайдено проєктів: ${state.projects.length}.`, "note");
      } else {
        showNote(projectsMsg, "Проєктів ще немає. Створіть проєкт (на бекенді) — і він зʼявиться тут.", "warn");
      }
    } catch (e) {
      state.projects = [];
      fillProjectSelect();
      renderProjectsTable();
      showNote(projectsMsg, `Не вдалося завантажити проєкти: ${e.message}`, "danger");
    }
  }

  // -----------------------
  // Market: normalizer
  // -----------------------
  function normalizeMarketResponse(body) {
    const rows = Array.isArray(body) ? body : (body?.items || body?.data || body?.rows || []);
    const total = Array.isArray(body) ? null : (body?.total ?? null);

    const norm = (rows || []).map((r) => ({
      taken_at: r?.taken_at || r?.takenAt || r?.ts || r?.time || r?.created_at || r?.createdAt,
      items_count: r?.items_count ?? r?.itemsCount ?? r?.count ?? r?.n,
      median: r?.median ?? r?.p50 ?? r?.m,
      p25: r?.p25 ?? r?.q25 ?? r?.low,
      p75: r?.p75 ?? r?.q75 ?? r?.high,
    }));

    return { rows: norm, total };
  }

  function getSelectedProjectId() {
    if (!selProject) return null;
    const v = (selProject.value || "").trim();
    if (!v) return null;
    localStorage.setItem(S.lastProjectId, v);
    return v;
  }

  function metricValue(row, metric) {
    if (metric === "cheap") return Number(row.p25);
    if (metric === "expensive") return Number(row.p75);
    return Number(row.median); // typical
  }

  function metricLabel(metric) {
    if (metric === "cheap") return "Дешевий сегмент";
    if (metric === "expensive") return "Дорогий сегмент";
    return "Типова ціна";
  }

  function setKpis(rows) {
    // KPI блоки мають бути “людські”
    if (!rows || !rows.length) {
      if (kpiTypical) kpiTypical.textContent = "—";
      if (kpiTypicalSub) kpiTypicalSub.textContent = "—";
      if (kpiDelta) kpiDelta.textContent = "—";
      if (kpiDeltaSub) kpiDeltaSub.textContent = "—";
      if (kpiRange) kpiRange.textContent = "—";
      if (kpiRangeSub) kpiRangeSub.textContent = "—";
      if (kpiItems) kpiItems.textContent = "—";
      if (kpiItemsSub) kpiItemsSub.textContent = "—";
      return;
    }

    // Бек часто віддає DESC (найновіше перше). Підстрахуємось:
    const sorted = [...rows].sort((a, b) => String(b.taken_at || "").localeCompare(String(a.taken_at || "")));
    const last = sorted[0];
    const prev = sorted[1] || null;

    const lastMedian = Number(last.median);
    const prevMedian = prev ? Number(prev.median) : null;

    const delta = (Number.isFinite(lastMedian) && Number.isFinite(prevMedian))
      ? (lastMedian - prevMedian)
      : null;

    const p25 = Number(last.p25);
    const p75 = Number(last.p75);
    const rangeText =
      Number.isFinite(p25) && Number.isFinite(p75)
        ? `від ${fmtMoney(p25)} до ${fmtMoney(p75)}`
        : "—";

    if (kpiTypical) kpiTypical.textContent = Number.isFinite(lastMedian) ? `${fmtMoney(lastMedian)} ₴` : "—";
    if (kpiTypicalSub) kpiTypicalSub.textContent = `Оновлено: ${fmtISO(last.taken_at)}`;

    if (kpiDelta) {
      if (delta === null) kpiDelta.textContent = "—";
      else kpiDelta.textContent = `${delta >= 0 ? "+" : ""}${fmtMoney(delta)} ₴`;
    }
    if (kpiDeltaSub) kpiDeltaSub.textContent = prev ? `Порівняння з: ${fmtISO(prev.taken_at)}` : "Недостатньо даних";

    if (kpiRange) kpiRange.textContent = rangeText;
    if (kpiRangeSub) kpiRangeSub.textContent =
      "Дешевий сегмент (25%) і дорогий сегмент (25%)";

    const ic = Number(last.items_count);
    if (kpiItems) kpiItems.textContent = Number.isFinite(ic) ? fmtNum(ic) : "—";
    if (kpiItemsSub) kpiItemsSub.textContent = "Скільки оголошень у вибірці";
  }

  function renderMarketTable(rows) {
    if (!marketTbody) return;
    marketTbody.innerHTML = "";
    const sorted = [...rows].sort((a, b) => String(b.taken_at || "").localeCompare(String(a.taken_at || "")));

    for (const r of sorted) {
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
  }

  // -----------------------
  // Simple chart (canvas)
  // -----------------------
  function drawChart(rows, metric) {
    if (!chartCanvas) return;

    const canvas = chartCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    const pad = { l: 46, r: 14, t: 14, b: 28 };
    const W = rect.width - pad.l - pad.r;
    const H = rect.height - pad.t - pad.b;

    if (!rows || rows.length < 2) {
      ctx.fillStyle = "#5b667a";
      ctx.font = "13px system-ui";
      ctx.fillText("Недостатньо даних для графіка", pad.l, pad.t + 18);
      return;
    }

    // oldest -> newest left->right
    const sorted = [...rows].sort((a, b) => String(a.taken_at || "").localeCompare(String(b.taken_at || "")));

    const values = sorted
      .map((r) => metricValue(r, metric))
      .filter((v) => Number.isFinite(v));

    if (values.length < 2) {
      ctx.fillStyle = "#5b667a";
      ctx.font = "13px system-ui";
      ctx.fillText("Недостатньо даних для графіка", pad.l, pad.t + 18);
      return;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = (max - min) || 1;

    const x = (i) => pad.l + (i / (values.length - 1)) * W;
    const y = (v) => pad.t + (1 - (v - min) / span) * H;

    // grid
    ctx.strokeStyle = "rgba(230,234,243,1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + (i / 4) * H;
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + W, yy);
    }
    ctx.stroke();

    // labels
    ctx.fillStyle = "#5b667a";
    ctx.font = "12px system-ui";
    ctx.fillText(`${fmtMoney(max)} ₴`, 10, pad.t + 12);
    ctx.fillTex
