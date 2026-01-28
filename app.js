/* SellCase Dashboard – app.js (clean, working)
 * - Single API base in one place
 * - Hash navigation (#market/#queries/#projects/#account)
 * - Auth: /auth/register (JSON), /auth/login (x-www-form-urlencoded), /auth/me (Bearer)
 * - Projects + Market + Queries calls
 */

(() => {
  // -----------------------------
  // Config
  // -----------------------------
  const DEFAULT_API_BASE = "https://sellcase-backend.onrender.com";

  const LS = {
    token: "sellcase_token",
    apiBase: "sellcase_api_base",
    lastProjectId: "sellcase_last_project_id",
    lastMetric: "sellcase_last_metric",
  };

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

  function getApiBase() {
    // allow override by query param ?api=
    try {
      const url = new URL(window.location.href);
      const q = url.searchParams.get("api");
      if (q && q.trim()) {
        localStorage.setItem(LS.apiBase, q.trim());
        return q.trim();
      }
    } catch (_) {}

    const saved = (localStorage.getItem(LS.apiBase) || "").trim();
    return saved || DEFAULT_API_BASE;
  }

  function setApiBase(v) {
    const val = (v || "").trim();
    if (!val) {
      localStorage.removeItem(LS.apiBase);
      return DEFAULT_API_BASE;
    }
    localStorage.setItem(LS.apiBase, val);
    return val;
  }

  function getToken() {
    return (localStorage.getItem(LS.token) || "").trim();
  }

  function setToken(token) {
    if (token) localStorage.setItem(LS.token, token);
    else localStorage.removeItem(LS.token);
  }

  function fmtMoney(v) {
    if (v === null || v === undefined || v === "") return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    // UAH formatting (simple)
    return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 }) + " ₴";
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function show(el) { if (el) el.classList.remove("hide"); }
  function hide(el) { if (el) el.classList.add("hide"); }

  function setNote(el, type, msg) {
    // expects "note" element with optional type classes
    if (!el) return;
    el.classList.remove("hide");
    el.classList.remove("ok", "warn", "danger");
    if (type) el.classList.add(type);
    el.textContent = msg || "";
  }

  function clearNote(el) {
    if (!el) return;
    el.classList.add("hide");
    el.textContent = "";
    el.classList.remove("ok", "warn", "danger");
  }

  // -----------------------------
  // API helper
  // -----------------------------
  async function apiFetch(path, { method = "GET", headers = {}, body = null, auth = true } = {}) {
    const base = getApiBase().replace(/\/+$/, "");
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

    const h = new Headers(headers);
    if (auth) {
      const t = getToken();
      if (t) h.set("Authorization", `Bearer ${t}`);
    }

    const res = await fetch(url, { method, headers: h, body });

    // Parse JSON if possible
    let data = null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      try { data = await res.json(); } catch (_) {}
    } else {
      try { data = await res.text(); } catch (_) {}
    }

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  function humanApiError(err) {
    const status = err?.status;
    const data = err?.data;

    if (status === 401 || status === 403) {
      return "Немає доступу. Увійдіть у акаунт ще раз.";
    }

    // FastAPI validation errors
    if (data && typeof data === "object" && Array.isArray(data.detail)) {
      const first = data.detail[0];
      if (first?.msg) return `Помилка: ${first.msg}`;
      return "Помилка валідації даних.";
    }

    if (data && typeof data === "object" && data.detail) {
      return String(data.detail);
    }

    if (typeof data === "string" && data.trim()) return data;

    return "Помилка запиту. Перевірте дані та спробуйте ще раз.";
  }

  // -----------------------------
  // UI elements (optional – code won't crash if not found)
  // -----------------------------
  const el = {
    // status
    serverStatus: $("#serverStatus"),

    // nav
    navMarket: $("#navMarket"),
    navQueries: $("#navQueries"),
    navProjects: $("#navProjects"),
    navAccount: $("#navAccount"),

    // views
    viewMarket: $("#viewMarket"),
    viewQueries: $("#viewQueries"),
    viewProjects: $("#viewProjects"),
    viewAccount: $("#viewAccount"),

    // account/auth
    loginEmail: $("#loginEmail"),
    loginPassword: $("#loginPassword"),
    btnLogin: $("#btnLogin"),
    loginMsg: $("#loginMsg"),

    regName: $("#regName"),
    regEmail: $("#regEmail"),
    regPassword: $("#regPassword"),
    btnRegister: $("#btnRegister"),
    regMsg: $("#regMsg"),

    meBox: $("#meBox"),
    meMsg: $("#meMsg"),
    btnLogout: $("#btnLogout"),

    // api base setting
    apiBaseInput: $("#apiBase"),
    btnSaveApiBase: $("#btnSaveApiBase"),

    // projects
    btnLoadProjects: $("#btnLoadProjects"),
    inpProjectName: $("#inpProjectName"),
    btnCreateProject: $("#btnCreateProject"),
    projectsTbody: $("#projectsTbody"),
    projectsMsg: $("#projectsMsg"),

    // market
    selProject: $("#selProject"),
    inpQLimit: $("#inpQLimit"),
    inpOffset: $("#inpOffset"),
    chkOnlyValid: $("#chkOnlyValid"),
    btnLoadMarket: $("#btnLoadMarket"),
    btnPrev: $("#btnPrev"),
    btnNext: $("#btnNext"),
    marketMsg: $("#marketMsg"),
    marketTbody: $("#marketTbody"),

    kpiTypical: $("#kpiTypical"),
    kpiDelta: $("#kpiDelta"),
    kpiRange: $("#kpiRange"),
    kpiCount: $("#kpiCount"),

    chart: $("#chart"),

    // metric toggles
    metricBtns: $all("[data-metric]"),

    // queries
    selQMode: $("#selQMode"),
    btnLoadQueries: $("#btnLoadQueries"),
    queriesTbody: $("#queriesTbody"),
    queriesMsg: $("#queriesMsg"),
  };

  // -----------------------------
  // Navigation
  // -----------------------------
  const routes = ["market", "queries", "projects", "account"];

  function setActiveNav(route) {
    const map = {
      market: el.navMarket,
      queries: el.navQueries,
      projects: el.navProjects,
      account: el.navAccount,
    };
    Object.values(map).forEach(x => x?.classList?.remove("active"));
    map[route]?.classList?.add("active");
  }

  function showRoute(route) {
    const map = {
      market: el.viewMarket,
      queries: el.viewQueries,
      projects: el.viewProjects,
      account: el.viewAccount,
    };
    Object.values(map).forEach(v => hide(v));
    show(map[route] || el.viewMarket);
    setActiveNav(route);
  }

  function getRouteFromHash() {
    const h = (window.location.hash || "").replace("#", "").trim();
    return routes.includes(h) ? h : "market";
  }

  function go(route) {
    const r = routes.includes(route) ? route : "market";
    if (window.location.hash !== `#${r}`) window.location.hash = `#${r}`;
    showRoute(r);
  }

  function bindNav() {
    el.navMarket?.addEventListener("click", () => go("market"));
    el.navQueries?.addEventListener("click", () => go("queries"));
    el.navProjects?.addEventListener("click", () => go("projects"));
    el.navAccount?.addEventListener("click", () => go("account"));

    window.addEventListener("hashchange", () => {
      showRoute(getRouteFromHash());
    });
  }

  // -----------------------------
  // Server status
  // -----------------------------
  async function pingServer() {
    if (!el.serverStatus) return;
    try {
      await apiFetch("/health", { auth: false });
      el.serverStatus.classList.remove("bad");
      el.serverStatus.classList.add("ok");
      setText(el.serverStatus, "Сервер онлайн");
    } catch (_) {
      el.serverStatus.classList.remove("ok");
      el.serverStatus.classList.add("bad");
      setText(el.serverStatus, "Сервер недоступний");
    }
  }

  // -----------------------------
  // Auth / Me
  // -----------------------------
  async function loadMe({ silent = false } = {}) {
    clearNote(el.meMsg);
    if (!getToken()) {
      setText(el.meBox, "Не виконано вхід.");
      return null;
    }

    try {
      const me = await apiFetch("/auth/me", { method: "GET", auth: true });
      const email = me?.email || "—";
      const name = me?.full_name || "";
      setText(el.meBox, name ? `${name} (${email})` : email);
      return me;
    } catch (err) {
      // token invalid -> logout
      if (err?.status === 401 || err?.status === 403) {
        setToken("");
        setText(el.meBox, "Не виконано вхід.");
        if (!silent) setNote(el.meMsg, "warn", "Сесія закінчилась. Увійдіть ще раз.");
        return null;
      }
      if (!silent) setNote(el.meMsg, "danger", humanApiError(err));
      return null;
    }
  }

  async function doLogin() {
    clearNote(el.loginMsg);

    const email = (el.loginEmail?.value || "").trim();
    const password = (el.loginPassword?.value || "").trim();

    if (!email || !password) {
      setNote(el.loginMsg, "warn", "Вкажіть email та пароль.");
      return;
    }

    try {
      const form = new URLSearchParams();
      form.set("grant_type", "password");
      form.set("username", email);
      form.set("password", password);

      const data = await apiFetch("/auth/login", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      const token = data?.access_token;
      if (!token) throw new Error("No token in response");

      setToken(token);

      setNote(el.loginMsg, "ok", "Вхід виконано успішно.");
      await loadMe({ silent: true });

      // after login: refresh projects list everywhere
      await loadProjects({ silent: true });
      await fillProjectsDropdown();

    } catch (err) {
      setNote(el.loginMsg, "danger", humanApiError(err));
    }
  }

  async function doRegister() {
    clearNote(el.regMsg);

    const full_name = (el.regName?.value || "").trim();
    const email = (el.regEmail?.value || "").trim();
    const password = (el.regPassword?.value || "").trim();

    if (!email || !password || !full_name) {
      setNote(el.regMsg, "warn", "Заповніть ім’я, email та пароль.");
      return;
    }
    if (password.length < 8) {
      setNote(el.regMsg, "warn", "Пароль має бути мінімум 8 символів.");
      return;
    }

    try {
      await apiFetch("/auth/register", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, full_name, password }),
      });

      // success: show message, clear only registration fields
      setNote(el.regMsg, "ok", "Акаунт створено. Тепер увійдіть зі своїм email та паролем.");
      if (el.regName) el.regName.value = "";
      if (el.regEmail) el.regEmail.value = "";
      if (el.regPassword) el.regPassword.value = "";

    } catch (err) {
      setNote(el.regMsg, "danger", humanApiError(err));
    }
  }

  function doLogout() {
    setToken("");
    setText(el.meBox, "Не виконано вхід.");
    setNote(el.meMsg, "ok", "Ви вийшли з акаунту.");
  }

  function bindAuth() {
    el.btnLogin?.addEventListener("click", (e) => { e.preventDefault(); doLogin(); });
    el.btnRegister?.addEventListener("click", (e) => { e.preventDefault(); doRegister(); });
    el.btnLogout?.addEventListener("click", (e) => { e.preventDefault(); doLogout(); });

    // API base setting (optional)
    if (el.apiBaseInput) el.apiBaseInput.value = getApiBase();
    el.btnSaveApiBase?.addEventListener("click", (e) => {
      e.preventDefault();
      const v = setApiBase(el.apiBaseInput?.value || "");
      setNote(el.meMsg, "ok", `API збережено: ${v}`);
      pingServer();
    });
  }

  // -----------------------------
  // Projects
  // -----------------------------
  let cacheProjects = [];

  async function loadProjects({ silent = false } = {}) {
    if (!silent) clearNote(el.projectsMsg);
    if (!getToken()) {
      if (!silent) setNote(el.projectsMsg, "warn", "Увійдіть, щоб бачити проєкти.");
      return [];
    }
    try {
      const items = await apiFetch("/olx/projects/", { method: "GET", auth: true });
      cacheProjects = Array.isArray(items) ? items : (items?.items || []);
      if (!Array.isArray(cacheProjects)) cacheProjects = [];

      renderProjectsTable(cacheProjects);
      return cacheProjects;
    } catch (err) {
      if (!silent) setNote(el.projectsMsg, "danger", humanApiError(err));
      return [];
    }
  }

  function renderProjectsTable(projects) {
    if (!el.projectsTbody) return;
    el.projectsTbody.innerHTML = "";

    if (!projects || projects.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="padding:12px;color:#5b667a;">Поки що немає проєктів.</td>`;
      el.projectsTbody.appendChild(tr);
      return;
    }

    for (const p of projects) {
      const id = p?.id ?? p?.project_id ?? "";
      const name = p?.name ?? p?.title ?? "Проєкт";
      const created = p?.created_at ? String(p.created_at).slice(0, 19).replace("T", " ") : "—";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${name}</td>
        <td>${id}</td>
        <td>${created}</td>
        <td><button class="btn small" data-pick="${id}">Обрати</button></td>
      `;
      el.projectsTbody.appendChild(tr);
    }

    // pick buttons
    $all("[data-pick]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-pick");
        if (!id) return;
        localStorage.setItem(LS.lastProjectId, String(id));
        await fillProjectsDropdown();
        go("market");
      });
    });
  }

  async function createProject() {
    clearNote(el.projectsMsg);
    const name = (el.inpProjectName?.value || "").trim();
    if (!name) {
      setNote(el.projectsMsg, "warn", "Вкажіть назву проєкту.");
      return;
    }
    if (!getToken()) {
      setNote(el.projectsMsg, "warn", "Увійдіть, щоб створювати проєкти.");
      return;
    }

    try {
      await apiFetch("/olx/projects/", {
        method: "POST",
        auth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      setNote(el.projectsMsg, "ok", "Проєкт створено.");
      if (el.inpProjectName) el.inpProjectName.value = "";

      await loadProjects({ silent: true });
      await fillProjectsDropdown();
    } catch (err) {
      setNote(el.projectsMsg, "danger", humanApiError(err));
    }
  }

  function bindProjects() {
    el.btnLoadProjects?.addEventListener("click", (e) => { e.preventDefault(); loadProjects(); });
    el.btnCreateProject?.addEventListener("click", (e) => { e.preventDefault(); createProject(); });
  }

  async function fillProjectsDropdown() {
    if (!el.selProject) return;

    // ensure cache
    if (cacheProjects.length === 0 && getToken()) {
      await loadProjects({ silent: true });
    }

    const lastId = (localStorage.getItem(LS.lastProjectId) || "").trim();

    el.selProject.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Оберіть проєкт…";
    el.selProject.appendChild(opt0);

    for (const p of cacheProjects) {
      const id = String(p?.id ?? p?.project_id ?? "");
      const name = p?.name ?? p?.title ?? `Проєкт ${id}`;
      if (!id) continue;
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = name;
      el.selProject.appendChild(opt);
    }

    if (lastId) el.selProject.value = lastId;

    el.selProject.addEventListener("change", () => {
      const v = (el.selProject.value || "").trim();
      if (v) localStorage.setItem(LS.lastProjectId, v);
    }, { once: true });
  }

  // -----------------------------
  // Market
  // -----------------------------
  let marketRows = [];
  let currentMetric = (localStorage.getItem(LS.lastMetric) || "median").trim() || "median";

  function metricValue(row, metric) {
    const m = metric || "median";
    const map = {
      median: row?.median,
      p25: row?.p25,
      p75: row?.p75,
      items: row?.items_count,
    };
    const v = map[m];
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function computeKPIs(rows) {
    const last = rows?.[rows.length - 1] || null;

    const median = metricValue(last, "median");
    const p25 = metricValue(last, "p25");
    const p75 = metricValue(last, "p75");
    const items = metricValue(last, "items");

    const prev = rows?.length > 1 ? rows[rows.length - 2] : null;
    const prevMedian = prev ? metricValue(prev, "median") : null;

    setText(el.kpiTypical, fmtMoney(median));
    setText(el.kpiRange, (p75 !== null && p25 !== null) ? fmtMoney(p75 - p25) : "—");
    setText(el.kpiCount, (items !== null) ? String(Math.round(items)) : "—");
    setText(el.kpiDelta, (median !== null && prevMedian !== null) ? fmtMoney(median - prevMedian) : "—");
  }

  function renderMarketTable(rows) {
    if (!el.marketTbody) return;
    el.marketTbody.innerHTML = "";

    if (!rows || rows.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" style="padding:12px;color:#5b667a;">Немає даних для відображення.</td>`;
      el.marketTbody.appendChild(tr);
      return;
    }

    for (const r of rows) {
      const taken = r?.taken_at ? String(r.taken_at).slice(0, 19).replace("T", " ") : "—";
      const items = r?.items_count ?? "—";
      const med = fmtMoney(r?.median);
      const p25 = fmtMoney(r?.p25);
      const p75 = fmtMoney(r?.p75);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${taken}</td>
        <td>${items}</td>
        <td>${med}</td>
        <td>${p25}</td>
        <td>${p75}</td>
      `;
      el.marketTbody.appendChild(tr);
    }
  }

  function drawChart(rows, metric) {
    if (!el.chart) return;
    const canvas = el.chart;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!rows || rows.length < 2) {
      ctx.fillStyle = "#5b667a";
      ctx.font = "13px system-ui";
      ctx.fillText("Недостатньо даних для графіка", 14, 22);
      return;
    }

    const values = rows
      .map(r => metricValue(r, metric))
      .filter(v => Number.isFinite(v));

    if (values.length < 2) {
      ctx.fillStyle = "#5b667a";
      ctx.font = "13px system-ui";
      ctx.fillText("Недостатньо даних для графіка", 14, 22);
      return;
    }

    const pad = { l: 54, r: 14, t: 14, b: 28 };
    const W = rect.width - pad.l - pad.r;
    const H = rect.height - pad.t - pad.b;

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

    // labels min/max
    ctx.fillStyle = "#5b667a";
    ctx.font = "12px system-ui";
    ctx.fillText(fmtMoney(max), 10, pad.t + 12);
    ctx.fillText(fmtMoney(min), 10, pad.t + H);

    // line
    ctx.strokeStyle = "#2f6bff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const xx = x(i);
      const yy = y(v);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
  }

  async function loadMarket() {
    clearNote(el.marketMsg);

    const projectId = (el.selProject?.value || localStorage.getItem(LS.lastProjectId) || "").trim();
    if (!projectId) {
      setNote(el.marketMsg, "warn", "Оберіть проєкт.");
      return;
    }

    const limit = Number(el.inpQLimit?.value ?? 30) || 30;
    const offset = Number(el.inpOffset?.value ?? 0) || 0;
    const onlyValid = !!el.chkOnlyValid?.checked;

    if (!getToken()) {
      setNote(el.marketMsg, "warn", "Увійдіть, щоб переглядати ринок.");
      return;
    }

    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(limit));
      qs.set("offset", String(offset));
      qs.set("only_valid", onlyValid ? "true" : "false");

      const rows = await apiFetch(`/olx/projects/${encodeURIComponent(projectId)}/market/history?${qs.toString()}`, {
        method: "GET",
        auth: true,
      });

      marketRows = Array.isArray(rows) ? rows : (rows?.items || []);
      if (!Array.isArray(marketRows)) marketRows = [];

      // sort by taken_at if present
      marketRows.sort((a, b) => String(a?.taken_at || "").localeCompare(String(b?.taken_at || "")));

      computeKPIs(marketRows);
      renderMarketTable(marketRows);
      drawChart(marketRows, currentMetric);

      if (marketRows.length === 0) {
        setNote(el.marketMsg, "warn", "Дані не знайдено для цього проєкту/параметрів.");
      }
    } catch (err) {
      setNote(el.marketMsg, "danger", humanApiError(err));
    }
  }

  function bindMarket() {
    el.btnLoadMarket?.addEventListener("click", (e) => { e.preventDefault(); loadMarket(); });

    el.btnPrev?.addEventListener("click", (e) => {
      e.preventDefault();
      const limit = Number(el.inpQLimit?.value ?? 30) || 30;
      const cur = Number(el.inpOffset?.value ?? 0) || 0;
      const next = Math.max(0, cur - limit);
      if (el.inpOffset) el.inpOffset.value = String(next);
      loadMarket();
    });

    el.btnNext?.addEventListener("click", (e) => {
      e.preventDefault();
      const limit = Number(el.inpQLimit?.value ?? 30) || 30;
      const cur = Number(el.inpOffset?.value ?? 0) || 0;
      const next = cur + limit;
      if (el.inpOffset) el.inpOffset.value = String(next);
      loadMarket();
    });

    // metric toggles
    function setMetric(m) {
      currentMetric = m;
      localStorage.setItem(LS.lastMetric, m);
      el.metricBtns.forEach(b => b.classList.toggle("active", b.getAttribute("data-metric") === m));
      drawChart(marketRows, currentMetric);
    }

    el.metricBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const m = btn.getAttribute("data-metric");
        if (!m) return;
        setMetric(m);
      });
    });

    // init active metric
    if (el.metricBtns.length) {
      const has = el.metricBtns.some(b => b.getAttribute("data-metric") === currentMetric);
      if (!has) currentMetric = "median";
      el.metricBtns.forEach(b => b.classList.toggle("active", b.getAttribute("data-metric") === currentMetric));
    }
  }

  // -----------------------------
  // Queries
  // -----------------------------
  async function loadQueries() {
    clearNote(el.queriesMsg);
    if (!getToken()) {
      setNote(el.queriesMsg, "warn", "Увійдіть, щоб переглядати запити.");
      return;
    }

    const mode = (el.selQMode?.value || "plain").trim();

    // Prefer endpoint "top-search-queries-with-category" for with_category
    const path =
      mode === "with_category"
        ? "/analytics/top-search-queries-with-category"
        : "/analytics/top-search-queries";

    try {
      const data = await apiFetch(path, { method: "GET", auth: true });
      const rows = Array.isArray(data) ? data : (data?.items || []);
      renderQueries(rows);
      if (!rows || rows.length === 0) setNote(el.queriesMsg, "warn", "Немає даних для запитів.");
    } catch (err) {
      setNote(el.queriesMsg, "danger", humanApiError(err));
    }
  }

  function renderQueries(rows) {
    if (!el.queriesTbody) return;
    el.queriesTbody.innerHTML = "";

    if (!rows || rows.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" style="padding:12px;color:#5b667a;">Немає даних.</td>`;
      el.queriesTbody.appendChild(tr);
      return;
    }

    for (const r of rows) {
      const q = r?.query ?? r?.q ?? "—";
      const c = r?.count ?? r?.cnt ?? r?.items_count ?? "—";
      const cat = r?.category ?? r?.category_name ?? "—";
      const score = r?.score ?? r?.confidence ?? "—";
      const src = r?.source ?? "OLX";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${String(q)}</td>
        <td>${String(c)}</td>
        <td>${String(cat)}</td>
        <td>${String(score)}</td>
        <td>${String(src)}</td>
      `;
      el.queriesTbody.appendChild(tr);
    }
  }

  function bindQueries() {
    el.btnLoadQueries?.addEventListener("click", (e) => { e.preventDefault(); loadQueries(); });
  }

  // -----------------------------
  // Boot
  // -----------------------------
  async function boot() {
    bindNav();
    bindAuth();
    bindProjects();
    bindMarket();
    bindQueries();

    showRoute(getRouteFromHash());

    await pingServer();
    setInterval(pingServer, 20000);

    // initial
    if (el.apiBaseInput) el.apiBaseInput.value = getApiBase();

    await loadMe({ silent: true });
    await fillProjectsDropdown();

    // optional auto-load projects if logged in
    if (getToken()) {
      await loadProjects({ silent: true });
      await fillProjectsDropdown();
    }
  }

  // Run after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
