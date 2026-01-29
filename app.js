/* ========= SellCase app.js (Auth + Projects + Market Overview/History) =========
   Based on your Swagger screenshots:
   - POST /auth/register (application/json): { email, full_name, password }
   - POST /auth/login (application/x-www-form-urlencoded): username, password
   - GET  /auth/me (Bearer)
   - GET  /olx/projects/ (Bearer)
   - GET  /olx/projects/{project_id}/market (Bearer) -> { project_id, last, prev }
   - GET  /olx/projects/{project_id}/market/history?limit=&offset=&only_valid=true (Bearer)
*/

const API_BASE = "https://sellcase-backend.onrender.com";

const ENDPOINTS = {
  health: "/health",
  register: "/auth/register",
  login: "/auth/login",
  me: "/auth/me",

  projects: "/olx/projects/",
  projectMarket: (id) => `/olx/projects/${encodeURIComponent(id)}/market`,
  projectHistory: (id, qs) =>
    `/olx/projects/${encodeURIComponent(id)}/market/history?${qs}`,
};

const LS_KEY = "sellcase_saved_queries_v1";
const LS_TOKEN = "sellcase_token_v1";

const $ = (id) => document.getElementById(id);

/* ========= Token ========= */
function setToken(token) {
  if (token) localStorage.setItem(LS_TOKEN, token);
  else localStorage.removeItem(LS_TOKEN);
}
function getToken() {
  return localStorage.getItem(LS_TOKEN) || "";
}

/* ========= UI helpers ========= */
function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

function setError(el, msg) {
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("show", !!msg);
}

function setHint(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
}

function setServerStatus(state) {
  const el = $("serverStatus");
  if (!el) return;

  const dot = el.querySelector(".dot");
  const text = el.querySelector("span:last-child");
  if (!dot || !text) return;

  dot.classList.remove("red", "green");
  if (state === "ok") {
    dot.classList.add("green");
    text.textContent = "Сервер OK";
  } else if (state === "down") {
    dot.classList.add("red");
    text.textContent = "Сервер недоступний";
  } else {
    text.textContent = "перевірка…";
  }
}

/* ========= Networking ========= */
function normalizeFetchError(err) {
  const m = String(err?.message || err || "");
  if (m.toLowerCase().includes("failed to fetch")) {
    return "Не вдалося підключитися до сервера. Перевір API_BASE, CORS та доступність backend.";
  }
  return m || "Невідома помилка.";
}

function buildUrl(path) {
  return API_BASE.replace(/\/$/, "") + path;
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
}

async function apiFetchJson(path, { method = "GET", body = null, headers = {} } = {}) {
  const url = buildUrl(path);

  const init = {
    method,
    headers: authHeaders({ ...headers }),
    credentials: "include",
  };

  if (body !== null) {
    init.headers = authHeaders({
      "Content-Type": "application/json",
      ...headers,
    });
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message || data.error)) ||
      (typeof data === "string" ? data : null) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function apiFetchForm(path, formParams) {
  const url = buildUrl(path);

  const body = new URLSearchParams();
  Object.entries(formParams || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) body.append(k, String(v));
  });

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body,
    credentials: "include",
  });

  const text = await res.text();

  if (!res.ok) {
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }
    const msg =
      (data && (data.detail || data.message || data.error)) ||
      (typeof data === "string" ? data : null) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text || null;
  }
}

/* ========= NAV ========= */
function setTab(tab) {
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  const sec = document.getElementById(`section-${tab}`);
  if (sec) sec.classList.add("active");
}

function initNav() {
  const nav = $("nav");
  if (!nav) return;

  nav.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    setTab(btn.dataset.tab);
  });
}

/* ========= State ========= */
const state = {
  me: null,
  projects: [],
  historyLimit: 30,
};

function initialsFrom(fullName, email) {
  const n = String(fullName || "").trim();
  if (n && n !== "Користувач") {
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map((p) => (p[0] || "").toUpperCase()).join("") || "U";
  }
  const e = String(email || "").trim();
  return e ? e[0].toUpperCase() : "U";
}

function formatDateISO(iso) {
  if (!iso) return "—";
  return String(iso).replace("T", " ").replace("Z", "").slice(0, 19);
}

