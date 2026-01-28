/* SellCase Dashboard — app.js (stable tabs + auth + market history)
 * API:
 *  - POST /auth/register (JSON): {email, full_name, password}
 *  - POST /auth/login (x-www-form-urlencoded): username, password, grant_type=password
 *  - GET  /auth/me (Bearer)
 *  - GET  /olx/projects/ (Bearer)
 *  - GET  /olx/projects/{id}/market/history?limit=&offset=&only_valid= (Bearer)
 */

(() => {
  // -----------------------
  // Helpers
  // -----------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const show = (el) => el && el.classList.remove("hide");
  const hide = (el) => el && el.classList.add("hide");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const STORAGE = {
    apiBase: "sellcase_api_base",
    token: "sellcase_token",
    lastTab: "sellcase_last_tab",
    lastProjectId: "sellcase_last_project_id",
    lastLimit: "sellcase_last_limit",
    lastOnlyValid: "sellcase_last_only_valid",
    lastOffset: "sellcase_last_offset",
    lastMetric: "sellcase_last_metric",
  };

  function getApiBase() {
    // 1) from localStorage (if you ever override)
    const saved = localStorage.getItem(STORAGE.apiBase);
    if (saved && saved.startsWith("http")) return saved.replace(/\/+$/, "");

    // 2) default
    return "https://sellcase-backend.onrender.com";
  }

  function setApiBase(url) {
    if (!url) return;
    localStorage.setItem(STORAGE.apiBase, url.replace(/\/+$/, ""));
  }

  function getToken() {
    return localStorage.getItem(STORAGE.token) || "";
  }

  function setToken(token) {
    if (!token) return;
    localStorage.setItem(STORAGE.token, token);
  }

  function clearToken() {
    localStorage.removeItem(STORAGE.token);
  }

  function fmtMoney(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    // show without forcing currency symbol (UAH/грн could be later)
    return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
  }

  function fmtNumber(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("uk-UA");
  }

  function safeText(el, text) {
    if (!el) return;
    el.textContent = text ?? "";
  }

  function setStatus(el, text, kind = "muted") {
    // kind can be: muted, ok, warn, danger
    if (!el) return;
    el.textContent = text;
    el.classList.remove("ok", "warn", "danger", "muted");
    el.classList.add(kind);
  }

  async function apiFetch(path, { method = "GET", token = true, headers = {}, body } = {}) {
    const base = getApiBase();
    const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

    const h = new Headers(headers);
    if (token) {
      const t = getToken();
      if (t) h.set("Authorization", t.startsWith("Bearer ") ? t : `Bearer ${t}`);
    }

    const res = await fetch(url, {
      method,
      headers: h,
      body,
    });

    const ct = res.headers.get("content-type") || "";
    let data = null;
    if (ct.includes("application/json")) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      try {
        data = await res.text();
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // -----------------------
  // Elements
  // -----------------------
  const views = {
    market: $("#viewMarket"),
    queries: $("#viewQueries"),
    projects: $("#viewProjects"),
    account: $("#viewAccount"),
  };

  const tabButtons = {
    market: $("#btnTabMarket"),
    queries: $("#btnTabQueries"),
    projects: $("#btnTabProjects"),
    account: $("#btnTabAccount"),
  };

  const serverDot = $("#serverDot");       // optional
  const serverText = $("#serverText");     // optional

  // Market
  const selProject = $("#selProject");
  const inpLimit = $("#inpLimit");
  const inpOffset = $("#inpOffset");
  const chkOnlyValid = $("#chkOnlyValid");
  const btnLoadMarket = $("#btnLoadMarket");
  const btnPrev = $("#btnPrev");
  const btnNext = $("#btnNext");
  const marketMsg = $("#marketMsg");
  const marketTbody = $("#marketTbody");

  const kpiTypical = $("#kpiTypical");
  const kpiTypicalSub = $("#kpiTypicalSub");
  const kpiDelta = $("#kpiDelta");
  const kpiDeltaSub = $("#kpiDeltaSub");
  const kpiRange = $("#kpiRange");
  const kpiRangeSub = $("#kpiRangeSub");
  const kpiCount = $("#kpiCount");
  const kpiCountSub = $("#kpiCountSub");

  const chartCanvas = $("#chart");

  // Account
  const loginEmail = $("#loginEmail");
  const loginPassword = $("#loginPassword");
  const btnLogin = $("#btnLogin");

  const regName = $("#regName");
  const regEmail = $("#regEmail");
  const regPassword = $("#regPassword");
  const btnRegister = $("#btnRegister");

  const meBox = $("#meBox");
  const btnLogout = $("#btnLogout");
  const authMsg = $("#authMsg");

  // -----------------------
  // Tabs (FIX: no form submit / no blank page)
  // -----------------------
  function setActiveTab(tab) {
    const canToggle =
      Object.values(views).filter(Boolean).length >= 2;

    if (canToggle) {
      Object.entries(views).forEach(([k, el]) => {
        if (!el) return;
        if (k === tab) show(el);
        else hide(el);
      });
    }

    Object.entries(tabButtons).forEach(([k, btn]) => {
      if (!btn) return;
      if (k === tab) btn.classList.add("active");
      else btn.classList.remove("active");
    });

    localStorage.setItem(STORAGE.lastTab, tab);
  }

  function normalizeTab(hash) {
    const h = (hash || "").replace("#", "").trim();
    if (["market", "queries", "projects", "account"].includes(h)) return h;
    return localStorage.getItem(STORAGE.lastTab) || "market";
  }

  function go(tab) {
    try {
      window.location.hash = `#${tab}`;
    } catch (_) {}
    setActiveTab(tab);
  }

  function bindTabs() {
    Object.entries(tabButtons).forEach(([tab, btn]) => {
      if (!btn) return;

      // CRITICAL: if it's <button> inside <form> and no type => submit => page refresh => blank
      if (btn.tagName === "BUTTON" && !btn.getAttribute("type")) {
        btn.setAttribute("type", "button");
      }

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        go(tab);
      });
    });

    window.addEventListener("hashchange", () => {
      setActiveTab(normalizeTab(window.location.hash));
    });

    setActiveTab(normalizeTab(window.location.hash));
  }

  // -----------------------
  // Server status (optional)
  // -----------------------
  async function checkServer() {
    if (!serverDot && !serverText) return;
    try {
      if (serverText) setStatus(serverText, "Перевірка сервера…", "muted");
      if (serverDot) serverDot.className = "dot muted";
      await apiFetch("/health", { token: false });
      if (serverText) setStatus(serverText, "Сервер онлайн", "ok");
      if (serverDot) serverDot.className = "dot ok";
    } catch {
      if (serverText) setStatus(serverText, "Сервер недоступний", "danger");
      if (serverDot) serverDot.className = "dot danger";
    }
  }

  // -----------------------
  // Auth
  // -----------------------
  function showAuthError(err) {
    if (!authMsg) return;
    let msg = "Помилка. Спробуйте ще раз.";
    if (err?.status === 401 || err?.status === 403) {
      msg = "Невірний email або пароль (або потрібен токен доступу).";
    } else if (err?.status === 422) {
      msg = "Перевірте введені дані (формат email, мінімум 8 символів у паролі).";
    } else if (err?.status >= 500) {
      msg = "Помилка сервера. Спробуйте пізніше.";
    }
    setStatus(authMsg, msg, "danger");
  }

  async function loadMe() {
    if (!meBox) return;
    const token = getToken();
    if (!token) {
      meBox.textContent = "Не виконано вхід.";
      return;
    }
    try {
      const me = await apiFetch("/auth/me", { token: true });
      const email = me?.email || "—";
      const name = me?.full_name || me?.fullName || "—";
      meBox.textContent = `${name} · ${email}`;
    } catch (e) {
      meBox.textContent = "Не виконано вхід.";
      // token may be expired/invalid
      if (e?.status === 401 || e?.status === 403) clearToken();
    }
  }

  async function login() {
    if (!loginEmail || !loginPassword) return;

    if (authMsg) setStatus(authMsg, "", "muted");

    const username = (loginEmail.value || "").trim();
    const password = loginPassword.value || "";
    if (!username || !password) {
      if (authMsg) setStatus(authMsg, "Вкажіть email та пароль.", "warn");
      return;
    }

    try {
      // x-www-form-urlencoded
      const params = new URLSearchParams();
      params.set("grant_type", "password");
      params.set("username", username);
      params.set("password", password);

      const data = await apiFetch("/auth/login", {
        method: "POST",
        token: false,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const access = data?.access_token;
      const tokenType = data?.token_type || "bearer";
      if (!access) throw new Error("No access_token");

      // store as Bearer
      setToken(`${tokenType} ${access}`);

      if (authMsg) setStatus(authMsg, "Успішний вхід ✅", "ok");

      await loadMe();
      await loadProjectsIntoSelect(); // refresh projects for market
      go("market");
    } catch (e) {
      showAuthError(e);
    }
  }

  async function register() {
    if (!regName || !regEmail || !regPassword) return;

    if (authMsg) setStatus(authMsg, "", "muted");

    const full_name = (regName.value || "").trim();
    const email = (regEmail.value || "").trim();
    const password = regPassword.value || "";

    if (!full_name || !email || password.length < 8) {
      if (authMsg) setStatus(authMsg, "Заповніть ім’я, email та пароль (мін. 8 символів).", "warn");
      return;
    }

    try {
      await apiFetch("/auth/register", {
        method: "POST",
        token: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, full_name, password }),
      });

      // IMPORTANT: your backend register DOES NOT return token (based on your screenshot),
      // so after register we do NOT auto-login silently.
      if (authMsg) setStatus(authMsg, "Акаунт створено ✅ Тепер увійдіть під своїм email і паролем.", "ok");

      // Do not auto-copy values to login (per your request)
      regPassword.value = "";
    } catch (e) {
      showAuthError(e);
    }
  }

  function logout() {
    clearToken();
    if (authMsg) setStatus(authMsg, "Ви вийшли з акаунту.", "muted");
    loadMe();
    // clear projects list
    if (selProject) {
      selProject.innerHTML = `<option value="">— Спочатку увійдіть —</option>`;
    }
    go("account");
  }

  function bindAuth() {
    if (btnLogin) {
      if (btnLogin.tagName === "BUTTON" && !btnLogin.getAttribute("type")) btnLogin.setAttribute("type", "button");
      btnLogin.addEventListener("click", (e) => {
        e.preventDefault();
        login();
      });
    }

    if (btnRegister) {
      if (btnRegister.tagName === "BUTTON" && !btnRegister.getAttribute("type")) btnRegister.setAttribute("type", "button");
      btnRegister.addEventListener("click", (e) => {
        e.preventDefault();
        register();
      });
    }

    if (btnLogout) {
      if (btnLogout.tagName === "BUTTON" && !btnLogout.getAttribute("type")) btnLogout.setAttribute("type", "button");
      btnLogout.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
      });
    }
  }

  // -----------------------
  // Projects
  // -----------------------
  async function loadProjectsIntoSelect() {
    if (!selProject) return;

    const token = getToken();
    if (!token) {
      selProject.innerHTML = `<option value="">— Увійдіть, щоб бачити проєкти —</option>`;
      return;
    }

    try {
      const list = await apiFetch("/olx/projects/", { token: true });
      const arr = Array.isArray(list) ? list : (list?.items || list?.projects || []);

      const last = localStorage.getItem(STORAGE.lastProjectId) || "";

      const options = arr.map((p) => {
        const id = p?.id ?? p?.project_id ?? p?.projectId;
        const name = p?.name ?? p?.title ?? `Проєкт #${id}`;
        return { id: String(id), name: String(name) };
      }).filter(x => x.id && x.id !== "undefined");

      if (options.length === 0) {
        selProject.innerHTML = `<option value="">Немає проєктів. Створіть проєкт у розділі “Проєкти”.</option>`;
        return;
      }

      selProject.innerHTML =
        `<option value="">— Оберіть проєкт —</option>` +
        options.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join("");

      // restore last selection if exists
      if (last && options.some(o => o.id === last)) {
        selProject.value = last;
      }
    } catch (e) {
      selProject.innerHTML = `<option value="">Помилка завантаження проєктів</option>`;
      if (marketMsg) setStatus(marketMsg, "Не вдалося завантажити проєкти. Перевірте вхід.", "danger");
      if (e?.status === 401 || e?.status === 403) clearToken();
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

  function bindProjects() {
    if (!selProject) return;
    selProject.addEventListener("change", () => {
      const v = selProject.value || "";
      if (v) localStorage.setItem(STORAGE.lastProjectId, v);
    });
  }

  // -----------------------
  // Market history
  // -----------------------
  function pickMetricRow(row) {
    // backend fields could vary; try common variants
    const median = row?.median ?? row?.p50 ?? row?.price_median ?? row?.median_price;
    const p25 = row?.p25 ?? row?.q25 ?? row?.price_p25;
    const p75 = row?.p75 ?? row?.q75 ?? row?.price_p75;
    const count = row?.items_count ?? row?.count ?? row?.items ?? row?.n;

    const taken_at = row?.taken_at ?? row?.created_at ?? row?.ts ?? row?.date;

    return {
      taken_at,
      median,
      p25,
      p75,
      count,
    };
  }

  function computeKpis(rows) {
    const cleaned = (rows || []).map(pickMetricRow);

    const last = cleaned[0] || null;
    const prev = cleaned[1] || null;

    const lastMedian = last ? Number(last.median) : NaN;
    const prevMedian = prev ? Number(prev.median) : NaN;

    const delta = (Number.isFinite(lastMedian) && Number.isFinite(prevMedian))
      ? lastMedian - prevMedian
      : NaN;

    const spread = last ? (Number(last.p75) - Number(last.p25)) : NaN;
    const items = last ? Number(last.count) : NaN;

    return {
      lastMedian,
      delta,
      spread,
      items,
      lastAt: last?.taken_at,
    };
  }

  function renderMarketTable(rows) {
    if (!marketTbody) return;
    marketTbody.innerHTML = "";

    const cleaned = (rows || []).map(pickMetricRow);

    for (const r of cleaned) {
      const tr = document.createElement("tr");

      const tdAt = document.createElement("td");
      tdAt.textContent = String(r.taken_at || "—");

      const tdCount = document.createElement("td");
      tdCount.textContent = fmtNumber(r.count);

      const tdMed = document.createElement("td");
      tdMed.textContent = fmtMoney(r.median);

      const td25 = document.createElement("td");
      td25.textContent = fmtMoney(r.p25);

      const td75 = document.createElement("td");
      td75.textContent = fmtMoney(r.p75);

      tr.appendChild(tdAt);
      tr.appendChild(tdCount);
      tr.appendChild(tdMed);
      tr.appendChild(td25);
      tr.appendChild(td75);

      marketTbody.appendChild(tr);
    }
  }

  function drawChart(rows) {
    if (!chartCanvas) return;

    const cleaned = (rows || []).map(pickMetricRow);

    const values = cleaned
      .map((r) => Number(r.median))
      .filter((v) => Number.isFinite(v));

    const canvas = chartCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(10, Math.floor(rect.width * dpr));
    canvas.height = Math.max(10, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // background
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (values.length < 2) {
      ctx.fillStyle = "#5b667a";
      ctx.font = "13px system-ui";
      ctx.fillText("Недостатньо даних для графіка", 12, 20);
      return;
    }

    const pad = { l: 40, r: 12, t: 12, b: 24 };
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

    // line
    ctx.strokeStyle = "rgba(47,111,255,1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const xx = x(i);
      const yy = y(v);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    // labels
    ctx.fillStyle = "#5b667a";
    ctx.font = "12px system-ui";
    ctx.fillText(`${fmtMoney(max)}`, 10, pad.t + 12);
    ctx.fillText(`${fmtMoney(min)}`, 10, pad.t + H);

    // last dot
    ctx.fillStyle = "rgba(47,111,255,1)";
    const lx = x(values.length - 1);
    const ly = y(values[values.length - 1]);
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  async function loadMarket() {
    if (!selProject || !inpLimit || !inpOffset || !chkOnlyValid) return;

    const projectId = selProject.value || localStorage.getItem(STORAGE.lastProjectId) || "";
    const limit = clampInt(inpLimit.value || localStorage.getItem(STORAGE.lastLimit) || "30", 5, 200);
    const offset = clampInt(inpOffset.value || localStorage.getItem(STORAGE.lastOffset) || "0", 0, 100000);
    const onlyValid = !!chkOnlyValid.checked;

    inpLimit.value = String(limit);
    inpOffset.value = String(offset);

    localStorage.setItem(STORAGE.lastLimit, String(limit));
    localStorage.setItem(STORAGE.lastOffset, String(offset));
    localStorage.setItem(STORAGE.lastOnlyValid, onlyValid ? "1" : "0");

    if (!projectId) {
      if (marketMsg) setStatus(marketMsg, "Оберіть проєкт.", "warn");
      return;
    }

    if (marketMsg) setStatus(marketMsg, "Завантаження…", "muted");

    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(limit));
      qs.set("offset", String(offset));
      qs.set("only_valid", onlyValid ? "true" : "false");

      const data = await apiFetch(`/olx/projects/${encodeURIComponent(projectId)}/market/history?${qs}`, { token: true });

      const rows = Array.isArray(data) ? data : (data?.items || data?.rows || []);
      renderMarketTable(rows);

      const kpi = computeKpis(rows);

      // KPI: typical price = median
      safeText(kpiTypical, fmtMoney(kpi.lastMedian));
      safeText(kpiTypicalSub, "Ціна, яка найкраще описує ринок (медіана).");

      safeText(kpiDelta, Number.isFinite(kpi.delta) ? `${kpi.delta > 0 ? "+" : ""}${fmtMoney(kpi.delta)}` : "—");
      safeText(kpiDeltaSub, "Зміна типовой ціни порівняно з попереднім періодом.");

      safeText(kpiRange, Number.isFinite(kpi.spread) ? fmtMoney(kpi.spread) : "—");
      safeText(kpiRangeSub, "Розкид цін: P75 − P25 (ширина “коридору”).");

      safeText(kpiCount, fmtNumber(kpi.items));
      safeText(kpiCountSub, "Скільки оголошень у вибірці.");

      drawChart(rows);

      if (marketMsg) setStatus(marketMsg, "Готово ✅", "ok");
    } catch (e) {
      if (e?.status === 401 || e?.status === 403) {
        if (marketMsg) setStatus(marketMsg, "Потрібен вхід (токен доступу). Перейдіть в “Акаунт” і увійдіть.", "danger");
        clearToken();
        await loadMe();
        await loadProjectsIntoSelect();
        go("account");
        return;
      }
      if (marketMsg) setStatus(marketMsg, "Помилка завантаження. Перевірте сервер або дані.", "danger");
      console.error(e);
    }
  }

  function clampInt(v, min, max) {
    const n = parseInt(String(v), 10);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function bindMarket() {
    // restore last values
    if (inpLimit) inpLimit.value = localStorage.getItem(STORAGE.lastLimit) || "30";
    if (inpOffset) inpOffset.value = localStorage.getItem(STORAGE.lastOffset) || "0";
    if (chkOnlyValid) chkOnlyValid.checked = (localStorage.getItem(STORAGE.lastOnlyValid) || "1") === "1";

    if (btnLoadMarket) {
      if (btnLoadMarket.tagName === "BUTTON" && !btnLoadMarket.getAttribute("type")) btnLoadMarket.setAttribute("type", "button");
      btnLoadMarket.addEventListener("click", (e) => {
        e.preventDefault();
        loadMarket();
      });
    }

    if (btnPrev) {
      if (btnPrev.tagName === "BUTTON" && !btnPrev.getAttribute("type")) btnPrev.setAttribute("type", "button");
      btnPrev.addEventListener("click", (e) => {
        e.preventDefault();
        const limit = clampInt(inpLimit?.value || "30", 5, 200);
        const offset = clampInt(inpOffset?.value || "0", 0, 100000);
        const nextOffset = Math.max(0, offset - limit);
        if (inpOffset) inpOffset.value = String(nextOffset);
        loadMarket();
      });
    }

    if (btnNext) {
      if (btnNext.tagName === "BUTTON" && !btnNext.getAttribute("type")) btnNext.setAttribute("type", "button");
      btnNext.addEventListener("click", (e) => {
        e.preventDefault();
        const limit = clampInt(inpLimit?.value || "30", 5, 200);
        const offset = clampInt(inpOffset?.value || "0", 0, 100000);
        const nextOffset = offset + limit;
        if (inpOffset) inpOffset.value = String(nextOffset);
        loadMarket();
      });
    }
  }

  // -----------------------
  // Boot
  // -----------------------
  async function boot() {
    // Make ALL buttons inside any form non-submit by default (extra safety)
    $$("form button:not([type])").forEach((b) => b.setAttribute("type", "button"));

    bindTabs();
    bindAuth();
    bindProjects();
    bindMarket();

    await checkServer();
    await loadMe();
    await loadProjectsIntoSelect();
  }

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
