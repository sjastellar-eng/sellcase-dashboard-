/* SellCase Dashboard (Light SaaS UI)
 * - Views: market/queries/projects/account
 * - Auth: /auth/register (JSON), /auth/login (x-www-form-urlencoded), /auth/me (Bearer)
 * - OLX:  GET /olx/projects/
 *         GET /olx/projects/{id}/market/history?limit=&offset=&only_valid=
 * - Queries: GET /analytics/top-search-queries-with-category
 *            GET /analytics/top-search-queries
 */

(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ----------------------------
  // Storage keys
  // ----------------------------
  const S = {
    token: "sellcase_token",
    apiBase: "sellcase_api_base",
    lastProjectId: "sellcase_last_project_id",
    lastMetric: "sellcase_chart_metric",
    marketOffset: "sellcase_market_offset",
  };

  // ----------------------------
  // Elements (Top)
  // ----------------------------
  const apiDot = $("#apiDot");
  const apiText = $("#apiText");

  const tabs = $$(".tab");
  const views = {
    market: $("#viewMarket"),
    queries: $("#viewQueries"),
    projects: $("#viewProjects"),
    account: $("#viewAccount"),
  };

  // ----------------------------
  // Market elements
  // ----------------------------
  const selProject = $("#selProject");
  const inpLimit = $("#inpLimit");
  const inpOffset = $("#inpOffset");
  const chkOnlyValid = $("#chkOnlyValid");

  const btnLoadMarket = $("#btnLoadMarket");
  const btnPrev = $("#btnPrev");
  const btnNext = $("#btnNext");
  const marketMsg = $("#marketMsg");

  const kpiMedian = $("#kpiMedian");
  const kpiMedianSub = $("#kpiMedianSub");
  const kpiDeltaMedian = $("#kpiDeltaMedian");
  const kpiDeltaMedianSub = $("#kpiDeltaMedianSub");
  const kpiSpread = $("#kpiSpread");
  const kpiSpreadSub = $("#kpiSpreadSub");
  const kpiItems = $("#kpiItems");
  const kpiItemsSub = $("#kpiItemsSub");

  const marketTbody = $("#marketTbody");
  const chartCanvas = $("#chart");

  const btnMetricMedian = $("#btnMetricMedian");
  const btnMetricP25 = $("#btnMetricP25");
  const btnMetricP75 = $("#btnMetricP75");

  const inpApiBase = $("#inpApiBase");
  const inpToken = $("#inpToken");

  // ----------------------------
  // Queries elements
  // ----------------------------
  const selQueryMode = $("#selQueryMode");
  const inpQueriesLimit = $("#inpQueriesLimit");
  const btnLoadQueries = $("#btnLoadQueries");
  const queriesTbody = $("#queriesTbody");
  const queriesMsg = $("#queriesMsg");

  // ----------------------------
  // Projects elements
  // ----------------------------
  const btnReloadProjects = $("#btnReloadProjects");
  const projectsTbody = $("#projectsTbody");
  const projectsMsg = $("#projectsMsg");
  const inpProjectName = $("#inpProjectName");
  const btnCreateProject = $("#btnCreateProject");

  // ----------------------------
  // Account elements
  // ----------------------------
  const loginEmail = $("#loginEmail");
  const loginPass = $("#loginPass");
  const btnLogin = $("#btnLogin");

  const regName = $("#regName");
  const regEmail = $("#regEmail");
  const regPass = $("#regPass");
  const btnRegister = $("#btnRegister");

  const meLine = $("#meLine");
  const btnLogout = $("#btnLogout");
  const accountMsg = $("#accountMsg");

  // ----------------------------
  // State
  // ----------------------------
  let state = {
    token: localStorage.getItem(S.token) || "",
    apiBase: localStorage.getItem(S.apiBase) || "",
    projects: [],
    marketRows: [],
    metric: localStorage.getItem(S.lastMetric) || "median",
    offset: Number(localStorage.getItem(S.marketOffset) || "0"),
    lastHealthOk: false,
  };

  // ----------------------------
  // Helpers
  // ----------------------------
  function setApiStatus(ok, text) {
    apiDot.classList.remove("ok", "bad");
    apiDot.classList.add(ok ? "ok" : "bad");
    apiText.textContent = text;
  }

  function setMsg(el, text, isError = false) {
    if (!el) return;
    el.classList.remove("hide");
    el.textContent = text;
    el.style.borderColor = isError ? "rgba(226,59,59,.25)" : "rgba(47,107,255,.25)";
    el.style.background = isError
      ? "linear-gradient(180deg, rgba(226,59,59,.07), rgba(226,59,59,.02))"
      : "linear-gradient(180deg, rgba(47,107,255,.06), rgba(47,107,255,.02))";
  }

  function clearMsg(el) {
    if (!el) return;
    el.classList.add("hide");
    el.textContent = "";
  }

  function fmtMoney(v) {
    if (!Number.isFinite(v)) return "—";
    // UA formatting, keep it simple
    try {
      return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(v) + " ₴";
    } catch {
      return String(Math.round(v)) + " ₴";
    }
  }

  function fmtNum(v) {
    if (!Number.isFinite(v)) return "—";
    try {
      return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(v);
    } catch {
      return String(Math.round(v));
    }
  }

  function safeStr(v) {
    return (v === null || v === undefined) ? "" : String(v);
  }

  function pickFirst(obj, keys, def = undefined) {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return def;
  }

  function metricValue(row, metric) {
    if (!row) return NaN;
    if (metric === "median") return Number(pickFirst(row, ["median", "med", "p50"], NaN));
    if (metric === "p25") return Number(pickFirst(row, ["p25", "q25"], NaN));
    if (metric === "p75") return Number(pickFirst(row, ["p75", "q75"], NaN));
    return NaN;
  }

  function takenAt(row) {
    return pickFirst(row, ["taken_at", "takenAt", "ts", "created_at", "createdAt"], "");
  }

  function itemsCount(row) {
    return Number(pickFirst(row, ["items_count", "items", "count"], NaN));
  }

  function calcQuantile(sortedValues, q) {
    if (!sortedValues.length) return NaN;
    const pos = (sortedValues.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const a = sortedValues[base];
    const b = sortedValues[Math.min(base + 1, sortedValues.length - 1)];
    return a + rest * (b - a);
  }

  function setToken(t) {
    state.token = t || "";
    if (state.token) localStorage.setItem(S.token, state.token);
    else localStorage.removeItem(S.token);
    if (inpToken) inpToken.value = state.token ? `Bearer ${state.token}` : "";
  }

  function getApiBase() {
    // priority: input -> localStorage -> same origin
    const fromInput = inpApiBase && inpApiBase.value ? inpApiBase.value.trim() : "";
    const fromLS = state.apiBase || "";
    const base = fromInput || fromLS || window.location.origin;
    return base.replace(/\/+$/, "");
  }

  function setApiBase(v) {
    state.apiBase = (v || "").trim().replace(/\/+$/, "");
    if (state.apiBase) localStorage.setItem(S.apiBase, state.apiBase);
    else localStorage.removeItem(S.apiBase);
  }

  async function apiFetch(path, opts = {}) {
    const base = getApiBase();
    const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

    const headers = new Headers(opts.headers || {});
    headers.set("Accept", "application/json");

    // If body is plain object and not FormData, JSON it
    let body = opts.body;
    if (body && typeof body === "object" && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }

    // Auth
    const token = state.token;
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetch(url, { ...opts, headers, body });

    let data = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try { data = await res.json(); } catch { data = null; }
    } else {
      try { data = await res.text(); } catch { data = null; }
    }

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function humanApiError(e) {
    if (!e) return "Сталася помилка.";
    const st = e.status;

    // Friendly auth errors
    if (st === 401 || st === 403) {
      return "Потрібен вхід у акаунт. Перейдіть у «Акаунт» і увійдіть.";
    }
    if (st === 429) return "Занадто багато запитів. Спробуйте трохи пізніше.";
    if (st >= 500) return "Сервер тимчасово недоступний. Спробуйте пізніше.";

    // Try to show backend message
    const msg =
      (e.data && typeof e.data === "object" && (e.data.detail || e.data.message)) ||
      (typeof e.data === "string" ? e.data : "");
    return msg ? `Помилка: ${msg}` : "Помилка запиту. Перевірте дані.";
  }

  // ----------------------------
  // Views / Tabs
  // ----------------------------
  function switchView(name) {
    Object.entries(views).forEach(([k, el]) => {
      if (!el) return;
      el.classList.toggle("active", k === name);
    });
    tabs.forEach((t) => {
      const sel = t.getAttribute("data-view") === name;
      t.setAttribute("aria-selected", sel ? "true" : "false");
    });

    // small convenience: when entering Projects/Market, refresh if needed
    if (name === "projects") {
      // do nothing auto to avoid spamming, but we can show stored
    }
  }

  function bindTabs() {
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-view");
        if (v) switchView(v);
      });
    });
  }

  // ----------------------------
  // Health
  // ----------------------------
  async function checkHealth() {
    try {
      const data = await apiFetch("/health", { method: "GET" });
      // If backend returns something, just accept
      state.lastHealthOk = true;
      setApiStatus(true, "Сервер онлайн");
      return data;
    } catch (e) {
      state.lastHealthOk = false;
      setApiStatus(false, "Сервер недоступний");
      return null;
    }
  }

  // ----------------------------
  // Auth
  // ----------------------------
  async function loadMe() {
    if (!state.token) {
      meLine.textContent = "Не виконано вхід.";
      return null;
    }
    try {
      const me = await apiFetch("/auth/me", { method: "GET" });
      const email = pickFirst(me, ["email", "username"], "");
      const name = pickFirst(me, ["full_name", "fullName", "name"], "");
      meLine.textContent = [name, email].filter(Boolean).join(" — ") || "Вхід виконано.";
      clearMsg(accountMsg);
      return me;
    } catch (e) {
      meLine.textContent = "Не виконано вхід.";
      setToken("");
      setMsg(accountMsg, humanApiError(e), true);
      return null;
    }
  }

  async function register() {
    clearMsg(accountMsg);
    const payload = {
      email: (regEmail.value || "").trim(),
      full_name: (regName.value || "").trim(),
      password: regPass.value || "",
    };
    if (!payload.email || !payload.password) {
      setMsg(accountMsg, "Вкажіть email та пароль для реєстрації.", true);
      return;
    }
    try {
      await apiFetch("/auth/register", { method: "POST", body: payload });
      setMsg(accountMsg, "Акаунт створено. Тепер увійдіть (email + пароль).");
      // auto-fill login
      loginEmail.value = payload.email;
      loginPass.value = payload.password;
      switchView("account");
    } catch (e) {
      setMsg(accountMsg, humanApiError(e), true);
    }
  }

  async function login() {
    clearMsg(accountMsg);

    const username = (loginEmail.value || "").trim();
    const password = loginPass.value || "";
    if (!username || !password) {
      setMsg(accountMsg, "Вкажіть email та пароль для входу.", true);
      return;
    }

    try {
      const form = new URLSearchParams();
      form.set("username", username);
      form.set("password", password);
      // FastAPI OAuth2PasswordRequestForm expects x-www-form-urlencoded
      const base = getApiBase();
      const url = `${base}/auth/login`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: form.toString(),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }

      const token = pickFirst(data, ["access_token", "token"], "");
      if (!token) throw new Error("No token in response");

      setToken(token);
      setMsg(accountMsg, "Вхід виконано ✅");
      await loadMe();
      await loadProjects(true); // populate select right away
      switchView("market");
    } catch (e) {
      setMsg(accountMsg, humanApiError(e), true);
    }
  }

  function logout() {
    setToken("");
    meLine.textContent = "Не виконано вхід.";
    setMsg(accountMsg, "Ви вийшли з акаунту.");
  }

  // ----------------------------
  // Projects
  // ----------------------------
  function renderProjectsTable(rows) {
    projectsTbody.innerHTML = "";
    if (!rows || !rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" class="muted">Проєктів поки немає.</td>`;
      projectsTbody.appendChild(tr);
      return;
    }

    rows.forEach((p) => {
      const id = pickFirst(p, ["id", "project_id"], "");
      const name = pickFirst(p, ["name", "title"], "—");
      const isActive = pickFirst(p, ["is_active", "active"], true);
      const created = pickFirst(p, ["created_at", "createdAt"], "");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${safeStr(id)}</b></td>
        <td>${safeStr(name)}</td>
        <td>${isActive ? "Активний" : "Неактивний"}</td>
        <td class="muted">${safeStr(created).slice(0, 19).replace("T", " ")}</td>
      `;
      projectsTbody.appendChild(tr);
    });
  }

  function renderProjectsSelect(rows) {
    const current = localStorage.getItem(S.lastProjectId) || "";
    selProject.innerHTML = `<option value="">— Оберіть проєкт —</option>`;

    (rows || []).forEach((p) => {
      const id = pickFirst(p, ["id", "project_id"], "");
      const name = pickFirst(p, ["name", "title"], `Проєкт ${id}`);
      const opt = document.createElement("option");
      opt.value = String(id);
      opt.textContent = `${name} (ID ${id})`;
      selProject.appendChild(opt);
    });

    // Restore last selected if exists
    if (current) selProject.value = current;
  }

  async function loadProjects(silent = false) {
    if (!silent) projectsMsg.textContent = "Завантаження…";
    try {
      const list = await apiFetch("/olx/projects/", { method: "GET" });
      // backend may return list or {items:[]}
      const rows = Array.isArray(list) ? list : (list && (list.items || list.results)) || [];
      state.projects = rows;

      renderProjectsSelect(rows);
      renderProjectsTable(rows);

      if (!silent) projectsMsg.textContent = `Готово: ${rows.length}`;
      return rows;
    } catch (e) {
      if (!silent) projectsMsg.textContent = "Не вдалося завантажити.";
      // also show in market message
      marketMsg.textContent = humanApiError(e);
      return [];
    }
  }

  async function createProject() {
    projectsMsg.textContent = "";
    const name = (inpProjectName.value || "").trim();
    if (!name) {
      projectsMsg.textContent = "Вкажіть назву проєкту.";
      return;
    }
    try {
      await apiFetch("/olx/projects/", { method: "POST", body: { name } });
      projectsMsg.textContent = "Проєкт створено ✅";
      inpProjectName.value = "";
      await loadProjects(true);
      switchView("projects");
    } catch (e) {
      projectsMsg.textContent = humanApiError(e);
    }
  }

  // ----------------------------
  // Market
  // ----------------------------
  function resetMarketUI() {
    kpiMedian.textContent = "—";
    kpiDeltaMedian.textContent = "—";
    kpiSpread.textContent = "—";
    kpiItems.textContent = "—";

    kpiMedianSub.textContent = "Ціна, яка найкраще описує ринок.";
    kpiDeltaMedianSub.textContent = "Порівняння з попереднім періодом.";
    kpiSpreadSub.textContent = "Наскільки широкий “коридор” цін.";
    kpiItemsSub.textContent = "Скільки пропозицій у вибірці.";

    marketTbody.innerHTML = "";
    state.marketRows = [];
    drawChart([], state.metric);
  }

  function renderMarketTable(rows) {
    marketTbody.innerHTML = "";
    if (!rows || !rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="muted">Немає даних. Спробуйте інший проєкт або змініть “Зсув”.</td>`;
      marketTbody.appendChild(tr);
      return;
    }
    rows.forEach((r) => {
      const t = safeStr(takenAt(r)).slice(0, 19).replace("T", " ");
      const items = itemsCount(r);
      const med = metricValue(r, "median");
      const p25 = metricValue(r, "p25");
      const p75 = metricValue(r, "p75");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${t || "—"}</td>
        <td>${Number.isFinite(items) ? fmtNum(items) : "—"}</td>
        <td><b>${fmtMoney(med)}</b></td>
        <td>${fmtMoney(p25)}</td>
        <td>${fmtMoney(p75)}</td>
      `;
      marketTbody.appendChild(tr);
    });
  }

  function computeKpis(rows) {
    // Use last row for "last median" and items count if present.
    if (!rows || !rows.length) {
      return {
        lastMedian: NaN,
        deltaMedian: NaN,
        spread: NaN,
        items: NaN,
      };
    }

    // newest likely first or last depending on backend; we can sort by taken_at string
    const sorted = [...rows].sort((a, b) => safeStr(takenAt(a)).localeCompare(safeStr(takenAt(b))));
    const last = sorted[sorted.length - 1];
    const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

    const lastMed = metricValue(last, "median");
    const prevMed = prev ? metricValue(prev, "median") : NaN;

    // compute spread from last row's p75 - p25
    const lastP25 = metricValue(last, "p25");
    const lastP75 = metricValue(last, "p75");
    const spread = (Number.isFinite(lastP75) && Number.isFinite(lastP25)) ? (lastP75 - lastP25) : NaN;

    const items = itemsCount(last);

    let delta = NaN;
    if (Number.isFinite(lastMed) && Number.isFinite(prevMed)) delta = lastMed - prevMed;

    return {
      lastMedian: lastMed,
      deltaMedian: delta,
      spread,
      items,
    };
  }

  function applyKpis(k) {
    kpiMedian.textContent = fmtMoney(k.lastMedian);
    kpiDeltaMedian.textContent = Number.isFinite(k.deltaMedian)
      ? ((k.deltaMedian >= 0 ? "+" : "") + fmtMoney(k.deltaMedian).replace(" ₴", "") + " ₴")
      : "—";
    kpiSpread.textContent = fmtMoney(k.spread);
    kpiItems.textContent = Number.isFinite(k.items) ? fmtNum(k.items) : "—";

    if (!Number.isFinite(k.lastMedian)) {
      kpiMedianSub.textContent = "Немає достатньо даних.";
      kpiDeltaMedianSub.textContent = "—";
      kpiSpreadSub.textContent = "—";
      kpiItemsSub.textContent = "—";
    } else {
      kpiMedianSub.textContent = "Половина оголошень дешевші, половина — дорожчі.";
      kpiDeltaMedianSub.textContent = "Різниця з попереднім зрізом.";
      kpiSpreadSub.textContent = "Ціновий “коридор” на ринку.";
      kpiItemsSub.textContent = "Кількість оголошень у зрізі.";
    }
  }

  async function loadMarket() {
    clearMsg(queriesMsg);
    marketMsg.textContent = "Завантаження…";

    const projectId = selProject.value;
    if (!projectId) {
      marketMsg.textContent = "Оберіть проєкт.";
      return;
    }

    localStorage.setItem(S.lastProjectId, String(projectId));

    const limit = Math.max(5, Number(inpLimit.value || 30));
    const offset = Math.max(0, Number(inpOffset.value || 0));
    state.offset = offset;
    localStorage.setItem(S.marketOffset, String(offset));

    const onlyValid = chkOnlyValid.checked ? "true" : "false";

    try {
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        only_valid: onlyValid,
      });

      const data = await apiFetch(`/olx/projects/${encodeURIComponent(projectId)}/market/history?${qs.toString()}`, {
        method: "GET",
      });

      const rows = Array.isArray(data) ? data : (data && (data.items || data.results || data.rows)) || [];
      state.marketRows = rows;

      renderMarketTable(rows);
      applyKpis(computeKpis(rows));
      drawChart(rows, state.metric);

      marketMsg.textContent = rows.length ? `Готово: ${rows.length} точок` : "Немає даних для цього зсуву.";
    } catch (e) {
      resetMarketUI();
      marketMsg.textContent = humanApiError(e);
    }
  }

  function prevMarket() {
    const cur = Math.max(0, Number(inpOffset.value || 0));
    const next = Math.max(0, cur + Math.max(1, Number(inpLimit.value || 30)));
    inpOffset.value = String(next);
    loadMarket();
  }

  function nextMarket() {
    const cur = Math.max(0, Number(inpOffset.value || 0));
    const step = Math.max(1, Number(inpLimit.value || 30));
    const next = Math.max(0, cur - step);
    inpOffset.value = String(next);
    loadMarket();
  }

  function setMetric(metric) {
    state.metric = metric;
    localStorage.setItem(S.lastMetric, metric);

    // pressed UI
    const map = {
      median: btnMetricMedian,
      p25: btnMetricP25,
      p75: btnMetricP75,
    };
    Object.entries(map).forEach(([k, el]) => {
      if (!el) return;
      el.setAttribute("aria-pressed", k === metric ? "true" : "false");
    });

    drawChart(state.marketRows || [], metric);
  }

  // ----------------------------
  // Chart
  // ----------------------------
  function drawChart(rows, metric) {
    if (!chartCanvas) return;
    const canvas = chartCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // background
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    const pad = { l: 48, r: 14, t: 14, b: 28 };
    const W = rect.width - pad.l - pad.r;
    const H = rect.height - pad.t - pad.b;

    if (!rows || rows.length < 2) {
      ctx.fillStyle = "#5b667a";
      ctx.font = "13px system-ui";
      ctx.fillText("Недостатньо даних для графіка", pad.l, pad.t + 14);
      return;
    }

    // sort by time oldest -> newest
    const sorted = [...rows].sort((a, b) => safeStr(takenAt(a)).localeCompare(safeStr(takenAt(b))));
    const values = sorted
      .map((r) => metricValue(r, metric))
      .filter((v) => Number.isFinite(v));

    if (values.length < 2) {
      ctx.fillStyle = "#5b667a";
      ctx.font = "13px system-ui";
      ctx.fillText("Недостатньо числових даних", pad.l, pad.t + 14);
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
    ctx.fillText(`${fmtMoney(max)}`, 10, pad.t + 12);
    ctx.fillText(`${fmtMoney(min)}`, 10, pad.t + H);

    // line
    ctx.strokeStyle = "rgba(47,107,255,.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const xx = x(i);
      const yy = y(v);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    // points
    ctx.fillStyle = "rgba(47,107,255,.95)";
    values.forEach((v, i) => {
      const xx = x(i);
      const yy = y(v);
      ctx.beginPath();
      ctx.arc(xx, yy, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // title
    const title =
      metric === "median" ? "Медіана" :
      metric === "p25" ? "P25" : "P75";

    ctx.fillStyle = "#0b1220";
    ctx.font = "12px system-ui";
    ctx.fillText(title, pad.l, rect.height - 10);
  }

  // ----------------------------
  // Queries
  // ----------------------------
  async function loadQueries() {
    clearMsg(queriesMsg);
    const mode = selQueryMode.value || "with_category";
    const limit = Math.max(5, Number(inpQueriesLimit.value || 50));

    try {
      const endpoint =
        mode === "plain"
          ? "/analytics/top-search-queries"
          : "/analytics/top-search-queries-with-category";

      const qs = new URLSearchParams({ limit: String(limit) });
      const data = await apiFetch(`${endpoint}?${qs.toString()}`, { method: "GET" });

      const rows = Array.isArray(data) ? data : (data && (data.items || data.results || data.rows)) || [];
      queriesTbody.innerHTML = "";

      if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" class="muted">Немає даних.</td>`;
        queriesTbody.appendChild(tr);
        return;
      }

      rows.forEach((r) => {
        const q = pickFirst(r, ["query", "q", "text"], "—");
        const cnt = Number(pickFirst(r, ["count", "items", "n"], NaN));
        const cat = pickFirst(r, ["category", "cat"], mode === "plain" ? "—" : "");
        const score = pickFirst(r, ["score", "weight"], "");
        const src = pickFirst(r, ["source", "from"], "OLX");

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><b>${safeStr(q)}</b></td>
          <td>${Number.isFinite(cnt) ? fmtNum(cnt) : "—"}</td>
          <td>${safeStr(cat || "—")}</td>
          <td class="muted">${safeStr(score || "—")}</td>
          <td class="muted">${safeStr(src || "—")}</td>
        `;
        queriesTbody.appendChild(tr);
      });

    } catch (e) {
      setMsg(queriesMsg, humanApiError(e), true);
    }
  }

  // ----------------------------
  // Wiring
  // ----------------------------
  function bindMarket() {
    btnLoadMarket.addEventListener("click", loadMarket);
    btnPrev.addEventListener("click", prevMarket); // older
    btnNext.addEventListener("click", nextMarket); // newer

    // metric toggle
    btnMetricMedian.addEventListener("click", () => setMetric("median"));
    btnMetricP25.addEventListener("click", () => setMetric("p25"));
    btnMetricP75.addEventListener("click", () => setMetric("p75"));

    // persist api base input
    if (inpApiBase) {
      inpApiBase.value = state.apiBase || "";
      inpApiBase.addEventListener("change", () => setApiBase(inpApiBase.value));
      inpApiBase.addEventListener("blur", () => setApiBase(inpApiBase.value));
    }

    // token input is only for debug; accept "Bearer ..." or raw
    if (inpToken) {
      inpToken.value = state.token ? `Bearer ${state.token}` : "";
      inpToken.addEventListener("change", () => {
        const raw = (inpToken.value || "").trim();
        const t = raw.replace(/^Bearer\s+/i, "");
        setToken(t);
        loadMe();
      });
    }

    // restore stored offset
    if (state.offset && inpOffset) inpOffset.value = String(state.offset);

    // store when select changes
    selProject.addEventListener("change", () => {
      const v = selProject.value;
      if (v) localStorage.setItem(S.lastProjectId, v);
    });
  }

  function bindQueries() {
    btnLoadQueries.addEventListener("click", loadQueries);
  }

  function bindProjects() {
    btnReloadProjects.addEventListener("click", () => loadProjects(false));
    btnCreateProject.addEventListener("click", createProject);
  }

  function bindAccount() {
    btnRegister.addEventListener("click", register);
    btnLogin.addEventListener("click", login);
    btnLogout.addEventListener("click", logout);
  }

  // ----------------------------
  // Init
  // ----------------------------
  async function init() {
    bindTabs();
    bindMarket();
    bindQueries();
    bindProjects();
    bindAccount();

    // Default metric UI
    setMetric(state.metric);

    // Health check
    setApiStatus(false, "Перевірка сервера…");
    await checkHealth();

    // Try load me if token exists
    await loadMe();

    // Load projects (silently) so Market select fills
    await loadProjects(true);

    // If we have a selected project + token, keep market ready
    const lastPid = localStorage.getItem(S.lastProjectId) || "";
    if (lastPid) {
      selProject.value = lastPid;
    }

    // Keep offset in sync with stored
    if (inpOffset) {
      inpOffset.value = String(state.offset || 0);
    }

    // periodic health
    setInterval(checkHealth, 30000);
  }

  // start after DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
