/* ========= SellCase app.js (final) =========
   Works with your Swagger:
   - POST /auth/register (application/json): { email, full_name, password }
   - POST /auth/login (application/x-www-form-urlencoded): username, password
   - GET  /auth/me (returns { email, full_name, id, created_at, is_active })
   - POST /auth/logout (if exists; if not, it will just clear UI)
   - POST /leads/ (optional)
   - GET  /leads/all (optional)
   - GET  /metrics/summary (optional)
   - GET  /health (optional)
*/

const API_BASE = "https://sellcase-backend.onrender.com"; // <-- проверь, что именно это у тебя

// Если какие-то пути отличаются — меняй тут:
const ENDPOINTS = {
  health: "/health",
  register: "/auth/register",
  login: "/auth/login",
  me: "/auth/me",
  logout: "/auth/logout", // если нет такого — оставь, код обработает
  metricsSummary: "/metrics/summary",
  leadsCreate: "/leads/",
  leadsAll: "/leads/all",
};

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
  // try to show human text instead of "Failed to fetch"
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
  // login часто возвращает token/json, но нам не обязательно
  if (!res.ok) {
    // попробуем вытащить detail/message
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

  // если это JSON — вернём, иначе вернём текст
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

const state = {
  me: null,
};

function splitName(fullName) {
  if (!fullName) return { first: "", last: "" };
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function renderMe() {
  const meName = $("meName");
  const meEmail = $("meEmail");

  if (!meName || !meEmail) return;

  if (!state.me) {
    meName.textContent = "—";
    meEmail.textContent = "Не виконано вхід.";
    return;
  }

  const email = state.me.email ?? "—";
  const full_name = state.me.full_name ?? "";
  const { first, last } = splitName(full_name);

  meName.textContent = `${first} ${last}`.trim() || full_name || "—";
  meEmail.textContent = email;
}

async function fetchMe() {
  try {
    const me = await apiFetchJson(ENDPOINTS.me);
    state.me = me;
    renderMe();
    return me;
  } catch {
    state.me = null;
    renderMe();
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

    showToast("Ви успішно зареєструвалися.");

    // hide registration block, keep only login
    const regBlock = $("registerBlock");
    if (regBlock) regBlock.style.display = "none";

    // fill login email
    if ($("loginEmail")) $("loginEmail").value = email;
    if ($("loginPassword")) $("loginPassword").value = "";
    setHint("loginInfo", "Тепер виконайте вхід.");

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
  setHint("loginInfo", "Вхід…");

  const btn = $("btnLogin");
  if (btn) btn.disabled = true;

  const email = ($("loginEmail")?.value || "").trim();
  const password = $("loginPassword")?.value || "";

  try {
    if (!email || !password) throw new Error("Вкажіть email та пароль.");

    // Swagger shows x-www-form-urlencoded with "username" and "password"
    await apiFetchForm(ENDPOINTS.login, {
      username: email,
      password,
      // grant_type, scope, client_id, client_secret are optional
    });

    showToast("Вхід виконано успішно.");
    setHint("loginInfo", "");

    await fetchMe();
  } catch (err) {
    setHint("loginInfo", "");
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
    // if your backend has logout - good. if not, we'll just clear UI.
    try {
      await apiFetchJson(ENDPOINTS.logout, { method: "POST" });
    } catch {
      // ignore if endpoint missing
    }

    state.me = null;
    renderMe();
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
}

/* ========= OPTIONAL: Metrics / Leads / Market =========
   If you later connect UI to /metrics/summary etc., here are helpers.
*/

async function ping() {
  setServerStatus("unknown");
  try {
    await apiFetchJson(ENDPOINTS.health);
    setServerStatus("ok");
  } catch {
    // If /health doesn't exist, try /metrics/summary as fallback:
    try {
      await apiFetchJson(ENDPOINTS.metricsSummary);
      setServerStatus("ok");
    } catch {
      setServerStatus("down");
    }
  }
}

/* ========= INIT ========= */

function init() {
  initNav();
  initAuth();

  // initial checks
  ping();
  fetchMe();

  // default tab
  setTab("market");
}

document.addEventListener("DOMContentLoaded", init);
