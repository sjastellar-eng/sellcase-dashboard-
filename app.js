// app.js — SellCase Dashboard (aligned with /openapi.json)
// Backend base: https://sellcase-backend.onrender.com

(() => {
  "use strict";

  const API_BASE = "https://sellcase-backend.onrender.com";

  const PING_INTERVAL_MS = 30_000;
  const DEFAULT_HISTORY_LIMIT = 30;
  const OFFSET_STEP = 1; // шаг по "истории" в API = offset (сколько периодов назад)

  /* -------------------- DOM helpers -------------------- */
  const $ = (id) => document.getElementById(id);

  const show = (el) => { if (el) el.style.display = ""; };
  const hide = (el) => { if (el) el.style.display = "none"; };

  function safeText(el, value) {
    if (!el) return;
    el.textContent = (value === undefined || value === null || value === "") ? "—" : String(value);
  }

  function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2800);
  }

  function setError(el, msg) {
    if (!el) return;
    const text = msg ? String(msg) : "";
    el.textContent = text;
    if (text) el.classList.add("show");
    else el.classList.remove("show");
  }

  /* -------------------- Token storage -------------------- */
  const TOKEN_KEY = "sellcase_token";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }
  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token || "");
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  /* -------------------- API helpers -------------------- */
  function authHeaders() {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  // Try to parse FastAPI errors nicely
  async function parseErrorResponse(resp) {
    let text = "";
    try {
      const data = await resp.json();

      // FastAPI often: {detail: "..."} or {detail: [{loc, msg, type}, ...]}
      if (typeof data?.detail === "string") return data.detail;

      if (Array.isArray(data?.detail)) {
        // Join all validation messages
        const msgs = data.detail
          .map((x) => {
            const loc = Array.isArray(x?.loc) ? x.loc.join(".") : "";
            const msg = x?.msg || "";
            return loc ? `${loc}: ${msg}` : msg;
          })
          .filter(Boolean);
        if (msgs.length) return msgs.join(" | ");
      }

      // Fallback: stringify short
      text = JSON.stringify(data);
      if (text && text.length > 400) text = text.slice(0, 400) + "…";
      return text || `HTTP ${resp.status}`;
    } catch {
      try {
        const t = await resp.text();
        return t || `HTTP ${resp.status}`;
      } catch {
        return `HTTP ${resp.status}`;
      }
    }
  }

  async function apiFetch(path, { method = "GET", headers = {}, body = null, timeoutMs = 25_000 } = {}) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      if (!resp.ok) {
        const msg = await parseErrorResponse(resp);
        const err = new Error(msg || "Request failed");
        err.status = resp.status;
        throw err;
      }

      return resp;
    } finally {
      clearTimeout(to);
    }
  }

  async function apiGetJson(path, opts = {}) {
    const resp = await apiFetch(path, {
      ...opts,
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(opts.headers || {}),
      },
    });
    return resp.json();
  }

  async function apiPostJson(path, payload, opts = {}) {
    const resp = await apiFetch(path, {
      ...opts,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      body: JSON.stringify(payload),
    });
    // some endpoints may return empty
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) return resp.json();
    return null;
  }

  async function apiPostForm(path, formObj, opts = {}) {
    const form = new URLSearchParams();
    Object.entries(formObj || {}).forEach(([k, v]) => form.set(k, String(v ?? "")));

    const resp = await apiFetch(path, {
      ...opts,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        ...(opts.headers || {}),
      },
      body: form.toString(),
    });
    return resp.json();
  }

  /* -------------------- UI: Tabs -------------------- */
  function setTab(tabName) {
    // buttons
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((b) => {
      const active = b.dataset.tab === tabName;
      b.classList.toggle("active", active);
    });

    // sections
    const map = {
      market: "section-market",
      queries: "section-queries",
      projects: "section-projects",
      account: "section-account",
    };

    Object.entries(map).forEach(([k, id]) => {
      const el = $(id);
      if (!el) return;
      el.classList.toggle("active", k === tabName);
    });
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

  /* -------------------- Server status -------------------- */
  function setServerStatus(isOk, label) {
    const s = $("serverStatus");
    if (!s) return;
    const dot = s.querySelector(".dot");
    const text = s.querySelector("span:last-child");
    if (dot) {
      dot.classList.remove("red", "green");
      dot.classList.add(isOk ? "green" : "red");
    }
    if (text) text.textContent = label || (isOk ? "Online" : "Offline");
  }

  async function pingServer() {
    try {
      await apiGetJson("/health");
      setServerStatus(true, "Online");
    } catch {
      setServerStatus(false, "Offline");
    }
  }

  /* -------------------- Auth UI -------------------- */
  function uiAfterLogout() {
    show($("authForms"));
    hide($("authDone"));
    setError($("accountError"), "");
    safeText($("loginInfo"), "");
  }

  function uiAfterLogin(me) {
    hide($("authForms"));
    show($("authDone"));

    const first = me?.first_name || "";
    const last = me?.last_name || "";
    const email = me?.email || "";
    const title = (first || last) ? `${first} ${last}`.trim() : (email || "Користувач");

    safeText($("userTitle"), title);
    safeText($("meId"), me?.id);
    safeText($("meCreated"), me?.created_at || me?.created || "");
    safeText($("meActive"), (me?.is_active === true) ? "Активний" : "—");

    const avatar = $("userAvatar");
    if (avatar) {
      const letter = (title || "U").trim().charAt(0).toUpperCase();
      avatar.textContent = letter || "U";
    }
  }

  async function loadMeSilently() {
    const token = getToken();
    if (!token) {
      uiAfterLogout();
      return;
    }
    try {
      const me = await apiGetJson("/auth/me", { headers: { ...authHeaders() } });
      uiAfterLogin(me);
    } catch (e) {
      // token invalid/expired
      clearToken();
      uiAfterLogout();
    }
  }

  function initAuth() {
    const errBox = $("accountError");

    const loginForm = $("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError(errBox, "");

        const email = String($("loginEmail")?.value || "").trim();
        const password = String($("loginPassword")?.value || "");

        if (!email || !password) {
          setError(errBox, "Будь ласка, заповніть email та пароль.");
          return;
        }

        try {
          showToast("Входимо…");

          // Swagger: /auth/login uses application/x-www-form-urlencoded (OAuth2PasswordRequestForm-like)
          const tokenResp = await apiPostForm("/auth/login", {
            username: email,
            password,
          });

          const access = tokenResp?.access_token;
          if (!access) throw new Error("Не отримали access_token від сервера.");

          setToken(access);
          showToast("✅ Вхід успішний.");

          await loadMeSilently();
          await loadProjectsSilently(); // обновим проекты для Market
        } catch (err) {
          setError(errBox, err?.message || "Не вдалося увійти.");
        }
      });
    }

    const registerForm = $("registerForm");
    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError(errBox, "");

        const first = String($("regFirstName")?.value || "").trim();
        const last = String($("regLastName")?.value || "").trim();
        const email = String($("regEmail")?.value || "").trim();
        const password = String($("regPassword")?.value || "");

        if (!first || !email || !password) {
          setError(errBox, "Будь ласка, заповніть імʼя, email та пароль.");
          return;
        }

        try {
          showToast("Створюємо акаунт…");

          // Swagger: UserCreate
          await apiPostJson("/auth/register", {
            first_name: first,
            last_name: last,
            email,
            password,
          });

          showToast("✅ Акаунт створено. Тепер увійдіть.");

          // НЕ автологинимся (как ты хотел раньше) — просто очищаем пароль
          if ($("regPassword")) $("regPassword").value = "";
          // можно подсказать заполнить логин
          if ($("loginEmail")) $("loginEmail").value = email;
        } catch (err) {
          setError(errBox, err?.message || "Не вдалося створити акаунт.");
        }
      });
    }

    const btnLogout = $("btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        clearToken();
        uiAfterLogout();
        showToast("Ви вийшли з акаунта.");
      });
    }

    const btnGoMarket = $("btnGoMarket");
    if (btnGoMarket) {
      btnGoMarket.addEventListener("click", () => setTab("market"));
    }
  }

  /* -------------------- Projects -------------------- */
  function asArrayProjects(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.projects)) return payload.projects;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  }

  function projectLabel(p) {
    const name = p?.name || p?.title || p?.project_name || p?.slug || `Project #${p?.id ?? p?.project_id ?? ""}`;
    return String(name);
  }

  function projectId(p) {
    return p?.id ?? p?.project_id ?? p?.projectId ?? null;
  }

  async function loadProjectsSilently() {
    const token = getToken();
    const sel = $("marketProject");
    const info = $("projectsInfo");
    const listEl = $("projectsList");
    const errEl = $("projectsError");

    if (sel) {
      sel.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Оберіть проект…";
      sel.appendChild(opt0);
    }

    if (!token) {
      safeText(info, "Увійдіть, щоб бачити проєкти.");
      safeText(listEl, "—");
      setError(errEl, "");
      return [];
    }

    try {
      setError(errEl, "");
      const projects = await apiGetJson("/olx/projects/", { headers: { ...authHeaders() } });
      const list = asArrayProjects(projects);

      // Fill Market select
      if (sel) {
        list.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = String(projectId(p));
          opt.textContent = projectLabel(p);
          sel.appendChild(opt);
        });
      }

      // Render Projects section
      if (listEl) {
        if (!list.length) {
          listEl.textContent = "Проєктів поки немає. Створіть проект через Swagger або додамо форму на фронті.";
        } else {
          const html = list
            .map((p) => {
              const id = projectId(p);
              const created = p?.created_at || "";
              const active = (p?.is_active === true) ? "✅ активний" : "—";
              const url = p?.search_url || "";
              return `
                <div style="padding:12px;border:1px solid #e5e7eb;border-radius:16px;background:#fff;box-shadow:0 8px 18px rgba(2,6,23,.06);margin:10px 0;">
                  <div style="font-weight:1200;">${escapeHtml(projectLabel(p))}</div>
                  <div style="margin-top:4px;color:#6b7280;font-weight:800;font-size:12px;">
                    ID: ${escapeHtml(String(id))} • ${escapeHtml(active)} ${created ? "• " + escapeHtml(created) : ""}
                  </div>
                  ${url ? `<div style="margin-top:6px;color:#6b7280;font-weight:800;font-size:12px;word-break:break-all;">${escapeHtml(url)}</div>` : ""}
                </div>
              `;
            })
            .join("");
          listEl.innerHTML = html;
        }
      }

      safeText(info, `Проєктів: ${list.length}`);
      return list;
    } catch (err) {
      setError(errEl, err?.message || "Не вдалося завантажити проєкти.");
      safeText(info, "");
      if (listEl) listEl.textContent = "—";
      return [];
    }
  }

  function initProjects() {
    const btn = $("btnProjectsReload");
    if (btn) btn.addEventListener("click", loadProjectsSilently);
  }

  /* -------------------- Market -------------------- */
  let marketOffset = 0;

  function formatMoney(value, currency = "UAH") {
    if (value === null || value === undefined) return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    try {
      return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n) + ` ${currency}`;
    } catch {
      return `${Math.round(n)} ${currency}`;
    }
  }

  function applyMarketKpi(data) {
    // Swagger пример для market/history показывает:
    // { project_id, last: {...}, prev: {...}, delta: {...} } — по скрину так и есть.
    // А market/overview может быть иначе. Мы работаем именно с market/history.
    const currency = data?.currency || "UAH";

    const last = data?.last || null;
    const prev = data?.prev || null;
    const delta = data?.delta || null;

    const typical = last?.median_price ?? last?.avg_price ?? last?.p50_price ?? null;
    const count = last?.items_count ?? last?.count ?? null;

    const min = last?.min_price ?? last?.p25_price ?? null;
    const max = last?.max_price ?? last?.p75_price ?? null;

    const deltaTypical =
      (delta?.median_abs ?? delta?.avg_abs ?? null);

    safeText($("kpiTypical"), typical === null ? "—" : formatMoney(typical, currency));
    safeText($("kpiCount"), (count === null || count === undefined) ? "—" : String(count));

    if (min !== null && max !== null) {
      safeText($("kpiRange"), `${formatMoney(min, currency)} — ${formatMoney(max, currency)}`);
    } else {
      safeText($("kpiRange"), "—");
    }

    if (deltaTypical !== null && deltaTypical !== undefined) {
      const sign = Number(deltaTypical) > 0 ? "+" : "";
      safeText($("kpiDelta"), `${sign}${formatMoney(deltaTypical, currency)}`);
    } else if (prev && last) {
      // fallback if delta absent
      const a = Number(prev?.median_price ?? prev?.avg_price ?? NaN);
      const b = Number(last?.median_price ?? last?.avg_price ?? NaN);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const d = b - a;
        const sign = d > 0 ? "+" : "";
        safeText($("kpiDelta"), `${sign}${formatMoney(d, currency)}`);
      } else {
        safeText($("kpiDelta"), "—");
      }
    } else {
      safeText($("kpiDelta"), "—");
    }
  }

  async function loadMarket() {
    const err = $("marketError");
    const hint = $("marketHint");
    setError(err, "");
    safeText(hint, "");

    const token = getToken();
    if (!token) {
      setError(err, "Увійдіть в акаунт, щоб завантажити аналітику.");
      return;
    }

    const sel = $("marketProject");
    const project = String(sel?.value || "");
    if (!project) {
      setError(err, "Оберіть проект.");
      return;
    }

    const pointsEl = $("marketPoints");
    const relEl = $("marketReliable");

    const points = Number(pointsEl?.value || DEFAULT_HISTORY_LIMIT);
    const limit = Math.max(1, Math.min(200, Number.isFinite(points) ? points : DEFAULT_HISTORY_LIMIT));
    const onlyValid = !!relEl?.checked;

    // offset = marketOffset (0,1,2...) — как у тебя в UI "Попередні/Наступні"
    const offset = marketOffset;

    try {
      safeText(hint, "Завантаження…");

      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(Math.max(0, offset)));
      params.set("only_valid", onlyValid ? "true" : "false");

      const data = await apiGetJson(`/olx/projects/${encodeURIComponent(project)}/market/history?${params.toString()}`, {
        headers: { ...authHeaders() },
      });

      applyMarketKpi(data);
      safeText(hint, `Готово. offset=${marketOffset}`);
      showToast("✅ Готово.");
    } catch (e) {
      setError(err, e?.message || "Не вдалося завантажити аналітику.");
      safeText(hint, "");
    }
  }

  function initMarket() {
    const btnLoad = $("btnMarketLoad");
    if (btnLoad) btnLoad.addEventListener("click", loadMarket);

    const btnPrev = $("btnPrev");
    if (btnPrev) {
      btnPrev.addEventListener("click", () => {
        marketOffset = Math.max(0, marketOffset + OFFSET_STEP);
        loadMarket();
      });
    }

    const btnNext = $("btnNext");
    if (btnNext) {
      btnNext.addEventListener("click", () => {
        marketOffset = Math.max(0, marketOffset - OFFSET_STEP);
        loadMarket();
      });
    }
  }

  /* -------------------- Queries (MVP: local save) -------------------- */
  const SAVED_QUERIES_KEY = "sellcase_saved_queries";

  function loadSavedQueries() {
    try {
      const raw = localStorage.getItem(SAVED_QUERIES_KEY) || "[]";
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveSavedQueries(arr) {
    localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(arr || []));
  }

  function renderSavedQueries() {
    const el = $("savedQueries");
    if (!el) return;

    const items = loadSavedQueries();
    if (!items.length) {
      el.textContent = "—";
      return;
    }

    el.innerHTML = items
      .slice()
      .reverse()
      .map((q) => {
        return `
          <div style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:16px;background:#fff;box-shadow:0 8px 18px rgba(2,6,23,.06);margin:8px 0;">
            <div style="font-weight:1200;">${escapeHtml(q.text || "—")}</div>
            <div style="margin-top:4px;color:#6b7280;font-weight:800;font-size:12px;">
              ${q.category ? "Категорія: " + escapeHtml(q.category) + " • " : ""}${escapeHtml(q.created_at || "")}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function initQueries() {
    const btnRun = $("btnRunQuery");
    if (btnRun) {
      btnRun.addEventListener("click", async () => {
        // Сейчас у тебя на странице MVP. Чтобы не ломать — просто "заглушка"
        showToast("MVP: Search підключимо наступним кроком.");
      });
    }

    const btnSave = $("btnSaveQuery");
    if (btnSave) {
      btnSave.addEventListener("click", () => {
        const text = String($("queryText")?.value || "").trim();
        const category = String($("queryCategory")?.value || "").trim();

        if (!text) {
          showToast("Введіть запит, щоб зберегти.");
          return;
        }

        const items = loadSavedQueries();
        items.push({
          text,
          category: category || "",
          created_at: new Date().toISOString(),
        });
        saveSavedQueries(items);
        renderSavedQueries();
        showToast("✅ Запит збережено.");
      });
    }

    renderSavedQueries();
  }

  /* -------------------- Small utilities -------------------- */
  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Fix logo if Render/paths glitch
  function fixHeaderLogo() {
    const imgs = document.querySelectorAll("img");
    imgs.forEach((img) => {
      // if broken, keep alt visible (browser default may hide)
      // nothing heavy here
    });
  }

  /* -------------------- Boot -------------------- */
  async function boot() {
    initNav();
    initAuth();
    initQueries();
    initProjects();
    initMarket();

    fixHeaderLogo();
    setTimeout(fixHeaderLogo, 200);
    setTimeout(fixHeaderLogo, 800);

    await pingServer();
    setInterval(pingServer, PING_INTERVAL_MS);

    await loadMeSilently();
    await loadProjectsSilently();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
