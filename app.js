/* ========= CONFIG ========= */

// 1) Впиши свой backend URL:
const API_BASE = "https://YOUR-BACKEND.onrender.com";

// 2) Если у тебя другие пути — поменяй тут:
const ENDPOINTS = {
  health: "/health",
  projects: "/projects",          // GET -> [{id,name}] или [{id,title}]
  market: "/market/overview",     // GET -> { typical_price, delta_typical_price, range, count } (пример)
  register: "/auth/register",     // POST {first_name,last_name,email,password}
  login: "/auth/login",           // POST {email,password}
  me: "/auth/me",                 // GET -> {first_name,last_name,email}
  logout: "/auth/logout",         // POST
};

/* ========= HELPERS ========= */

const $ = (id) => document.getElementById(id);

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

function setError(el, msg) {
  el.textContent = msg || "";
  el.classList.toggle("show", !!msg);
}

function setServerStatus(state) {
  const el = $("serverStatus");
  const dot = el.querySelector(".dot");
  const text = el.querySelector("span:last-child");

  dot.classList.remove("red", "green", "gray");
  if (state === "ok") {
    dot.classList.add("green");
    text.textContent = "Сервер OK";
  } else if (state === "down") {
    dot.classList.add("red");
    text.textContent = "Сервер недоступний";
  } else {
    dot.classList.add("gray");
    text.textContent = "перевірка…";
  }
}

async function apiFetch(path, { method = "GET", body = null, headers = {} } = {}) {
  const url = API_BASE.replace(/\/$/, "") + path;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : null,
    // важно если cookie-сессии:
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

/* ========= NAV ========= */

function setTab(tab) {
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  $(`section-${tab}`).classList.add("active");
}

function initNav() {
  $("nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    setTab(btn.dataset.tab);
  });
}

/* ========= STATE ========= */

const state = {
  projects: [],
  me: null,

  // market pagination:
  marketOffset: 0,
  marketPoints: 30,
  marketReliable: false,
  marketProjectId: null,

  // for prev/next enable:
  canNext: true,
};

/* ========= PROJECTS ========= */

function normalizeProject(p) {
  return {
    id: p.id ?? p.project_id ?? p.uuid ?? p.slug,
    name: p.name ?? p.title ?? p.project_name ?? String(p.id ?? "Проєкт"),
  };
}

function renderProjects() {
  const list = $("projectsList");
  const sel = $("marketProject");

  sel.innerHTML = "";
  if (!state.projects.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— немає проєктів —";
    sel.appendChild(opt);
    list.textContent = "Немає проєктів.";
    return;
  }

  state.projects.forEach((p, idx) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);

    if (idx === 0 && !state.marketProjectId) state.marketProjectId = p.id;
  });

  sel.value = state.marketProjectId;

  list.innerHTML = state.projects
    .map((p) => `• ${p.name} <span class="muted">(${p.id})</span>`)
    .join("<br/>");
}

async function loadProjects() {
  setError($("projectsError"), "");
  $("projectsInfo").textContent = "Завантаження…";
  try {
    const raw = await apiFetch(ENDPOINTS.projects);
    const arr = Array.isArray(raw) ? raw : (raw.items || raw.projects || []);
    state.projects = arr.map(normalizeProject).filter((p) => p.id != null);
    renderProjects();
    $("projectsInfo").textContent = `Проєктів: ${state.projects.length}`;
  } catch (e) {
    $("projectsInfo").textContent = "";
    setError($("projectsError"), e.message || "Помилка завантаження проєктів.");
  }
}

/* ========= MARKET ========= */

function setMarketButtons() {
  const prev = $("btnPrev");
  const next = $("btnNext");
  prev.disabled = state.marketOffset <= 0;
  next.disabled = !state.canNext;
}

function renderMarketKpi(data) {
  // Подстрой поля под свой API при необходимости
  const typical = data.typical_price ?? data.typical ?? data.median ?? null;
  const delta = data.delta_typical_price ?? data.delta ?? data.change ?? null;
  const range = data.range ?? (data.min != null && data.max != null ? `${data.min}–${data.max}` : null);
  const count = data.count ?? data.total ?? null;

  $("kpiTypical").textContent = typical != null ? String(typical) : "—";
  $("kpiDelta").textContent = delta != null ? String(delta) : "—";
  $("kpiRange").textContent = range != null ? String(range) : "—";
  $("kpiCount").textContent = count != null ? String(count) : "—";
}

async function loadMarket() {
  setError($("marketError"), "");
  $("marketHint").textContent = "Завантаження…";

  // sync UI -> state
  state.marketProjectId = $("marketProject").value || null;
  state.marketPoints = Number($("marketPoints").value || 30);
  state.marketOffset = Number($("marketOffset").value || 0);
  state.marketReliable = !!$("marketReliable").checked;

  if (!state.marketProjectId) {
    $("marketHint").textContent = "";
    setError($("marketError"), "Оберіть проєкт.");
    return;
  }

  try {
    // пример: query params
    const params = new URLSearchParams({
      project_id: String(state.marketProjectId),
      points: String(state.marketPoints),
      offset: String(state.marketOffset),
      reliable_only: state.marketReliable ? "1" : "0",
    });

    const data = await apiFetch(`${ENDPOINTS.market}?${params.toString()}`);

    renderMarketKpi(data);

    // логика next: если API возвращает "has_more" — используем, иначе считаем true по умолчанию
    state.canNext = data.has_more != null ? !!data.has_more : true;

    $("marketHint").textContent = `Зсув: ${state.marketOffset}`;
    setMarketButtons();
  } catch (e) {
    $("marketHint").textContent = "";
    setError($("marketError"), e.message || "Помилка запиту. Перевірте дані.");
  }
}

