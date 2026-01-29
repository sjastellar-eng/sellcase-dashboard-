/* =========================================================
   SellCase app.js — FIXED:
   ✅ login more robust (tries payload variants + endpoints)
   ✅ server status ping no longer requires JSON (so it won’t stick on Connecting…)
   ✅ logo fills the square (not tiny)
   ✅ no debug banners / no endpoint text in UI
   ========================================================= */

(() => {
  /* -------------------- CONFIG -------------------- */
  const DEFAULT_API_BASE = "https://sellcase-backend.onrender.com";
  const API_BASE =
    (window.SELLCASE_API_BASE && String(window.SELLCASE_API_BASE)) ||
    localStorage.getItem("sellcase_api_base") ||
    DEFAULT_API_BASE;

  const LS_TOKEN = "sellcase_token_v1";
  const LS_SAVED_QUERIES = "sellcase_saved_queries_v1";

  const TIMEOUT_MS = 20000;     // Render cold start friendly
  const PING_INTERVAL_MS = 30000;
  const PING_RETRIES = 2;

  // We try multiple routes; first that works wins.
  const ROUTES = {
    // IMPORTANT: ping routes must not require JSON parsing
    health: ["/health", "/api/health", "/ping", "/docs"],

    login: ["/auth/login", "/api/auth/login"],
    register: ["/auth/register", "/api/auth/register"],
    me: ["/auth/me", "/api/auth/me", "/users/me", "/api/users/me"],

    projects: ["/projects", "/api/projects", "/project", "/api/project"],

    marketSummary: [
      "/metrics/summary",
      "/api/metrics/summary",
      "/analytics/market/summary",
      "/api/analytics/market/summary",
      "/market/summary",
      "/api/market/summary",
    ],

    topBrands: [
      "/search/analytics/top-brands",
      "/api/search/analytics/top-brands",
      "/search/analytics/top_brands",
      "/api/search/analytics/top_brands",
    ],

    queryRun: [
      "/search/analytics/query",
      "/api/search/analytics/query",
      "/search/analytics/run",
      "/api/search/analytics/run",
      "/search/analytics",
      "/api/search/analytics",
    ],
  };

  /* -------------------- HELPERS -------------------- */
  const $ = (id) => document.getElementById(id);

  function buildUrl(path) {
    return API_BASE.replace(/\/$/, "") + path;
  }

  function getToken() {
    return localStorage.getItem(LS_TOKEN) || "";
  }
  function setToken(token) {
    if (token) localStorage.setItem(LS_TOKEN, token);
    else localStorage.removeItem(LS_TOKEN);
  }

  function safeText(el, text) {
    if (!el) return;
    el.textContent = text == null ? "" : String(text);
  }

  function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3200);
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
    const box = $("serverStatus");
    if (!box) return;
    const dot = box.querySelector(".dot");
    const text = box.querySelector("span:last-child");
    if (!dot || !text) return;

    dot.classList.remove("red", "green");

    if (state === "online") {
      dot.classList.add("green");
      text.textContent = "Online";
    } else if (state === "offline") {
      dot.classList.add("red");
      text.textContent = "Offline";
    } else {
      text.textContent = "Connecting…";
    }
  }

  function initialsFrom(fullName, email) {
    const n = String(fullName || "").trim();
    if (n && n.toLowerCase() !== "користувач" && n.toLowerCase() !== "user") {
      const parts = n.split(/\s+/).slice(0, 2);
      const letters = parts.map((p) => (p[0] || "").toUpperCase()).join("");
      return letters || "U";
    }
    const e = String(email || "").trim();
    return e ? e[0].toUpperCase() : "U";
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const s = String(iso).replace("T", " ").replace("Z", "");
    return s.slice(0, 19);
  }

  function moneyUAH(v) {
    if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
    const n = Number(v);
    try {
      return (
        new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n) +
        " грн"
      );
    } catch {
      return `${Math.round(n)} грн`;
    }
  }

  function asArrayProjects(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.projects)) return payload.projects;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  }

  function projectLabel(p) {
    const name =
      p?.name ||
      p?.title ||
      p?.project_name ||
      p?.projectTitle ||
      p?.slug ||
      `Проект #${p?.id ?? "—"}`;
    return String(name);
  }

  function projectId(p) {
    return p?.id ?? p?.project_id ?? p?.projectId ?? p?.slug ?? p?.name ?? "";
  }

  function normalizeMe(me) {
    const first = me?.first_name || me?.firstName || "";
    const last = me?.last_name || me?.lastName || "";
    const full =
      me?.full_name ||
      me?.fullName ||
      (String(first || "").trim() + " " + String(last || "").trim()).trim();

    return {
      id: me?.id ?? me?.user_id ?? me?.userId ?? null,
      email: me?.email ?? "",
      fullName: full || "Користувач",
      createdAt: me?.created_at || me?.createdAt || "",
      isActive: me?.is_active ?? me?.active ?? null,
      raw: me,
    };
  }

  /* -------------------- FETCH (timeout) -------------------- */
  async function fetchWithTimeout(url, options = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchJSON(url, options = {}) {
    const res = await fetchWithTimeout(url, options);
    const text = await res.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }

    if (!res.ok) {
      const err = new Error("HTTP " + res.status);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function tryRoutesJSON(routeList, options = {}) {
    let lastErr = null;
    for (const p of routeList) {
      try {
        const data = await fetchJSON(buildUrl(p), options);
        return { ok: true, path: p, data };
      } catch (e) {
        lastErr = e;
      }
    }
    return { ok: false, error: lastErr };
  }

  async function tryRoutesOK(routeList, options = {}) {
    // For ping only: any 2xx/3xx is OK; no JSON needed
    let lastErr = null;
    for (const p of routeList) {
      try {
        const res = await fetchWithTimeout(buildUrl(p), {
          ...options,
          method: options.method || "GET",
        });
        if (res.ok) return { ok: true, path: p };
        lastErr = new Error("HTTP " + res.status);
      } catch (e) {
        lastErr = e;
      }
    }
    return { ok: false, error: lastErr };
  }

  /* -------------------- SERVER STATUS -------------------- */
  async function pingServer() {
    setServerStatus("connecting");
    let ok = false;

    for (let i = 0; i <= PING_RETRIES; i++) {
      const r = await tryRoutesOK(ROUTES.health, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
      });
      if (r.ok) {
        ok = true;
        break;
      }
    }

    setServerStatus(ok ? "online" : "offline");
    return ok;
  }

  /* -------------------- NAVIGATION -------------------- */
  function showSection(tab) {
    const sections = {
      market: $("section-market"),
      queries: $("section-queries"),
      projects: $("section-projects"),
      account: $("section-account"),
    };

    Object.values(sections).forEach((s) => s && s.classList.remove("active"));
    if (sections[tab]) sections[tab].classList.add("active");

    document.querySelectorAll(".bottom-nav .tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
  }

  function initNav() {
    document.querySelectorAll(".bottom-nav .tab").forEach((btn) => {
      btn.addEventListener("click", () => showSection(btn.dataset.tab));
    });
  }

  /* -------------------- AUTH UI -------------------- */
  function uiAfterLogin(me) {
    const forms = $("authForms");
    const done = $("authDone");
    if (forms) forms.style.display = "none";
    if (done) done.style.display = "block";

    safeText($("userTitle"), me.fullName || "Користувач");
    safeText($("userSubtitle"), "✅ Вхід виконано.");

    const avatar = $("userAvatar");
    if (avatar) avatar.textContent = initialsFrom(me.fullName, me.email);

    safeText($("meId"), me.id ?? "—");
    safeText($("meCreated"), formatDate(me.createdAt));

    if ($("meActive")) {
      if (me.isActive === true) safeText($("meActive"), "Активний");
      else if (me.isActive === false) safeText($("meActive"), "Неактивний");
      else safeText($("meActive"), "—");
    }
  }

  function uiAfterLogout() {
    const forms = $("authForms");
    const done = $("authDone");
    if (forms) forms.style.display = "block";
    if (done) done.style.display = "none";
  }

  async function loadMeSilently() {
    if (!getToken()) return null;

    const r = await tryRoutesJSON(ROUTES.me, {
      method: "GET",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    });

    if (!r.ok) return null;
    const me = normalizeMe(r.data);
    uiAfterLogin(me);
    return me;
  }

  function extractToken(data) {
    return (
      data?.access_token ||
      data?.token ||
      data?.jwt ||
      data?.data?.access_token ||
      data?.data?.token ||
      ""
    );
  }

  async function loginSmart(email, password) {
    // Many backends differ in field names. We try a few.
    const bodies = [
      { email, password },
      { username: email, password },
      { login: email, password },
      { user: email, password },
    ];

    // Also try x-www-form-urlencoded if backend expects it
    const jsonHeaders = { "Content-Type": "application/json" };

    let lastErr = null;

    for (const endpoint of ROUTES.login) {
      for (const b of bodies) {
        try {
          const data = await fetchJSON(buildUrl(endpoint), {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify(b),
          });
          const token = extractToken(data);
          return { ok: true, data, token };
        } catch (e) {
          lastErr = e;
        }

        // form encoded attempt
        try {
          const form = new URLSearchParams();
          Object.entries(b).forEach(([k, v]) => form.set(k, String(v)));
          const data = await fetchJSON(buildUrl(endpoint), {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form.toString(),
          });
          const token = extractToken(data);
          return { ok: true, data, token };
        } catch (e) {
          lastErr = e;
        }
      }
    }

    return { ok: false, error: lastErr };
  }

  function initAuth() {
    const loginForm = $("loginForm");
    const registerForm = $("registerForm");

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError($("accountError"), "");
        setHint("loginInfo", "");

        const email = String($("loginEmail")?.value || "").trim();
        const password = String($("loginPassword")?.value || "").trim();

        if (!email || !password) {
          setError($("accountError"), "Будь ласка, введіть email та пароль.");
          return;
        }

        try {
          showToast("Виконуємо вхід…");

          const r = await loginSmart(email, password);
          if (!r.ok) throw r.error || new Error("login failed");

          if (r.token) setToken(r.token);

          const me = await loadMeSilently();
          if (!me) {
            // If backend doesn’t have /me, still show user
            uiAfterLogin({ fullName: "Користувач", email });
          }

          await loadProjects(true);
        } catch (err) {
          setToken("");
          uiAfterLogout();
          setError(
            $("accountError"),
            "Не вдалося виконати вхід. Перевірте email/пароль і спробуйте ще раз."
          );
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError($("accountError"), "");

        const first_name = String($("regFirstName")?.value || "").trim();
        const last_name = String($("regLastName")?.value || "").trim();
        const email = String($("regEmail")?.value || "").trim();
        const password = String($("regPassword")?.value || "").trim();

        if (!email || !password || !first_name) {
          setError($("accountError"), "Будь ласка, заповніть імʼя, email та пароль.");
          return;
        }

        try {
          showToast("Створюємо акаунт…");

          const r = await tryRoutesJSON(ROUTES.register, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ first_name, last_name, email, password }),
          });

          if (!r.ok) throw r.error || new Error("register failed");

          showToast("✅ Акаунт створено. Тепер увійдіть.");

          if ($("regFirstName")) $("regFirstName").value = "";
          if ($("regLastName")) $("regLastName").value = "";
          if ($("regEmail")) $("regEmail").value = "";
          if ($("regPassword")) $("regPassword").value = "";
        } catch (err) {
          setError(
            $("accountError"),
            "Не вдалося створити акаунт. Можливо, email вже використовується."
          );
        }
      });
    }

    const btnLogout = $("btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        setToken("");
        uiAfterLogout();
        showToast("Ви вийшли з акаунта.");
      });
    }

    const btnGoMarket = $("btnGoMarket");
    if (btnGoMarket) btnGoMarket.addEventListener("click", () => showSection("market"));
  }

  /* -------------------- PROJECTS -------------------- */
  let cachedProjects = [];

  function renderProjectsList(projects) {
    const box = $("projectsList");
    const info = $("projectsInfo");
    const err = $("projectsError");
    setError(err, "");

    if (!box) return;

    if (!projects || !projects.length) {
      safeText(box, "Проекти поки відсутні.");
      safeText(info, "");
      return;
    }

    safeText(info, `Знайдено: ${projects.length}`);
    box.innerHTML = "";

    const ul = document.createElement("ul");
    ul.style.margin = "0";
    ul.style.paddingLeft = "18px";
    ul.style.fontWeight = "800";

    projects.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = `${projectLabel(p)} (ID: ${projectId(p)})`;
      ul.appendChild(li);
    });

    box.appendChild(ul);
  }

  function fillMarketProjects(projects) {
    const sel = $("marketProject");
    if (!sel) return;

    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Оберіть проект…";
    sel.appendChild(opt0);

    projects.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = String(projectId(p));
      opt.textContent = projectLabel(p);
      sel.appendChild(opt);
    });
  }

  async function loadProjects(silent = false) {
    const err = $("projectsError");
    if (!silent) setError(err, "");

    const r = await tryRoutesJSON(ROUTES.projects, {
      method: "GET",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    });

    if (!r.ok) {
      cachedProjects = [];
      fillMarketProjects([]);
      renderProjectsList([]);
      if (!silent) {
        setError(err, "Не вдалося завантажити проекти. Спробуйте пізніше.");
      }
      return [];
    }

    const list = asArrayProjects(r.data);
    cachedProjects = list;
    fillMarketProjects(list);
    renderProjectsList(list);
    return list;
  }

  function initProjects() {
    const btn = $("btnProjectsReload");
    if (btn) btn.addEventListener("click", () => loadProjects(false));
  }

  /* -------------------- MARKET -------------------- */
  let marketCursor = 0;

  function resetMarketKpi() {
    safeText($("kpiTypical"), "—");
    safeText($("kpiDelta"), "—");
    safeText($("kpiRange"), "—");
    safeText($("kpiCount"), "—");
  }

  function applyMarketKpi(data) {
    const typical =
      data?.typical_price ?? data?.typical ?? data?.median ?? data?.p50 ?? null;

    const delta =
      data?.delta ?? data?.delta_typical ?? data?.typical_delta ?? null;

    const min = data?.range_min ?? data?.min ?? data?.p10 ?? null;
    const max = data?.range_max ?? data?.max ?? data?.p90 ?? null;

    const count = data?.count ?? data?.total ?? data?.ads_count ?? null;

    safeText($("kpiTypical"), moneyUAH(typical));

    if (delta == null || Number.isNaN(Number(delta))) safeText($("kpiDelta"), "—");
    else {
      const d = Number(delta);
      const sign = d > 0 ? "+" : "";
      safeText($("kpiDelta"), `${sign}${moneyUAH(d).replace(" грн", "")} грн`);
    }

    if (min != null && max != null) safeText($("kpiRange"), `${moneyUAH(min)} — ${moneyUAH(max)}`);
    else safeText($("kpiRange"), "—");

    safeText($("kpiCount"), count != null ? String(count) : "—");
  }

  async function loadMarket() {
    setError($("marketError"), "");
    setHint("marketHint", "");

    const project = String($("marketProject")?.value || "");
    const points = Number($("marketPoints")?.value || 30);
    const reliable = !!$("marketReliable")?.checked;

    const offsetInput = $("marketOffset");
    let offset = Number(offsetInput?.value || marketCursor);
    if (Number.isNaN(offset) || offset < 0) offset = 0;

    if (!project) {
      setError($("marketError"), "Оберіть проект.");
      return;
    }

    const params = new URLSearchParams();
    params.set("project_id", project);
    params.set("points", String(Math.max(5, Math.min(30, points || 30))));
    params.set("offset", String(offset));
    params.set("reliable", reliable ? "true" : "false");

    try {
      showToast("Завантажуємо аналітику…");
      const routeList = ROUTES.marketSummary.map((p) => p + "?" + params.toString());
      const r = await tryRoutesJSON(routeList, {
        method: "GET",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });

      if (!r.ok) throw r.error || new Error("market load failed");

      resetMarketKpi();
      applyMarketKpi(r.data);

      marketCursor = offset;
      if (offsetInput) offsetInput.value = String(offset);
      setHint("marketHint", "Готово.");
    } catch (err) {
      resetMarketKpi();
      setError($("marketError"), "Не вдалося завантажити аналітику. Спробуйте ще раз пізніше.");
    }
  }

    function initMarket() {
    const btnLoad = $("btnMarketLoad");
    if (btnLoad) btnLoad.addEventListener("click", loadMarket);

    const btnPrev = $("btnPrev");
    const btnNext = $("btnNext");
    const offsetInput = $("marketOffset");
    const pointsInput = $("marketPoints");

    if (btnPrev) {
      btnPrev.addEventListener("click", () => {
        const points = Number(pointsInput?.value || 30);
        let offset = Number(offsetInput?.value || marketCursor);
        if (Number.isNaN(offset)) offset = 0;
        offset = Math.max(0, offset - Math.max(1, points));
        marketCursor = offset;
        if (offsetInput) offsetInput.value = String(offset);
        loadMarket();
      });
    }

    if (btnNext) {
      btnNext.addEventListener("click", () => {
        const points = Number(pointsInput?.value || 30);
        let offset = Number(offsetInput?.value || marketCursor);
        if (Number.isNaN(offset)) offset = 0;
        offset = offset + Math.max(1, points);
        marketCursor = offset;
        if (offsetInput) offsetInput.value = String(offset);
        loadMarket();
      });
    }

    const btnSave = $("btnSaveQuery");
    if (btnSave) {
      btnSave.addEventListener("click", () => {
        const project = String($("marketProject")?.value || "");
        const reliable = !!$("marketReliable")?.checked;
        const points = Number($("marketPoints")?.value || 30);
        const offset = Number($("marketOffset")?.value || 0);

        if (!project) {
          showToast("Спочатку оберіть проект.");
          return;
        }

        const payload = { type: "market", project_id: project, reliable, points, offset, ts: Date.now() };
        const saved = loadSavedQueries();
        saved.unshift(payload);
        saveSavedQueries(saved);
        renderSavedQueries();
        showToast("✅ Запит збережено.");
      });
    }
  }

  /* -------------------- QUERIES -------------------- */
  function loadSavedQueries() {
    try {
      const raw = localStorage.getItem(LS_SAVED_QUERIES) || "[]";
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveSavedQueries(arr) {
    try {
      localStorage.setItem(LS_SAVED_QUERIES, JSON.stringify(arr.slice(0, 50)));
    } catch {}
  }

  function renderSavedQueries() {
    const box = $("savedQueries");
    if (!box) return;

    const saved = loadSavedQueries();
    if (!saved.length) {
      box.textContent = "Поки немає збережених запитів.";
      return;
    }

    box.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "8px";

    saved.slice(0, 10).forEach((q) => {
      const card = document.createElement("div");
      card.style.padding = "10px 12px";
      card.style.border = "1px solid #e5e7eb";
      card.style.borderRadius = "14px";
      card.style.background = "#fff";
      card.style.boxShadow = "0 8px 18px rgba(2,6,23,.06)";
      card.style.display = "flex";
      card.style.justifyContent = "space-between";
      card.style.gap = "10px";
      card.style.alignItems = "center";

      const left = document.createElement("div");
      left.style.display = "grid";
      left.style.gap = "2px";

      const t = document.createElement("div");
      t.style.fontWeight = "1100";
      t.textContent =
        q.type === "market" ? `Market • Project ${q.project_id}` : `Запит • ${q.query || "—"}`;

      const d = document.createElement("div");
      d.style.fontWeight = "800";
      d.style.fontSize = "12px";
      d.style.color = "#6b7280";
      d.textContent = new Date(q.ts || Date.now()).toLocaleString("uk-UA");

      left.appendChild(t);
      left.appendChild(d);

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.type = "button";
      btn.textContent = "Відкрити";
      btn.addEventListener("click", () => {
        if (q.type === "market") {
          showSection("market");
          if ($("marketProject")) $("marketProject").value = String(q.project_id || "");
          if ($("marketPoints")) $("marketPoints").value = String(q.points ?? 30);
          if ($("marketOffset")) $("marketOffset").value = String(q.offset ?? 0);
          if ($("marketReliable")) $("marketReliable").checked = !!q.reliable;
          showToast("Збережений запит підставлено.");
        } else {
          showSection("queries");
          if ($("queryText")) $("queryText").value = String(q.query || "");
          if ($("queryCategory")) $("queryCategory").value = String(q.category || "");
          showToast("Збережений запит підставлено.");
        }
      });

      card.appendChild(left);
      card.appendChild(btn);
      wrap.appendChild(card);
    });

    box.appendChild(wrap);
  }

  function initQueries() {
    renderSavedQueries();

    const btnRun = $("btnRunQuery");
    if (!btnRun) return;

    btnRun.addEventListener("click", async () => {
      const q = String($("queryText")?.value || "").trim();
      const category = String($("queryCategory")?.value || "").trim();

      if (!q) {
        showToast("Введіть запит для пошуку.");
        return;
      }

      const params = new URLSearchParams();
      params.set("q", q);
      if (category) params.set("category", category);

      try {
        showToast("Шукаємо…");

        // Prefer real query endpoint; if not supported, at least ensure analytics reachable
        let r = await tryRoutesJSON(
          ROUTES.queryRun.map((p) => p + "?" + params.toString()),
          { method: "GET", headers: { ...authHeaders(), "Content-Type": "application/json" } }
        );

        if (!r.ok) {
          r = await tryRoutesJSON(ROUTES.topBrands, {
            method: "GET",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
          });
        }

        if (!r.ok) throw r.error || new Error("search failed");

        showToast("✅ Запит виконано. Вивід результатів підключимо наступним кроком.");

        const saved = loadSavedQueries();
        saved.unshift({ type: "query", query: q, category, ts: Date.now() });
        saveSavedQueries(saved);
        renderSavedQueries();
      } catch {
        showToast("Не вдалося виконати пошук. Спробуйте пізніше.");
      }
    });
  }

  /* -------------------- LOGO FIX (fill the cell) -------------------- */
  function initLogoFix() {
    // Top-left small logo in appbar
    const logoImg = document.querySelector(".logo img");
    if (logoImg) {
      // Fill the 44x44 box nicely
      logoImg.style.width = "100%";
      logoImg.style.height = "100%";
      logoImg.style.objectFit = "contain";
      logoImg.style.padding = "6px";
      logoImg.style.display = "block";
    }

    // Hero logo (market)
    const heroLogo = $("brandLogo");
    if (heroLogo) {
      heroLogo.style.objectFit = "contain";
    }
  }

  /* -------------------- BOOT -------------------- */
  async function boot() {
    initNav();
    initAuth();
    initProjects();
    initMarket();
    initQueries();
    initLogoFix();

    // Ping loop
    await pingServer();
    setInterval(pingServer, PING_INTERVAL_MS);

    // Load projects
    await loadProjects(true);

    // Restore session if token exists
    await loadMeSilently();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
