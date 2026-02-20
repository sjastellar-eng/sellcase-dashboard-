/* SellCase dashboard – app.js
   Works with backend: https://sellcase-backend.onrender.com
   Fixes:
   - register/login send {username,password} (username = email)
   - proper error rendering (no [object Object])
   - robust route fallbacks (tries multiple endpoints)
*/

(() => {
  "use strict";

  /* =======================
     CONFIG
  ======================= */

  const API_BASE =
    (window.SELLCASE_API_BASE && String(window.SELLCASE_API_BASE)) ||
    "https://sellcase-backend.onrender.com";

  // If some endpoint differs in your backend, just add it to the arrays below.
  const ROUTES = {
    ping: ["/health", "/healthz", "/"],
    register: ["/auth/register"],
    login: ["/auth/login"],
    me: ["/auth/me", "/users/me", "/me"],

    projects: ["/olx/projects/"], // GET list, POST create

    // Market overview (docs show /olx/projects/{project_id}/market and /market/history)
    marketOverview: [
      (id) => `/olx/projects/${encodeURIComponent(id)}/market`,
      (id) => `/olx/projects/${encodeURIComponent(id)}/market/overview`,
    ],
    marketHistory: [
      (id) => `/olx/projects/${encodeURIComponent(id)}/market/history`,
    ],

    // Queries/Search (we will try multiple likely endpoints)
    queryRun: [
      "/search/analytics",
      "/search/analyze",
      "/search/run",
      "/analytics/search",
      "/analytics/query",
      "/search",
    ],
  };

  const PING_INTERVAL_MS = 25_000;

  /* =======================
     DOM helpers
  ======================= */

  const $ = (id) => document.getElementById(id);

  function safeText(el, text) {
    if (!el) return;
    el.textContent = text == null ? "" : String(text);
  }

  function setError(el, message) {
    if (!el) return;
    const msg = (message || "").trim();
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
    showToast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function fmtMoney(v) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    const n = Number(v);
    // UAH looks best with no decimals in most OLX contexts
    return `${Math.round(n).toLocaleString("uk-UA")} грн`;
  }

  function fmtInt(v) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return Number(v).toLocaleString("uk-UA");
  }

  function normalizeErrorPayload(payload) {
    // FastAPI often returns: { detail: "..." } or { detail: [{loc,msg,type}, ...] }
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    if (payload.detail != null) {
      const d = payload.detail;
      if (typeof d === "string") return d;
      if (Array.isArray(d)) {
        return d
          .map((x) => {
            const loc = Array.isArray(x.loc) ? x.loc.join(".") : "";
            const msg = x.msg || x.message || JSON.stringify(x);
            return loc ? `${loc}: ${msg}` : String(msg);
          })
          .join(" | ");
      }
      return String(d);
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }

  function getToken() {
    return localStorage.getItem("token") || "";
  }

  function setToken(t) {
    const v = (t || "").trim();
    if (!v) localStorage.removeItem("token");
    else localStorage.setItem("token", v);
  }

  function authHeaders(extra = {}) {
    const h = { ...extra };
    const tok = getToken();
    if (tok) h.Authorization = `Bearer ${tok}`;
    return h;
  }

  function joinUrl(path) {
    if (!path) return API_BASE;
    if (/^https?:\/\//i.test(path)) return path;
    return API_BASE.replace(/\/$/, "") + "/" + String(path).replace(/^\//, "");
  }

  async function tryRoutesJSON(pathsOrFns, fetchInit) {
    const candidates = Array.isArray(pathsOrFns) ? pathsOrFns : [pathsOrFns];
    let lastErr = null;

    for (const c of candidates) {
      const path = typeof c === "function" ? c(fetchInit.__project_id) : c;
      const url = joinUrl(path);

      try {
        const res = await fetch(url, fetchInit);
        const ct = (res.headers.get("content-type") || "").toLowerCase();

        let data = null;
        if (ct.includes("application/json")) {
          data = await res.json().catch(() => null);
        } else {
          const txt = await res.text().catch(() => "");
          data = txt ? { detail: txt } : null;
        }

        if (res.ok) return { ok: true, url, data, res };

        // store best error
        const msg = normalizeErrorPayload(data) || `${res.status} ${res.statusText}`;
        lastErr = new Error(msg);
        lastErr.status = res.status;
        lastErr.url = url;
        lastErr.payload = data;
      } catch (e) {
        lastErr = e;
        lastErr.url = url;
      }
    }

    return { ok: false, error: lastErr || new Error("Request failed") };
  }

  /* =======================
     Navigation (tabs/sections)
  ======================= */

  function showSection(name) {
    const ids = ["market", "queries", "projects", "account"];
    ids.forEach((k) => {
      const sec = $(`section-${k}`);
      const tab = document.querySelector(`.tab[data-tab="${k}"]`);
      if (sec) sec.classList.toggle("active", k === name);
      if (tab) tab.classList.toggle("active", k === name);
    });
  }

  function initNav() {
    document.querySelectorAll(".tab[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        showSection(tab);
      });
    });
  }

  /* =======================
     Server status / ping
  ======================= */

  async function pingServer() {
    const st = $("serverStatus");
    if (!st) return;
    const dot = st.querySelector(".dot");
    const label = st.querySelector("span:nth-child(2)") || st.querySelector("span");

    // optimistic
    if (label) label.textContent = "Перевірка...";
    if (dot) dot.className = "dot";

    const r = await tryRoutesJSON(ROUTES.ping, { method: "GET" });
    if (r.ok) {
      if (label) label.textContent = "Online";
      if (dot) dot.className = "dot green";
      return true;
    } else {
      if (label) label.textContent = "Offline";
      if (dot) dot.className = "dot red";
      return false;
    }
  }

  /* =======================
     AUTH
  ======================= */

  async function loadMeSilently() {
    const tok = getToken();
    if (!tok) {
      uiAfterLogout();
      return;
    }

    const r = await tryRoutesJSON(ROUTES.me, {
      method: "GET",
      headers: authHeaders({ Accept: "application/json" }),
    });

    if (!r.ok) {
      // token invalid/expired
      setToken("");
      uiAfterLogout();
      return;
    }

    const me = r.data || {};
    uiAfterLogin(me);
  }

  function initialsFromEmail(email) {
    const s = (email || "U").trim();
    const a = s.split("@")[0] || "U";
    return a.slice(0, 2).toUpperCase();
  }

  function uiAfterLogin(me) {
    const forms = $("authForms");
    const done = $("authDone");
    if (forms) forms.style.display = "none";
    if (done) done.style.display = "block";

    // Fill "me" cards if present
    const id = me.id ?? me.user_id ?? me.uid ?? "—";
    const created = me.created_at ?? me.created ?? me.createdAt ?? "—";
    const active = me.is_active ?? me.active ?? true;

    safeText($("meId"), id);
    safeText($("meCreated"), created === "—" ? "—" : String(created).slice(0, 19).replace("T", " "));
    safeText($("meActive"), active ? "✅ Активний" : "⛔ Неактивний");

    const email = me.username ?? me.email ?? "";
    const first = me.first_name ?? me.firstName ?? "";
    const last = me.last_name ?? me.lastName ?? "";
    const title = (first || last) ? `${first} ${last}`.trim() : (email || "Користувач");

    safeText($("userTitle"), title || "Користувач");
    safeText($("userSubtitle"), "✅ Вхід успішно виконано.");

    const av = $("userAvatar");
    if (av) av.textContent = initialsFromEmail(email);
  }

  function uiAfterLogout() {
    const forms = $("authForms");
    const done = $("authDone");
    if (forms) forms.style.display = "block";
    if (done) done.style.display = "none";

    safeText($("meId"), "—");
    safeText($("meCreated"), "—");
    safeText($("meActive"), "—");

    // do NOT wipe inputs, but you can if you want
  }

  function initAuth() {
    const errBox = $("accountError");

    const registerForm = $("registerForm");
    const loginForm = $("loginForm");

    const btnLogout = $("btnLogout");
    const btnGoMarket = $("btnGoMarket");

    if (btnGoMarket) {
      btnGoMarket.addEventListener("click", () => showSection("market"));
    }

    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        setToken("");
        uiAfterLogout();
        showToast("✅ Ви вийшли з акаунта.");
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError(errBox, "");

        const email = String(($("regEmail")?.value || "")).trim();
        const password = String(($("regPassword")?.value || "")).trim();

        // optional fields (not used by backend currently)
        // const first = String(($("regFirstName")?.value || "")).trim();
        // const last = String(($("regLastName")?.value || "")).trim();

        if (!email || !password) {
          setError(errBox, "Будь ласка, заповніть email та пароль.");
          return;
        }

        showToast("Створюємо акаунт...");

        const r = await tryRoutesJSON(ROUTES.register, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ username: email, password }),
        });

        if (!r.ok) {
          setError(errBox, normalizeErrorPayload(r.error?.payload) || r.error?.message || "Не вдалося створити акаунт.");
          return;
        }

        showToast("✅ Акаунт створено. Тепер увійдіть.");
        // удобство: переносим в логин
        if ($("loginEmail")) $("loginEmail").value = email;
        if ($("loginPassword")) $("loginPassword").value = password;
      });
    }

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError(errBox, "");

        const email = String(($("loginEmail")?.value || "")).trim();
        const password = String(($("loginPassword")?.value || "")).trim();

        if (!email || !password) {
          setError(errBox, "Будь ласка, введіть email та пароль.");
          return;
        }

        showToast("Входимо...");

        const r = await tryRoutesJSON(ROUTES.login, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ username: email, password }),
        });

        if (!r.ok) {
          setError(errBox, normalizeErrorPayload(r.error?.payload) || r.error?.message || "Не вдалося увійти.");
          return;
        }

        const data = r.data || {};
        const token = data.access_token || data.token || data.jwt || "";
        if (!token) {
          setError(errBox, "Логін успішний, але сервер не повернув token.");
          return;
        }

        setToken(token);
        showToast("✅ Вхід успішний!");

        await loadMeSilently();
        await loadProjectsSilently(); // to fill selects
        showSection("market");
      });
    }
  }

  /* =======================
     PROJECTS
  ======================= */

  function asArrayProjects(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.projects)) return payload.projects;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  }

  function projectLabel(p) {
    const name = p?.name || p?.title || p?.project_name || p?.slug || p?.id || p?.project_id;
    return String(name ?? "");
  }

  function projectId(p) {
    return p?.id ?? p?.project_id ?? p?.projectId ?? p?.slug ?? null;
  }

  async function loadProjectsSilently() {
    const info = $("projectsInfo");
    const err = $("projectsError");
    setError(err, "");

    const r = await tryRoutesJSON(ROUTES.projects, {
      method: "GET",
      headers: authHeaders({ Accept: "application/json" }),
    });

    if (!r.ok) {
      safeText(info, "");
      // If unauthorized: show hint but don't scream
      const msg = normalizeErrorPayload(r.error?.payload) || r.error?.message || "Не вдалося завантажити проєкти.";
      setError(err, msg);
      return [];
    }

    const list = asArrayProjects(r.data);
    safeText(info, list.length ? `Знайдено: ${list.length}` : "Поки немає проєктів");

    // Fill market select
    const sel = $("marketProject");
    if (sel) {
      sel.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Оберіть проект...";
      sel.appendChild(opt0);

      list.forEach((p) => {
        const id = projectId(p);
        if (id == null) return;
        const opt = document.createElement("option");
        opt.value = String(id);
        opt.textContent = projectLabel(p);
        sel.appendChild(opt);
      });
    }

    // Render projects list
    const box = $("projectsList");
    if (box) {
      if (!list.length) {
        box.textContent = "—";
      } else {
        box.innerHTML = "";
        const ul = document.createElement("div");
        ul.style.display = "grid";
        ul.style.gap = "10px";

        list.forEach((p) => {
          const id = projectId(p);
          const name = projectLabel(p);
          const created = p?.created_at || p?.createdAt || "";
          const active = p?.is_active ?? p?.active ?? true;

          const card = document.createElement("div");
          card.style.padding = "12px";
          card.style.border = "1px solid var(--border)";
          card.style.borderRadius = "16px";
          card.style.background = "white";
          card.style.boxShadow = "var(--shadow-soft)";
          card.innerHTML = `
            <div style="font-weight:1100; letter-spacing:-.02em;">${escapeHtml(name)}</div>
            <div style="margin-top:4px; color:var(--muted); font-weight:800; font-size:12px;">
              ID: ${escapeHtml(String(id ?? "—"))}
              ${created ? " · " + escapeHtml(String(created).slice(0, 19).replace("T", " ")) : ""}
              · ${active ? "✅ active" : "⛔ inactive"}
            </div>
            <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn" data-act="use" data-id="${escapeHtml(String(id))}" type="button">Використати у Ринку</button>
            </div>
          `;
          ul.appendChild(card);
        });

        box.appendChild(ul);

        box.querySelectorAll('button[data-act="use"]').forEach((b) => {
          b.addEventListener("click", () => {
            const id = b.getAttribute("data-id") || "";
            const sel = $("marketProject");
            if (sel) sel.value = id;
            showSection("market");
            showToast("✅ Проєкт обрано.");
          });
        });
      }
    }

    return list;
  }

  function initProjects() {
    const btn = $("btnProjectsReload");
    if (btn) btn.addEventListener("click", loadProjectsSilently);
  }

  /* =======================
     MARKET
  ======================= */

  function applyMarketKpi(data) {
    // Try to map different backend shapes
    const typical =
      data?.typical_price ??
      data?.typical ??
      data?.median_price ??
      data?.median ??
      data?.p50 ??
      data?.p50_price ??
      null;

    const min =
      data?.range_min ??
      data?.min ??
      data?.p10 ??
      data?.p25 ??
      data?.min_price ??
      null;

    const max =
      data?.range_max ??
      data?.max ??
      data?.p90 ??
      data?.p75 ??
      data?.max_price ??
      null;

    const count =
      data?.count ??
      data?.total ??
      data?.ads_count ??
      data?.items_count ??
      data?.n ??
      null;

    // delta typical
    const delta =
      data?.delta?.typical ??
      data?.delta?.median ??
      data?.delta_typical ??
      data?.delta_median ??
      data?.delta ??
      null;

    safeText($("kpiTypical"), typical == null ? "—" : fmtMoney(typical));
    safeText($("kpiRange"), min == null && max == null ? "—" : `${fmtMoney(min)} — ${fmtMoney(max)}`);
    safeText($("kpiCount"), count == null ? "—" : fmtInt(count));

    if (delta == null || delta === 0) {
      safeText($("kpiDelta"), delta == null ? "—" : "0");
    } else {
      const sign = Number(delta) > 0 ? "+" : "";
      // delta often in currency units; show as money-ish
      safeText($("kpiDelta"), `${sign}${fmtMoney(delta)}`);
    }
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
    params.set("offset", String(Number.isFinite(offset) && offset >= 0 ? offset : 0));
    params.set("reliable", reliable ? "true" : "false");

    // Primary: market overview
    const r1 = await tryRoutesJSON(
      ROUTES.marketOverview.map((fn) => (id) => fn(id) + "?" + params.toString()),
      {
        __project_id: project,
        method: "GET",
        headers: authHeaders({ Accept: "application/json" }),
      }
    );

    if (r1.ok) {
      applyMarketKpi(r1.data);
      showToast("✅ Готово.");
      return;
    }

    // Fallback: some backends only provide history
    const r2 = await tryRoutesJSON(
      ROUTES.marketHistory.map((fn) => (id) => fn(id) + "?" + params.toString()),
      {
        __project_id: project,
        method: "GET",
        headers: authHeaders({ Accept: "application/json" }),
      }
    );

    if (r2.ok) {
      // If history returns array, take last item
      const d = r2.data;
      const item = Array.isArray(d) ? d[0] || d[d.length - 1] : (d?.last || d);
      applyMarketKpi(item || d);
      showToast("✅ Готово.");
      return;
    }

    const msg =
      normalizeErrorPayload(r1.error?.payload) ||
      r1.error?.message ||
      normalizeErrorPayload(r2.error?.payload) ||
      r2.error?.message ||
      "Не вдалося завантажити аналітику.";
    setError(err, msg);
  }

  function initMarket() {
    const btnLoad = $("btnMarketLoad");
    if (btnLoad) btnLoad.addEventListener("click", loadMarket);

    const btnPrev = $("btnPrev");
    const btnNext = $("btnNext");
    const offsetEl = $("marketOffset");

    if (btnPrev) {
      btnPrev.addEventListener("click", () => {
        const v = Math.max(0, Number(offsetEl?.value || 0) + 1);
        if (offsetEl) offsetEl.value = String(v);
        loadMarket();
      });
    }
    if (btnNext) {
      btnNext.addEventListener("click", () => {
        const v = Math.max(0, Number(offsetEl?.value || 0) - 1);
        if (offsetEl) offsetEl.value = String(v);
        loadMarket();
      });
    }

    // Save query (local only for now)
    const btnSave = $("btnSaveQuery");
    if (btnSave) {
      btnSave.addEventListener("click", () => {
        const project = String($("marketProject")?.value || "");
        if (!project) {
          showToast("Спочатку оберіть проект.");
          return;
        }
        const payload = {
          project_id: project,
          points: Number($("marketPoints")?.value || 30),
          offset: Number($("marketOffset")?.value || 0),
          reliable: !!$("marketReliable")?.checked,
          saved_at: new Date().toISOString(),
        };
        const key = "sellcase_saved_market";
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        arr.unshift(payload);
        localStorage.setItem(key, JSON.stringify(arr.slice(0, 30)));
        showToast("✅ Збережено.");
        renderSavedQueries();
      });
    }
  }

  /* =======================
     QUERIES / SEARCH
  ======================= */

  function renderSavedQueries() {
    const box = $("savedQueries");
    if (!box) return;

    const key = "sellcase_saved_market";
    const arr = JSON.parse(localStorage.getItem(key) || "[]");

    if (!arr.length) {
      box.textContent = "—";
      return;
    }

    box.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "10px";

    arr.slice(0, 8).forEach((q, idx) => {
      const card = document.createElement("div");
      card.style.padding = "12px";
      card.style.border = "1px solid var(--border)";
      card.style.borderRadius = "16px";
      card.style.background = "white";
      card.style.boxShadow = "var(--shadow-soft)";
      card.innerHTML = `
        <div style="font-weight:1100">Запит #${idx + 1}</div>
        <div style="margin-top:4px; color:var(--muted); font-weight:800; font-size:12px;">
          project_id: ${escapeHtml(String(q.project_id))} · points: ${escapeHtml(String(q.points))}
          · offset: ${escapeHtml(String(q.offset))} · reliable: ${q.reliable ? "true" : "false"}
        </div>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn" type="button" data-act="apply" data-i="${idx}">Застосувати</button>
        </div>
      `;
      wrap.appendChild(card);
    });

    box.appendChild(wrap);

    box.querySelectorAll('button[data-act="apply"]').forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.getAttribute("data-i") || 0);
        const q = arr[i];
        if (!q) return;

        const sel = $("marketProject");
        if (sel) sel.value = String(q.project_id || "");
        if ($("marketPoints")) $("marketPoints").value = String(q.points ?? 30);
        if ($("marketOffset")) $("marketOffset").value = String(q.offset ?? 0);
        if ($("marketReliable")) $("marketReliable").checked = !!q.reliable;

        showSection("market");
        loadMarket();
      });
    });
  }

  async function runQuery() {
    // IMPORTANT: backend search endpoints may differ. We try multiple.
    const err = $("marketError") || $("projectsError") || $("accountError");
    // We'll show toast & do not break UI if not supported.
    const text = String($("queryText")?.value || "").trim();
    const category = String($("queryCategory")?.value || "").trim();

    if (!text) {
      showToast("Введіть запит.");
      return;
    }

    const body = {
      q: text,
      query: text,
      text,
      category: category || null,
    };

    showToast("Запуск аналізу...");

    const r = await tryRoutesJSON(ROUTES.queryRun, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      // If backend truly not ready, be explicit but not destructive
      const msg =
        normalizeErrorPayload(r.error?.payload) ||
        r.error?.message ||
        "Search/Queries ще не підключені на бекенді.";
      showToast("⛔ Запити не відповідають.");
      // Put a readable message somewhere visible
      if (err) setError(err, msg);
      return;
    }

    // If backend returns something useful, show it in toast or in a simple block
    const data = r.data;
    showToast("✅ Запит виконано.");

    // Minimal renderer: try show typical KPI if present
    try {
      if (data && typeof data === "object") {
        const maybeTypical = data.typical_price ?? data.median_price ?? data.typical ?? null;
        if (maybeTypical != null) showToast(`✅ Типова ціна: ${fmtMoney(maybeTypical)}`);
      }
    } catch {}
  }

  function initQueries() {
    const btn = $("btnRunQuery");
    if (btn) btn.addEventListener("click", runQuery);
    renderSavedQueries();
  }

  /* =======================
     Misc
  ======================= */

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* =======================
     BOOT
  ======================= */

  async function boot() {
    initNav();
    initAuth();
    initProjects();
    initMarket();
    initQueries();

    await pingServer();
    setInterval(pingServer, PING_INTERVAL_MS);

    await loadMeSilently();
    await loadProjectsSilently();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
