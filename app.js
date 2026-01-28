/* ========= SellCase app.js (final, updated) =========
   Swagger confirms:
   - POST /auth/register (application/json): { email, full_name, password }
   - POST /auth/login (application/x-www-form-urlencoded): username, password
   - GET  /auth/me returns { email, full_name, id, created_at, is_active }
*/

const API_BASE = "https://sellcase-backend.onrender.com"; // <-- проверь

const ENDPOINTS = {
  health: "/health",
  register: "/auth/register",
  login: "/auth/login",
  me: "/auth/me",
  logout: "/auth/logout", // если нет — просто очистим UI
};

const LS_KEY = "sellcase_saved_queries_v1";

const $ = (id) => document.getElementById(id);

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

async function apiFetchJson(path, { method = "GET", body = null, headers = {} } = {}) {
  const url = API_BASE.replace(/\/$/, "") + path;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : null,
    credentials: "include",
  });

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
  const url = API_BASE.replace(/\/$/, "") + path;

  const body = new URLSearchParams();
  Object.entries(formParams || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) body.append(k, String(v));
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

const state = { me: null };

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

  // extended fields
  if ($("meId")) $("meId").textContent = String(meLike?.id ?? "—");
  if ($("meCreated")) $("meCreated").textContent = formatDateISO(meLike?.created_at);
  if ($("meActive")) $("meActive").textContent =
    meLike?.is_active === true ? "Активний" :
    meLike?.is_active === false ? "Неактивний" : "—";
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
    // update profile card with real data
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

    // IMPORTANT: your API expects full_name
    await apiFetchJson(ENDPOINTS.register, {
      method: "POST",
      body: {
        email,
        full_name: `${first} ${last}`.trim(),
        password,
      },
    });

    showToast("✅ Ви успішно зареєструвалися.");
    // hide register block, keep login
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

    // IMPORTANT: your login uses x-www-form-urlencoded with username/password
    await apiFetchForm(ENDPOINTS.login, {
      username: email,
      password,
    });

    // show success immediately (even if /auth/me fails for a moment)
    showToast("✅ Вхід успішно виконано.");
    setHint("loginInfo", "✅ Вхід успішно виконано.");

    uiAfterLoginOn({ email, full_name: "Користувач" });

    // fetch real user profile
    await fetchMe();

    // stay on account screen (profile)
    setTab("account");

  } catch (err) {
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
    // try server logout, but don't depend on it
    try {
      await apiFetchJson(ENDPOINTS.logout, { method: "POST" });
    } catch {
      // ignore if missing
    }

    state.me = null;
    uiAfterLoginOff();
    showToast("Ви вийшли з акаунта.");

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

/* ========= INIT ========= */

function init() {
  initNav();
  initAuth();
  initQueryUI();

  // Projects page currently is UI-only; you can connect to API later.
  const projBtn = $("btnProjectsReload");
  if (projBtn) projBtn.addEventListener("click", () => {
    $("projectsList").textContent = "Поки що не підключено до API проектів.";
    setHint("projectsInfo", "MVP: підключимо згодом.");
  });

  // Market buttons (placeholders — подключим когда будет endpoint)
  const loadBtn = $("btnMarketLoad");
  if (loadBtn) loadBtn.addEventListener("click", () => {
    setHint("marketHint", "MVP: підключимо ринок до API. Зараз це макет.");
    showToast("Завантаження ринку: підключимо API ендпоінт.");
  });
  const prev = $("btnPrev");
  const next = $("btnNext");
  if (prev) prev.addEventListener("click", () => showToast("Попередні: підключимо пагінацію до API."));
  if (next) next.addEventListener("click", () => showToast("Наступні: підключимо пагінацію до API."));

  // initial
  ping();

  // If user already logged in (cookie), show profile mode
  fetchMe().then((me) => {
    if (me) {
      uiAfterLoginOn(me);
      setTab("account");
    } else {
      uiAfterLoginOff();
    }
  });

  setTab("market");
}

document.addEventListener("DOMContentLoaded", init);
