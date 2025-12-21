// ====== CONFIG ======
const API_BASE = "https://sellcase-backend.onrender.com";

// ====== I18N ======
const i18n = {
  ua: {
    title: "Топ пошукових запитів",
    query: "Запит",
    count: "Кількість",
    category: "Категорія",
    confidence: "Впевненість",
    source: "Джерело",
    loading: "Завантаження...",
    empty: "Немає даних"
  },
  ru: {
    title: "Топ поисковых запросов",
    query: "Запрос",
    count: "Количество",
    category: "Категория",
    confidence: "Уверенность",
    source: "Источник",
    loading: "Загрузка...",
    empty: "Нет данных"
  },
  en: {
    title: "Top Search Queries",
    query: "Query",
    count: "Count",
    category: "Category",
    confidence: "Confidence",
    source: "Source",
    loading: "Loading...",
    empty: "No data"
  }
};

// ====== LANGUAGE ======
function detectLanguage() {
  const saved = localStorage.getItem("lang");
  if (saved) return saved;

  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("uk")) return "ua";
  if (lang.startsWith("ru")) return "ru";
  return "en";
}

let currentLang = detectLanguage();

// ====== FETCH DATA ======
async function loadTopSearchQueries() {
  try {
    const res = await fetch(`${API_BASE}/analytics/top-search-queries?days=7&limit=20`);
    const data = await res.json();
    renderTable(data);
  } catch (e) {
    console.error(e);
  }
}

// ====== RENDER ======
function renderTable(rows) {
  console.log("DATA:", rows);
  // дальше будем рисовать таблицу
}

// ====== INIT ======
document.addEventListener("DOMContentLoaded", () => {
  loadTopSearchQueries();
});
