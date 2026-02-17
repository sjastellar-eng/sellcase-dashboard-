;(() => {
  "use strict";

  /* =========================
     CONFIG
  ========================= */
  const API_BASE = "https://sellcase-backend.onrender.com"; // твой backend
  const LS_TOKEN_KEY = "sellcase_token";

  const ROUTES = {
    health: "/health",
    register: "/auth/register",
    login: "/auth/login",
    me: "/auth/me",
    projects: "/olx/projects",
    market: (projectId) => `/olx/projects/${encodeURIComponent(projectId)}/market`,
    marketHistory: (projectId) => `/olx/projects/${encodeURIComponent(projectId)}/market/history`,
    ads: (projectId) => `/olx/projects/${encodeURIComponent(projectId)}/ads`,
    snapshots: (projectId) => `/olx/projects/${encodeURIComponent(projectId)}/snapshots`,
  };

  /* =========================
     HELPERS
  ========================= */
  const $ = (id) => document.getElementById(id);

  function safeText(el, val) {
    if (!el) return;
    el.textContent = val == null ? "—" : String(val);
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

  function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove("show"), 2400);
  }

  function getToken() {
    return localStorage.getItem(LS_TOKEN_KEY) || "";
  }
  function setToken(t) {
    if (!t) localStorage.removeItem(LS_TOKEN_KEY);
    else localStorage.setItem(LS_TOKEN_KEY, t);
  }

  function authHeaders() {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  async function apiJSON(path, { method = "GET", headers = {}, body = null } = {}) {
    const url = path.startsWith("http") ? path : (API_BASE + path);
    const res = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...authHeaders(),
      },
      body,
    });

    // если вдруг сервер отдает HTML при ошибке — тоже аккуратно прочитаем
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    let data = null;

    if (ct.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => "");
      data = text ? { detail: text } : null;
    }

    if (!res.ok) {
      const message =
        (data && (data.detail || data.message)) ||
        `HTTP ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* =========================
     NAV / SECTIONS
  ========================= */
  function setActiveTab(tabName) {
    document.querySelectorAll(".tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tabName);
    });

    const map = {
      market: "section-market",
      queries: "section-queries",
      projects: "section-projects",
      account: "section-account",
    };

    const targetId = map[tabName];
    document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
    const sec = $(targetId);
    if (sec) sec.classList.add("active");
  }

  function initNav() {
    document.querySelectorAll(".tab").forEach((b) => {
      b.addEventListener("click", () => setActiveTab(b.dataset.tab));
    });
  }

  /* =========================
     SERVER STATUS
  ========================= */
  async function pingServer() {
    const box = $("serverStatus");
    if (!box) return;

    const dot = box.querySelector(".dot");
    const text = box.querySelector("span:last-child");

    try {
      // health может быть /health или / — оставим один
      await apiJSON(ROUTES.health, { method: "GET", headers: { "Accept": "application/json" } });
      dot?.classList.remove("red");
      dot?.classList.add("green");
      if (text) text.textContent = "Online";
    } catch {
      dot?.classList.remove("green");
      dot?.classList.add("red");
      if (text) text.textContent = "Offline";
    }
  }

  /* =========================
     AUTH UI
  ========================= */
  function uiAfterLogout() {
    const forms = $("authForms");
    const done = $("authDone");
    if (forms) forms.style.display = "";
    if (done) done.style.display = "none";
  }

  function uiAfterLogin(me) {
    const forms = $("authForms");
    const done = $("authDone");
    if (forms) forms.style.display = "none";
    if (done) done.style.display = "";

    const fullName = [me?.first_name, me?.last_name].filter(Boolean).join(" ").trim() || me?.email || "Користувач";
    safeText($("userTitle"), fullName);
    safeText($("meId"), me?.id ?? "—");
    safeText($("meCreated"), me?.created_at ?? "—");
    safeText($("meActive"), me?.is_active ?? "—");

    // аватар буква
    const av = $("userAvatar");
    if (av) av.textContent = (fullName[0] || "U").toUpperCase();
  }

  async function loadMeSilently() {
    const me = await apiJSON(ROUTES.me, { method: "GET", headers: { "Accept": "application/json" } });
    uiAfterLogin(me);
    return me;
  }

  function initAuth() {
    const errBox = $("accountError");
    const loginForm = $("loginForm");
    const registerForm = $("registerForm");

    // LOGIN
    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError(errBox, "");
        const email = String($("loginEmail")?.value || "").trim();
        const password = String($("loginPassword")?.value || "");

        if (!email || !password) {
          setError(errBox, "Будь ласка, введіть email і пароль.");
          return;
        }

        try {
          showToast("Входимо...");
          const data = await apiJSON(ROUTES.login, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          // поддержка разных ключей: access_token / token
          const token = data?.access_token || data?.token || "";
          if (!token) throw new Error("Сервер не повернув token.");

          setToken(token);
          showToast("✅ Вхід успішний.");

          await loadProjectsSilently();
          await loadMeSilently();
        } catch (err) {
          setError(errBox, err?.message || "Не вдалося увійти.");
        }
      });
    }

    // REGISTER
    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError(errBox, "");

        const first = String($("regFirstName")?.value || "").trim();
        const last = String($("regLastName")?.value || "").trim();
        const email = String($("regEmail")?.value || "").trim();
        const password = String($("regPassword")?.value || "");

        if (!first || !email || !password) {
          setError(errBox, "Будь ласка, заповніть ім’я, email та пароль.");
          return;
        }

        try {
          showToast("Створюємо акаунт...");
          await apiJSON(ROUTES.register, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ first_name: first, last_name: last, email, password }),
          });

          showToast("✅ Акаунт створено. Тепер увійдіть.");
          // Важно: не автологин — как ты и хотел
        } catch (err) {
          setError(errBox, err?.message || "Не вдалося створити акаунт.");
        }
      });
    }

    // LOGOUT
    const btnLogout = $("btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        setToken("");
        uiAfterLogout();
        showToast("Ви вийшли з акаунта.");
      });
    }

    // GO MARKET
    const btnGoMarket = $("btnGoMarket");
    if (btnGoMarket) {
      btnGoMarket.addEventListener("click", () => setActiveTab("market"));
    }
  }

  /* =========================
     PROJECTS
  ========================= */
  function asArrayProjects(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.projects)) return payload.projects;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  }

  function projectLabel(p) {
    return String(p?.name || p?.title || p?.project_name || p?.slug || p?.id || "—");
  }
  function projectId(p) {
    return p?.id ?? p?.project_id ?? p?.projectId ?? p?.slug ?? "";
  }

  async function loadProjectsSilently() {
    // если нет токена — просто не грузим (и не ругаемся)
    if (!getToken()) return [];

    try {
      const data = await apiJSON(ROUTES.projects, { method: "GET", headers: { "Accept": "application/json" } });
      const list = asArrayProjects(data);

      // select в Market
      const sel = $("marketProject");
      if (sel) {
        sel.innerHTML = "";
        const opt0 = document.createElement("option");
        opt0.value = "";
        opt0.textContent = "Оберіть проект...";
        sel.appendChild(opt0);

        list.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = String(projectId(p));
          opt.textContent = projectLabel(p);
          sel.appendChild(opt);
        });
      }

      // Projects section list
      const pl = $("projectsList");
      if (pl) {
        if (!list.length) pl.textContent = "—";
        else {
          pl.innerHTML = list
            .map((p) => `• ${projectLabel(p)} (id: ${projectId(p)})`)
            .join("<br/>");
        }
      }

      safeText($("projectsInfo"), list.length ? `Знайдено: ${list.length}` : "");
      setError($("projectsError"), "");
      return list;
    } catch (err) {
      // если токен умер — покажем в Projects, но не ломаем всё
      setError($("projectsError"), err?.message || "Не вдалося завантажити проекти.");
      return [];
    }
  }

  function initProjects() {
    const btn = $("btnProjectsReload");
    if (btn) btn.addEventListener("click", loadProjectsSilently);
  }

  /* =========================
     MARKET
  ========================= */
  function formatMoneyUAH(v) {
    if (v == null || v === "—") return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    // без лишней магии: пробелы/грн
    return `${Math.round(n).toLocaleString("uk-UA")} грн`;
  }

  function applyMarketKpi(data) {
    // поддержим несколько форматов
    const typical =
      data?.typical_price ?? data?.typical ?? data?.last?.median_price ?? data?.last?.avg_price ?? null;

    const min =
      data?.range_min ?? data?.min ?? data?.last?.p25_price ?? data?.last?.min_price ?? null;

    const max =
      data?.range_max ?? data?.max ?? data?.last?.p75_price ?? data?.last?.max_price ?? null;

    const count =
      data?.count ?? data?.total ?? data?.ads_count ?? data?.last?.items_count ?? null;

    // delta
    const delta =
      data?.delta?.median_abs ??
      data?.delta?.typical_abs ??
      data?.delta ??
      null;

    safeText($("kpiTypical"), typical == null ? "—" : formatMoneyUAH(typical));
    safeText($("kpiRange"), (min == null || max == null) ? "—" : `${formatMoneyUAH(min)} — ${formatMoneyUAH(max)}`);
    safeText($("kpiCount"), count == null ? "—" : String(count));
    safeText($("kpiDelta"), delta == null ? "—" : formatMoneyUAH(delta));
  }

  async function loadMarket() {
    const err = $("marketError");
    setError(err, "");
    const hint = $("marketHint");
    safeText(hint, "");

    const project = String($("marketProject")?.value || "");
    if (!project) {
      setError(err, "Оберіть проект.");
      return;
    }

    const points = Number($("marketPoints")?.value || 30);
    const offset = Number($("marketOffset")?.value || 0);
    const reliable = !!$("marketReliable")?.checked;

    const params = new URLSearchParams();
    params.set("points", String(Math.max(5, Math.min(30, Number.isFinite(points) ? points : 30))));
    params.set("offset", String(Number.isFinite(offset) && offset >= 0 ? offset : 0));
    params.set("reliable", reliable ? "true" : "false");

    try {
      showToast("Завантажуємо аналітику...");
      // ✅ ВАЖНО: project_id теперь в PATH, как в Swagger
      const data = await apiJSON(`${ROUTES.market(project)}?${params.toString()}`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });

      applyMarketKpi(data);
      showToast("✅ Готово.");
      safeText(hint, `offset: ${params.get("offset")} • points: ${params.get("points")}`);
    } catch (e) {
      setError(err, e?.message || "Не вдалося завантажити аналітику.");
    }
  }

  function initMarket() {
    const btn = $("btnMarketLoad");
    if (btn) btn.addEventListener("click", loadMarket);

    // Prev / Next -> offset +/- points (или 1, если хочешь)
    const btnPrev = $("btnPrev");
    const btnNext = $("btnNext");

    if (btnPrev) {
      btnPrev.addEventListener("click", () => {
        const offEl = $("marketOffset");
        const points = Number($("marketPoints")?.value || 30);
        const cur = Number(offEl?.value || 0);
        const step = Number.isFinite(points) ? points : 30;
        const nextVal = Math.max(0, cur + step); // "попередні" = глубже в историю
        if (offEl) offEl.value = String(nextVal);
        loadMarket();
      });
    }

    if (btnNext) {
      btnNext.addEventListener("click", () => {
        const offEl = $("marketOffset");
        const points = Number($("marketPoints")?.value || 30);
        const cur = Number(offEl?.value || 0);
        const step = Number.isFinite(points) ? points : 30;
        const nextVal = Math.max(0, cur - step); // "наступні" = ближе к текущему
        if (offEl) offEl.value = String(nextVal);
        loadMarket();
      });
    }

    // Save Query (пока локально)
    const btnSave = $("btnSaveQuery");
    if (btnSave) {
      btnSave.addEventListener("click", () => {
        const project = String($("marketProject")?.value || "");
        if (!project) {
          showToast("Спочатку оберіть проект.");
          return;
        }
        const item = {
          project_id: project,
          points: Number($("marketPoints")?.value || 30),
          offset: Number($("marketOffset")?.value || 0),
          reliable: !!$("marketReliable")?.checked,
          saved_at: new Date().toISOString(),
        };

        const key = "sellcase_saved_queries";
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        arr.unshift(item);
        localStorage.setItem(key, JSON.stringify(arr.slice(0, 20)));
        renderSavedQueries();
        showToast("✅ Збережено.");
      });
    }
  }

  /* =========================
     QUERIES (локальный MVP)
  ========================= */
  function renderSavedQueries() {
    const box = $("savedQueries");
    if (!box) return;
    const arr = JSON.parse(localStorage.getItem("sellcase_saved_queries") || "[]");
    if (!arr.length) {
      box.textContent = "—";
      return;
    }
    box.innerHTML = arr
      .map((q) => {
        const when = (q.saved_at || "").slice(0, 19).replace("T", " ");
        return `• project_id: <b>${q.project_id}</b> • points: ${q.points} • offset: ${q.offset} • reliable: ${q.reliable ? "yes" : "no"} <span class="hint">(${when})</span>`;
      })
      .join("<br/>");
  }

  function initQueries() {
    const btn = $("btnRunQuery");
    if (btn) {
      btn.addEventListener("click", () => {
        // пока заглушка (у тебя будет полноценный search/router)
        const txt = String($("queryText")?.value || "").trim();
        if (!txt) return showToast("Введіть запит.");
        showToast("🔎 Поки що MVP: збереження/структура. Search підключимо наступним кроком.");
      });
    }
    renderSavedQueries();
  }

  /* =========================
     BOOT
  ========================= */
  async function boot() {
    initNav();
    initAuth();
    initProjects();
    initQueries();
    initMarket();

    await pingServer();

    // если есть токен — попробуем подтянуть данные
    if (getToken()) {
      try {
        await loadProjectsSilently();
        await loadMeSilently();
      } catch {
        // токен мог протухнуть — сбросим
        setToken("");
        uiAfterLogout();
      }
    } else {
      uiAfterLogout();
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
