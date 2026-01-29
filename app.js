/* ========= SellCase app.js (OLX projects + market + auth + autodetect search/analytics) ========= */

const API_BASE = "https://sellcase-backend.onrender.com";

const ENDPOINTS = {
  health: "/health",

  // auth
  register: "/auth/register",
  login: "/auth/login",
  me: "/auth/me",

  // olx projects
  olxProjects: "/olx/projects/",

  // olx market
  olxProjectMarket: (projectId) => `/olx/projects/${projectId}/market`,
  olxProjectMarketHistory: (projectId, limit = 30, offset = 0, onlyValid = true) =>
    `/olx/projects/${projectId}/market/history?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}&only_valid=${onlyValid ? "true" : "false"}`,

  // openapi
  openapi: "/openapi.json",
};

const LS_KEY = "sellcase_saved_queries_v1";
const LS_TOKEN = "sellcase_token_v1";
const LS_SELECTED_PROJECT = "sellcase_selected_project_v1";

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

function normalizeFetchError(err) {
  const m = String(err?.message || err || "");
  if (m.toLowerCase().includes("failed to fetch")) {
    return "Не вдалося підключитися до сервера. Перевір API_BASE, CORS та доступність backend.";
  }
  return m || "Невідома помилка.";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ========= Networking ========= */

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
  // history paging for market/history
  historyOffset: 0,
  historyLimit: 30,
  historyOnlyValid: true,
};

/* ========= Formatting ========= */

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

function formatMoney(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("uk-UA");
}

/* ========= AUTH UI ========= */

