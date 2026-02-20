/* app.js — SellCase static frontend (no frameworks)
   - Auto-detects API paths from OpenAPI (/openapi.json)
   - Supports OAuth2 form login OR JSON login (based on schema)
   - Stores token, attaches Authorization header
   - Fixes "[object Object]" errors, provides readable messages
*/

(() => {
  // =========================
  // CONFIG
  // =========================
  const API_BASE = "https://sellcase-backend.onrender.com"; // <-- твой бэк
  const LS_TOKEN = "sellcase_token";
  const LS_USER  = "sellcase_user";

  // =========================
  // DOM HELPERS
  // =========================
  const $ = (id) => document.getElementById(id);

  const toastEl = $("toast");
  const serverStatusEl = $("serverStatus");

  function setStatus(color, text) {
    if (!serverStatusEl) return;
    const dot = serverStatusEl.querySelector(".dot");
    const span = serverStatusEl.querySelector("span:last-child");
    dot.classList.remove("red", "green");
    if (color === "red") dot.classList.add("red");
    if (color === "green") dot.classList.add("green");
    span.textContent = text;
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  function setError(el, msg) {
    if (!el) return;
    if (!msg) {
      el.classList.remove("show");
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.classList.add("show");
  }

  function safeMsg(err) {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    if (err?.message) return err.message;

    // FastAPI validation error style: {detail:[{loc,msg,type},...]}
    if (err?.detail) {
      if (typeof err.detail === "string") return err.detail;
      if (Array.isArray(err.detail)) {
        return err.detail
          .map((d) => {
            const loc = Array.isArray(d.loc) ? d.loc.join(".") : (d.loc || "body");
            return `${loc}: ${d.msg || "error"}`;
          })
          .join(" | ");
      }
    }
    try { return JSON.stringify(err); } catch { return String(err); }
  }

  // =========================
  // AUTH STORAGE
  // =========================
  function getToken() {
    return localStorage.getItem(LS_TOKEN) || "";
  }
  function setToken(t) {
    if (t) localStorage.setItem(LS_TOKEN, t);
    else localStorage.removeItem(LS_TOKEN);
  }
  function setUser(u) {
    if (u) localStorage.setItem(LS_USER, JSON.stringify(u));
    else localStorage.removeItem(LS_USER);
  }
  function getUser() {
    const raw = localStorage.getItem(LS_USER);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // =========================
  // API CORE
  // =========================
  async function apiFetch(path, opts = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const headers = new Headers(opts.headers || {});

    // attach token if present
    const token = getToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    // default accept json
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    const res = await fetch(url, { ...opts, headers });

    // Try parse JSON, but not always
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const isJson = ct.includes("application/json");

    if (!res.ok) {
      let payload = null;
      if (isJson) {
        try { payload = await res.json(); } catch {}
      } else {
        try { payload = await res.text(); } catch {}
      }
      const e = new Error(`HTTP ${res.status}`);
      e.status = res.status;
      e.payload = payload;
      throw e;
    }

    if (res.status === 204) return null;
    if (isJson) return await res.json();
    return await res.text();
  }

  async function apiJson(path, method, bodyObj) {
    return apiFetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    });
  }

  async function apiForm(path, bodyObj) {
    const form = new URLSearchParams();
    Object.entries(bodyObj || {}).forEach(([k, v]) => form.set(k, v ?? ""));
    return apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  }

  // =========================
  // OPENAPI DETECTION
  // =========================
  let OPENAPI = null;

  async function loadOpenApi() {
    try {
      OPENAPI = await apiFetch("/openapi.json", { method: "GET", headers: {} });
      return OPENAPI;
    } catch (e) {
      // If blocked, we'll fallback
      OPENAPI = null;
      return null;
    }
  }

  function hasPath(method, p) {
    if (!OPENAPI?.paths) return false;
    const obj = OPENAPI.paths[p];
    if (!obj) return false;
    return !!obj[method.toLowerCase()];
  }

  function pickFirstExisting(candidates, method = "get") {
    for (const p of candidates) {
      if (hasPath(method, p)) return p;
    }
    return "";
  }

  // tries to find path by substring matches in OpenAPI
  function findPathByHint(method, includesArr = []) {
    if (!OPENAPI?.paths) return "";
    const m = method.toLowerCase();
    const paths = Object.keys(OPENAPI.paths);
    for (const p of paths) {
      const op = OPENAPI.paths[p]?.[m];
      if (!op) continue;
      const ok = includesArr.every((s) => p.toLowerCase().includes(s.toLowerCase()));
      if (ok) return p;
    }
    return "";
  }

  function loginWantsForm(loginPath) {
    try {
      const op = OPENAPI?.paths?.[loginPath]?.post;
      const content = op?.requestBody?.content;
      if (!content) return false;
      return !!content["application/x-www-form-urlencoded"];
    } catch {
      return false;
    }
  }

  // =========================
  // ENDPOINTS (auto)
  // =========================
  const EP = {
    health: "/health",
    register: "/auth/register",
    login: "/auth/login",
    me: "/auth/me",
    projectsList: "/olx/projects/",
    projectsCreate: "/olx/projects/",
    market: "/olx/projects/{project_id}/market",
    // optional, if exists:
    queriesList: "",
    queriesCreate: "",
    queriesRun: "",
  };

  function formatPath(p, params = {}) {
    let out = p;
    Object.entries(params).forEach(([k, v]) => {
      out = out.replace(`{${k}}`, encodeURIComponent(String(v)));
    });
    return out;
  }

  // =========================
  // UI NAV
  // =========================
  const sections = {
    market: $("section-market"),
    queries: $("section-queries"),
    projects: $("section-projects"),
    account: $("section-account"),
  };

  function showSection(name) {
    Object.values(sections).forEach((el) => el?.classList.remove("active"));
    sections[name]?.classList.add("active");

    document.querySelectorAll(".tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === name);
    });
  }

  function initNav() {
    document.querySelectorAll(".tab").forEach((b) => {
      b.addEventListener("click", () => showSection(b.dataset.tab));
    });
  }

  // =========================
  // AUTH UI
  // =========================
  const authForms = $("authForms");
  const authDone = $("authDone");
  const accountError = $("accountError");

  const loginForm = $("loginForm");
  const loginInfo = $("loginInfo");
  const loginEmail = $("loginEmail");
  const loginPassword = $("loginPassword");

  const registerForm = $("registerForm");
  const regFirstName = $("regFirstName");
  const regLastName = $("regLastName");
  const regEmail = $("regEmail");
  const regPassword = $("regPassword");

  const btnLogout = $("btnLogout");
  const btnGoMarket = $("btnGoMarket");

  const userAvatar = $("userAvatar");
  const userTitle = $("userTitle");
  const userSubtitle = $("userSubtitle");
  const meId = $("meId");
  const meCreated = $("meCreated");
  const meActive = $("meActive");

  function renderAuthState() {
    const token = getToken();
    const me = getUser();

    if (token && me) {
      if (authForms) authForms.style.display = "none";
      if (authDone) authDone.style.display = "block";

      const initials = (me?.first_name?.[0] || me?.email?.[0] || "U").toUpperCase();
      if (userAvatar) userAvatar.textContent = initials;

      const fullName = [me?.first_name, me?.last_name].filter(Boolean).join(" ").trim();
      if (userTitle) userTitle.textContent = fullName || me?.email || "Користувач";

      if (userSubtitle) userSubtitle.textContent = "✅ Вхід успішно виконано.";
      if (meId) meId.textContent = me?.id ?? "—";
      if (meCreated) meCreated.textContent = me?.created_at ?? "—";
      if (meActive) meActive.textContent = String(me?.is_active ?? "—");
    } else {
      if (authForms) authForms.style.display = "block";
      if (authDone) authDone.style.display = "none";
    }
  }

  async function fetchMe() {
    if (!EP.me) return null;
    const me = await apiFetch(EP.me, { method: "GET" });
    setUser(me);
    return me;
  }

  async function doLogin(email, password) {
    setError(accountError, "");
    if (loginInfo) loginInfo.textContent = "…";

    try {
      const wantsForm = OPENAPI ? loginWantsForm(EP.login) : true;

      let data;
      if (wantsForm) {
        // OAuth2PasswordRequestForm expects username+password
        data = await apiForm(EP.login, { username: email, password });
      } else {
        // JSON login
        data = await apiJson(EP.login, "POST", { email, password, username: email });
      }

      const token = data?.access_token || data?.token || data?.accessToken || "";
      if (!token) throw new Error("Login OK, but token not found in response");

      setToken(token);

      await fetchMe();
      renderAuthState();
      showToast("Успішний вхід ✅");
      if (loginInfo) loginInfo.textContent = "";

      // refresh protected areas
      await loadProjectsIntoUI();
      await loadProjectsSelect();
    } catch (e) {
      const msg = safeMsg(e.payload || e);
      setToken("");
      setUser(null);
      renderAuthState();
      setError(accountError, msg);
      if (loginInfo) loginInfo.textContent = "";
    }
  }

  async function doRegister(first_name, last_name, email, password) {
    setError(accountError, "");
    try {
      // send максимально совместимо: email + username (на всякий)
      const payload = {
        first_name: first_name || "",
        last_name: last_name || "",
        email: email || "",
        username: email || "",
        password: password || "",
      };

      await apiJson(EP.register, "POST", payload);

      // После регистрации не автологиним (как ты просил раньше),
      // но показываем успех.
      showToast("Реєстрація успішна ✅ Тепер увійдіть.");
    } catch (e) {
      const msg = safeMsg(e.payload || e);
      setError(accountError, msg);
    }
  }

  function initAuthHandlers() {
    if (loginForm) {
      loginForm.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const email = (loginEmail?.value || "").trim();
        const pass = (loginPassword?.value || "").trim();
        doLogin(email, pass);
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fn = (regFirstName?.value || "").trim();
        const ln = (regLastName?.value || "").trim();
        const em = (regEmail?.value || "").trim();
        const pw = (regPassword?.value || "").trim();
        doRegister(fn, ln, em, pw);
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener("click", async () => {
        setToken("");
        setUser(null);
        renderAuthState();
        showToast("Вихід виконано");
      });
    }

    if (btnGoMarket) {
      btnGoMarket.addEventListener("click", () => showSection("market"));
    }
  }

  // =========================
  // PROJECTS UI
  // =========================
  const btnProjectsReload = $("btnProjectsReload");
  const projectsInfo = $("projectsInfo");
  const projectsList = $("projectsList");
  const projectsError = $("projectsError");

  async function loadProjects() {
    if (!EP.projectsList) return [];
    return await apiFetch(EP.projectsList, { method: "GET" });
  }

  function renderProjects(list) {
    if (!projectsList) return;
    if (!Array.isArray(list) || list.length === 0) {
      projectsList.textContent = "—";
      return;
    }

    projectsList.innerHTML = list
      .map((p) => {
        const name = p?.name ?? "(без назви)";
        const id = p?.id ?? "";
        const url = p?.search_url ?? "";
        const active = p?.is_active ? "✅" : "⏸";
        return `
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:16px;background:#fff;box-shadow:0 8px 18px rgba(2,6,23,.06);margin-bottom:10px;">
            <div style="font-weight:1100;letter-spacing:-.01em;">${active} #${id} — ${escapeHtml(name)}</div>
            <div style="margin-top:6px;font-size:12px;color:#6b7280;font-weight:800;word-break:break-all;">${escapeHtml(url)}</div>
          </div>
        `;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadProjectsIntoUI() {
    setError(projectsError, "");
    if (projectsInfo) projectsInfo.textContent = "";

    try {
      if (!getToken()) {
        setError(projectsError, "Not authenticated");
        renderProjects([]);
        return;
      }
      const list = await loadProjects();
      renderProjects(list);
      if (projectsInfo) projectsInfo.textContent = `Знайдено: ${list.length}`;
    } catch (e) {
      const msg = safeMsg(e.payload || e);
      setError(projectsError, msg);
      renderProjects([]);
    }
  }

  function initProjectsHandlers() {
    if (btnProjectsReload) {
      btnProjectsReload.addEventListener("click", loadProjectsIntoUI);
    }
  }

  // =========================
  // MARKET UI
  // =========================
  const marketProject = $("marketProject");
  const marketPoints = $("marketPoints");
  const marketOffset = $("marketOffset");
  const marketReliable = $("marketReliable");

  const btnMarketLoad = $("btnMarketLoad");
  const btnPrev = $("btnPrev");
  const btnNext = $("btnNext");

  const marketHint = $("marketHint");
  const marketError = $("marketError");

  const kpiTypical = $("kpiTypical");
  const kpiDelta = $("kpiDelta");
  const kpiRange = $("kpiRange");
  const kpiCount = $("kpiCount");

  function setKpi(typical, delta, range, count) {
    if (kpiTypical) kpiTypical.textContent = typical ?? "—";
    if (kpiDelta) kpiDelta.textContent = delta ?? "—";
    if (kpiRange) kpiRange.textContent = range ?? "—";
    if (kpiCount) kpiCount.textContent = count ?? "—";
  }

  async function loadProjectsSelect() {
    if (!marketProject) return;

    marketProject.innerHTML = "";
    try {
      if (!getToken()) {
        marketProject.innerHTML = `<option value="">(увійдіть)</option>`;
        return;
      }
      const list = await loadProjects();
      if (!Array.isArray(list) || list.length === 0) {
        marketProject.innerHTML = `<option value="">(немає проектів)</option>`;
        return;
      }
      marketProject.innerHTML = list
        .map((p) => `<option value="${p.id}">${escapeHtml(p.name || ("Project " + p.id))}</option>`)
        .join("");
    } catch {
      marketProject.innerHTML = `<option value="">(помилка завантаження)</option>`;
    }
  }

  function fmtMoney(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return `${Math.round(n).toLocaleString("uk-UA")} грн`;
  }

  async function loadMarket() {
    setError(marketError, "");
    if (marketHint) marketHint.textContent = "";

    try {
      if (!getToken()) throw new Error("Not authenticated");

      const projectId = Number(marketProject?.value || 0);
      if (!projectId) throw new Error("Оберіть проект");

      const points = Math.max(5, Math.min(30, Number(marketPoints?.value || 30)));
      const offset = Math.max(0, Number(marketOffset?.value || 0));
      const reliable = !!marketReliable?.checked;

      // build query (supported by most FastAPI endpoints)
      const base = formatPath(EP.market, { project_id: projectId });
      const qs = new URLSearchParams();
      qs.set("points", String(points));
      qs.set("offset", String(offset));
      qs.set("reliable", reliable ? "true" : "false");

      const data = await apiFetch(`${base}?${qs.toString()}`, { method: "GET" });

      // ожидаемый формат по твоему скрину:
      // { project_id, last:{...}, prev:{...}, delta:{...} }
      const last = data?.last || null;
      const prev = data?.prev || null;
      const delta = data?.delta || null;

      const typical = fmtMoney(last?.median_price ?? last?.avg_price ?? null);
      const d = delta?.median_abs ?? delta?.avg_abs ?? null;
      const deltaText = (d === null || d === undefined) ? "—" : `${d >= 0 ? "+" : ""}${fmtMoney(d)}`;

      const r1 = last?.p25_price ?? last?.min_price ?? null;
      const r2 = last?.p75_price ?? last?.max_price ?? null;
      const rangeText = (r1 == null || r2 == null) ? "—" : `${fmtMoney(r1)} — ${fmtMoney(r2)}`;

      const count = last?.items_count ?? "—";

      setKpi(typical, deltaText, rangeText, String(count));

      if (marketHint) {
        const t = last?.taken_at ? `Оновлено: ${last.taken_at}` : "Готово";
        marketHint.textContent = t;
      }
    } catch (e) {
      const msg = safeMsg(e.payload || e);
      setError(marketError, msg);
      setKpi("—", "—", "—", "—");
      if (marketHint) marketHint.textContent = "";
    }
  }

  function initMarketHandlers() {
    if (btnMarketLoad) btnMarketLoad.addEventListener("click", loadMarket);

    if (btnPrev) btnPrev.addEventListener("click", () => {
      const points = Math.max(5, Math.min(30, Number(marketPoints?.value || 30)));
      const cur = Math.max(0, Number(marketOffset?.value || 0));
      marketOffset.value = String(Math.max(0, cur - points));
      loadMarket();
    });

    if (btnNext) btnNext.addEventListener("click", () => {
      const points = Math.max(5, Math.min(30, Number(marketPoints?.value || 30)));
      const cur = Math.max(0, Number(marketOffset?.value || 0));
      marketOffset.value = String(cur + points);
      loadMarket();
    });
  }

  // =========================
  // QUERIES (auto if API exists)
  // =========================
  const btnRunQuery = $("btnRunQuery");
  const queryText = $("queryText");
  const queryCategory = $("queryCategory");
  const savedQueries = $("savedQueries");

  const btnSaveQuery = $("btnSaveQuery");

  const LS_Q = "sellcase_saved_queries";

  function loadSavedLocal() {
    try {
      return JSON.parse(localStorage.getItem(LS_Q) || "[]");
    } catch {
      return [];
    }
  }
  function saveSavedLocal(list) {
    localStorage.setItem(LS_Q, JSON.stringify(list || []));
  }
  function renderSavedLocal() {
    if (!savedQueries) return;
    const list = loadSavedLocal();
    if (!list.length) { savedQueries.textContent = "—"; return; }
    savedQueries.innerHTML = list
      .slice().reverse()
      .map((q) => `<div style="padding:8px 0;border-bottom:1px solid #e5e7eb">
        <b>${escapeHtml(q.text)}</b> <span style="color:#6b7280;font-weight:800;font-size:12px;">${escapeHtml(q.category || "всі")}</span>
      </div>`)
      .join("");
  }

  async function runQuery() {
    // Если бэкенд-эндпоинта нет — хотя бы не “болванка”: сохраняем и показываем,
    // а также делаем понятное сообщение.
    const text = (queryText?.value || "").trim();
    const category = (queryCategory?.value || "").trim();
    if (!text) { showToast("Введіть запит"); return; }

    // try backend if exists
    if (EP.queriesRun && getToken()) {
      try {
        // предположим JSON body
        const data = await apiJson(EP.queriesRun, "POST", { text, category });
        showToast("Запит виконано ✅");
        // тут можно будет отрисовать результат, когда утвердим формат
        console.log("Query result:", data);
      } catch (e) {
        console.warn("Query run failed:", e);
        showToast("Запити поки не відповідають (API). Збережено локально.");
      }
    } else {
      showToast("Запити поки не підключені на API. Збережено локально.");
    }

    // Always save locally so it’s not пусто
    const list = loadSavedLocal();
    list.push({ text, category, at: new Date().toISOString() });
    saveSavedLocal(list);
    renderSavedLocal();
  }

  function saveCurrentQuery() {
    const text = (queryText?.value || "").trim() || "(порожній)";
    const category = (queryCategory?.value || "").trim();
    const list = loadSavedLocal();
    list.push({ text, category, at: new Date().toISOString() });
    saveSavedLocal(list);
    renderSavedLocal();
    showToast("Запит збережено ⭐");
  }

  function initQueriesHandlers() {
    if (btnRunQuery) btnRunQuery.addEventListener("click", runQuery);
    if (btnSaveQuery) btnSaveQuery.addEventListener("click", saveCurrentQuery);
  }

  // =========================
  // INIT
  // =========================
  async function pingServer() {
    // health endpoint detection
    const p = pickFirstExisting(["/health", "/"], "get") || "/health";
    EP.health = p;

    try {
      await apiFetch(EP.health, { method: "GET", headers: {} });
      setStatus("green", "Online");
    } catch {
      // even if health fails, API may still be alive
      setStatus("red", "Offline");
    }
  }

  async function detectEndpoints() {
    // If openapi available, pick exact paths
    if (!OPENAPI?.paths) return;

    EP.login = pickFirstExisting(["/auth/login", "/login", "/token"], "post") || EP.login;
    EP.register = pickFirstExisting(["/auth/register", "/auth/signup", "/register", "/signup"], "post") || EP.register;
    EP.me = pickFirstExisting(["/auth/me", "/users/me", "/me"], "get") || EP.me;

    EP.projectsList = pickFirstExisting(["/olx/projects/", "/projects/"], "get") || EP.projectsList;
    EP.projectsCreate = pickFirstExisting(["/olx/projects/", "/projects/"], "post") || EP.projectsCreate;

    // market paths (based on your docs screenshots)
    const marketExact = findPathByHint("get", ["/olx/projects/", "/market"]);
    if (marketExact) EP.market = marketExact;

    // queries/search (optional)
    // find something like /search/analytics or /search/run
    const qRun = findPathByHint("post", ["search"]) || "";
    if (qRun) EP.queriesRun = qRun;
  }

  async function boot() {
    initNav();
    initAuthHandlers();
    initProjectsHandlers();
    initMarketHandlers();
    initQueriesHandlers();

    setStatus("", "Перевірка...");
    await loadOpenApi();
    await detectEndpoints();
    await pingServer();

    // Restore session
    renderAuthState();

    // If token exists but no me cached, refresh
    if (getToken() && !getUser() && EP.me) {
      try { await fetchMe(); } catch {
        setToken(""); setUser(null);
      }
      renderAuthState();
    }

    // Fill UI
    renderSavedLocal();

    // Load protected data if authenticated
    await loadProjectsSelect();
    await loadProjectsIntoUI();

    // Optional: auto-load market after projects loaded
    // (do nothing; user will click)
  }

  boot();
})();