/* ========= AUTH UI ========= */
function uiAfterLoginOn(meLike) {
  const forms = $("authForms");
  if (forms) forms.style.display = "none";

  const done = $("authDone");
  if (done) done.style.display = "block";

  const email = meLike?.email || ($("loginEmail")?.value || "").trim();
  const full = meLike?.full_name || meLike?.fullName || "Користувач";

  if ($("userTitle")) $("userTitle").textContent = full || "Користувач";
  if ($("userSubtitle")) $("userSubtitle").textContent = "✅ Вхід успішно виконано.";
  if ($("userAvatar")) $("userAvatar").textContent = initialsFrom(full, email);

  if ($("meId")) $("meId").textContent = String(meLike?.id ?? "—");
  if ($("meCreated")) $("meCreated").textContent = formatDateISO(meLike?.created_at);
  if ($("meActive")) {
    $("meActive").textContent =
      meLike?.is_active === true ? "Активний" :
      meLike?.is_active === false ? "Неактивний" : "—";
  }
}

function uiAfterLoginOff() {
  const forms = $("authForms");
  if (forms) forms.style.display = "block";

  const done = $("authDone");
  if (done) done.style.display = "none";

  setHint("loginInfo", "");
}

/* ========= AUTH ========= */
async function fetchMe() {
  try {
    const me = await apiFetchJson(ENDPOINTS.me);
    state.me = me;
    uiAfterLoginOn(me);
    return me;
  } catch {
    state.me = null;
    return null;
  }
}

function extractToken(loginResponse) {
  if (!loginResponse) return "";
  return loginResponse.access_token || loginResponse.token || loginResponse.jwt || "";
}

