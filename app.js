/* ========= SellCase app.js (stable UX + timeout/retry + friendly errors) ========= */

const API_BASE = "https://sellcase-backend.onrender.com"; // backend
const ENDPOINTS = {
  health: "/health",
  register: "/auth/register",
  login: "/auth/login",
  me: "/auth/me",
  metricsSummary: "/metrics/summary",
};

const LS_KEY = "sellcase_saved_queries_v1";
const LS_TOKEN = "sellcase_token_v1";

const TIMEOUT_MS = 15000;     // 15s for Render cold start
const PING_RETRIES = 2;       // retry ping a couple times
const PING_INTERVAL_MS = 30000;

const $ = (id) => document.getElementById(id);

const state = {
  me: null,
  marketCursor: 0,
};

function buildUrl(path) {
  return API_BASE.replace(/\/$/, "") + path;
}

/* ========= Token ========= */

function setToken(token) {
  if (token) localStorage.setItem(LS_TOKEN, token);
  else localStorage.removeItem(LS_TOKEN);
}
function getToken() {
  return localStorage.getItem(LS_TOKEN) || "";
}

/* ========= UI ========= */

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

function setServerStatus(stateText) {
  const el = $("serverStatus");
  if (!el) return;

  const dot = el.querySelector(".dot");
  const text = el.querySelector("span:last-child");
  if (!dot || !text) return;

  dot.classList.remove("red", "green");

  if (stateText === "online") {
    dot.classList.add("green");
    text.textContent = "Online";
  } else if (stateText === "offline") {
    dot.classList.add("red");
    text.textContent = "Offline";
  } else {
    text.textContent = "Connecting…";
  }
}

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
    meLike?.full ||
    "Користувач";

  const av = $("userAvatar");
  const title = $("userTitle");
  const sub = $("userSubtitle");

  if (title) title.textContent = full || "Користувач";
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

/* ========= Networking (timeout + friendly messages) ========= */

function authHeaders(extra = {}) {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : { ...extra };
}

async function fetchWithTimeout(url, init, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

function userFriendlyError(err) {
  const msg = String(err?.message || err || "");

  // Abort / timeout
  if (msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("abort")) {
    return "Сервер відповідає занадто довго. Спробуйте ще раз.";
  }

  // Network/CORS
  if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
    return "Сервіс тимчасово недоступний. Перевірте інтернет або спробуйте ще раз через хвилину.";
  }

  // HTTP explicit
  if (msg.startsWith("HTTP 401")) return "Невірний логін або пароль.";
  if (msg.startsWith("HTTP 403")) return "Доступ заборонено.";
  if (msg.startsWith("HTTP 404")) return "Функція тимчасово недоступна.";
  if (msg.startsWith("HTTP 422")) return "Перевірте правильність введених даних.";
  if (msg.startsWith("HTTP 5")) return "Помилка сервера. Спробуйте пізніше.";

  // Backend-provided detail (keep short)
  return msg || "Сталася помилка. Спробуйте ще раз.";
}

async function apiFetchJson(path, { method = "GET", body = null, headers = {} } = {}) {
  const url = buildUrl(path);

  const init = {
    method,
    headers: authHeaders({ ...headers }),
    // IMPORTANT: token auth -> no cookies needed, reduces CORS issues
    credentials: "omit",
  };

  if (body !== null) {
    init.headers = authHeaders({
      "Content-Type": "application/json",
      ...headers,
    });
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetchWithTimeout(url, init);
  } catch (e) {
    console.warn("[apiFetchJson] network/timeout:", url, e);
    throw new Error(userFriendlyError(e));
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!res.ok) {
    const rawMsg =
      (data && (data.detail || data.message || data.error)) ||
      (typeof data === "string" ? data : null) ||
      `HTTP ${res.status}`;

    console.warn("[apiFetchJson] http error:", url, res.status, rawMsg);
    throw new Error(`HTTP ${res.status}: ${rawMsg}`);
  }

  return data;
}

async function apiFetchForm(path, formParams) {
  const url = buildUrl(path);

  const body = new URLSearchParams();
  Object.entries(formParams || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) body.append(k, String(v));
  });

  let res;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
      body,
      credentials: "omit",
    });
  } catch (e) {
    console.warn("[apiFetchForm] network/timeout:", url, e);
    throw new Error(userFriendlyError(e));
  }

  const text = await res.text();

  if (!res.ok) {
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }

    const rawMsg =
      (data && (data.detail || data.message || data.error)) ||
      (typeof data === "string" ? data : null) ||
      `HTTP ${res.status}`;

    console.warn("[apiFetchForm] http error:", url, res.status, rawMsg);
    throw new Error(`HTTP ${res.status}: ${rawMsg}`);
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

/* ========= AUTH ========= */

async function fetchMe() {
  try {
    const me = await apiFetchJson(ENDPOINTS.me);
    state.me = me;
    uiAfterLoginOn(me);
    return me;
  } catch (e) {
    state.me = null;
    return null;
  }
}

