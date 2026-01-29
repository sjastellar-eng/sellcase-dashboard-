/* ========= SellCase app.js (clean UI + projects loader + better status) ========= */

const API_BASE = "https://sellcase-backend.onrenderender.com".replace("renderender","onrender"); // защита от опечатки :)
/* если у тебя точно другой домен — замени на:
   const API_BASE = "https://sellcase-backend.onrender.com";
*/

const ENDPOINTS = {
  health: "/health",
  register: "/auth/register",
  login: "/auth/login",
  me: "/auth/me",
  metricsSummary: "/metrics/summary",

  // OLX projects
  olxProjects: "/olx/projects/",
};

const LS_KEY = "sellcase_saved_queries_v1";
const LS_TOKEN = "sellcase_token_v1";

const $ = (id) => document.getElementById(id);

const state = {
  me: null,
  marketCursor: 0,
  projects: [],
  suppressDevText: true, // скрываем "заглушки" в UI
};

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

function setServerStatus(stateName) {
  const el = $("serverStatus");
  if (!el) return;

  const dot = el.querySelector(".dot");
  const text = el.querySelector("span:last-child");
  if (!dot || !text) return;

  dot.classList.remove("red", "green");

  if (stateName === "online") {
    dot.classList.add("green");
    text.textContent = "Online";
  } else if (stateName === "offline") {
    dot.classList.add("red");
    text.textContent = "Offline";
  } else {
    text.textContent = "Connecting…";
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
    init.headers = authHeaders({ "Content-Type": "application/json", ...headers });
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

/* ========= Remove dev texts (no HTML edit needed) ========= */
function suppressDevCopy() {
  if (!state.suppressDevText) return;

  // В секциях: Запити / Проекти — прячем sub-текст (он сейчас "заглушка")
  ["section-queries", "section-projects"].forEach((sid) => {
    const sec = document.getElementById(sid);
    if (!sec) return;
    const sub = sec.querySelector(".sub");
    if (sub) sub.style.display = "none";
  });

  // В "Проєкти" — если уже есть текст "Немає проектів..." — покажем нейтральнее
  const projectsList = $("projectsList");
  if (projectsList && projectsList.textContent.trim()) {
    // оставим как есть, это уже "пользовательский" текст
  }
}

/* ========= AUTH UI ========= */
function initialsFrom(fullName, email) {
  const n = String(fullName || "").trim();
  if (n) {
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

function uiAfterLoginOn(meLike) {
  const forms = $("authForms");
  if (forms) forms.style.display = "none";

  const done = $("authDone");
  if (done) done.style.display = "block";

  const email =
    meLike?.email || (document.getElementById("loginEmail")?.value || "").trim();

  // важное: если full_name нет — показываем email (чтобы НЕ было "Користувач")
  const full = String(meLike?.full_name || meLike?.fullName || "").trim();
  const displayName = full || email || "User";

  const av = $("userAvatar");
  const title = $("userTitle");
  const sub = $("userSubtitle");

  if (title) title.textContent = displayName;
  if (sub) sub.textContent = "✅ Вхід виконано.";
  if (av) av.textContent = initialsFrom(full, email);

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

    showToast("✅ Реєстрація успішна.");
    const regBlock = $("registerBlock");
    if (regBlock) regBlock.style.display = "none";

    if ($("loginEmail")) $("loginEmail").value = email;
    if ($("loginPassword")) $("loginPassword").value = "";
    setHint("loginInfo", "✅ Реєстрація успішна. Тепер увійдіть.");

  } catch (err) {
    setError(errEl, normalizeFetchError(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function extractToken(loginResponse) {
  if (!loginResponse) return "";
  return loginResponse.access_token || loginResponse.token || loginResponse.jwt || "";
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

    const loginRes = await apiFetchForm(ENDPOINTS.login, { username: email, password });
    const token = extractToken(loginRes);

    if (!token) throw new Error("Сервер не повернув access_token (перевір /auth/login).");

    setToken(token);

    uiAfterLoginOn({ email, full_name: "" }); // сразу покажем email
    const me = await fetchMe();
    if (!me) throw new Error("Токен збережено, але /auth/me не відповів. Перевір бекенд.");

    showToast("✅ Вхід виконано.");
    setTab("account");

    // После входа — обновим проекты, чтобы "Ринок" сразу был готов
    await loadProjects({ silent: true });

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
    uiAfterLoginOff();
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

/* ========= Saved Queries ========= */
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

  box.innerHTML = items.map((q, i) => {
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
  }).join("");

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
    // никаких дев-текстов и endpoint-логов
    showToast("Функція пошуку підключається. Зараз доступні: Ринок та Проєкти.");
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
      ts: Date.now()
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
  setServerStatus("connecting");
  try {
    await apiFetchJson(ENDPOINTS.health);
    setServerStatus("online");
  } catch {
    setServerStatus("offline");
  }
}

/* ========= Projects ========= */
function renderProjectsList() {
  const list = $("projectsList");
  if (!list) return;

  if (!state.projects.length) {
    list.textContent = "Немає проектів або API не відповів.";
    return;
  }

  list.innerHTML = state.projects.map(p => {
    const name = p?.name ?? "—";
    const notes = p?.notes ? ` · ${p.notes}` : "";
    const active = p?.is_active ? "🟢" : "⚪️";
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border);font-weight:900;">
      ${active} ${name}${notes}
      <div class="hint" style="margin-top:4px;">id: ${p.id}</div>
    </div>`;
  }).join("");
}

function fillMarketProjectSelect() {
  const sel = $("marketProject");
  if (!sel) return;

  const prev = sel.value || "";
  sel.innerHTML = "";

  // placeholder
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Оберіть проект…";
  sel.appendChild(opt0);

  state.projects.forEach(p => {
    const o = document.createElement("option");
    o.value = String(p.id);
    o.textContent = p.name || `Project ${p.id}`;
    sel.appendChild(o);
  });

  // restore previous if exists
  if (prev) sel.value = prev;
}

async function loadProjects({ silent = false } = {}) {
  const info = $("projectsInfo");
  const errEl = $("projectsError");
  setError(errEl, "");
  if (info) info.textContent = "";

  // projects endpoint guarded by auth (lock in swagger)
  if (!getToken()) {
    if (!silent) {
      if (info) info.textContent = "Потрібен вхід.";
      showToast("Спочатку увійдіть, щоб завантажити проєкти.");
    }
    state.projects = [];
    renderProjectsList();
    fillMarketProjectSelect();
    return;
  }

  try {
    const data = await apiFetchJson(ENDPOINTS.olxProjects);
    state.projects = Array.isArray(data) ? data : (data?.items || []);
    renderProjectsList();
    fillMarketProjectSelect();
    if (!silent) showToast("✅ Проєкти оновлено.");
  } catch (e) {
    state.projects = [];
    renderProjectsList();
    fillMarketProjectSelect();
    setError(errEl, normalizeFetchError(e));
  }
}

/* ========= Market: /metrics/summary ========= */
function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== null && obj[k] !== undefined) return obj[k];
  }
  return undefined;
}
function formatMoney(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("uk-UA");
}
function setKpi(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

function buildMetricsQuery() {
  // тут мы используем проект id как "project"
  const project = $("marketProject")?.value || "";
  const points = Number($("marketPoints")?.value || 30);
  const offset = Number($("marketOffset")?.value || 0);
  const reliable = !!$("marketReliable")?.checked;

  const qs = new URLSearchParams();
  if (project) qs.set("project", project);
  qs.set("points", String(points));
  qs.set("offset", String(offset));
  qs.set("reliable", reliable ? "true" : "false");
  qs.set("cursor", String(state.marketCursor || 0)); // если игнорируется — ок
  return qs.toString();
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

  const project = $("marketProject")?.value || "";
  if (!project) {
    setError(errEl, "Оберіть проект.");
    return;
  }

  const btn = $("btnMarketLoad");
  if (btn) btn.disabled = true;

  try {
    const qs = buildMetricsQuery();
    const data = await apiFetchJson(`${ENDPOINTS.metricsSummary}?${qs}`);
    const root = data?.summary || data?.data || data || {};

    const typical = pick(root, ["typical", "typical_price", "price_typical", "median_price", "median", "p50"]);
    const delta = pick(root, ["delta", "delta_price", "typical_delta", "change", "diff"]);
    const count = pick(root, ["count", "listings_count", "items_count", "ads_count", "n"]);
    const rMin = pick(root, ["min", "range_min", "low", "p10", "from"]);
    const rMax = pick(root, ["max", "range_max", "high", "p90", "to"]);

    setKpi("kpiTypical", formatMoney(typical));

    if (delta === null || delta === undefined || Number.isNaN(Number(delta))) {
      setKpi("kpiDelta", "—");
    } else {
      const n = Number(delta);
      setKpi("kpiDelta", (n > 0 ? "+" : "") + n.toLocaleString("uk-UA"));
    }

    if (rMin !== undefined || rMax !== undefined) {
      setKpi("kpiRange", `${formatMoney(rMin)} — ${formatMoney(rMax)}`);
    } else {
      const rangeStr = pick(root, ["range", "corridor", "price_range"]);
      setKpi("kpiRange", rangeStr ? String(rangeStr) : "—");
    }

    setKpi("kpiCount", count === undefined ? "—" : Number(count).toLocaleString("uk-UA"));

    setHint("marketHint", "✅ Дані оновлено.");
    showToast("Ринок оновлено.");

  } catch (err) {
    setError(errEl, normalizeFetchError(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initMarket() {
  const loadBtn = $("btnMarketLoad");
  if (loadBtn) loadBtn.addEventListener("click", loadMarketSummary);

  const prev = $("btnPrev");
  const next = $("btnNext");

  if (prev) prev.addEventListener("click", () => {
    state.marketCursor = Math.max(0, (state.marketCursor || 0) - 1);
    loadMarketSummary();
  });
  if (next) next.addEventListener("click", () => {
    state.marketCursor = (state.marketCursor || 0) + 1;
    loadMarketSummary();
  });
}

/* ========= Projects button ========= */
function initProjects() {
  const projBtn = $("btnProjectsReload");
  if (projBtn) projBtn.addEventListener("click", () => loadProjects({ silent: false }));
}

/* ========= INIT ========= */
async function init() {
  initNav();
  initAuth();
  initQueryUI();
  initMarket();
  initProjects();

  suppressDevCopy();
  ping();

  // If token exists, try /auth/me and load projects
  if (getToken()) {
    const me = await fetchMe();
    if (!me) {
      setToken("");
      uiAfterLoginOff();
    } else {
      await loadProjects({ silent: true });
    }
  } else {
    uiAfterLoginOff();
  }

  setTab("market");
}

document.addEventListener("DOMContentLoaded", init);