async function handleRegister(e) {
  e.preventDefault();

  const errEl = $("accountError");
  setError(errEl, "");

  const btn = $("btnRegister");
  if (btn) btn.disabled = true;

  const first = ($("regFirstName")?.value || "").trim();
  const last = ($("regLastName")?.value || "").trim();
  const email = ($("regEmail")?.value || "").trim();
  const password = $("regPassword")?.value || "";

  try {
    if (!first || !last) throw new Error("Вкажіть імʼя та прізвище.");
    if (!email) throw new Error("Вкажіть email.");
    if (!password || password.length < 8) throw new Error("Пароль має містити мінімум 8 символів.");

    await apiFetchJson(ENDPOINTS.register, {
      method: "POST",
      body: { email, full_name: `${first} ${last}`.trim(), password },
    });

    showToast("✅ Ви успішно зареєструвалися.");
    const regBlock = $("registerBlock");
    if (regBlock) regBlock.style.display = "none";

    if ($("loginEmail")) $("loginEmail").value = email;
    if ($("loginPassword")) $("loginPassword").value = "";
    setHint("loginInfo", "✅ Реєстрація успішна. Тепер виконайте вхід.");
  } catch (err) {
    setError(errEl, normalizeFetchError(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleLogin(e) {
  e.preventDefault();

  const errEl = $("accountError");
  setError(errEl, "");
  setHint("loginInfo", "");

  const btn = $("btnLogin");
  if (btn) btn.disabled = true;

  const email = ($("loginEmail")?.value || "").trim();
  const password = $("loginPassword")?.value || "";

  try {
    if (!email || !password) throw new Error("Вкажіть email та пароль.");

    const loginRes = await apiFetchForm(ENDPOINTS.login, {
      username: email,
      password,
    });

    const token = extractToken(loginRes);
    if (!token) {
      throw new Error("Сервер не повернув access_token. Перевір відповідь /auth/login у Swagger.");
    }

    setToken(token);

    showToast("✅ Вхід успішно виконано.");
    setHint("loginInfo", "✅ Вхід успішно виконано.");

    uiAfterLoginOn({ email, full_name: "Користувач" });

    const me = await fetchMe();
    if (!me) throw new Error("Токен збережено, але /auth/me не відповів. Перевір Authorization/CORS.");

    // После логина сразу тянем проекты для рынка
    await loadProjects({ silent: true });

    setTab("account");
  } catch (err) {
    setToken("");
    setError(errEl, normalizeFetchError(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleLogout() {
  const errEl = $("accountError");
  setError(errEl, "");

  const btn = $("btnLogout");
  if (btn) btn.disabled = true;

  try {
    setToken("");
    state.me = null;
    state.projects = [];
    uiAfterLoginOff();
    clearProjectsUI();
    showToast("Ви вийшли з акаунта.");
    setTab("account");
  } catch (err) {
    setError(errEl, normalizeFetchError(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initAuth() {
  const loginForm = $("loginForm");
  const regForm = $("registerForm");
  const logoutBtn = $("btnLogout");

  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  if (regForm) regForm.addEventListener("submit", handleRegister);
  if (logoutBtn) logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    handleLogout();
  });

  const go = $("btnGoMarket");
  if (go) go.addEventListener("click", (e) => {
    e.preventDefault();
    setTab("market");
  });
}

/* ========= Saved Queries (localStorage) ========= */
function getSavedQueries() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}
function setSavedQueries(items) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}
function renderSavedQueries() {
  const box = $("savedQueries");
  if (!box) return;

  const items = getSavedQueries();
  if (!items.length) {
    box.textContent = "Поки немає збережених запитів.";
    return;
  }

  box.innerHTML = items
    .map((q, i) => {
      const title = `${q.text || "—"}${q.category ? " · " + q.category : ""}`;
      return `
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:1100;">${title}</div>
            <div class="hint">points: ${q.points ?? "—"}, reliable: ${q.reliable ? "так" : "ні"}, offset: ${q.offset ?? 0}</div>
          </div>
          <div class="row">
            <button class="btn" type="button" data-action="apply" data-index="${i}">Застосувати</button>
            <button class="btn" type="button" data-action="del" data-index="${i}">🗑</button>
          </div>
        </div>
      `;
    })
    .join("");

  box.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const idx = Number(b.dataset.index);
    const action = b.dataset.action;
    const items2 = getSavedQueries();

    if (action === "del") {
      items2.splice(idx, 1);
      setSavedQueries(items2);
      renderSavedQueries();
      return;
    }

    if (action === "apply") {
      const q = items2[idx];
      if ($("marketPoints")) $("marketPoints").value = String(q.points ?? 30);
      if ($("marketOffset")) $("marketOffset").value = String(q.offset ?? 0);
      if ($("marketReliable")) $("marketReliable").checked = !!q.reliable;
      setTab("market");
      showToast("⭐ Запит застосовано.");
    }
  };
}

function initQueryUI() {
  const run = $("btnRunQuery");
  if (run) run.addEventListener("click", () => {
    showToast("Запит — заглушка. Підключимо search/analytics наступним кроком.");
  });

  const save = $("btnSaveQuery");
  if (save) save.addEventListener("click", () => {
    const points = Number($("marketPoints")?.value || 30);
    const offset = Number($("marketOffset")?.value || 0);
    const reliable = !!$("marketReliable")?.checked;

    const item = {
      text: $("queryText")?.value || "",
      category: $("queryCategory")?.value || "",
      points,
      offset,
      reliable,
      ts: Date.now(),
    };

    const items = getSavedQueries();
    items.unshift(item);
    setSavedQueries(items.slice(0, 30));
    renderSavedQueries();
    showToast("⭐ Запит збережено.");
  });

  renderSavedQueries();
}

/* ========= Server Health ========= */
async function ping() {
  setServerStatus("unknown");
  try {
    await apiFetchJson(ENDPOINTS.health);
    setServerStatus("ok");
  } catch {
    setServerStatus("down");
  }
}

/* ========= Projects ========= */
function clearProjectsUI() {
  const sel = $("marketProject");
  if (sel) {
    sel.innerHTML = `<option value="">— Оберіть проект —</option>`;
  }
  const list = $("projectsList");
  if (list) list.textContent = "—";
}

function renderProjects() {
  const sel = $("marketProject");
  const list = $("projectsList");

  if (sel) {
    const current = String(sel.value || "");
    sel.innerHTML = `<option value="">— Оберіть проект —</option>` + state.projects
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (#${p.id})</option>`)
      .join("");

    // restore selection if exists
    if (current && state.projects.some((p) => String(p.id) === current)) {
      sel.value = current;
    } else {
      // default to first project if none selected
      if (!sel.value && state.projects.length) sel.value = String(state.projects[0].id);
    }
  }

  if (list) {
    if (!state.projects.length) {
      list.textContent = "Немає проектів.";
    } else {
      list.innerHTML = state.projects
        .map((p) => {
          const url = p.search_url ? `<div class="hint">${escapeHtml(p.search_url)}</div>` : "";
          const note = p.notes ? `<div class="hint">📝 ${escapeHtml(p.notes)}</div>` : "";
          const active = p.is_active ? "✅ active" : "⛔ inactive";
          return `
            <div style="padding:12px 0;border-bottom:1px solid var(--border);">
              <div style="font-weight:1100;">${escapeHtml(p.name)} <span class="hint">#${p.id}</span></div>
              <div class="hint">${active} · created: ${escapeHtml(formatDateISO(p.created_at))}</div>
              ${note}
              ${url}
            </div>
          `;
        })
        .join("");
    }
  }
}

async function loadProjects({ silent = false } = {}) {
  const errEl = $("projectsError");
  if (errEl) setError(errEl, "");

  if (!getToken()) {
    if (!silent && errEl) setError(errEl, "Потрібен вхід. Увійдіть, щоб завантажити проекти.");
    clearProjectsUI();
    return [];
  }

  try {
    const data = await apiFetchJson(ENDPOINTS.projects);
    // Swagger shows list
    state.projects = Array.isArray(data) ? data : (data?.items || []);
    renderProjects();
    if (!silent) showToast("✅ Проекти завантажено.");
    return state.projects;
  } catch (err) {
    state.projects = [];
    clearProjectsUI();
    if (!silent && errEl) setError(errEl, normalizeFetchError(err));
    return [];
  }
}

/* ========= Market ========= */
function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== null && obj[k] !== undefined) {
      return obj[k];
    }
  }
  return undefined;
}

function formatMoney(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("uk-UA");
}

function setKpi(id, val) {
  const el = $(id);
  if (!el) return;
  el.textContent = val;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSelectedProjectId() {
  const v = $("marketProject")?.value || "";
  return v ? Number(v) : null;
}

function readHistoryParams() {
  const limit = Math.max(1, Math.min(50, Number($("marketPoints")?.value || state.historyLimit || 30)));
  const offset = Math.max(0, Number($("marketOffset")?.value || 0));
  const only_valid = !!$("marketReliable")?.checked;
  return { limit, offset, only_valid };
}

function applyMarketFromSnapshot(lastSnap, prevSnap) {
  // According to screenshot: snapshot has:
  // items_count, avg_price, min_price, max_price, median_price, p25_price, p75_price, taken_at
  const typical = pick(lastSnap, ["median_price", "avg_price", "p50_price", "p50", "median"]);
  const p25 = pick(lastSnap, ["p25_price", "p25"]);
  const p75 = pick(lastSnap, ["p75_price", "p75"]);
  const rMin = pick(lastSnap, ["min_price", "min"]);
  const rMax = pick(lastSnap, ["max_price", "max"]);
  const count = pick(lastSnap, ["items_count", "count", "n"]);

  // delta typical vs prev
  let delta = undefined;
  if (prevSnap) {
    const prevTypical = pick(prevSnap, ["median_price", "avg_price", "p50_price", "p50", "median"]);
    if (typical !== undefined && prevTypical !== undefined) {
      delta = Number(typical) - Number(prevTypical);
    }
  }

  setKpi("kpiTypical", formatMoney(typical));

  if (delta === undefined || Number.isNaN(Number(delta))) {
    setKpi("kpiDelta", "—");
  } else {
    const n = Number(delta);
    const s = (n > 0 ? "+" : "") + n.toLocaleString("uk-UA");
    setKpi("kpiDelta", s);
  }

  // Range preference: p25—p75, else min—max
  if (p25 !== undefined || p75 !== undefined) {
    setKpi("kpiRange", `${formatMoney(p25)} — ${formatMoney(p75)}`);
  } else if (rMin !== undefined || rMax !== undefined) {
    setKpi("kpiRange", `${formatMoney(rMin)} — ${formatMoney(rMax)}`);
  } else {
    setKpi("kpiRange", "—");
  }

  setKpi("kpiCount", count === undefined ? "—" : Number(count).toLocaleString("uk-UA"));
}

async function loadMarketSummary() {
  const errEl = $("marketError");
  setError(errEl, "");
  setHint("marketHint", "");

  if (!getToken()) {
    setError(errEl, "Потрібен вхід. Спочатку увійдіть в аккаунт.");
    setTab("account");
    return;
  }

  const projectId = getSelectedProjectId();
  if (!projectId) {
    setError(errEl, "Оберіть проект.");
    return;
  }

  const btn = $("btnMarketLoad");
  if (btn) btn.disabled = true;

  try {
    // 1) First: quick overview (last + prev)
    const overview = await apiFetchJson(ENDPOINTS.projectMarket(projectId));
    const lastSnap = overview?.last || null;
    const prevSnap = overview?.prev || null;

    if (!lastSnap) {
      // fallback to history
      const { limit, offset, only_valid } = readHistoryParams();
      const qs = new URLSearchParams();
      qs.set("limit", String(limit));
      qs.set("offset", String(offset));
      qs.set("only_valid", only_valid ? "true" : "false");
      const hist = await apiFetchJson(ENDPOINTS.projectHistory(projectId, qs.toString()));
      const items = hist?.items || [];
      if (!items.length) {
        applyMarketFromSnapshot(null, null);
        setHint("marketHint", "Немає даних по проекту.");
        return;
      }
      applyMarketFromSnapshot(items[0], items[1] || null);
      setHint("marketHint", "✅ Дані оновлено (history).");
      showToast("Ринок: KPI оновлено.");
      return;
    }

    applyMarketFromSnapshot(lastSnap, prevSnap);
    setHint("marketHint", `✅ Дані оновлено (${formatDateISO(lastSnap.taken_at)})`);
    showToast("Ринок: KPI оновлено.");
  } catch (err) {
    setError(errEl, normalizeFetchError(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initMarket() {
  const loadBtn = $("btnMarketLoad");
  if (loadBtn) loadBtn.addEventListener("click", () => loadMarketSummary());

  // Prev/Next: paginate history by limit and write into marketOffset input
  const prev = $("btnPrev");
  const next = $("btnNext");

  if (prev) prev.addEventListener("click", () => {
    const { limit } = readHistoryParams();
    const offEl = $("marketOffset");
    const cur = Math.max(0, Number(offEl?.value || 0));
    const nextVal = Math.max(0, cur - limit);
    if (offEl) offEl.value = String(nextVal);
    loadMarketSummary();
  });

  if (next) next.addEventListener("click", () => {
    const { limit } = readHistoryParams();
    const offEl = $("marketOffset");
    const cur = Math.max(0, Number(offEl?.value || 0));
    const nextVal = cur + limit;
    if (offEl) offEl.value = String(nextVal);
    loadMarketSummary();
  });

  // Change project -> auto load if already has data
  const sel = $("marketProject");
  if (sel) sel.addEventListener("change", () => {
    // optional auto-load
    // loadMarketSummary();
  });
}

/* ========= Projects UI actions ========= */
function initProjects() {
  const projBtn = $("btnProjectsReload");
  if (projBtn) projBtn.addEventListener("click", async () => {
    setHint("projectsInfo", "");
    await loadProjects({ silent: false });
    setHint("projectsInfo", "✅ Список оновлено.");
  });
}

/* ========= INIT ========= */
async function init() {
  initNav();
  initAuth();
  initQueryUI();
  initMarket();
  initProjects();

  ping();

  // If token exists, try /auth/me; if ok -> load projects
  if (getToken()) {
    const me = await fetchMe();
    if (me) {
      await loadProjects({ silent: true });
      setTab("market");
    } else {
      setToken("");
      uiAfterLoginOff();
      clearProjectsUI();
      setTab("account");
    }
  } else {
    uiAfterLoginOff();
    clearProjectsUI();
    setTab("market");
  }
}

document.addEventListener("DOMContentLoaded", init);