function extractToken(loginResponse) {
  return (
    loginResponse?.access_token ||
    loginResponse?.token ||
    loginResponse?.jwt ||
    ""
  );
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

    showToast("✅ Реєстрація успішна. Тепер увійдіть.");
    const regBlock = $("registerBlock");
    if (regBlock) regBlock.style.display = "none";

    if ($("loginEmail")) $("loginEmail").value = email;
    if ($("loginPassword")) $("loginPassword").value = "";
    setHint("loginInfo", "✅ Реєстрація успішна. Увійдіть у акаунт.");

  } catch (err) {
    setError(errEl, userFriendlyError(err));
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

    const loginRes = await apiFetchForm(ENDPOINTS.login, { username: email, password });

    const token = extractToken(loginRes);
    if (!token) throw new Error("Не вдалося отримати токен доступу. Спробуйте ще раз.");

    setToken(token);

    uiAfterLoginOn({ email, full_name: "Користувач" });

    const me = await fetchMe();
    if (!me) throw new Error("Не вдалося завантажити профіль. Спробуйте ще раз.");

    showToast("✅ Вхід виконано.");
    setTab("account");

  } catch (err) {
    setToken("");
    uiAfterLoginOff();
    setError(errEl, userFriendlyError(err));
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
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
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
    showToast("Запуск пошуку підключимо наступним кроком.");
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
  const project = $("marketProject")?.value || "";
  const points = Number($("marketPoints")?.value || 30);
  const offset = Number($("marketOffset")?.value || 0);
  const reliable = !!$("marketReliable")?.checked;

  const qs = new URLSearchParams();
  if (project) qs.set("project", project);
  qs.set("points", String(points));
  qs.set("offset", String(offset));
  qs.set("reliable", reliable ? "true" : "false");
  qs.set("cursor", String(state.marketCursor || 0)); // optional

  return qs.toString();
}

async function loadMarketSummary() {
  const errEl = $("marketError");
  setError(errEl, "");
  setHint("marketHint", "");

  if (!getToken()) {
    setError(errEl, "Потрібен вхід. Будь ласка, увійдіть у акаунт.");
    setTab("account");
    return;
  }

  const btn = $("btnMarketLoad");
  if (btn) btn.disabled = true;

  try {
    const qs = buildMetricsQuery();
    const data = await apiFetchJson(`${ENDPOINTS.metricsSummary}?${qs}`);
    const root = data?.summary || data?.data || data || {};

    const typical = pick(root, ["typical", "typical_price", "median_price", "median", "p50"]);
    const delta = pick(root, ["delta", "delta_price", "change", "diff"]);
    const count = pick(root, ["count", "listings_count", "items_count", "ads_count", "n"]);
    const rMin = pick(root, ["min", "range_min", "low", "from"]);
    const rMax = pick(root, ["max", "range_max", "high", "to"]);

    setKpi("kpiTypical", formatMoney(typical));
    if (delta === null || delta === undefined || Number.isNaN(Number(delta))) setKpi("kpiDelta", "—");
    else {
      const n = Number(delta);
      const s = (n > 0 ? "+" : "") + n.toLocaleString("uk-UA");
      setKpi("kpiDelta", s);
    }

    setKpi("kpiRange", (rMin !== undefined || rMax !== undefined) ? `${formatMoney(rMin)} — ${formatMoney(rMax)}` : "—");
    setKpi("kpiCount", (count === undefined ? "—" : Number(count).toLocaleString("uk-UA")));

    setHint("marketHint", "✅ Дані оновлено.");
    showToast("Ринок оновлено.");

  } catch (err) {
    setError(errEl, userFriendlyError(err));
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

/* ========= Projects (temporary UX, no scary text) ========= */

function initProjects() {
  const projBtn = $("btnProjectsReload");
  if (!projBtn) return;

  projBtn.addEventListener("click", () => {
    const list = $("projectsList");
    const info = $("projectsInfo");
    if (list) list.textContent = "Поки що проєкти не підключені.";
    if (info) info.textContent = "Скоро додамо завантаження з API.";
    showToast("Проєкти: у розробці.");
  });
}

/* ========= Health ping (retry) ========= */

async function pingOnce() {
  await apiFetchJson(ENDPOINTS.health);
}

async function ping() {
  setServerStatus("connecting");

  for (let i = 0; i <= PING_RETRIES; i++) {
    try {
      await pingOnce();
      setServerStatus("online");
      return true;
    } catch (e) {
      // wait a bit and retry (Render cold start)
      if (i < PING_RETRIES) await new Promise(r => setTimeout(r, 900));
    }
  }

  setServerStatus("offline");
  return false;
}

/* ========= INIT ========= */

function init() {
  initNav();
  initAuth();
  initQueryUI();
  initMarket();
  initProjects();

  // default tab
  setTab("market");

  // Ping now + periodically
  ping();
  setInterval(ping, PING_INTERVAL_MS);

  // If token exists, try /auth/me
  if (getToken()) {
    fetchMe().then((me) => {
      if (!me) {
        setToken("");
        uiAfterLoginOff();
      }
    });
  } else {
    uiAfterLoginOff();
  }
}

document.addEventListener("DOMContentLoaded", init);
