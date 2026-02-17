/* SellCase dashboard app.js (full) */

(() => {
  "use strict";

  // =========================
  // CONFIG
  // =========================
  const API_BASE = "https://sellcase-backend.onrender.com"; // ВАЖНО: только сюда

  const ROUTES = {
    health: "/health",

    // Auth
    register: "/auth/register",
    login: "/auth/login",
    me: "/auth/me",

    // Projects
    projects: "/olx/projects/",

    // Market (по твоим скринам из /docs)
    marketSummary: (projectId) => `/olx/projects/${encodeURIComponent(projectId)}/market/summary`,

    // Later (когда подключим)
    // search: "/search/..." etc
  };

  const TOKEN_KEY = "sellcase_token_v1";
  const SAVED_QUERIES_KEY = "sellcase_saved_queries_v1";
  const PING_INTERVAL_MS = 25000;

  // =========================
  // DOM HELPERS
  // =========================
  const $ = (id) => document.getElementById(id);

  function safeText(el, value) {
    if (!el) return;
    el.textContent = value == null ? "" : String(value);
  }

  function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = String(msg ?? "");
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2600);
  }

  function setError(el, err) {
    if (!el) return;

    const msg = formatError(err);
    if (!msg) {
      el.classList.remove("show");
      el.textContent = "";
      return;
    }
    el.classList.add("show");
    el.textContent = msg;
  }

  function formatError(err) {
    if (!err) return "";

    // Уже строка
    if (typeof err === "string") return err;

    // Ошибка JS
    if (err instanceof Error) return err.message || "Невідома помилка";

    // FastAPI detail
    // { detail: "..." } или { detail: [ {loc,msg,type}, ... ] }
    if (typeof err === "object") {
      if (typeof err.detail === "string") return err.detail;

      if (Array.isArray(err.detail)) {
        // 422 validation list
        const parts = err.detail
          .map((x) => {
            const loc = Array.isArray(x.loc) ? x.loc.join(".") : "";
            const msg = x.msg || "";
            return [loc, msg].filter(Boolean).join(": ");
          })
          .filter(Boolean);
        return parts.join(" | ") || "Помилка валідації";
      }

      // Любой другой объект
      try {
        return JSON.stringify(err);
      } catch {
        return "Невідома помилка";
      }
    }

    return String(err);
  }

  // =========================
  // TOKEN
  // =========================
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token) {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  }

  function authHeaders() {
    const token = getToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  // =========================
  // API
  // =========================
  async function apiFetch(path, opts = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

    const method = (opts.method || "GET").toUpperCase();
    const headers = Object.assign({}, opts.headers || {});

    // IMPORTANT:
    // - Не ставим Content-Type на GET
    // - Ставим Content-Type только когда есть body
    const hasBody = opts.body !== undefined && opts.body !== null;

    if (opts.auth !== false) {
      Object.assign(headers, authHeaders());
    }

    if (hasBody && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    // Таймаут, чтобы не висло
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? 20000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: hasBody ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
        signal: controller.signal,
        // mode: "cors" // по умолчанию cors
      });

      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      let data = null;
      if (isJson) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      } else {
        // иногда backend отдаёт текст
        try {
          data = await res.text();
        } catch {
          data = null;
        }
      }

      if (!res.ok) {
        // если FastAPI вернул {detail:...} — покажем detail
        throw data || { detail: `HTTP ${res.status}` };
      }

      return { ok: true, data, status: res.status };
    } catch (e) {
      // Это место ловит "Failed to fetch" / CORS / offline / timeout
      // Превратим в нормальный текст
      if (e?.name === "AbortError") {
        throw new Error("Таймаут запиту (сервер довго не відповідає).");
      }
      if (e instanceof TypeError) {
        // Обычно это как раз "Failed to fetch"
        throw new Error("Не вдалося підключитися до API (CORS/мережа). Перевір домен фронта в ALLOWED_ORIGINS та API_BASE.");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function pingServer() {
    const badge = $("serverStatus");
    const dot = badge?.querySelector(".dot");
    const text = badge?.querySelector("span:last-child");

    try {
      if (dot) dot.className = "dot";
      if (text) text.textContent = "Перевірка...";

      await apiFetch(ROUTES.health, { auth: false, timeoutMs: 12000 });

      if (dot) dot.className = "dot green";
      if (text) text.textContent = "Online";
    } catch {
      if (dot) dot.className = "dot red";
      if (text) text.textContent = "Offline";
    }
  }

  // =========================
  // NAV / SECTIONS
  // =========================
  function showSection(key) {
    const ids = ["market", "queries", "projects", "account"];
    ids.forEach((k) => {
      const el = $(`section-${k}`);
      if (el) el.classList.toggle("active", k === key);
    });

    document.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === key);
    });
  }

  function initNav() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => showSection(btn.dataset.tab));
    });
  }

  // =========================
  // AUTH UI
  // =========================
  function uiAfterLogin(me) {
    const forms = $("authForms");
    const done = $("authDone");

    if (forms) forms.style.display = "none";
    if (done) done.style.display = "block";

    // avatar
    const avatar = $("userAvatar");
    const title = $("userTitle");
    const sub = $("userSubtitle");

    const first = me?.first_name || "";
    const last = me?.last_name || "";
    const email = me?.email || "";

    const letter = (first || email || "U").trim().slice(0, 1).toUpperCase();
    safeText(avatar, letter);

    safeText(title, (first || last) ? `${first} ${last}`.trim() : (email || "Користувач"));
    safeText(sub, "✅ Вхід успішно виконано.");

    safeText($("meId"), me?.id ?? "—");
    safeText($("meCreated"), me?.created_at ?? "—");
    safeText($("meActive"), String(me?.is_active ?? true));

    // projects dropdown refresh
    loadProjectsSilently();
  }

  function uiAfterLogout() {
    const forms = $("authForms");
    const done = $("authDone");
    if (forms) forms.style.display = "block";
    if (done) done.style.display = "none";
  }

  async function loadMeSilently() {
    const token = getToken();
    if (!token) return;

    try {
      const r = await apiFetch(ROUTES.me, { method: "GET" });
      uiAfterLogin(r.data);
    } catch {
      // токен мог протухнуть
      setToken("");
      uiAfterLogout();
    }
  }

  function initAuth() {
    const accountError = $("accountError");
    setError(accountError, "");

    const loginForm = $("loginForm");
    const registerForm = $("registerForm");

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError(accountError, "");

        const email = String($("loginEmail")?.value || "").trim();
        const password = String($("loginPassword")?.value || "");

        if (!email || !password) {
          setError(accountError, "Будь ласка, введіть email та пароль.");
          return;
        }

        try {
          showToast("Виконуємо вхід...");
          const r = await apiFetch(ROUTES.login, {
            method: "POST",
            auth: false,
            body: { email, password },
          });

          // ожидаем { access_token: "..." } или похожее
          const token = r.data?.access_token || r.data?.token || "";
          if (!token) throw new Error("API не повернув токен.");

          setToken(token);
          showToast("✅ Увійшли.");
          await loadMeSilently();
          showSection("market");
        } catch (err) {
          setError(accountError, err);
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError(accountError, "");

        const first_name = String($("regFirstName")?.value || "").trim();
        const last_name = String($("regLastName")?.value || "").trim();
        const email = String($("regEmail")?.value || "").trim();
        const password = String($("regPassword")?.value || "");

        if (!first_name || !email || !password) {
          setError(accountError, "Будь ласка, заповніть імʼя, email та пароль.");
          return;
        }

        try {
          showToast("Створюємо акаунт...");
          await apiFetch(ROUTES.register, {
            method: "POST",
            auth: false,
            body: { first_name, last_name, email, password },
          });

          showToast("✅ Акаунт створено. Тепер увійдіть.");
        } catch (err) {
          setError(accountError, err);
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
    if (btnGoMarket) {
      btnGoMarket.addEventListener("click", () => showSection("market"));
    }
  }

  // =========================
  // PROJECTS
  // =========================
  function asArrayProjects(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.projects)) return payload.projects;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  }

  function projectLabel(p) {
    const name = p?.name ?? p?.title ?? p?.project_name ?? p?.slug ?? "";
    return String(name || "Project");
  }

  function projectId(p) {
    return p?.id ?? p?.project_id ?? p?.projectId ?? p?.slug ?? "";
  }

  async function loadProjectsSilently() {
    try {
      const r = await apiFetch(ROUTES.projects, { method: "GET" });
      const list = asArrayProjects(r.data);

      // dropdown for market
      const sel = $("marketProject");
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

      // projects page list
      renderProjectsList(list);

      safeText($("projectsInfo"), list.length ? `Проєктів: ${list.length}` : "Проєктів поки немає.");
      setError($("projectsError"), "");
      return list;
    } catch (err) {
      // если не залогинен — projects могут быть закрыты
      setError($("projectsError"), err);
      safeText($("projectsInfo"), "");
      return [];
    }
  }

  function renderProjectsList(list) {
    const box = $("projectsList");
    if (!box) return;

    if (!list || !list.length) {
      box.textContent = "—";
      return;
    }

    box.innerHTML = "";
    const ul = document.createElement("ul");
    ul.style.margin = "0";
    ul.style.paddingLeft = "18px";

    list.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = `${projectLabel(p)} (id: ${projectId(p)})`;
      ul.appendChild(li);
    });

    box.appendChild(ul);
  }

  function initProjects() {
    const btn = $("btnProjectsReload");
    if (btn) btn.addEventListener("click", loadProjectsSilently);
  }

  // =========================
  // MARKET
  // =========================
  function formatPrice(x) {
    if (x == null || x === "") return "—";
    const n = Number(x);
    if (!Number.isFinite(n)) return String(x);
    return new Intl.NumberFormat("uk-UA").format(n);
  }

  function applyMarketKpi(data) {
    const typical = data?.typical_price ?? data?.typical ?? data?.p50 ?? null;
    const min = data?.range_min ?? data?.min ?? data?.p10 ?? null;
    const max = data?.range_max ?? data?.max ?? data?.p90 ?? null;
    const count = data?.count ?? data?.total ?? data?.ads_count ?? null;

    // delta может быть в data.delta.median_abs / data.delta.typical_abs etc
    const deltaAbs =
      data?.delta?.typical_abs ??
      data?.delta?.median_abs ??
      data?.delta_abs ??
      null;

    safeText($("kpiTypical"), typical == null ? "—" : `${formatPrice(typical)} грн`);
    safeText($("kpiRange"), (min == null || max == null) ? "—" : `${formatPrice(min)}–${formatPrice(max)} грн`);
    safeText($("kpiCount"), count == null ? "—" : formatPrice(count));
    safeText($("kpiDelta"), deltaAbs == null ? "—" : `${formatPrice(deltaAbs)} грн`);
  }

  async function loadMarket() {
    const err = $("marketError");
    setError(err, "");

    const sel = $("marketProject");
    const project = String(sel?.value || "");
    if (!project) {
      setError(err, "Оберіть проект.");
      return;
    }

    const pointsEl = $("marketPoints");
    const offsetEl = $("marketOffset");
    const relEl = $("marketReliable");

    const points = Number(pointsEl?.value || 30);
    const offset = Number(offsetEl?.value || 0);
    const reliable = !!relEl?.checked;

    const params = new URLSearchParams();
    params.set("project_id", project);
    params.set("points", String(Math.max(5, Math.min(30, Number.isFinite(points) ? points : 30))));
    params.set("offset", String(Number.isFinite(offset) ? Math.max(0, offset) : 0));
    params.set("reliable", reliable ? "true" : "false");

    try {
      showToast("Завантаження аналітики...");
      const url = `${ROUTES.marketSummary(project)}?${params.toString()}`;

      const r = await apiFetch(url, { method: "GET" });
      applyMarketKpi(r.data);

      safeText($("marketHint"), `offset=${params.get("offset")}, points=${params.get("points")}`);
      showToast("✅ Готово.");
    } catch (e) {
      setError(err, e);
    }
  }

  function initMarket() {
    const btnLoad = $("btnMarketLoad");
    if (btnLoad) btnLoad.addEventListener("click", loadMarket);

    const btnPrev = $("btnPrev");
    const btnNext = $("btnNext");
    const offsetEl = $("marketOffset");

    if (btnPrev && offsetEl) {
      btnPrev.addEventListener("click", () => {
        const v = Number(offsetEl.value || 0);
        offsetEl.value = String((Number.isFinite(v) ? v : 0) + 1);
        loadMarket();
      });
    }

    if (btnNext && offsetEl) {
      btnNext.addEventListener("click", () => {
        const v = Number(offsetEl.value || 0);
        const next = Math.max(0, (Number.isFinite(v) ? v : 0) - 1);
        offsetEl.value = String(next);
        loadMarket();
      });
    }

    // Save query (local)
    const btnSave = $("btnSaveQuery");
    if (btnSave) {
      btnSave.addEventListener("click", () => {
        const sel = $("marketProject");
        const project = String(sel?.value || "");
        if (!project) {
          showToast("Спочатку оберіть проект.");
          return;
        }
        const record = {
          ts: new Date().toISOString(),
          project_id: project,
          points: Number($("marketPoints")?.value || 30),
          offset: Number($("marketOffset")?.value || 0),
          reliable: !!$("marketReliable")?.checked,
        };
        const list = loadSavedQueries();
        list.unshift(record);
        saveSavedQueries(list.slice(0, 50));
        renderSavedQueries();
        showToast("✅ Збережено.");
      });
    }
  }

  // =========================
  // QUERIES (MVP placeholder)
  // =========================
  function loadSavedQueries() {
    try {
      const raw = localStorage.getItem(SAVED_QUERIES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveSavedQueries(arr) {
    localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(arr || []));
  }

  function renderSavedQueries() {
    const box = $("savedQueries");
    if (!box) return;

    const list = loadSavedQueries();
    if (!list.length) {
      box.textContent = "—";
      return;
    }

    box.innerHTML = "";
    const ul = document.createElement("ul");
    ul.style.margin = "0";
    ul.style.paddingLeft = "18px";

    list.forEach((q) => {
      const li = document.createElement("li");
      li.textContent = `project_id=${q.project_id}, points=${q.points}, offset=${q.offset}, reliable=${q.reliable ? "true" : "false"}`;
      ul.appendChild(li);
    });

    box.appendChild(ul);
  }

  function initQueries() {
    renderSavedQueries();

    const btn = $("btnRunQuery");
    if (btn) {
      btn.addEventListener("click", () => {
        // Пока у тебя в UI написано “Search подключим следующим шагом”
        // Не делаем фейковый запрос, чтобы не было "Failed to fetch"
        showToast("Search ще не підключено в MVP (підключимо наступним кроком).");
      });
    }
  }

  // =========================
  // BOOT
  // =========================
  async function boot() {
    initNav();
    initAuth();
    initQueries();
    initProjects();
    initMarket();

    await pingServer();
    setInterval(pingServer, PING_INTERVAL_MS);

    await loadMeSilently();
    await loadProjectsSilently();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
