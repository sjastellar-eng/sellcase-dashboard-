/* SellCase Dashboard - app.js (stable)
 * - API base configurable (DEFAULT_API_BASE or ?api=...)
 * - Auth: /auth/register (JSON), /auth/login (x-www-form-urlencoded), /auth/me (Bearer)
 * - Tabs routing by #hash: #market, #queries, #projects, #account
 * - Defensive: works even if some ids differ (uses data attributes as fallback)
 */

(() => {
  "use strict";

  // =========================
  // Config
  // =========================
  const DEFAULT_API_BASE = "https://sellcase-backend.onrender.com";

  const STORAGE = {
    token: "sellcase_token",
    lastTab: "sellcase_last_tab",
    lastProjectId: "sellcase_last_project_id",
  };

  // =========================
  // Helpers
  // =========================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function safeText(el, txt) {
    if (!el) return;
    el.textContent = txt ?? "";
  }

  function show(el) {
    if (!el) return;
    el.classList.remove("hide");
    el.style.display = "";
  }
  function hide(el) {
    if (!el) return;
    el.classList.add("hide");
    el.style.display = "none";
  }

  function toFormUrlEncoded(obj) {
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      p.append(k, String(v));
    });
    return p.toString();
  }

  function getApiBase() {
    // Priority:
    // 1) ?api=https://...
    // 2) <meta name="sellcase-api" content="...">
    // 3) DEFAULT_API_BASE
    try {
      const u = new URL(window.location.href);
      const api = u.searchParams.get("api");
      if (api && /^https?:\/\//i.test(api)) return api.replace(/\/$/, "");
    } catch (_) {}

    const meta = document.querySelector('meta[name="sellcase-api"]');
    if (meta?.content && /^https?:\/\//i.test(meta.content)) {
      return meta.content.replace(/\/$/, "");
    }

    return DEFAULT_API_BASE.replace(/\/$/, "");
  }

  const API_BASE = getApiBase();

  function setToken(token) {
    if (token) localStorage.setItem(STORAGE.token, token);
    else localStorage.removeItem(STORAGE.token);
  }

  function getToken() {
    return localStorage.getItem(STORAGE.token) || "";
  }

  function authHeaders() {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  async function apiFetch(path, { method = "GET", headers = {}, body } = {}) {
    const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...headers,
      },
      body,
    });

    const contentType = res.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
    } else {
      try {
        data = await res.text();
      } catch (_) {
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

  // Simple toast
  function toast(message, type = "info") {
    // Try to use #toast container if exists
    let wrap = $("#toastWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "toastWrap";
      wrap.style.position = "fixed";
      wrap.style.left = "12px";
      wrap.style.right = "12px";
      wrap.style.bottom = "12px";
      wrap.style.zIndex = "9999";
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.gap = "8px";
      document.body.appendChild(wrap);
    }

    const el = document.createElement("div");
    el.style.padding = "12px 14px";
    el.style.borderRadius = "14px";
    el.style.boxShadow = "0 10px 30px rgba(15,23,42,.12)";
    el.style.background = "#ffffff";
    el.style.border = "1px solid rgba(226,232,240,1)";
    el.style.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu";
    el.style.color = "#0b1220";
    el.style.display = "flex";
    el.style.justifyContent = "space-between";
    el.style.alignItems = "center";
    el.style.gap = "10px";

    const badge = document.createElement("span");
    badge.textContent =
      type === "ok" ? "✅" : type === "warn" ? "⚠️" : type === "err" ? "⛔" : "ℹ️";

    const text = document.createElement("div");
    text.textContent = message;

    const close = document.createElement("button");
    close.textContent = "×";
    close.type = "button";
    close.style.border = "0";
    close.style.background = "transparent";
    close.style.fontSize = "20px";
    close.style.lineHeight = "1";
    close.style.cursor = "pointer";
    close.style.color = "#64748b";

    close.onclick = () => el.remove();

    el.appendChild(badge);
    el.appendChild(text);
    el.appendChild(close);

    wrap.appendChild(el);
    setTimeout(() => {
      if (el.isConnected) el.remove();
    }, 4500);
  }

  // =========================
  // Elements (by id OR fallback data-*)
  // =========================

  // Server badge
  const elServerBadge = $("#serverBadge") || $("[data-server-badge]");
  const elServerDot = $("#serverDot") || $("[data-server-dot]");
  const elServerText = $("#serverText") || $("[data-server-text]");

  // Tabs buttons (ids OR [data-tab])
  const tabButtons = {
    market: $("#tabMarket") || $('[data-tab="market"]'),
    queries: $("#tabQueries") || $('[data-tab="queries"]'),
    projects: $("#tabProjects") || $('[data-tab="projects"]'),
    account: $("#tabAccount") || $('[data-tab="account"]'),
  };

  // Views / sections (ids OR [data-view])
  const views = {
    market: $("#viewMarket") || $('[data-view="market"]'),
    queries: $("#viewQueries") || $('[data-view="queries"]'),
    projects: $("#viewProjects") || $('[data-view="projects"]'),
    account: $("#viewAccount") || $('[data-view="account"]'),
  };

  // Account: login/register forms
  const inpLoginEmail = $("#inpLoginEmail") || $("[data-login-email]");
  const inpLoginPassword = $("#inpLoginPassword") || $("[data-login-password]");
  const btnLogin = $("#btnLogin") || $("[data-action='login']");

  const inpRegName = $("#inpRegName") || $("[data-reg-name]");
  const inpRegSurname = $("#inpRegSurname") || $("[data-reg-surname]");
  const inpRegEmail = $("#inpRegEmail") || $("[data-reg-email]");
  const inpRegPassword = $("#inpRegPassword") || $("[data-reg-password]");
  const btnRegister = $("#btnRegister") || $("[data-action='register']");

  const btnLogout = $("#btnLogout") || $("[data-action='logout']");

  const elMeBox = $("#meBox") || $("[data-me-box]");
  const elMeText = $("#meText") || $("[data-me-text]");
  const elAuthMsg = $("#authMsg") || $("[data-auth-msg]"); // for errors
  const elRegMsg = $("#regMsg") || $("[data-reg-msg]"); // for errors

  // Projects
  const btnLoadProjects = $("#btnLoadProjects") || $("[data-action='load-projects']");
  const projectsTbody = $("#projectsTbody") || $("[data-projects-body]");
  const btnCreateProject = $("#btnCreateProject") || $("[data-action='create-project']");
  const inpProjectName = $("#inpProjectName") || $("[data-project-name]");
  const inpProjectQuery = $("#inpProjectQuery") || $("[data-project-query]");

  // Market
  const selProject = $("#selProject") || $("[data-market-project]");
  const inpLimit = $("#inpLimit") || $("[data-market-limit]");
  const inpOffset = $("#inpOffset") || $("[data-market-offset]");
  const chkOnlyValid = $("#chkOnlyValid") || $("[data-market-onlyvalid]");
  const btnLoadMarket = $("#btnLoadMarket") || $("[data-action='load-market']");
  const btnPrev = $("#btnPrev") || $("[data-action='prev']");
  const btnNext = $("#btnNext") || $("[data-action='next']");

  const kpiMedian = $("#kpiMedian") || $("[data-kpi='median']");
  const kpiDelta = $("#kpiDelta") || $("[data-kpi='delta']");
  const kpiRange = $("#kpiRange") || $("[data-kpi='range']");
  const kpiItems = $("#kpiItems") || $("[data-kpi='items']");
  const marketTbody = $("#marketTbody") || $("[data-market-body]");
  const marketMsg = $("#marketMsg") || $("[data-market-msg]");

  // Queries
  const selQMode = $("#selQMode") || $("[data-queries-mode]");
  const btnLoadQueries = $("#btnLoadQueries") || $("[data-action='load-queries']");
  const queriesTbody = $("#queriesTbody") || $("[data-queries-body]");
  const queriesMsg = $("#queriesMsg") || $("[data-queries-msg]");

  // =========================
  // UI Text (explain metrics)
  // =========================
  function explainMetricsUA() {
    // Small inline helper you can reuse anywhere
    return {
      median:
        "Типова ціна (медіана): половина оголошень дешевші, половина — дорожчі. Не «ламається» одиничними дуже дорогими/дешевими цінами.",
      p25p75:
        "Діапазон (P75–P25): «коридор» цін. P25 — дешевше, ніж у 75% оголошень; P75 — дорожче, ніж у 75%. Чим більший діапазон — тим більше різняться ціни (часто потрібна сегментація: стан/комплектація/бренд).",
    };
  }

  function fmtMoney(v) {
    if (!Number.isFinite(v)) return "—";
    // UAH-like format (no forced currency sign)
    return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(v);
  }

  function pickNumber(obj, keys) {
    for (const k of keys) {
      const v = obj?.[k];
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  // =========================
  // Routing / Tabs
  // =========================
  function setActiveTab(tab) {
    Object.entries(views).forEach(([k, el]) => {
      if (!el) return;
      if (k === tab) show(el);
      else hide(el);
    });

    Object.entries(tabButtons).forEach(([k, btn]) => {
      if (!btn) return;
      if (k === tab) btn.classList.add("active");
      else btn.classList.remove("active");
    });

    localStorage.setItem(STORAGE.lastTab, tab);
  }

  function normalizeTab(hash) {
    const h = (hash || "").replace("#", "").trim();
    if (h === "market" || h === "queries" || h === "projects" || h === "account") return h;
    return localStorage.getItem(STORAGE.lastTab) || "market";
  }

  function go(tab) {
    window.location.hash = `#${tab}`;
    setActiveTab(tab);
  }

  function bindTabs() {
    Object.entries(tabButtons).forEach(([tab, btn]) => {
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        go(tab);
      });
    });

    window.addEventListener("hashchange", () => {
      setActiveTab(normalizeTab(window.location.hash));
    });

    setActiveTab(normalizeTab(window.location.hash));
  }

  // =========================
  // Server status
  // =========================
  async function checkServer() {
    try {
      await apiFetch("/health");
      if (elServerBadge) elServerBadge.style.opacity = "1";
      if (elServerDot) elServerDot.style.background = "#00b894";
      safeText(elServerText, "Сервер онлайн");
      return true;
    } catch (_) {
      if (elServerDot) elServerDot.style.background = "#e23b3b";
      safeText(elServerText, "Сервер недоступний");
      return false;
    }
  }

  // =========================
  // Auth
  // =========================
  async function loadMe() {
    if (!getToken()) {
      safeText(elMeText, "Не виконано вхід.");
      return null;
    }
    try {
      const me = await apiFetch("/auth/me", { headers: { ...authHeaders() } });
      safeText(elMeText, `${me?.full_name || me?.email || "Користувач"} (${me?.email || ""})`);
      return me;
    } catch (e) {
      // token expired / invalid
      setToken("");
      safeText(elMeText, "Не виконано вхід.");
      if (e?.status === 401 || e?.status === 403) {
        toast("Сесія закінчилась. Увійдіть знову.", "warn");
      }
      return null;
    }
  }

  async function doRegister() {
    hide(elRegMsg);

    const name = (inpRegName?.value || "").trim();
    const surname = (inpRegSurname?.value || "").trim();
    const email = (inpRegEmail?.value || "").trim();
    const password = inpRegPassword?.value || "";

    if (!email || !password) {
      if (elRegMsg) {
        elRegMsg.textContent = "Вкажіть email та пароль.";
        show(elRegMsg);
      } else {
        toast("Вкажіть email та пароль.", "warn");
      }
      return;
    }

    const full_name = [name, surname].filter(Boolean).join(" ").trim();

    try {
      await apiFetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          full_name: full_name || name || "Користувач",
          password,
        }),
      });

      // IMPORTANT: do not copy into login fields
      if (inpRegPassword) inpRegPassword.value = "";
      toast("Ви успішно зареєстровані. Тепер увійдіть.", "ok");

      // Switch to account tab and focus login
      go("account");
      setTimeout(() => {
        inpLoginEmail?.focus?.();
      }, 50);
    } catch (e) {
      const msg =
        e?.data?.detail ||
        (e?.status === 409 ? "Такий email вже існує." : null) ||
        "Помилка реєстрації. Перевірте дані.";
      if (elRegMsg) {
        elRegMsg.textContent = msg;
        show(elRegMsg);
      } else {
        toast(msg, "err");
      }
    }
  }

  async function doLogin() {
    hide(elAuthMsg);

    const email = (inpLoginEmail?.value || "").trim();
    const password = inpLoginPassword?.value || "";
    if (!email || !password) {
      const msg = "Вкажіть email та пароль.";
      if (elAuthMsg) {
        elAuthMsg.textContent = msg;
        show(elAuthMsg);
      } else {
        toast(msg, "warn");
      }
      return;
    }

    try {
      // Swagger shows x-www-form-urlencoded with username/password
      const body = toFormUrlEncoded({
        username: email,
        password,
        grant_type: "password",
      });

      const data = await apiFetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      const token = data?.access_token || "";
      if (!token) throw new Error("No token in response");

      setToken(token);
      if (inpLoginPassword) inpLoginPassword.value = "";
      toast("Вхід виконано.", "ok");

      await loadMe();
      await loadProjectsIntoSelect(); // refresh project list after login
      go("market");
    } catch (e) {
      const msg =
        e?.data?.detail ||
        (e?.status === 401 ? "Невірний email або пароль." : null) ||
        "Не вдалося увійти. Перевірте дані.";
      if (elAuthMsg) {
        elAuthMsg.textContent = msg;
        show(elAuthMsg);
      } else {
        toast(msg, "err");
      }
    }
  }

  function doLogout() {
    setToken("");
    toast("Ви вийшли з акаунта.", "ok");
    safeText(elMeText, "Не виконано вхід.");
    // Clear project select (will reload if user logs in)
    if (selProject) selProject.innerHTML = `<option value="">Оберіть проєкт…</option>`;
    go("account");
  }

  function bindAuth() {
    if (btnRegister) btnRegister.addEventListener("click", (e) => (e.preventDefault(), doRegister()));
    if (btnLogin) btnLogin.addEventListener("click", (e) => (e.preventDefault(), doLogin()));
    if (btnLogout) btnLogout.addEventListener("click", (e) => (e.preventDefault(), doLogout()));

    // Enter to submit login
    [inpLoginEmail, inpLoginPassword].forEach((el) => {
      if (!el) return;
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          doLogin();
        }
      });
    });

    // Enter to submit register
    [inpRegName, inpRegSurname, inpRegEmail, inpRegPassword].forEach((el) => {
      if (!el) return;
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          doRegister();
        }
      });
    });
  }

  // =========================
  // Projects
  // =========================
  function normalizeProjectId(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? String(n) : "";
  }

  function renderProjectsTable(list) {
    if (!projectsTbody) return;
    projectsTbody.innerHTML = "";
    (list || []).forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p?.id ?? ""}</td>
        <td>${escapeHtml(p?.name ?? "")}</td>
        <td>${escapeHtml(p?.query ?? "")}</td>
        <td>${escapeHtml(p?.created_at ?? "")}</td>
      `;
      projectsTbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadProjects() {
    if (!getToken()) {
      toast("Спочатку увійдіть в акаунт.", "warn");
      go("account");
      return [];
    }
    const list = await apiFetch("/olx/projects/", { headers: { ...authHeaders() } });
    // Some backends return {items:[...]} etc.
    const arr = Array.isArray(list) ? list : list?.items || list?.data || [];
    return arr;
  }

  async function loadProjectsIntoSelect() {
    if (!selProject) return;
    selProject.innerHTML = `<option value="">Оберіть проєкт…</option>`;

    if (!getToken()) return;

    try {
      const arr = await loadProjects();
      arr.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = String(p.id);
        opt.textContent = p.name ? `${p.name}` : `Проєкт #${p.id}`;
        selProject.appendChild(opt);
      });

      const last = normalizeProjectId(localStorage.getItem(STORAGE.lastProjectId));
      if (last) selProject.value = last;
    } catch (e) {
      // 401/403 typical when token missing
      if (e?.status === 401 || e?.status === 403) {
        toast("Потрібен вхід. Увійдіть, будь ласка.", "warn");
        go("account");
      } else {
        toast("Не вдалося завантажити проєкти.", "err");
      }
    }
  }

  async function onLoadProjectsClick() {
    try {
      const arr = await loadProjects();
      renderProjectsTable(arr);
      toast("Проєкти завантажено.", "ok");
      // also refresh dropdown
      await loadProjectsIntoSelect();
    } catch (e) {
      const msg = e?.data?.detail || "Не вдалося завантажити проєкти.";
      toast(msg, "err");
    }
  }

  async function onCreateProjectClick() {
    if (!getToken()) {
      toast("Спочатку увійдіть в акаунт.", "warn");
      go("account");
      return;
    }
    const name = (inpProjectName?.value || "").trim();
    const query = (inpProjectQuery?.value || "").trim();
    if (!name || !query) {
      toast("Заповніть назву та запит.", "warn");
      return;
    }

    try {
      await apiFetch("/olx/projects/", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name, query }),
      });
      toast("Проєкт створено.", "ok");
      if (inpProjectName) inpProjectName.value = "";
      if (inpProjectQuery) inpProjectQuery.value = "";
      await onLoadProjectsClick();
    } catch (e) {
      const msg = e?.data?.detail || "Не вдалося створити проєкт.";
      toast(msg, "err");
    }
  }

  function bindProjects() {
    if (btnLoadProjects) btnLoadProjects.addEventListener("click", (e) => (e.preventDefault(), onLoadProjectsClick()));
    if (btnCreateProject) btnCreateProject.addEventListener("click", (e) => (e.preventDefault(), onCreateProjectClick()));
  }

  // =========================
  // Market
  // =========================
  function ensurePrevNextInline() {
    // Force prev/next buttons in one row if they exist
    if (!btnPrev || !btnNext) return;

    const parent = btnPrev.parentElement;
    if (!parent) return;

    // If buttons are in different parents (as in your screenshot),
    // try to move them into the same row container near Load button.
    try {
      // Find a common action row container
      const actionRow =
        parent.closest(".actions") ||
        parent.closest(".row") ||
        parent.closest(".fieldRow") ||
        btnLoadMarket?.parentElement ||
        parent;

      // Make row flex
      actionRow.style.display = "flex";
      actionRow.style.flexWrap = "wrap";
      actionRow.style.gap = "10px";
      actionRow.style.alignItems = "center";

      // Ensure order: Load, Prev, Next
      if (btnLoadMarket && btnLoadMarket.parentElement !== actionRow) actionRow.appendChild(btnLoadMarket);
      if (btnPrev.parentElement !== actionRow) actionRow.appendChild(btnPrev);
      if (btnNext.parentElement !== actionRow) actionRow.appendChild(btnNext);
    } catch (_) {}
  }

  function currentMarketParams() {
    const projectId = normalizeProjectId(selProject?.value);
    const limit = Math.max(5, Math.min(200, Number(inpLimit?.value || 30)));
    const offset = Math.max(0, Number(inpOffset?.value || 0));
    const only_valid = !!(chkOnlyValid?.checked);
    return { projectId, limit, offset, only_valid };
  }

  function setOffset(v) {
    if (!inpOffset) return;
    inpOffset.value = String(Math.max(0, Number(v) || 0));
  }

  function renderMarket(rows) {
    if (!marketTbody) return;
    marketTbody.innerHTML = "";

    (rows || []).forEach((r) => {
      const taken_at = r?.taken_at || r?.ts || r?.created_at || "";
      const items = pickNumber(r, ["items_count", "count", "items", "n"]);
      const median = pickNumber(r, ["median", "med"]);
      const p25 = pickNumber(r, ["p25", "q25"]);
      const p75 = pickNumber(r, ["p75", "q75"]);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(String(taken_at))}</td>
        <td>${Number.isFinite(items) ? fmtMoney(items) : "—"}</td>
        <td>${Number.isFinite(median) ? fmtMoney(median) : "—"}</td>
        <td>${Number.isFinite(p25) ? fmtMoney(p25) : "—"}</td>
        <td>${Number.isFinite(p75) ? fmtMoney(p75) : "—"}</td>
      `;
      marketTbody.appendChild(tr);
    });
  }

  function renderKpis(rows) {
    const last = (rows || [])[0];
    const prev = (rows || [])[1];

    const lastMedian = pickNumber(last, ["median", "med"]);
    const prevMedian = pickNumber(prev, ["median", "med"]);

    const lastP25 = pickNumber(last, ["p25", "q25"]);
    const lastP75 = pickNumber(last, ["p75", "q75"]);
    const lastItems = pickNumber(last, ["items_count", "count", "items", "n"]);

    safeText(kpiMedian, Number.isFinite(lastMedian) ? fmtMoney(lastMedian) : "—");
    safeText(kpiItems, Number.isFinite(lastItems) ? fmtMoney(lastItems) : "—");

    const range = Number.isFinite(lastP75) && Number.isFinite(lastP25) ? (lastP75 - lastP25) : NaN;
    safeText(kpiRange, Number.isFinite(range) ? fmtMoney(range) : "—");

    const delta = Number.isFinite(lastMedian) && Number.isFinite(prevMedian) ? (lastMedian - prevMedian) : NaN;
    const sign = Number.isFinite(delta) ? (delta > 0 ? "+" : "") : "";
    safeText(kpiDelta, Number.isFinite(delta) ? `${sign}${fmtMoney(delta)}` : "—");
  }

  async function loadMarket() {
    if (!getToken()) {
      toast("Спочатку увійдіть в акаунт.", "warn");
      go("account");
      return;
    }

    const { projectId, limit, offset, only_valid } = currentMarketParams();
    if (!projectId) {
      toast("Оберіть проєкт.", "warn");
      return;
    }

    localStorage.setItem(STORAGE.lastProjectId, projectId);

    // UI msg
    if (marketMsg) {
      marketMsg.textContent = "Завантажуємо дані…";
      show(marketMsg);
    }

    try {
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        only_valid: String(only_valid),
      }).toString();

      const data = await apiFetch(`/olx/projects/${projectId}/market/history?${qs}`, {
        headers: { ...authHeaders() },
      });

      const rows = Array.isArray(data) ? data : data?.items || data?.data || [];
      // Assume backend returns newest first; if not, we still show as is.
      renderKpis(rows);
      renderMarket(rows);

      if (marketMsg) hide(marketMsg);
      toast("Ринок завантажено.", "ok");
    } catch (e) {
      const msg =
        (e?.status === 401 || e?.status === 403)
          ? "Потрібен вхід (токен). Увійдіть у вкладці «Акаунт»."
          : e?.data?.detail || "Не вдалося завантажити ринок.";
      if (marketMsg) {
        marketMsg.textContent = msg;
        show(marketMsg);
      }
      toast(msg, "err");
    }
  }

  function bindMarket() {
    if (btnLoadMarket) btnLoadMarket.addEventListener("click", (e) => (e.preventDefault(), loadMarket()));

    if (btnPrev) {
      btnPrev.addEventListener("click", (e) => {
        e.preventDefault();
        const { limit, offset } = currentMarketParams();
        setOffset(Math.max(0, offset + limit));
        loadMarket();
      });
    }

    if (btnNext) {
      btnNext.addEventListener("click", (e) => {
        e.preventDefault();
        const { limit, offset } = currentMarketParams();
        setOffset(Math.max(0, offset - limit));
        loadMarket();
      });
    }

    if (selProject) {
      selProject.addEventListener("change", () => {
        const v = normalizeProjectId(selProject.value);
        if (v) localStorage.setItem(STORAGE.lastProjectId, v);
      });
    }

    ensurePrevNextInline();
  }

  // =========================
  // Queries
  // =========================
  async function loadQueries() {
    if (!getToken()) {
      toast("Спочатку увійдіть в акаунт.", "warn");
      go("account");
      return;
    }

    if (queriesMsg) {
      queriesMsg.textContent = "Завантажуємо запити…";
      show(queriesMsg);
    }

    try {
      const mode = selQMode?.value || "with_category";
      const path =
        mode === "plain"
          ? "/analytics/top-search-queries"
          : "/analytics/top-search-queries-with-category";

      const data = await apiFetch(path, { headers: { ...authHeaders() } });
      const rows = Array.isArray(data) ? data : data?.items || data?.data || [];

      if (queriesTbody) {
        queriesTbody.innerHTML = "";
        rows.forEach((r) => {
          const q = r?.query || r?.text || r?.q || "";
          const count = r?.count || r?.items || r?.n || "";
          const category = r?.category || r?.cat || "—";
          const score = r?.score || r?.quality || "—";
          const source = r?.source || "OLX";

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${escapeHtml(String(q))}</td>
            <td>${escapeHtml(String(count))}</td>
            <td>${escapeHtml(String(category))}</td>
            <td>${escapeHtml(String(score))}</td>
            <td>${escapeHtml(String(source))}</td>
          `;
          queriesTbody.appendChild(tr);
        });
      }

      if (queriesMsg) hide(queriesMsg);
      toast("Запити завантажено.", "ok");
    } catch (e) {
      const msg =
        (e?.status === 401 || e?.status === 403)
          ? "Потрібен вхід (токен). Увійдіть у вкладці «Акаунт»."
          : e?.data?.detail || "Не вдалося завантажити запити.";
      if (queriesMsg) {
        queriesMsg.textContent = msg;
        show(queriesMsg);
      }
      toast(msg, "err");
    }
  }

  function bindQueries() {
    if (btnLoadQueries) btnLoadQueries.addEventListener("click", (e) => (e.preventDefault(), loadQueries()));
  }

  // =========================
  // Boot
  // =========================
  async function boot() {
    // If buttons were "clickable but not switching", usually events weren't bound because script failed earlier.
    // So: do everything defensively and never throw from boot.
    try {
      bindTabs();
      bindAuth();
      bindProjects();
      bindMarket();
      bindQueries();

      await checkServer();
      setInterval(checkServer, 15000);

      // If token exists, load user + projects
      await loadMe();
      await loadProjectsIntoSelect();

      // If market tab and has project, allow quick load on first open (optional)
      // Comment out if you don't want auto load:
      // if (normalizeTab(window.location.hash) === "market" && selProject?.value) loadMarket();

    } catch (e) {
      console.error("BOOT ERROR:", e);
      toast("Помилка ініціалізації. Перевірте консоль (F12).", "err");
    }
  }

  // Wait DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
