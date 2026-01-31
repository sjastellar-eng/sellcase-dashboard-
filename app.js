/* =========================================================
   SellCase app.js — robust DOM + logo fix + user label + results render
   ========================================================= */
(() => {
  const DEFAULT_API_BASE = "https://sellcase-backend.onrender.com";
  const API_BASE =
    (window.SELLCASE_API_BASE && String(window.SELLCASE_API_BASE)) ||
    localStorage.getItem("sellcase_api_base") ||
    DEFAULT_API_BASE;

  const LS_TOKEN = "sellcase_token_v1";
  const LS_SAVED_QUERIES = "sellcase_saved_queries_v1";
  const TIMEOUT_MS = 20000;
  const PING_INTERVAL_MS = 30000;
  const PING_RETRIES = 2;

  const ROUTES = {
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
    queryRun: [
      "/search/analytics/query",
      "/api/search/analytics/query",
      "/search/analytics/run",
      "/api/search/analytics/run",
      "/search/analytics",
      "/api/search/analytics",
    ],
    topBrands: [
      "/search/analytics/top-brands",
      "/api/search/analytics/top-brands",
      "/search/analytics/top_brands",
      "/api/search/analytics/top_brands",
    ],
  };

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
  function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function safeText(el, text) {
    if (!el) return;
    el.textContent = text == null ? "" : String(text);
  }

  function showToast(msg) {
    const t = $("toast") || document.querySelector("#toast");
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

  function setServerStatus(state) {
    const box = $("serverStatus") || document.querySelector("#serverStatus");
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
      fullName: full || "",
      createdAt: me?.created_at || me?.createdAt || "",
      isActive: me?.is_active ?? me?.active ?? null,
      raw: me,
    };
  }

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

  async function pingServer() {
    setServerStatus("connecting");
    let ok = false;
    for (let i = 0; i <= PING_RETRIES; i++) {
      const r = await tryRoutesOK(ROUTES.health, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
      });
      if (r.ok) { ok = true; break; }
    }
    setServerStatus(ok ? "online" : "offline");
    return ok;
  }

  /* --------- NAV --------- */
  function showSection(tab) {
    const sections = {
      market: $("section-market") || document.querySelector("#section-market"),
      queries: $("section-queries") || document.querySelector("#section-queries"),
      projects: $("section-projects") || document.querySelector("#section-projects"),
      account: $("section-account") || document.querySelector("#section-account"),
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

  /* --------- LOGO FIX (guaranteed) --------- */
  function fixHeaderLogo() {
    // Strategy 1: .logo img
    let img = document.querySelector(".logo img");

    // Strategy 2: first image inside header/appbar (the one near “SellCase”)
    if (!img) {
      const header =
        document.querySelector("header") ||
        document.querySelector(".appbar") ||
        document.querySelector(".topbar") ||
        document.querySelector(".header") ||
        document.querySelector(".card.header") ||
        document.body;

      const imgs = header ? header.querySelectorAll("img") : [];
      if (imgs && imgs.length) img = imgs[0];
    }

    if (!img) return;

    const holder = img.parentElement;

    // Make the holder a fixed square and force the img to fill it.
    if (holder) {
      holder.style.width = holder.style.width || "44px";
      holder.style.height = holder.style.height || "44px";
      holder.style.display = "grid";
      holder.style.placeItems = "center";
      holder.style.overflow = "hidden";
      holder.style.borderRadius = holder.style.borderRadius || "12px";
    }

    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";  // IMPORTANT: fill the square
    img.style.display = "block";
    img.style.padding = "0";        // remove any previous padding
  }

  /* --------- USER LABEL (email/name) --------- */
  function setUserLabel({ fullName, email }) {
    const title = $("userTitle") || document.querySelector("#userTitle");
    const sub = $("userSubtitle") || document.querySelector("#userSubtitle");
    const av = $("userAvatar") || document.querySelector("#userAvatar");

    const bestName = String(fullName || "").trim();
    const bestEmail = String(email || "").trim();

    // Show email if name missing
    const line1 = bestName || bestEmail || "Користувач";
    const line2 = bestName ? (bestEmail || "") : (bestEmail ? "✅ Вхід виконано." : "✅ Вхід виконано.");

    safeText(title, line1);
    safeText(sub, line2 || "✅ Вхід виконано.");
    if (av) av.textContent = initialsFrom(bestName || "U", bestEmail);
  }

  function uiAfterLogin(me, fallbackEmail) {
    const forms = $("authForms") || document.querySelector("#authForms");
    const done = $("authDone") || document.querySelector("#authDone");
    if (forms) forms.style.display = "none";
    if (done) done.style.display = "block";

    const email = me?.email || fallbackEmail || "";
    const fullName = me?.fullName || "";

    setUserLabel({ fullName, email });

    safeText($("meId") || document.querySelector("#meId"), me?.id ?? "—");
    safeText($("meCreated") || document.querySelector("#meCreated"), formatDate(me?.createdAt));

    const activeEl = $("meActive") || document.querySelector("#meActive");
    if (activeEl) {
      if (me?.isActive === true) safeText(activeEl, "Активний");
      else if (me?.isActive === false) safeText(activeEl, "Неактивний");
      else safeText(activeEl, "—");
    }
  }

  function uiAfterLogout() {
    const forms = $("authForms") || document.querySelector("#authForms");
    const done = $("authDone") || document.querySelector("#authDone");
    if (forms) forms.style.display = "block";
    if (done) done.style.display = "none";
  }

  async function loadMeSilently(fallbackEmail) {
    if (!getToken()) return null;
    const r = await tryRoutesJSON(ROUTES.me, {
      method: "GET",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    });
    if (!r.ok) return null;
    const me = normalizeMe(r.data);
    uiAfterLogin(me, fallbackEmail);
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
    const bodies = [
      { email, password },
      { username: email, password },
      { login: email, password },
      { user: email, password },
    ];

    let lastErr = null;

    for (const endpoint of ROUTES.login) {
      for (const b of bodies) {
        try {
          const data = await fetchJSON(buildUrl(endpoint), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(b),
          });
          return { ok: true, data, token: extractToken(data) };
        } catch (e) {
          lastErr = e;
        }

        try {
          const form = new URLSearchParams();
          Object.entries(b).forEach(([k, v]) => form.set(k, String(v)));
          const data = await fetchJSON(buildUrl(endpoint), {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form.toString(),
          });
          return { ok: true, data, token: extractToken(data) };
        } catch (e) {
          lastErr = e;
        }
      }
    }
    return { ok: false, error: lastErr };
  }

  /* --------- RESULTS RENDER (queries) --------- */
  function ensureResultsBox() {
    // Prefer existing container
    let box = $("queryResults") || document.querySelector("#queryResults");

    if (box) return box;

    // Try to place under queries form
    const queriesSection =
      $("section-queries") ||
      document.querySelector("#section-queries") ||
      document.querySelector('[data-tab="queries"]')?.closest("section") ||
      document.body;

    // Find the run button and insert after its parent block
    const btn = $("btnRunQuery") || document.querySelector("#btnRunQuery");
    const anchor = btn ? btn.closest(".card") || btn.closest("div") : queriesSection;

    box = document.createElement("div");
    box.id = "queryResults";
    box.style.marginTop = "12px";
    box.style.padding = "12px";
    box.style.border = "1px solid #e5e7eb";
    box.style.borderRadius = "16px";
    box.style.background = "#fff";
    box.style.boxShadow = "0 10px 22px rgba(2,6,23,.06)";
    box.style.fontWeight = "900";

    const title = document.createElement("div");
    title.textContent = "Результати";
    title.style.fontSize = "16px";
    title.style.marginBottom = "8px";

    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    pre.style.fontSize = "12px";
    pre.style.fontWeight = "700";
    pre.style.margin = "0";
    pre.id = "queryResultsPre";
    pre.textContent = "Поки немає результатів.";

    box.appendChild(title);
    box.appendChild(pre);

    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
    } else {
      queriesSection.appendChild(box);
    }

    return box;
  }

  function renderResults(data) {
    const box = ensureResultsBox();
    const pre = box.querySelector("#queryResultsPre");
    if (!pre) return;

    // Pretty-print but keep small
    let out = "";
    try {
      out = JSON.stringify(data, null, 2);
    } catch {
      out = String(data);
    }
    pre.textContent = out || "Порожня відповідь.";
  }

  /* --------- SAVED QUERIES --------- */
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
    const box = $("savedQueries") || document.querySelector("#savedQueries");
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
      t.textContent = `Запит • ${q.query || "—"}`;

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
        showSection("queries");
        const input = $("queryText") || document.querySelector("#queryText") || document.querySelector('input[type="text"]');
        if (input) input.value = String(q.query || "");
        showToast("Збережений запит підставлено.");
      });

      card.appendChild(left);
      card.appendChild(btn);
      wrap.appendChild(card);
    });

    box.appendChild(wrap);
  }

  /* --------- QUERIES --------- */
  function initQueries() {
    renderSavedQueries();

    const btnRun = $("btnRunQuery") || document.querySelector("#btnRunQuery");
    if (!btnRun) return;

    btnRun.addEventListener("click", async () => {
      const input = $("queryText") || document.querySelector("#queryText") || document.querySelector('input[type="text"]');
      const q = String(input?.value || "").trim();

      const catSel = $("queryCategory") || document.querySelector("#queryCategory");
      const category = String(catSel?.value || "").trim();

      if (!q) {
        showToast("Введіть запит для пошуку.");
        return;
      }

      const params = new URLSearchParams();
      params.set("q", q);
      if (category) params.set("category", category);

      try {
        showToast("Шукаємо…");

        // Try real query endpoint first
        let r = await tryRoutesJSON(
          ROUTES.queryRun.map((p) => p + "?" + params.toString()),
          { method: "GET", headers: { ...authHeaders(), "Content-Type": "application/json" } }
        );

        // Fallback: top-brands endpoint (so you always see SOME data if backend works)
        if (!r.ok) {
          r = await tryRoutesJSON(ROUTES.topBrands, {
            method: "GET",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
          });
        }

        if (!r.ok) throw r.error || new Error("search failed");

        renderResults(r.data);

        const saved = loadSavedQueries();
        saved.unshift({ query: q, category, ts: Date.now() });
        saveSavedQueries(saved);
        renderSavedQueries();

        showToast("✅ Готово.");
      } catch {
        showToast("Не вдалося виконати пошук. Спробуйте пізніше.");
      }
    });
  }

  /* --------- AUTH --------- */
  function initAuth() {
    const loginForm = $("loginForm") || document.querySelector("#loginForm");
    const registerForm = $("registerForm") || document.querySelector("#registerForm");
    const errBox = $("accountError") || document.querySelector("#accountError");

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError(errBox, "");

        const emailEl = $("loginEmail") || document.querySelector("#loginEmail");
        const passEl = $("loginPassword") || document.querySelector("#loginPassword");
        const email = String(emailEl?.value || "").trim();
        const password = String(passEl?.value || "").trim();

        if (!email || !password) {
          setError(errBox, "Будь ласка, введіть email та пароль.");
          return;
        }

        try {
          showToast("Виконуємо вхід…");
          const r = await loginSmart(email, password);
          if (!r.ok) throw r.error || new Error("login failed");

          if (r.token) setToken(r.token);

          const me = await loadMeSilently(email);
          if (!me) {
            // even if /me absent, show email
            uiAfterLogin({ fullName: "", email, id: "—", createdAt: "", isActive: null }, email);
          }

          showToast("✅ Ви увійшли.");
        } catch {
          setToken("");
          uiAfterLogout();
          setError(errBox, "Не вдалося виконати вхід. Перевірте email/пароль і спробуйте ще раз.");
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError(errBox, "");

        const first = String(($("regFirstName") || document.querySelector("#regFirstName"))?.value || "").trim();
        const last = String(($("regLastName") || document.querySelector("#regLastName"))?.value || "").trim();
        const email = String(($("regEmail") || document.querySelector("#regEmail"))?.value || "").trim();
        const password = String(($("regPassword") || document.querySelector("#regPassword"))?.value || "").trim();

        if (!email || !password || !first) {
          setError(errBox, "Будь ласка, заповніть імʼя, email та пароль.");
          return;
        }

        try {
          showToast("Створюємо акаунт…");
          const r = await tryRoutesJSON(ROUTES.register, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ first_name: first, last_name: last, email, password }),
          });
          if (!r.ok) throw r.error || new Error("register failed");
          showToast("✅ Акаунт створено. Тепер увійдіть.");
        } catch {
          setError(errBox, "Не вдалося створити акаунт. Можливо, email вже використовується.");
        }
      });
    }

    const btnLogout = $("btnLogout") || document.querySelector("#btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        setToken("");
        uiAfterLogout();
        showToast("Ви вийшли з акаунта.");
      });
    }

    const btnGoMarket = $("btnGoMarket") || document.querySelector("#btnGoMarket");
    if (btnGoMarket) btnGoMarket.addEventListener("click", () => showSection("market"));
  }

  /* --------- PROJECTS minimal (keep your old HTML working) --------- */
  function asArrayProjects(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.projects)) return payload.projects;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  }
  function projectLabel(p) {
    const name = p?.name || p?.title || p?.project_name || p?.slug || `Проект #${p?.id ?? "—"}`;
    return String(name);
  }
  function projectId(p) {
    return p?.id ?? p?.project_id ?? p?.projectId ?? p?.slug ?? p?.name ?? "";
  }

  async function loadProjectsSilently() {
    const r = await tryRoutesJSON(ROUTES.projects, {
      method: "GET",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    });
    if (!r.ok) return [];

    const list = asArrayProjects(r.data);
    const sel = $("marketProject") || document.querySelector("#marketProject");
    if (sel) {
      sel.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Оберіть проект…";
      sel.appendChild(opt0);

      list.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = String(projectId(p));
        opt.textContent = projectLabel(p);
        sel.appendChild(opt);
      });
    }
    return list;
  }

  /* --------- MARKET minimal KPI render if ids exist --------- */
  function applyMarketKpi(data) {
    const typical = data?.typical_price ?? data?.typical ?? data?.median ?? data?.p50 ?? null;
    const min = data?.range_min ?? data?.min ?? data?.p10 ?? null;
    const max = data?.range_max ?? data?.max ?? data?.p90 ?? null;
    const count = data?.count ?? data?.total ?? data?.ads_count ?? null;

    safeText($("kpiTypical") || document.querySelector("#kpiTypical"), moneyUAH(typical));
    safeText($("kpiRange") || document.querySelector("#kpiRange"), (min != null && max != null) ? `${moneyUAH(min)} — ${moneyUAH(max)}` : "—");
    safeText($("kpiCount") || document.querySelector("#kpiCount"), count != null ? String(count) : "—");
  }

  async function loadMarket() {
    const err = $("marketError") || document.querySelector("#marketError");
    setError(err, "");

    const sel = $("marketProject") || document.querySelector("#marketProject");
    const project = String(sel?.value || "");
    if (!project) { setError(err, "Оберіть проект."); return; }

    const pointsEl = $("marketPoints") || document.querySelector("#marketPoints");
    const offsetEl = $("marketOffset") || document.querySelector("#marketOffset");
    const relEl = $("marketReliable") || document.querySelector("#marketReliable");

    const points = Number(pointsEl?.value || 30);
    const offset = Number(offsetEl?.value || 0);
    const reliable = !!relEl?.checked;

    const params = new URLSearchParams();
    params.set("project_id", project);
    params.set("points", String(Math.max(5, Math.min(30, points || 30))));
    params.set("offset", String(Number.isNaN(offset) ? 0 : offset));
    params.set("reliable", reliable ? "true" : "false");

    try {
      showToast("Завантажуємо аналітику…");
      const r = await tryRoutesJSON(
        ROUTES.marketSummary.map((p) => p + "?" + params.toString()),
        { method: "GET", headers: { ...authHeaders(), "Content-Type": "application/json" } }
      );
      if (!r.ok) throw r.error || new Error("market failed");
      applyMarketKpi(r.data);
      showToast("✅ Готово.");
    } catch {
      setError(err, "Не вдалося завантажити аналітику. Спробуйте ще раз пізніше.");
    }
  }

  function initMarket() {
    const btnLoad = $("btnMarketLoad") || document.querySelector("#btnMarketLoad");
    if (btnLoad) btnLoad.addEventListener("click", loadMarket);
  }

  /* --------- BOOT --------- */
  async function boot() {
    initNav();
    initAuth();
    initQueries();
    initMarket();

    // Fix logo immediately + after short delay (some layouts render late)
    fixHeaderLogo();
    setTimeout(fixHeaderLogo, 200);
    setTimeout(fixHeaderLogo, 800);

    await pingServer();
    setInterval(pingServer, PING_INTERVAL_MS);

    await loadProjectsSilently();
    await loadMeSilently();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
