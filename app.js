/* app.js — SellCase vanilla frontend
   - Works with FastAPI backend on Render
   - Correct auth: /auth/login via x-www-form-urlencoded (OAuth2PasswordRequestForm)
   - Stores token in localStorage
   - Adds Authorization: Bearer <token> for protected endpoints
*/

(() => {
  // ===== CONFIG =====
  const API_BASE = "https://sellcase-backend.onrender.com"; // твой бек
  const LS_TOKEN = "sellcase_token";
  const LS_TOKEN_TYPE = "sellcase_token_type";
  const LS_USER = "sellcase_user";

  // ===== DOM HELPERS =====
  const $ = (id) => document.getElementById(id);

  function showToast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove("show"), 3500);
  }

  function setError(id, msg) {
    const el = $(id);
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.add("show");
    } else {
      el.textContent = "";
      el.classList.remove("show");
    }
  }

  function fmtMoney(v) {
    if (v === null || v === undefined) return "—";
    if (typeof v !== "number") return String(v);
    return new Intl.NumberFormat("uk-UA").format(v);
  }

  // ===== TOKEN =====
  function getToken() {
    return localStorage.getItem(LS_TOKEN);
  }
  function setToken(token, tokenType = "bearer") {
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_TOKEN_TYPE, tokenType || "bearer");
  }
  function clearToken() {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_TOKEN_TYPE);
    localStorage.removeItem(LS_USER);
  }

  // ===== API =====
  async function apiFetch(path, { method = "GET", headers = {}, body = null, auth = false, asJson = true } = {}) {
    const url = API_BASE + path;

    const finalHeaders = { ...headers };

    if (auth) {
      const token = getToken();
      if (!token) throw new Error("Not authenticated (no token).");
      finalHeaders["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body,
    });

    // fetch() может дать "Failed to fetch" если CORS/сеть/SSL
    // но если мы дошли сюда — у нас есть HTTP ответ.
    const ct = res.headers.get("content-type") || "";

    let data = null;
    if (ct.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => null);
    }

    if (!res.ok) {
      // FastAPI errors often: {detail: "..."} or {detail:[...]}
      const detail =
        (data && typeof data === "object" && data.detail) ? data.detail :
        (typeof data === "string" ? data : "Request failed");

      if (Array.isArray(detail)) {
        // pydantic validation errors
        const pretty = detail.map(e => {
          const loc = Array.isArray(e.loc) ? e.loc.join(".") : String(e.loc);
          return `${loc}: ${e.msg}`;
        }).join(" | ");
        throw new Error(pretty);
      }

      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }

    return asJson ? data : data;
  }

  async function apiHealth() {
    return apiFetch("/health", { method: "GET" });
  }

  async function apiRegister({ first_name, last_name, email, password }) {
    return apiFetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first_name, last_name, email, password }),
    });
  }

  // IMPORTANT: OAuth2PasswordRequestForm => x-www-form-urlencoded with username/password
  async function apiLogin({ email, password }) {
    const form = new URLSearchParams();
    form.set("username", email);   // backend expects "username"
    form.set("password", password);

    return apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  }

  async function apiMe() {
    return apiFetch("/auth/me", { method: "GET", auth: true });
  }

  async function apiListProjects() {
    return apiFetch("/olx/projects/", { method: "GET", auth: true });
  }

  async function apiCreateProject({ name, search_url, notes }) {
    return apiFetch("/olx/projects/", {
      method: "POST",
      auth: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, search_url, notes }),
    });
  }

  async function apiMarketOverview(projectId) {
    return apiFetch(`/olx/projects/${projectId}/market`, { method: "GET", auth: true });
  }

  async function apiMarketHistory(projectId, { points = 30, offset = 0, reliable_only = false } = {}) {
    const qs = new URLSearchParams();
    qs.set("points", String(points));
    qs.set("offset", String(offset));
    qs.set("reliable_only", reliable_only ? "true" : "false");
    return apiFetch(`/olx/projects/${projectId}/market/history?` + qs.toString(), { method: "GET", auth: true });
  }

  // If you want "ads list" live parse by saved project:
  async function apiProjectAds(projectId, { max_pages = 3 } = {}) {
    const qs = new URLSearchParams();
    qs.set("max_pages", String(max_pages));
    return apiFetch(`/olx/projects/${projectId}/ads?` + qs.toString(), { method: "GET", auth: true });
  }

  // ===== UI: Tabs =====
  function setTab(tabName) {
    // sections
    ["market", "queries", "projects", "account"].forEach((t) => {
      const sec = $(`section-${t}`);
      if (sec) sec.classList.toggle("active", t === tabName);
    });

    // nav buttons
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
  }

  // ===== STATUS =====
  async function updateServerStatus() {
    const statusEl = $("serverStatus");
    if (!statusEl) return;

    const dot = statusEl.querySelector(".dot");
    const txt = statusEl.querySelector("span:nth-child(2)");

    try {
      await apiHealth();
      dot.classList.remove("red");
      dot.classList.add("green");
      txt.textContent = "Online";
    } catch (e) {
      dot.classList.remove("green");
      dot.classList.add("red");
      txt.textContent = "Offline";
    }
  }

  // ===== AUTH UI =====
  function setAuthUI(loggedIn, user = null) {
    const forms = $("authForms");
    const done = $("authDone");
    if (!forms || !done) return;

    if (loggedIn) {
      forms.style.display = "none";
      done.style.display = "block";

      if (user) {
        localStorage.setItem(LS_USER, JSON.stringify(user));
        const title = $("userTitle");
        const meId = $("meId");
        const meCreated = $("meCreated");
        const meActive = $("meActive");
        const avatar = $("userAvatar");

        const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.email || "User";
        if (title) title.textContent = name;
        if (meId) meId.textContent = user.id ?? "—";
        if (meCreated) meCreated.textContent = user.created_at ? String(user.created_at).slice(0, 19) : "—";
        if (meActive) meActive.textContent = user.is_active ? "Active" : "Inactive";
        if (avatar) avatar.textContent = (name[0] || "U").toUpperCase();
      }
    } else {
      forms.style.display = "block";
      done.style.display = "none";
    }
  }

  async function bootAuth() {
    const token = getToken();
    if (!token) {
      setAuthUI(false);
      return;
    }
    try {
      const me = await apiMe();
      setAuthUI(true, me);
    } catch (e) {
      clearToken();
      setAuthUI(false);
    }
  }

  // ===== PROJECTS =====
  async function loadProjectsIntoUI() {
    setError("projectsError", "");
    const listEl = $("projectsList");
    const infoEl = $("projectsInfo");
    const marketSelect = $("marketProject");

    if (listEl) listEl.textContent = "Завантаження...";
    if (marketSelect) marketSelect.innerHTML = "";

    try {
      const projects = await apiListProjects();

      if (infoEl) infoEl.textContent = `Знайдено: ${projects.length}`;

      // Projects list
      if (listEl) {
        if (!projects.length) {
          listEl.textContent = "Немає проектів. Створи проект в бекенді або додамо UI для створення.";
        } else {
          listEl.innerHTML = projects.map(p => {
            const url = (p.search_url || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const name = (p.name || "Без назви").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return `
              <div style="padding:12px;border:1px solid #e5e7eb;border-radius:16px;margin-bottom:10px;background:#fff;">
                <div style="font-weight:1100;">${name} <span style="color:#6b7280;font-weight:800;">#${p.id}</span></div>
                <div style="margin-top:6px;color:#6b7280;font-weight:800;font-size:12px;word-break:break-all;">${url}</div>
              </div>
            `;
          }).join("");
        }
      }

      // Market dropdown
      if (marketSelect) {
        projects.forEach(p => {
          const opt = document.createElement("option");
          opt.value = String(p.id);
          opt.textContent = `${p.name || "Project"} (#${p.id})`;
          marketSelect.appendChild(opt);
        });
      }

      return projects;
    } catch (e) {
      if (listEl) listEl.textContent = "—";
      setError("projectsError", `Помилка: ${e.message}`);
      if (String(e.message).toLowerCase().includes("not authenticated")) {
        showToast("Потрібен вхід (token). Зайди в Аккаунт → Увійти.");
      }
      return [];
    }
  }

  // ===== MARKET =====
  function setMarketKPIs(data) {
    // data expected from /olx/projects/{id}/market
    // based on swagger screenshots: {project_id, last:{...}, prev:{...}, delta:{...}}
    const last = data?.last || null;
    const delta = data?.delta || null;

    const typical = last?.median_price ?? last?.avg_price ?? null;
    const range = (last && (last.p25_price !== undefined) && (last.p75_price !== undefined))
      ? `${fmtMoney(last.p25_price)} – ${fmtMoney(last.p75_price)}`
      : "—";

    $("kpiTypical").textContent = typical !== null ? fmtMoney(typical) : "—";
    $("kpiRange").textContent = range;
    $("kpiCount").textContent = (last?.items_count ?? "—");

    // delta typical price (median_abs or avg_abs)
    const d = (delta?.median_abs ?? delta?.avg_abs ?? null);
    $("kpiDelta").textContent = d !== null ? fmtMoney(d) : "—";
  }

  async function loadMarket({ useHistory = false } = {}) {
    setError("marketError", "");
    const hint = $("marketHint");

    const projectId = $("marketProject")?.value;
    if (!projectId) {
      if (hint) hint.textContent = "Немає проектів для вибору.";
      return;
    }

    const points = Number($("marketPoints")?.value || 30);
    const offset = Number($("marketOffset")?.value || 0);
    const reliable_only = Boolean($("marketReliable")?.checked);

    try {
      if (hint) hint.textContent = "Завантаження...";
      if (!useHistory) {
        const data = await apiMarketOverview(projectId);
        setMarketKPIs(data);
      } else {
        const hist = await apiMarketHistory(projectId, { points, offset, reliable_only });
        // hist может быть массивом снапшотов — покажем последний как KPI
        if (Array.isArray(hist) && hist.length) {
          const last = hist[0];
          setMarketKPIs({ last, delta: null });
        } else {
          setMarketKPIs(null);
        }
      }
      if (hint) hint.textContent = "Готово.";
    } catch (e) {
      if (hint) hint.textContent = "";
      setError("marketError", `Помилка: ${e.message}`);
      if (String(e.message).toLowerCase().includes("not authenticated")) {
        showToast("Потрібен вхід. Перейди в Аккаунт → Увійти.");
      }
    }
  }

  // ===== QUERIES =====
  // IMPORTANT: backend currently doesn't expose live search API by query text.
  // We'll store locally as MVP, and you can later add /search/olx endpoint on backend.
  function loadSavedQueries() {
    const box = $("savedQueries");
    if (!box) return;
    const raw = localStorage.getItem("sellcase_saved_queries");
    const arr = raw ? JSON.parse(raw) : [];
    if (!arr.length) {
      box.textContent = "—";
      return;
    }
    box.innerHTML = arr.map(q => `
      <div style="padding:10px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;margin-bottom:8px;">
        <div style="font-weight:1100;">${(q.text || "").replace(/</g,"&lt;")}</div>
        <div style="margin-top:4px;font-size:12px;color:#6b7280;font-weight:800;">Категорія: ${q.category || "всі"}</div>
      </div>
    `).join("");
  }

  function saveQueryLocal(text, category) {
    const raw = localStorage.getItem("sellcase_saved_queries");
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift({ text, category, at: new Date().toISOString() });
    localStorage.setItem("sellcase_saved_queries", JSON.stringify(arr.slice(0, 50)));
    loadSavedQueries();
  }

  // ===== EVENTS =====
  function wireEvents() {
    // tabs
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => setTab(btn.dataset.tab));
    });

    // auth: login
    $("loginForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("accountError", "");
      const email = $("loginEmail")?.value?.trim() || "";
      const password = $("loginPassword")?.value || "";

      try {
        const token = await apiLogin({ email, password });
        if (!token?.access_token) throw new Error("No access_token in response");
        setToken(token.access_token, token.token_type || "bearer");

        const me = await apiMe();
        setAuthUI(true, me);
        showToast("✅ Вхід успішно.");
      } catch (err) {
        setError("accountError", `Помилка входу: ${err.message}`);
      }
    });

    // auth: register
    $("registerForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("accountError", "");

      const first_name = $("regFirstName")?.value?.trim() || "";
      const last_name = $("regLastName")?.value?.trim() || "";
      const email = $("regEmail")?.value?.trim() || "";
      const password = $("regPassword")?.value || "";

      try {
        await apiRegister({ first_name, last_name, email, password });
        showToast("✅ Реєстрація успішна. Тепер увійди.");
        // НЕ переносим данные в логин автоматически (как ты просил)
      } catch (err) {
        setError("accountError", `Помилка реєстрації: ${err.message}`);
      }
    });

    $("btnLogout")?.addEventListener("click", () => {
      clearToken();
      setAuthUI(false);
      showToast("Вийшли з акаунта.");
    });

    $("btnGoMarket")?.addEventListener("click", async () => {
      setTab("market");
      await loadProjectsIntoUI();
    });

    // projects reload
    $("btnProjectsReload")?.addEventListener("click", async () => {
      await loadProjectsIntoUI();
    });

    // market load
    $("btnMarketLoad")?.addEventListener("click", async () => {
      await loadMarket({ useHistory: false });
    });

    // prev/next (history offset)
    $("btnPrev")?.addEventListener("click", async () => {
      const el = $("marketOffset");
      if (!el) return;
      el.value = String(Math.max(0, Number(el.value || 0) + Number($("marketPoints")?.value || 30)));
      await loadMarket({ useHistory: true });
    });

    $("btnNext")?.addEventListener("click", async () => {
      const el = $("marketOffset");
      if (!el) return;
      el.value = String(Math.max(0, Number(el.value || 0) - Number($("marketPoints")?.value || 30)));
      await loadMarket({ useHistory: true });
    });

    // queries run
    $("btnRunQuery")?.addEventListener("click", async () => {
      const text = $("queryText")?.value?.trim() || "";
      const category = $("queryCategory")?.value || "";

      if (!text) {
        showToast("Введи запит.");
        return;
      }

      // IMPORTANT truth:
      // backend doesn't have an endpoint that реально ищет OLX по тексту запроса.
      // So we store locally and inform.
      saveQueryLocal(text, category);
      showToast("ℹ️ Запит збережено локально. Для live-пошуку потрібен API на беку (/search/olx).");
    });

    // save query from market hero button
    $("btnSaveQuery")?.addEventListener("click", () => {
      const sel = $("marketProject");
      if (!sel || !sel.value) {
        showToast("Спочатку обери проект.");
        return;
      }
      saveQueryLocal(`Project #${sel.value}`, "project");
      showToast("⭐ Збережено локально.");
    });
  }

  // ===== BOOT =====
  async function boot() {
    wireEvents();
    loadSavedQueries();
    await updateServerStatus();
    setInterval(updateServerStatus, 15000);

    await bootAuth();

    // Try load projects only if logged in
    if (getToken()) {
      await loadProjectsIntoUI();
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
