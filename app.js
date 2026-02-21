/* app.js — SellCase frontend glue (vanilla)
   Works with current index.html and backend routes on Render.
*/
(() => {
  "use strict";

  // =============================
  // Config
  // =============================
  const DEFAULT_API_BASE = "https://sellcase-backend.onrender.com";
  const LS_TOKEN = "sellcase.token";
  const LS_API_BASE = "sellcase.apiBase";
  const LS_SAVED_QUERIES = "sellcase.savedQueries";
  const LS_LAST_PROJECT_ID = "sellcase.lastProjectId";

  const API_BASE = (localStorage.getItem(LS_API_BASE) || DEFAULT_API_BASE).replace(/\/$/, "");

  // =============================
  // DOM helpers
  // =============================
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const ch of children) node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
    return node;
  }

  // =============================
  // UI: toast / errors / status
  // =============================
  let toastTimer = null;
  function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function setError(boxId, msg) {
    const box = $(boxId);
    if (!box) return;
    if (!msg) {
      box.textContent = "";
      box.classList.remove("show");
      return;
    }
    box.textContent = msg;
    box.classList.add("show");
  }

  function setHint(id, msg) {
    const node = $(id);
    if (!node) return;
    node.textContent = msg || "";
  }

  function setServerStatus(state) {
    // state: connecting | online | offline
    const status = $("serverStatus");
    if (!status) return;
    const dot = qs(".dot", status);
    const text = qs("span:nth-child(2)", status) || qs("span", status);

    if (dot) dot.classList.remove("green", "red");
    if (state === "connecting") {
      if (text) text.textContent = "Connecting…";
    } else if (state === "online") {
      if (dot) dot.classList.add("green");
      if (text) text.textContent = "Online";
    } else {
      if (dot) dot.classList.add("red");
      if (text) text.textContent = "Offline";
    }
  }

  // =============================
  // Auth: token storage
  // =============================
  function getToken() {
    return localStorage.getItem(LS_TOKEN) || "";
  }
  function setToken(token) {
    if (token) localStorage.setItem(LS_TOKEN, token);
    else localStorage.removeItem(LS_TOKEN);
  }

  // =============================
  // HTTP
  // =============================
  async function apiFetch(path, opts = {}) {
    const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

    const headers = new Headers(opts.headers || {});
    headers.set("Accept", "application/json");

    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(url, { ...opts, headers });

    // Try parse JSON
    let data = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      // Might still return json-like
      try {
        const txt = await res.text();
        data = txt;
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const detail =
        (data && typeof data === "object" && (data.detail || data.message)) ||
        (typeof data === "string" ? data : "") ||
        `HTTP ${res.status}`;
      const err = new Error(detail);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  // =============================
  // Navigation tabs
  // =============================
  function setActiveTab(tabName) {
    // tabName: market | queries | projects | account
    qsa(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
    qsa(".section").forEach((s) => s.classList.remove("active"));
    const section = $(`section-${tabName}`);
    if (section) section.classList.add("active");
  }

  function initTabs() {
    qsa(".tab").forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
    });
  }

  // =============================
  // Account (register/login/me)
  // =============================
  function avatarTextFromEmail(email) {
    if (!email) return "U";
    const c = String(email).trim()[0] || "U";
    return c.toUpperCase();
  }

  function setLoggedInUI(me) {
    const forms = $("authForms");
    const done = $("authDone");
    if (forms) forms.style.display = "none";
    if (done) done.style.display = "block";

    const email = me?.email || "";
    const id = me?.id != null ? String(me.id) : "—";
    const created = me?.created_at ? String(me.created_at) : "—";
    const active = me?.is_active != null ? (me.is_active ? "Активний" : "Неактивний") : "—";

    if ($("userTitle")) $("userTitle").textContent = email || "Користувач";
    if ($("userAvatar")) $("userAvatar").textContent = avatarTextFromEmail(email);

    if ($("meId")) $("meId").textContent = id;
    if ($("meCreated")) $("meCreated").textContent = created;
    if ($("meActive")) $("meActive").textContent = active;

    setError("accountError", "");
  }

  function setLoggedOutUI() {
    const forms = $("authForms");
    const done = $("authDone");
    if (forms) forms.style.display = "block";
    if (done) done.style.display = "none";
  }

  async function loadMe() {
    const token = getToken();
    if (!token) {
      setLoggedOutUI();
      return null;
    }
    try {
      const me = await apiFetch("/auth/me", { method: "GET" });
      setLoggedInUI(me);
      return me;
    } catch (e) {
      // token invalid
      setToken("");
      setLoggedOutUI();
      return null;
    }
  }

  async function doRegister(email, password) {
    // Backend expects JSON: {email, password} 9
    return apiFetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  }

  async function doLogin(email, password) {
    // Backend expects OAuth2PasswordRequestForm => x-www-form-urlencoded username/password 10
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);

    return apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  }

  function initAccountHandlers() {
    const loginForm = $("loginForm");
    const registerForm = $("registerForm");
    const logoutBtn = $("btnLogout");
    const goMarketBtn = $("btnGoMarket");

    if (loginForm) {
      loginForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        setError("accountError", "");
        setHint("loginInfo", ""); // keep clean

        const email = ($("loginEmail")?.value || "").trim();
        const password = $("loginPassword")?.value || "";

        if (!email || !password) {
          setError("accountError", "Вкажіть email і пароль.");
          return;
        }

        try {
          const tok = await doLogin(email, password);
          if (tok?.access_token) setToken(tok.access_token);
          showToast("✅ Вхід успішний");
          await loadMe();
          // refresh projects after login
          await reloadProjects();
          await reloadProjectsSelect();
        } catch (e) {
          setError("accountError", String(e.message || e));
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        setError("accountError", "");

        // Your backend does NOT accept first/last name in register
        const email = ($("regEmail")?.value || "").trim();
        const password = $("regPassword")?.value || "";

        if (!email || !password) {
          setError("accountError", "Вкажіть email і пароль.");
          return;
        }

        try {
          await doRegister(email, password);
          showToast("✅ Реєстрація успішна. Тепер увійдіть.");
          // Do not auto-login unless you want it.
        } catch (e) {
          setError("accountError", String(e.message || e));
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        setToken("");
        setLoggedOutUI();
        showToast("Ви вийшли з акаунту");
        // clear UI that depends on auth
        clearProjectsUI();
        clearMarketUI();
      });
    }

    if (goMarketBtn) {
      goMarketBtn.addEventListener("click", () => setActiveTab("market"));
    }
  }

  // =============================
  // Projects
  // =============================
  function clearProjectsUI() {
    if ($("projectsList")) $("projectsList").innerHTML = "—";
    setError("projectsError", "");
    setHint("projectsInfo", "");
    if ($("marketProject")) $("marketProject").innerHTML = "";
  }

  function clearMarketUI() {
    if ($("kpiTypical")) $("kpiTypical").textContent = "—";
    if ($("kpiDelta")) $("kpiDelta").textContent = "—";
    if ($("kpiRange")) $("kpiRange").textContent = "—";
    if ($("kpiCount")) $("kpiCount").textContent = "—";
    setHint("marketHint", "");
    setError("marketError", "");
  }

  function moneyUAH(x) {
    if (x == null || Number.isNaN(Number(x))) return "—";
    const n = Number(x);
    return `${Math.round(n).toLocaleString("uk-UA")} ₴`;
  }

  function fmtDelta(curr, prev) {
    if (curr == null || prev == null) return "—";
    const c = Number(curr), p = Number(prev);
    if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return "—";
    const diff = c - p;
    const pct = (diff / p) * 100;
    const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
    return `${sign}${Math.abs(diff).toFixed(0)} ₴ (${sign}${Math.abs(pct).toFixed(1)}%)`;
  }

  function renderProjectCard(p, lastSnapshot) {
    const title = el("div", { style: "font-weight:1200; font-size:14px; letter-spacing:-.01em;" }, [p.name || `Проєкт #${p.id}`]);
    const url = el("div", { class: "hint", style: "margin-top:4px; word-break:break-word;" }, [p.search_url || "—"]);
    const meta = el("div", { class: "hint", style: "margin-top:8px;" }, [
      lastSnapshot
        ? `Останній зріз: ${moneyUAH(lastSnapshot.median_price ?? lastSnapshot.avg_price)} • ${lastSnapshot.items_count ?? "—"} огол.`
        : "Поки немає зрізів. Натисніть “Завантажити” в Ринку."
    ]);

    const actions = el("div", { style: "margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;" });

    const btnUse = el("button", { class: "btn", type: "button" }, ["Використати в Ринку"]);
    btnUse.addEventListener("click", async () => {
      localStorage.setItem(LS_LAST_PROJECT_ID, String(p.id));
      await reloadProjectsSelect();
      setActiveTab("market");
    });

    const btnRefresh = el("button", { class: "btn primary", type: "button" }, ["Оновити зріз"]);
    btnRefresh.addEventListener("click", async () => {
      try {
        setError("projectsError", "");
        await refreshProject(p.id);
        showToast("✅ Зріз оновлено");
        await reloadProjects();
        await reloadProjectsSelect();
      } catch (e) {
        setError("projectsError", String(e.message || e));
      }
    });

    actions.appendChild(btnUse);
    actions.appendChild(btnRefresh);

    const box = el("div", {
      style:
        "padding:14px;border-radius:22px;border:1px solid var(--border);background:white;box-shadow: var(--shadow-soft);margin-top:10px;",
    });

    box.appendChild(title);
    box.appendChild(url);
    box.appendChild(meta);
    box.appendChild(actions);
    return box;
  }

  async function reloadProjects() {
    const token = getToken();
    if (!token) return;

    setError("projectsError", "");
    setHint("projectsInfo", "Завантаження…");

    try {
      // overview gives last_snapshot but without median/p25/p75; we still can show basics
      const list = await apiFetch("/olx/projects/overview", { method: "GET" }); // 11

      const root = $("projectsList");
      if (!root) return;

      root.innerHTML = "";
      if (!Array.isArray(list) || list.length === 0) {
        root.textContent = "Поки немає проєктів. Створіть перший проєкт.";
        setHint("projectsInfo", "");
        return;
      }

      // For better info, we fetch last snapshot for each project (limit 1)
      for (const p of list) {
        let last = null;
        try {
          const snaps = await apiFetch(`/olx/projects/${p.id}/snapshots?limit=1&offset=0`, { method: "GET" }); // 12
          last = Array.isArray(snaps) && snaps[0] ? snaps[0] : null;
        } catch {
          last = null;
        }
        root.appendChild(renderProjectCard(p, last));
      }

      setHint("projectsInfo", `Проєктів: ${list.length}`);
    } catch (e) {
      setError("projectsError", String(e.message || e));
      setHint("projectsInfo", "");
    }
  }

  async function createProject(name, search_url, notes = "") {
    // Requires auth. 13
    return apiFetch("/olx/projects/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, search_url, notes }),
    });
  }

  async function refreshProject(projectId) {
    // 14
    return apiFetch(`/olx/projects/${projectId}/refresh`, { method: "POST" });
  }

  function ensureCreateProjectButton() {
    const row = qs("#section-projects .row");
    if (!row) return;
    if (qs("#btnProjectCreate", row)) return;

    const btn = el("button", { class: "btn", id: "btnProjectCreate", type: "button" }, ["Створити проєкт"]);
    btn.addEventListener("click", async () => {
      setError("projectsError", "");

      const token = getToken();
      if (!token) {
        setActiveTab("account");
        setError("accountError", "Спочатку увійдіть, щоб створювати проєкти.");
        return;
      }

      const name = (prompt("Назва проєкту (наприклад: iPhone 13 / Дитячі коляски)") || "").trim();
      if (!name) return;

      const url = (prompt("Вставте URL пошуку OLX (повний link з фільтрами):") || "").trim();
      if (!url) return;

      const notes = (prompt("Нотатка (необовʼязково):") || "").trim();

      try {
        await createProject(name, url, notes);
        showToast("✅ Проєкт створено");
        await reloadProjects();
        await reloadProjectsSelect();
      } catch (e) {
        setError("projectsError", String(e.message || e));
      }
    });

    row.insertBefore(btn, row.firstChild);
  }

  // =============================
  // Market (snapshots => KPI)
  // =============================
  async function reloadProjectsSelect() {
    const sel = $("marketProject");
    if (!sel) return;

    sel.innerHTML = "";
    const token = getToken();
    if (!token) return;

    try {
      const projects = await apiFetch("/olx/projects/", { method: "GET" }); // 15
      if (!Array.isArray(projects) || projects.length === 0) {
        sel.appendChild(el("option", { value: "" }, ["(немає проєктів)"]));
        return;
      }

      for (const p of projects) {
        sel.appendChild(el("option", { value: String(p.id) }, [p.name || `Проєкт #${p.id}`]));
      }

      const remembered = localStorage.getItem(LS_LAST_PROJECT_ID);
      const firstId = String(projects[0].id);
      const pick = remembered && projects.some((p) => String(p.id) === String(remembered)) ? String(remembered) : firstId;

      sel.value = pick;
    } catch {
      sel.appendChild(el("option", { value: "" }, ["(помилка завантаження)"]));
    }
  }

  async function loadMarketKpi({ doRefresh = false } = {}) {
    setError("marketError", "");
    setHint("marketHint", "");

    const token = getToken();
    if (!token) {
      setError("marketError", "Увійдіть, щоб бачити ринок і проєкти.");
      return;
    }

    const projectId = Number($("marketProject")?.value || 0);
    if (!projectId) {
      setError("marketError", "Оберіть проєкт.");
      return;
    }
    localStorage.setItem(LS_LAST_PROJECT_ID, String(projectId));

    const points = Math.max(5, Math.min(30, Number($("marketPoints")?.value || 30)));
    const offset = Math.max(0, Number($("marketOffset")?.value || 0));

    try {
      setHint("marketHint", doRefresh ? "Оновлюємо дані з OLX…" : "Завантаження…");

      if (doRefresh) {
        await refreshProject(projectId);
      }

      // Fetch snapshots page
      const snaps = await apiFetch(`/olx/projects/${projectId}/snapshots?limit=${points}&offset=${offset}`, { method: "GET" });

      if (!Array.isArray(snaps) || snaps.length === 0) {
        clearMarketUI();
        setHint("marketHint", "Немає зрізів. Натисніть “Завантажити”, щоб створити перший.");
        return;
      }

      // snapshots are ordered desc by taken_at in backend listing function
      const cur = snaps[0];
      const prev = snaps[1] || null;

      const typical = cur.median_price ?? cur.avg_price ?? null;
      const prevTypical = prev ? (prev.median_price ?? prev.avg_price ?? null) : null;

      const p25 = cur.p25_price ?? null;
      const p75 = cur.p75_price ?? null;
      const range =
        p25 != null && p75 != null
          ? `${moneyUAH(p25)} — ${moneyUAH(p75)}`
          : cur.min_price != null && cur.max_price != null
          ? `${moneyUAH(cur.min_price)} — ${moneyUAH(cur.max_price)}`
          : "—";

      if ($("kpiTypical")) $("kpiTypical").textContent = moneyUAH(typical);
      if ($("kpiDelta")) $("kpiDelta").textContent = prevTypical != null && typical != null ? fmtDelta(typical, prevTypical) : "—";
      if ($("kpiRange")) $("kpiRange").textContent = range;
      if ($("kpiCount")) $("kpiCount").textContent = cur.items_count != null ? String(cur.items_count) : "—";

      setHint("marketHint", `Зрізів у вибірці: ${snaps.length}`);
    } catch (e) {
      setError("marketError", String(e.message || e));
      setHint("marketHint", "");
    }
  }

  function initMarketHandlers() {
    const btnLoad = $("btnMarketLoad");
    const btnPrev = $("btnPrev");
    const btnNext = $("btnNext");

    if (btnLoad) {
      btnLoad.addEventListener("click", async () => {
        await loadMarketKpi({ doRefresh: true });
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener("click", async () => {
        const off = $("marketOffset");
        if (!off) return;
        const cur = Math.max(0, Number(off.value || 0));
        off.value = String(cur + 1);
        await loadMarketKpi({ doRefresh: false });
      });
    }

    if (btnNext) {
      btnNext.addEventListener("click", async () => {
        const off = $("marketOffset");
        if (!off) return;
        const cur = Math.max(0, Number(off.value || 0));
        off.value = String(Math.max(0, cur - 1));
        await loadMarketKpi({ doRefresh: false });
      });
    }

    const sel = $("marketProject");
    if (sel) {
      sel.addEventListener("change", async () => {
        await loadMarketKpi({ doRefresh: false });
      });
    }
  }

  // =============================
  // Queries (Search)
  // =============================
  function getSavedQueries() {
    try {
      const raw = localStorage.getItem(LS_SAVED_QUERIES);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function setSavedQueries(arr) {
    localStorage.setItem(LS_SAVED_QUERIES, JSON.stringify(arr.slice(0, 50)));
  }

  function ensureQueriesUI() {
    const section = $("section-queries");
    if (!section) return;
    if ($("queryResults")) return;

    const divider = qs(".divider", section);
    const results = el("div", { id: "queryResults", style: "margin-top:12px;" });
    divider?.after(results);
  }

  function renderSavedQueries() {
    const box = $("savedQueries");
    if (!box) return;

    const items = getSavedQueries();
    if (items.length === 0) {
      box.textContent = "—";
      return;
    }

    box.innerHTML = "";
    const wrap = el("div", { style: "display:flex; gap:8px; flex-wrap:wrap;" });

    for (const it of items) {
      const chip = el(
        "button",
        { class: "btn", type: "button", style: "padding:10px 12px; border-radius:999px;" },
        [`${it.query}${it.category ? ` • ${it.category}` : ""}`]
      );
      chip.addEventListener("click", async () => {
        if ($("queryText")) $("queryText").value = it.query;
        if ($("queryCategory")) $("queryCategory").value = it.category || "";
        await runSearch();
      });
      wrap.appendChild(chip);
    }

    box.appendChild(wrap);
  }

  function saveCurrentQuery() {
    const q = ($("queryText")?.value || "").trim();
    const cat = ($("queryCategory")?.value || "").trim();
    if (!q) {
      showToast("Введіть запит для збереження");
      return;
    }
    const arr = getSavedQueries();
    const exists = arr.some((x) => (x.query || "").toLowerCase() === q.toLowerCase() && (x.category || "") === cat);
    if (!exists) {
      arr.unshift({ query: q, category: cat, ts: Date.now() });
      setSavedQueries(arr);
      renderSavedQueries();
    }
    showToast("⭐ Запит збережено");
  }

  function renderSearchResults(payload) {
    ensureQueriesUI();
    const root = $("queryResults");
    if (!root) return;

    root.innerHTML = "";

    const header = el(
      "div",
      {
        style:
          "padding:14px;border-radius:22px;border:1px solid var(--border);background:white;box-shadow: var(--shadow-soft);",
      },
      []
    );

    const q = payload?.query || "";
    const cnt = payload?.results_count ?? 0;
    header.appendChild(el("div", { style: "font-weight:1200; font-size:14px; letter-spacing:-.01em;" }, [`Результат для: ${q}`]));
    header.appendChild(el("div", { class: "hint", style: "margin-top:4px;" }, [`Знайдено в базі: ${cnt}`]));

    root.appendChild(header);

    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0) {
      root.appendChild(
        el(
          "div",
          { class: "hint", style: "margin-top:10px; text-align:center;" },
          ["Поки немає даних у базі для цього запиту. Це означає, що OLX-оголошення ще не зібрані/не завантажені в OlxAd."]
        )
      );
      return;
    }

    const list = el("div", { style: "margin-top:12px; display:grid; gap:10px;" });

    for (const it of items.slice(0, 50)) {
      const card = el("div", {
        style:
          "padding:14px;border-radius:22px;border:1px solid var(--border);background:white;box-shadow: var(--shadow-soft);",
      });

      const t = it.title || it.name || "Оголошення";
      const price = it.price != null ? moneyUAH(it.price) : "—";
      const url = it.url || it.link || it.external_url || "";
      const loc = it.location || it.city || it.region || it.category || "";
      const seller = it.seller_name || it.seller || "";

      card.appendChild(el("div", { style: "font-weight:1200; letter-spacing:-.01em;" }, [t]));
      card.appendChild(el("div", { class: "hint", style: "margin-top:6px;" }, [
        `Ціна: ${price}${loc ? ` • ${loc}` : ""}${seller ? ` • ${seller}` : ""}`,
      ]));

      if (url) {
        const a = el("a", { href: url, target: "_blank", rel: "noopener", style: "display:inline-block; margin-top:8px; font-weight:900;" }, ["Відкрити оголошення →"]);
        card.appendChild(a);
      }

      list.appendChild(card);
    }

    root.appendChild(list);
  }

  async function runSearch() {
    setError("accountError", ""); // keep clean

    const q = ($("queryText")?.value || "").trim();
    const cat = ($("queryCategory")?.value || "").trim();

    if (!q) {
      showToast("Введіть запит");
      return;
    }

    try {
      // Backend search uses POST with query string param: /search?query=... 16
      const payload = await apiFetch(`/search?query=${encodeURIComponent(q)}`, { method: "POST" });

      // Save query locally as UX (optional)
      const arr = getSavedQueries();
      const exists = arr.some((x) => (x.query || "").toLowerCase() === q.toLowerCase() && (x.category || "") === cat);
      if (!exists) {
        arr.unshift({ query: q, category: cat, ts: Date.now() });
        setSavedQueries(arr);
        renderSavedQueries();
      }

      renderSearchResults(payload);
    } catch (e) {
      ensureQueriesUI();
      const root = $("queryResults");
      if (root) {
        root.innerHTML = "";
        root.appendChild(
          el(
            "div",
            { class: "error show", style: "display:block;" },
            [String(e.message || e)]
          )
        );
      }
    }
  }

  function initQueryHandlers() {
    ensureQueriesUI();

    const btnRun = $("btnRunQuery");
    const btnSave = $("btnSaveQuery");

    if (btnRun) btnRun.addEventListener("click", runSearch);
    if (btnSave) btnSave.addEventListener("click", saveCurrentQuery);

    renderSavedQueries();
  }

  // =============================
  // Server status check
  // =============================
  async function checkServer() {
    setServerStatus("connecting");
    try {
      await apiFetch("/health", { method: "GET" }); // 17
      setServerStatus("online");
    } catch {
      setServerStatus("offline");
    }
  }

  // =============================
  // Boot
  // =============================
  async function boot() {
    initTabs();
    initAccountHandlers();
    initMarketHandlers();
    initQueryHandlers();
    ensureCreateProjectButton();

    await checkServer();

    // load auth state (if token exists)
    await loadMe();

    // if logged in - load projects + select
    if (getToken()) {
      await reloadProjects();
      await reloadProjectsSelect();
      // Load market without refresh (fast)
      await loadMarketKpi({ doRefresh: false });
    } else {
      clearProjectsUI();
      clearMarketUI();
    }

    // Projects reload button
    const btnReload = $("btnProjectsReload");
    if (btnReload) {
      btnReload.addEventListener("click", async () => {
        await reloadProjects();
        await reloadProjectsSelect();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