function uiAfterLoginOn(meLike) {
  const forms = $("authForms");
  if (forms) forms.style.display = "none";

  const done = $("authDone");
  if (done) done.style.display = "block";

  const email = (meLike?.email || $("loginEmail")?.value || "").trim();

  // ✅ fallback: если full_name null -> username из email
  const full =
    (meLike?.full_name || meLike?.fullName || "").trim() ||
    (email ? email.split("@")[0] : "") ||
    "Користувач";

  const av = $("userAvatar");
  const title = $("userTitle");
  const sub = $("userSubtitle");

  if (title) title.textContent = full;
  if (sub) sub.textContent = email ? `✅ Вхід успішно виконано · ${email}` : "✅ Вхід успішно виконано.";
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

    const loginRes = await apiFetchForm(ENDPOINTS.login, { username: email, password });
    const token = extractToken(loginRes);

    if (!token) throw new Error("Сервер не повернув access_token. Перевір відповідь /auth/login у Swagger.");

    setToken(token);

    showToast("✅ Вхід успішно виконано.");
    setHint("loginInfo", "✅ Вхід успішно виконано.");

    // placeholder
    uiAfterLoginOn({ email, full_name: "" });

    // real /auth/me
    const me = await fetchMe();
    if (!me) throw new Error("Токен збережено, але /auth/me не відповів. Перевір Authorization на бекенді.");

    // Load projects after login
    await loadProjectsIntoUI();

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

  box.innerHTML = items
    .map((q, i) => {
      const title = `${q.text || "—"}${q.category ? " · " + q.category : ""}`;
      return `
      <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:1100;">${escapeHtml(title)}</div>
          <div class="hint">points: ${q.points ?? "—"}, reliable: ${q.reliable ? "так" : "ні"}, offset: ${q.offset ?? 0}</div>
        </div>
        <div class="row">
          <button class="btn" type="button" data-action="apply" data-index="${i}">Застосувати</button>
          <button class="btn" type="button" data-action="del" data-index="${i}">🗑</button>
        </div>
      </div>`;
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

/* ========= Projects (OLX) ========= */

function saveSelectedProjectId(id) {
  if (id) localStorage.setItem(LS_SELECTED_PROJECT, String(id));
  else localStorage.removeItem(LS_SELECTED_PROJECT);
}

function getSelectedProjectId() {
  const v = localStorage.getItem(LS_SELECTED_PROJECT);
  return v ? Number(v) : null;
}

function setProjectsSelectOptions(projects) {
  const sel = $("marketProject");
  if (!sel) return;

  sel.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— оберіть проект —";
  sel.appendChild(opt0);

  for (const p of projects) {
    const opt = document.createElement("option");
    opt.value = String(p.id);
    opt.textContent = `${p.name || "Project"} (#${p.id})`;
    sel.appendChild(opt);
  }

  const saved = getSelectedProjectId();
  if (saved && projects.some(p => Number(p.id) === saved)) {
    sel.value = String(saved);
  }
}

async function loadProjectsIntoUI() {
  // token required
  if (!getToken()) return;

  try {
    const data = await apiFetchJson(ENDPOINTS.olxProjects);
    state.projects = Array.isArray(data) ? data : (data?.items || []);
    setProjectsSelectOptions(state.projects);

    // show projects in Projects section too
    renderProjectsList();
  } catch (err) {
    // silent for market; show in projects section
    const pe = $("projectsError");
    if (pe) setError(pe, normalizeFetchError(err));
  }
}

function renderProjectsList() {
  const list = $("projectsList");
  if (!list) return;

  if (!state.projects.length) {
    list.textContent = "Немає проектів або API не відповів.";
    return;
  }

  list.innerHTML = state.projects.map(p => {
    return `
      <div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="font-weight:1100;">${escapeHtml(p.name || "—")}</div>
        <div class="hint">id: ${p.id} · active: ${p.is_active ? "так" : "ні"}</div>
        ${p.search_url ? `<div class="hint">${escapeHtml(p.search_url)}</div>` : ``}
      </div>
    `;
  }).join("");
}

function initProjects() {
  const btn = $("btnProjectsReload");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const info = $("projectsInfo");
    const err = $("projectsError");
    if (err) setError(err, "");
    if (info) setHint("projectsInfo", "");

    if (!getToken()) {
      showToast("Спочатку увійдіть в акаунт.");
      setTab("account");
      return;
    }

    btn.disabled = true;
    try {
      await loadProjectsIntoUI();
      setHint("projectsInfo", "✅ Список оновлено.");
      showToast("Проекти оновлено.");
    } catch (e) {
      if (err) setError(err, normalizeFetchError(e));
    } finally {
      btn.disabled = false;
    }
  });

  const sel = $("marketProject");
  if (sel) {
    sel.addEventListener("change", () => {
      const id = sel.value ? Number(sel.value) : null;
      saveSelectedProjectId(id);
      // reset paging when project changes
      state.historyOffset = 0;
    });
  }
}

/* ========= Market (OLX market endpoints) ========= */

function setKpi(id, val) {
  const el = $(id);
  if (!el) return;
  el.textContent = val;
}

async function loadMarketOverview(projectId) {
  // GET /olx/projects/{project_id}/market
  const data = await apiFetchJson(ENDPOINTS.olxProjectMarket(projectId));

  const last = data?.last || null;
  const prev = data?.prev || null;

  if (!last) {
    setKpi("kpiTypical", "—");
    setKpi("kpiDelta", "—");
    setKpi("kpiRange", "—");
    setKpi("kpiCount", "—");
    return;
  }

  const typical = last.median_price ?? last.avg_price ?? last.p50_price ?? last.typical_price;
  const count = last.items_count ?? last.count ?? last.ads_count;
  const rangeMin = last.p25_price ?? last.min_price ?? last.range_min;
  const rangeMax = last.p75_price ?? last.max_price ?? last.range_max;

  setKpi("kpiTypical", formatMoney(typical));
  setKpi("kpiRange", `${formatMoney(rangeMin)} — ${formatMoney(rangeMax)}`);
  setKpi("kpiCount", count !== undefined ? Number(count).toLocaleString("uk-UA") : "—");

  // delta: last.typical - prev.typical (fallback)
  let delta = null;
  if (prev) {
    const prevTypical = prev.median_price ?? prev.avg_price ?? prev.p50_price ?? prev.typical_price;
    if (prevTypical !== undefined && typical !== undefined) {
      delta = Number(typical) - Number(prevTypical);
    }
  }
  if (delta === null || Number.isNaN(Number(delta))) {
    setKpi("kpiDelta", "—");
  } else {
    const n = Number(delta);
    const s = (n > 0 ? "+" : "") + n.toLocaleString("uk-UA");
    setKpi("kpiDelta", s);
  }

  return data;
}

async function loadMarketHistory(projectId) {
  // GET /olx/projects/{project_id}/market/history
  const limit = Number($("marketPoints")?.value || state.historyLimit);
  const offset = state.historyOffset;
  const onlyValid = !!$("marketReliable")?.checked;

  state.historyLimit = limit;
  state.historyOnlyValid = onlyValid;

  const data = await apiFetchJson(ENDPOINTS.olxProjectMarketHistory(projectId, limit, offset, onlyValid));
  return data;
}

function ensureMarketHint(h) {
  const el = $("marketHint");
  if (el) el.textContent = h || "";
}

async function loadMarket() {
  const errEl = $("marketError");
  setError(errEl, "");
  ensureMarketHint("");

  if (!getToken()) {
    setError(errEl, "Потрібен вхід. Спочатку увійдіть в аккаунт.");
    setTab("account");
    return;
  }

  const sel = $("marketProject");
  const projectId = sel?.value ? Number(sel.value) : getSelectedProjectId();
  if (!projectId) {
    setError(errEl, "Оберіть проект.");
    return;
  }

  const btn = $("btnMarketLoad");
  if (btn) btn.disabled = true;

  try {
    // Overview (last vs prev)
    await loadMarketOverview(projectId);

    // Optional: load history if you want to use offset/points as “history”
    // We'll load it and just confirm it exists; can be used later for charts
    await loadMarketHistory(projectId);

    ensureMarketHint("✅ Дані оновлено.");
    showToast("Ринок: KPI оновлено.");
  } catch (err) {
    setError(errEl, normalizeFetchError(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initMarket() {
  const loadBtn = $("btnMarketLoad");
  if (loadBtn) loadBtn.addEventListener("click", loadMarket);

  const prev = $("btnPrev");
  const next = $("btnNext");

  if (prev) prev.addEventListener("click", async () => {
    state.historyOffset = Math.max(0, (state.historyOffset || 0) - state.historyLimit);
    await loadMarket();
  });

  if (next) next.addEventListener("click", async () => {
    state.historyOffset = (state.historyOffset || 0) + state.historyLimit;
    await loadMarket();
  });
}

/* ========= Queries: autodetect search/analytics ========= */

async function loadOpenApi() {
  try {
    return await apiFetchJson(ENDPOINTS.openapi);
  } catch {
    return null;
  }
}

function findPathsByKeywords(openapi, keywords = []) {
  const paths = Object.keys(openapi?.paths || {});
  const k = keywords.map((s) => String(s).toLowerCase());
  return paths.filter((p) => k.every((kw) => p.toLowerCase().includes(kw)));
}

function ensureQueryResultBox() {
  let box = document.getElementById("queryResult");
  if (box) return box;

  const sec = document.getElementById("section-queries");
  if (!sec) return null;

  box = document.createElement("div");
  box.id = "queryResult";
  box.style.marginTop = "12px";
  box.style.padding = "12px";
  box.style.background = "white";
  box.style.border = "1px solid var(--border)";
  box.style.borderRadius = "22px";
  box.style.boxShadow = "var(--shadow-soft)";
  box.innerHTML = `<div class="hint">Результат пошуку з’явиться тут.</div>`;
  sec.appendChild(box);

  return box;
}

function renderQueryResult(data) {
  const box = ensureQueryResultBox();
  if (!box) return;

  const items = Array.isArray(data) ? data : (data?.items || data?.results || []);
  const total = data?.total ?? (Array.isArray(items) ? items.length : 0);

  const head = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <div style="font-weight:1100;">Результати</div>
      <div class="hint">total: ${total}</div>
    </div>
    <div style="height:1px;background:var(--border);margin:12px 0;"></div>
  `;

  if (!items || !items.length) {
    box.innerHTML = head + `<div class="hint">Нічого не знайдено.</div>`;
    return;
  }

  const rows = items.slice(0, 10).map((it) => {
    const title = it.title || it.name || it.query || it.text || "—";
    const price = it.price || it.median_price || it.typical_price || it.avg_price;
    const meta = [
      it.category ? `категорія: ${it.category}` : null,
      it.items_count ? `оголошень: ${it.items_count}` : null,
      it.taken_at ? `зріз: ${formatDateISO(it.taken_at)}` : null,
    ].filter(Boolean).join(" · ");

    return `
      <div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="font-weight:1100;">${escapeHtml(title)}</div>
        <div class="hint">${escapeHtml(meta || "")}</div>
        ${price !== undefined ? `<div style="margin-top:6px;font-weight:1200;">${formatMoney(price)} грн</div>` : ``}
      </div>
    `;
  }).join("");

  box.innerHTML = head + rows + (items.length > 10 ? `<div class="hint">Показано 10 з ${items.length}.</div>` : "");
}

async function runSearchAnalytics() {
  ensureQueryResultBox();

  if (!getToken()) {
    showToast("Спочатку увійдіть в акаунт.");
    setTab("account");
    return;
  }

  const q = ($("queryText")?.value || "").trim();
  const category = ($("queryCategory")?.value || "").trim();

  if (!q) {
    showToast("Введіть запит (наприклад: iPhone).");
    return;
  }

  const openapi = await loadOpenApi();

  let candidates = [];
  if (openapi) {
    candidates = [
      ...findPathsByKeywords(openapi, ["search", "analytics"]),
      ...findPathsByKeywords(openapi, ["analytics"]),
      ...findPathsByKeywords(openapi, ["search"]),
    ];
  }

  if (!candidates.length) {
    candidates = [
      "/search/analytics",
      "/olx/search/analytics",
      "/analytics/search",
      "/analytics",
      "/search",
    ];
  }

  candidates = [...new Set(candidates)];

  const payload = {
    query: q,
    text: q,
    q: q,
    category: category || undefined,
  };

  let lastErr = null;

  for (const path of candidates) {
    try {
      const data = await apiFetchJson(path, { method: "POST", body: payload });
      showToast(`✅ Працює: ${path}`);
      renderQueryResult(data);
      return;
    } catch (e1) {
      lastErr = e1;

      try {
        const qs = new URLSearchParams();
        qs.set("query", q);
        if (category) qs.set("category", category);
        const data2 = await apiFetchJson(`${path}?${qs.toString()}`);
        showToast(`✅ Працює: ${path} (GET)`);
        renderQueryResult(data2);
        return;
      } catch (e2) {
        lastErr = e2;
      }
    }
  }

  const box = ensureQueryResultBox();
  const msg = normalizeFetchError(lastErr);
  box.innerHTML = `
    <div style="font-weight:1100;">Помилка</div>
    <div style="height:1px;background:var(--border);margin:12px 0;"></div>
    <div class="hint">${escapeHtml(msg)}</div>
    <div class="hint" style="margin-top:8px;">Я пробував шляхи: ${escapeHtml(candidates.join(", "))}</div>
  `;
  showToast("❌ Search/analytics поки не підключено (див. помилку).");
}

function initQueryUI() {
  const run = $("btnRunQuery");
  if (run) run.addEventListener("click", async () => {
    run.disabled = true;
    try {
      await runSearchAnalytics();
    } finally {
      run.disabled = false;
    }
  });

  const save = $("btnSaveQuery");
  if (save) save.addEventListener("click", () => {
    const points = Number($("marketPoints")?.value || 30);
    const offset = state.historyOffset || 0;
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
  ensureQueryResultBox();
}

/* ========= INIT ========= */

function init() {
  initNav();
  initAuth();
  initProjects();
  initMarket();
  initQueryUI();

  ping();

  // If token exists, try /auth/me and load projects
  if (getToken()) {
    fetchMe().then(async (me) => {
      if (me) {
        await loadProjectsIntoUI();
      } else {
        setToken("");
        uiAfterLoginOff();
      }
    });
  } else {
    uiAfterLoginOff();
  }

  // default tab
  setTab("market");
}

document.addEventListener("DOMContentLoaded", init);
