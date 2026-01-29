/* ========= SellCase app.js (token auth + /auth/me + /metrics/summary) =========
   Swagger confirms:
   - POST /auth/register (application/json): { email, full_name, password }
   - POST /auth/login (application/x-www-form-urlencoded): username, password (OAuth2 password)
   - GET  /auth/me requires Authorization: Bearer <token>
   - Market live: GET /metrics/summary -> KPI
*/

const API_BASE = "https://sellcase-backend.onrender.com"; // <-- проверь

const ENDPOINTS = {
  health: "/health",
  register: "/auth/register",
  login: "/auth/login",
  me: "/auth/me",
  metricsSummary: "/metrics/summary",
  // projects: "/projects", // если появится/есть — подключим отдельно
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
    return "Не вдалося підключитися до сервера. Перевірте API_BASE, CORS та доступність backend.";
  }
  return m || "Невідома помилка.";
}

function buildUrl(path) {
  return API_BASE.replace(/\/$/, "") + path;
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : { ...extra };
}

async function apiFetchJson(path, { method = "GET", body = null, headers = {} } = {}) {
  const url = buildUrl(path);

  const init = {
    method,
    headers: authHeaders({
      ...headers,
    }),
    credentials: "include",
  };

  // Only set JSON content-type when body is present or explicitly provided.
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

/* ========= AUTH UI Mode ========= */

const state = {
  me: null,
  marketCursor: 0,
};

function initialsFrom(fullName, email) {
  const n = String(fullName || "").trim();
  if (n && n !== "Користувач") {
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map(p => (p[0] || "").toUpperCase()).join("") || "U";
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
    meLike?.email ||
    (document.getElementById("loginEmail")?.value || "").trim();

  const full =
    meLike?.full_name ||
    meLike?.fullName ||
    "Користувач";

  const av = $("userAvatar");
  const title = $("userTitle");
  const sub = $("userSubtitle");

  if (title) title.textContent = full || "Користувач";
  if (sub) sub.textContent = "✅ Вхід успішно виконано.";
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
      body: {
        email,
        full_name: `${first} ${last}`.trim(),
        password,
      },
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

function extractToken(loginResponse) {
  // Most FastAPI OAuth2PasswordRequestForm responses:
  // { "access_token": "...", "token_type": "bearer" }
  if (!loginResponse) return "";
  return (
    loginResponse.access_token ||
    loginResponse.token ||
    loginResponse.jwt ||
    ""
  );
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
      // backend вернул "что-то", но не токен -> без него /auth/me не сработает
      throw new Error("Логін успішний, але сервер не повернув access_token. Перевір відповідь /auth/login у Swagger.");
    }

    setToken(token);

    showToast("✅ Вхід успішно виконано.");
    setHint("loginInfo", "✅ Вхід успішно виконано.");

    // show placeholder immediately
    uiAfterLoginOn({ email, full_name: "Користувач" });

    // fetch real profile
    const me = await fetchMe();
    if (!me) throw new Error("Токен збережено, але /auth/me не відповів. Перевір CORS/Authorization на бекенді.");

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
    showToast("Запит збережено як чернетка. Підключимо API для реального запуску.");
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
  setServerStatus("unknown");
  try {
    await apiFetchJson(ENDPOINTS.health);
    setServerStatus("ok");
  } catch {
    setServerStatus("down");
  }
}

/* ========= Market: /metrics/summary -> KPI ========= */

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
  const n = Number(v);
  // basic UA formatting
  return n.toLocaleString("uk-UA");
}

function setKpi(id, val) {
  const el = $(id);
  if (!el) return;
  el.textContent = val;
}

function buildMetricsQuery() {
  // project value (id or slug)
  const project = $("marketProject")?.value || "";
  const points = Number($("marketPoints")?.value || 30);
  const offset = Number($("marketOffset")?.value || 0);
  const reliable = !!$("marketReliable")?.checked;

  // Cursor / paging for prev/next. We use state.marketCursor as generic offset multiplier.
  // If backend expects "offset" as history offset already, keep it. We add cursor as "cursor" param as optional.
  const cursor = state.marketCursor;

  const qs = new URLSearchParams();
  if (project) qs.set("project", project);
  qs.set("points", String(points));
  qs.set("offset", String(offset));
  qs.set("reliable", reliable ? "true" : "false");

  // Optional param if backend supports; harmless if ignored
  qs.set("cursor", String(cursor));

  return qs.toString();
}

async function loadMarketSummary() {
  const errEl = $("marketError");
  setError(errEl, "");
  setHint("marketHint", "");

  // Must be logged in (token) because swagger shows Bearer for /auth/me; metrics likely too.
  if (!getToken()) {
    setError(errEl, "Потрібен вхід. Спочатку увійдіть в аккаунт.");
    setTab("account");
    return;
  }

  const btn = $("btnMarketLoad");
  if (btn) btn.disabled = true;

  try {
    const qs = buildMetricsQuery();
    const data = await apiFetchJson(`${ENDPOINTS.metricsSummary}?${qs}`);

    // Try to normalize different response schemas
    // Common candidates:
    // { typical, delta, min, max, count }
    // { typical_price, delta_price, range_min, range_max, listings_count }
    // { summary: {...} }
    const root = data?.summary || data?.data || data || {};

    const typical = pick(root, ["typical", "typical_price", "price_typical", "median_price", "median", "p50"]);
    const delta = pick(root, ["delta", "delta_price", "typical_delta", "change", "diff"]);
    const count = pick(root, ["count", "listings_count", "items_count", "ads_count", "n"]);

    const rMin = pick(root, ["min", "range_min", "low", "p10", "from"]);
    const rMax = pick(root, ["max", "range_max", "high", "p90", "to"]);

    setKpi("kpiTypical", formatMoney(typical));
    // delta with sign
    if (delta === null || delta === undefined || Number.isNaN(Number(delta))) {
      setKpi("kpiDelta", "—");
    } else {
      const n = Number(delta);
      const s = (n > 0 ? "+" : "") + n.toLocaleString("uk-UA");
      setKpi("kpiDelta", s);
    }

    if (rMin !== undefined || rMax !== undefined) {
      setKpi("kpiRange", `${formatMoney(rMin)} — ${formatMoney(rMax)}`);
    } else {
      // maybe range is string
      const rangeStr = pick(root, ["range", "corridor", "price_range"]);
      setKpi("kpiRange", rangeStr ? String(rangeStr) : "—");
    }

    setKpi("kpiCount", (count === undefined ? "—" : Number(count).toLocaleString("uk-UA")));

    setHint("marketHint", "✅ Дані оновлено.");
    showToast("Ринок: KPI оновлено.");

  } catch (err) {
    setError(errEl, normalizeFetchError(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initMarket() {
  const loadBtn = $("btnMarketLoad");
  if (loadBtn) loadBtn.addEventListener("click", () => {
    loadMarketSummary();
  });

  const prev = $("btnPrev");
  const next = $("btnNext");

  if (prev) prev.addEventListener("click", () => {
    state.marketCursor = Math.max(0, (state.marketCursor || 0) - 1);
    loadMarketSummary();
  });
  if (next) next.addEventListener("click", () => {
    // increment cursor (if backend ignores it, harmless)
    state.marketCursor = (state.marketCursor || 0) + 1;
    loadMarketSummary();
  });
}

/* ========= INIT ========= */

function init() {
  initNav();
  initAuth();
  initQueryUI();
  initMarket();

  // Projects page пока заглушка (не ломаем)
  const projBtn = $("btnProjectsReload");
  if (projBtn) projBtn.addEventListener("click", () => {
    $("projectsList").textContent = "Поки що не підключено до API проектів.";
    setHint("projectsInfo", "MVP: підключимо згодом.");
  });

  ping();

  // If token exists, try /auth/me
  if (getToken()) {
    fetchMe().then((me) => {
      if (me) {
        setTab("account");
      } else {
        // token invalid -> clear
        setToken("");
        uiAfterLoginOff();
      }
    });
  } else {
    uiAfterLoginOff();
  }

  // default screen
  setTab("market");
}

document.addEventListener("DOMContentLoaded", init);
