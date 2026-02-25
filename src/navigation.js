/* ================================================
   STOCKAIVERSE – NAVIGATION  (navigation.js)
   All files live in the same folder: Pre_Login/
   ================================================ */

/**
 * PAGE REGISTRY
 * Uncomment a page name once you have created that file.
 * Every HTML page in this project uses goTo() for navigation.
 */
const PAGES = [
  'index.html',
  'signup.html',
  'dashboard.html',
  
  // 'market-home.html',
  // 'indices.html',
  // 'trending-stocks.html',
  // 'news-updates.html',
  // 'analytics-home.html',
  // 'chart-patterns.html',
  // 'trading-strategies.html',
  // 'oracle-lens.html',
  // 'deepsight-ai.html',
  // 'tech-engine.html',
  // 'nifty-oi-tech.html',
  // 'apex-ai.html',
  // 'dashboard.html',
  // 'watchlist.html',
  // 'settings.html',
  // 'help.html',
  // 'policies.html',
  // 'privacy.html',
  // 'terms.html',
  // 'disclaimer.html',
];

/** Navigate to page if it exists, else show toast */
function goTo(page) {
  if (PAGES.includes(page)) {
    window.location.href = page;
  } else {
    showToast('🚧  Page coming soon: ' + page);
  }
}

/** Bottom toast notification */
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}