function initMarket() {
  $("btnMarketLoad").addEventListener("click", (e) => {
    e.preventDefault();
    loadMarket();
  });

  $("btnPrev").addEventListener("click", (e) => {
    e.preventDefault();
    state.marketOffset = Math.max(0, state.marketOffset - state.marketPoints);
    $("marketOffset").value = String(state.marketOffset);
    loadMarket();
  });

  $("btnNext").addEventListener("click", (e) => {
    e.preventDefault();
    if (!state.canNext) return;
    state.marketOffset = state.marketOffset + state.marketPoints;
    $("marketOffset").value = String(state.marketOffset);
    loadMarket();
  });
}

/* ========= AUTH ========= */

function renderMe() {
  if (!state.me) {
    $("meName").textContent = "—";
    $("meEmail").textContent = "Не виконано вхід.";
    return;
  }
  const fn = state.me.first_name ?? "";
  const ln = state.me.last_name ?? "";
  $("meName").textContent = `${fn} ${ln}`.trim() || "—";
  $("meEmail").textContent = state.me.email ?? "—";
}

async function fetchMe() {
  try {
    const me = await apiFetch(ENDPOINTS.me);
    state.me = me;
    renderMe();
  } catch {
    state.me = null;
    renderMe();
  }
}

async function handleRegister(e) {
  e.preventDefault();
  setError($("accountError"), "");
  $("btnRegister").disabled = true;

  const first_name = $("regFirstName").value.trim();
  const last_name = $("regLastName").value.trim();
  const email = $("regEmail").value.trim();
  const password = $("regPassword").value;

  try {
    if (!first_name || !last_name) throw new Error("Вкажіть імʼя та прізвище.");
    if (!email) throw new Error("Вкажіть email.");
    if (!password || password.length < 8) throw new Error("Пароль має містити мінімум 8 символів.");

    await apiFetch(ENDPOINTS.register, {
      method: "POST",
      body: { first_name, last_name, email, password },
    });

    showToast("Ви успішно зареєструвалися.");

    // скрываем регистрацию, оставляем вход
    $("registerBlock").style.display = "none";

    // автозаполним вход:
    $("loginEmail").value = email;
    $("loginPassword").value = "";
    $("loginInfo").textContent = "Тепер виконайте вхід.";

    // опционально: сразу перейти на вход
    // setTab("account");
  } catch (err) {
    setError($("accountError"), err.message || "Помилка реєстрації.");
  } finally {
    $("btnRegister").disabled = false;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  setError($("accountError"), "");
  $("btnLogin").disabled = true;
  $("loginInfo").textContent = "Вхід…";

  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  try {
    if (!email || !password) throw new Error("Вкажіть email та пароль.");

    await apiFetch(ENDPOINTS.login, {
      method: "POST",
      body: { email, password },
    });

    showToast("Вхід виконано успішно.");
    $("loginInfo").textContent = "";
    await fetchMe();
  } catch (err) {
    $("loginInfo").textContent = "";
    setError($("accountError"), err.message || "Помилка входу. Перевірте дані.");
  } finally {
    $("btnLogin").disabled = false;
  }
}

async function handleLogout() {
  setError($("accountError"), "");
  $("btnLogout").disabled = true;
  try {
    await apiFetch(ENDPOINTS.logout, { method: "POST" });
    state.me = null;
    renderMe();
    showToast("Ви вийшли з акаунта.");
  } catch (err) {
    setError($("accountError"), err.message || "Не вдалося вийти.");
  } finally {
    $("btnLogout").disabled = false;
  }
}

function initAuth() {
  $("loginForm").addEventListener("submit", handleLogin);
  $("registerForm").addEventListener("submit", handleRegister);
  $("btnLogout").addEventListener("click", (e) => {
    e.preventDefault();
    handleLogout();
  });
}

/* ========= SERVER HEALTH ========= */

async function ping() {
  setServerStatus("unknown");
  try {
    await apiFetch(ENDPOINTS.health);
    setServerStatus("ok");
  } catch {
    setServerStatus("down");
  }
}

/* ========= INIT ========= */

function init() {
  initNav();

  // Buttons etc.
  initMarket();
  initAuth();

  $("btnProjectsReload").addEventListener("click", (e) => {
    e.preventDefault();
    loadProjects();
  });

  // First load
  ping();
  loadProjects();
  fetchMe();

  // Set initial market buttons
  setMarketButtons();
}

// Start when DOM ready
document.addEventListener("DOMContentLoaded", init);
