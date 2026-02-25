# StockAiVerse – Dummy Website Skeleton

A structural web skeleton to demonstrate user journey, navigation flow, and feature hierarchy — built before actual development begins.

---

## 📁 File Structure

```
Pre_Login/
├── index.html        ← Master landing page (pre-login)
├── signup.html       ← Create Account page
├── dashboard.html    ← Post-login dashboard
├── style.css         ← Shared styles for all pages
└── navigation.js     ← Shared navigation logic
```

---

## 🗺️ User Flow

```
index.html  →  Get Started  →  dashboard.html
index.html  →  Sign In      →  signup.html
signup.html →  Create Account → dashboard.html
```

---

## ⚙️ How Navigation Works

All buttons use `goTo('page.html')`.
- Page exists → opens it
- Page not built yet → shows `🚧 Page coming soon` toast

To register a new page, add it to the `PAGES` array in `navigation.js`:
```javascript
const PAGES = [
  'index.html',
  'your-new-page.html',  // ← add here
];
```

---

## ➕ Adding a New Page

1. Create `your-page.html` in the same folder
2. Add this at the top: `<link rel="stylesheet" href="style.css">`
3. Add this at the bottom: `<script src="navigation.js"></script>`
4. Register it in `navigation.js`

---

## 🚀 How to Run

Open `index.html` in any browser. No server needed.

---

> Pure HTML · CSS · JavaScript — no frameworks, no backend, no database.
> *StockAiVerse v0.1.0 · Pre-alpha*
