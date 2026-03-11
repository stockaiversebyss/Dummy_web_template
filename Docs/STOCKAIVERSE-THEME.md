# StockAiVerse — Theme & Design System

Use this file as the single source of truth when building or updating any page in the StockAiVerse project. Copy the CSS variables, component patterns, and layout rules below to keep every page visually consistent.

---

## 1. Fonts

Import these in every page `<head>` **before** any styles:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet"/>
```

| Variable    | Value                          | Usage                              |
|-------------|--------------------------------|------------------------------------|
| `--font`    | `'Plus Jakarta Sans', sans-serif` | Body, UI, headings (default)    |
| `--serif`   | `'Instrument Serif', serif`    | Italic/decorative headline accents |

---

## 2. CSS Custom Properties (`:root`)

Paste this block into every page stylesheet:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* Blues */
  --blue-900: #0a1628;
  --blue-800: #0d2040;
  --blue-700: #0f3460;
  --blue-600: #1565C0;
  --blue-500: #1976D2;
  --blue-400: #2196F3;
  --blue-300: #64B5F6;
  --blue-100: #BBDEFB;
  --blue-50:  #E3F2FD;

  /* Accent */
  --accent: #00B4D8;   /* cyan — used for highlights, gradients, italic headings */

  /* Neutrals */
  --white:     #ffffff;
  --gray-50:   #F8FAFC;
  --gray-100:  #EEF2F7;
  --gray-300:  #CBD5E1;
  --gray-500:  #64748B;
  --gray-700:  #334155;

  /* Status */
  --green: #00C897;   /* positive / gain */
  --red:   #FF4B6E;   /* negative / loss */

  /* Typography */
  --font:  'Plus Jakarta Sans', sans-serif;
  --serif: 'Instrument Serif', serif;
}

html { scroll-behavior: smooth; }
body {
  font-family: var(--font);
  background: var(--white);
  color: var(--gray-700);
  overflow-x: hidden;
}
a    { text-decoration: none; color: inherit; cursor: pointer; }
button { font-family: var(--font); cursor: pointer; border: none; outline: none; }
```

---

## 3. Color Palette

### Blues (primary brand)
| Token         | Hex       | Typical use                          |
|---------------|-----------|--------------------------------------|
| `--blue-900`  | `#0a1628` | Page backgrounds (dark), footer, headings |
| `--blue-800`  | `#0d2040` | Dark card backgrounds                |
| `--blue-700`  | `#0f3460` | Hero gradient start, hover states    |
| `--blue-600`  | `#1565C0` | Primary buttons, links               |
| `--blue-500`  | `#1976D2` | Logo accent, secondary buttons       |
| `--blue-400`  | `#2196F3` | Tags, icons, sparklines              |
| `--blue-300`  | `#64B5F6` | Card border on hover                 |
| `--blue-100`  | `#BBDEFB` | Light icon fills                     |
| `--blue-50`   | `#E3F2FD` | Icon backgrounds, tag chips, hover tints |

### Accent & Status
| Token      | Hex       | Use                                  |
|------------|-----------|--------------------------------------|
| `--accent` | `#00B4D8` | Cyan highlight, logo gradient, italic heading colour |
| `--green`  | `#00C897` | Positive price change, live dot, battery |
| `--red`    | `#FF4B6E` | Negative price change, loss          |

### Neutrals
| Token        | Hex       | Use                          |
|--------------|-----------|------------------------------|
| `--white`    | `#ffffff` | Page background, card background |
| `--gray-50`  | `#F8FAFC` | Alt section background        |
| `--gray-100` | `#EEF2F7` | Borders, dividers, chips      |
| `--gray-300` | `#CBD5E1` | Disabled / placeholder        |
| `--gray-500` | `#64748B` | Secondary text, descriptions  |
| `--gray-700` | `#334155` | Body text                     |

---

## 4. Key Gradients

```css
/* Hero background */
background: linear-gradient(145deg, var(--blue-900) 0%, var(--blue-700) 50%, var(--blue-500) 100%);

/* Logo icon & avatar */
background: linear-gradient(135deg, var(--blue-600), var(--accent));

/* Portfolio / dark card */
background: linear-gradient(135deg, var(--blue-800), var(--blue-500));

/* CTA banner */
background: linear-gradient(130deg, var(--blue-700), var(--blue-500));

/* ApexAI (featured/apex) engine icon */
background: linear-gradient(135deg, var(--blue-600), var(--accent));
```

---

## 5. Typography Scale

| Role                  | `font-size`              | `font-weight` | `color`            | Notes                         |
|-----------------------|--------------------------|---------------|--------------------|-------------------------------|
| Hero H1               | `clamp(2rem,4vw,3.3rem)` | 800           | `var(--white)`     | `letter-spacing: -1px`        |
| H1 italic accent      | inherits                 | 400           | `var(--accent)`    | `font-family: var(--serif)`   |
| Section title         | `2rem`                   | 800           | `var(--blue-900)`  | `letter-spacing: -0.5px`      |
| Section label         | `0.72rem`                | 700           | `var(--blue-400)`  | uppercase, `letter-spacing: 1px`, blue-50 bg |
| Section subtitle      | `1rem`                   | 400           | `var(--gray-500)`  | max-width ~520 px             |
| Card title            | `1rem`                   | 800           | `var(--blue-900)`  |                               |
| Card description      | `0.82–0.83rem`           | 400           | `var(--gray-500)`  | `line-height: 1.55`           |
| Body / paragraph      | `1rem`                   | 400           | `var(--gray-700)`  | `line-height: 1.68`           |
| Small / meta          | `0.78rem`                | 400–600       | `var(--gray-500)`  |                               |
| Nav button            | `0.875rem`               | 600           | `var(--gray-700)`  |                               |
| Button text           | `0.875–0.925rem`         | 700–800       |                    |                               |

### Italic heading pattern
Wrap decorative words in `<em>` inside headings:
```html
<h2>Five Engines. <em>One Conviction.</em></h2>
```
```css
em { font-style: italic; font-family: var(--serif); color: var(--accent); font-weight: 400; }
```

---

## 6. Spacing & Layout

```css
/* Max-width wrapper */
.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 64px;
}

/* Standard section padding */
.page-sec     { padding: 96px 0; background: var(--white); }
.page-sec-alt { padding: 96px 0; background: var(--gray-50); }

/* Section header row */
.sec-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 48px;
  gap: 24px;
}
.sec-label {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1px; color: var(--blue-400);
  background: var(--blue-50); padding: 5px 12px;
  border-radius: 8px; display: inline-block; margin-bottom: 14px;
}
.sec-title {
  font-size: 2rem; font-weight: 800;
  color: var(--blue-900); letter-spacing: -0.5px; margin-bottom: 10px;
}
.sec-sub { font-size: 1rem; color: var(--gray-500); max-width: 520px; }
```

---

## 7. Header

Fixed, full-width top bar. Height **68 px**. Always `z-index: 200`.

```css
header {
  position: fixed; top: 0; left: 0; right: 0; z-index: 200;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 48px; height: 68px;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(33,150,243,0.12);
  box-shadow: 0 2px 20px rgba(21,101,192,0.06);
}
```

- **Offset for header:** any full-screen section needs `padding-top: 68px`.
- **Logo:** `font-weight: 800`, `color: var(--blue-900)`. The word "AiVerse" (or coloured portion) uses `color: var(--blue-500)`.
- **Logo icon:** 36×36 px, `border-radius: 10px`, gradient `--blue-600 → --accent`.
- **Nav buttons:** `padding: 8px 16px`, `border-radius: 8px`, hover → `background: var(--blue-50); color: var(--blue-600)`.
- **Dropdown:** `border-radius: 14px`, `box-shadow: 0 8px 40px rgba(21,101,192,0.15)`, animates from `opacity:0 translateY(-8px)` to visible on hover.
- **CTA button (header):** `.btn-signin` — pill shape `border-radius: 24px`, `background: var(--blue-600)`, hover darkens to `--blue-700`.

---

## 8. Buttons

```css
/* Primary — white pill (on dark/hero backgrounds) */
.btn-primary {
  padding: 14px 32px; border-radius: 30px;
  background: var(--white); color: var(--blue-700);
  font-size: 0.925rem; font-weight: 800;
  box-shadow: 0 6px 24px rgba(0,0,0,0.2);
  transition: all 0.2s;
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(0,0,0,0.25); }

/* Secondary — ghost pill (on dark backgrounds) */
.btn-secondary {
  padding: 14px 32px; border-radius: 30px;
  background: rgba(255,255,255,0.12); color: var(--white);
  border: 1.5px solid rgba(255,255,255,0.3);
  font-size: 0.925rem; font-weight: 700;
  transition: all 0.2s;
}
.btn-secondary:hover { background: rgba(255,255,255,0.2); }

/* Outline small — "View all →" links */
.view-all-btn {
  padding: 9px 20px; border-radius: 20px;
  border: 1.5px solid var(--gray-300);
  font-size: 0.82rem; font-weight: 700; color: var(--gray-700);
  background: var(--white); transition: all 0.2s; white-space: nowrap;
}
.view-all-btn:hover { border-color: var(--blue-400); color: var(--blue-600); }

/* CTA banner button */
.btn-cta {
  background: white; color: var(--blue-700);
  padding: 13px 30px; border-radius: 28px;
  font-size: 0.9rem; font-weight: 800;
  box-shadow: 0 6px 20px rgba(0,0,0,0.14);
  transition: all 0.2s; white-space: nowrap;
}
.btn-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(0,0,0,0.2); }

/* Header sign-in */
.btn-signin {
  padding: 9px 22px; border-radius: 24px;
  background: var(--blue-600); color: var(--white);
  font-size: 0.875rem; font-weight: 700;
  box-shadow: 0 4px 16px rgba(21,101,192,0.3);
  transition: all 0.2s;
}
.btn-signin:hover { background: var(--blue-700); transform: translateY(-1px); }
```

**Hover rule (universal):** interactive cards, buttons, and nav items lift with `transform: translateY(-2px … -5px)` and gain a deeper `box-shadow`.

---

## 9. Cards

### Service card
```css
.svc-card {
  background: var(--white); border-radius: 20px;
  padding: 28px 24px; border: 1.5px solid var(--gray-100);
  cursor: pointer; transition: all 0.25s;
}
.svc-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(21,101,192,0.1); border-color: var(--blue-300); }
```

### Engine card
```css
.engine-card {
  background: var(--white); border-radius: 20px;
  padding: 26px 22px; border: 1.5px solid var(--gray-100);
  cursor: pointer; transition: all 0.25s; position: relative; overflow: hidden;
}
.engine-card:hover { transform: translateY(-5px); box-shadow: 0 16px 48px rgba(21,101,192,0.1); border-color: var(--blue-300); }
/* Large ghost number (top-right watermark) */
.engine-num { position: absolute; top: 18px; right: 18px; font-size: 2.2rem; font-weight: 900; color: var(--gray-100); font-family: var(--serif); }
/* Icon box */
.engine-icon { width: 44px; height: 44px; border-radius: 12px; background: var(--blue-50); font-size: 18px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
/* Featured (Apex) variant */
.engine-card.apex .engine-icon { background: linear-gradient(135deg,var(--blue-600),var(--accent)); color: white; box-shadow: 0 6px 18px rgba(21,101,192,0.3); }
```

### Analytics card
```css
.an-card {
  background: var(--white); border-radius: 20px;
  padding: 26px 22px; border: 1.5px solid var(--gray-100);
  cursor: pointer; transition: all 0.25s;
}
.an-card:hover { border-color: var(--blue-300); box-shadow: 0 12px 40px rgba(21,101,192,0.08); transform: translateY(-4px); }
.an-tag {
  font-size: 0.67rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--blue-400);
  background: var(--blue-50); padding: 4px 10px;
  border-radius: 10px; display: inline-block; margin-bottom: 12px;
}
```

### Card icon box pattern
```css
.icon-box {
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--blue-50); color: var(--blue-500);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; margin-bottom: 14px;
}
```

---

## 10. CTA Banner

```css
.cta-banner {
  background: linear-gradient(130deg, var(--blue-700), var(--blue-500));
  border-radius: 22px; padding: 40px 48px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 32px; margin-top: 24px;
}
.cta-banner h3 { font-size: 1.4rem; font-weight: 800; color: white; margin-bottom: 6px; }
.cta-banner p  { font-size: 0.9rem; color: rgba(255,255,255,0.7); }
```

---

## 11. Footer

Dark background (`--blue-900`), 3-column grid, subdued text.

```css
footer { background: var(--blue-900); color: rgba(255,255,255,0.65); padding: 60px 0 32px; }
.footer-main {
  display: grid; grid-template-columns: 2fr 1fr 1fr;
  gap: 48px; padding-bottom: 40px;
  border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 28px;
}
.footer-col h4  { font-size: 0.78rem; font-weight: 800; color: white; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
.footer-col a   { display: block; font-size: 0.83rem; margin-bottom: 9px; color: rgba(255,255,255,0.5); transition: color 0.2s; }
.footer-col a:hover { color: white; }
.footer-bottom  { display: flex; justify-content: space-between; align-items: center; }
.footer-bottom p { font-size: 0.78rem; color: rgba(255,255,255,0.3); }
.footer-legal a  { font-size: 0.78rem; color: rgba(255,255,255,0.3); margin-left: 20px; transition: color 0.2s; }
.footer-legal a:hover { color: rgba(255,255,255,0.65); }
```

---

## 12. Shadows Reference

| Context                  | Box-shadow value                                     |
|--------------------------|------------------------------------------------------|
| Header                   | `0 2px 20px rgba(21,101,192,0.06)`                  |
| Logo icon                | `0 4px 12px rgba(21,101,192,0.3)`                   |
| Dropdown                 | `0 8px 40px rgba(21,101,192,0.15)`                  |
| Card hover               | `0 16px 48px rgba(21,101,192,0.1)`                  |
| Primary button           | `0 6px 24px rgba(0,0,0,0.2)`                        |
| Primary button hover     | `0 10px 32px rgba(0,0,0,0.25)`                      |
| Header CTA button        | `0 4px 16px rgba(21,101,192,0.3)`                   |
| CTA banner button        | `0 6px 20px rgba(0,0,0,0.14)`                       |
| Toast                    | `0 8px 32px rgba(0,0,0,0.25)`                       |
| Phone mockup             | `drop-shadow(0 40px 60px rgba(0,0,0,0.55))`         |

---

## 13. Border Radii

| Component            | Radius  |
|----------------------|---------|
| Cards (main)         | `20px`  |
| Logo icon            | `10px`  |
| Header nav hover     | `8px`   |
| Dropdown             | `14px`  |
| Dropdown items       | `9px`   |
| Pill buttons         | `24–30px` |
| Tag chips            | `8–10px` |
| Icon boxes           | `12px`  |

---

## 14. Animations & Transitions

```css
/* Entrance — used on hero children */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Floating phone / card */
@keyframes floatY {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-14px); }
}

/* Live status dot */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.45; }
}
```

- **Default transition:** `all 0.2s` on interactive elements.
- **Card transition:** `all 0.25s`.
- **Entrance stagger (hero):** Apply `animation: fadeUp 0.55s ease both` with `animation-delay` increments of `0.1s` per child.

---

## 15. Toast Notification

```css
.toast {
  position: fixed; bottom: 28px; left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: var(--blue-900); color: white;
  padding: 12px 24px; border-radius: 30px;
  font-size: 0.85rem; font-weight: 600;
  opacity: 0; transition: all 0.3s;
  pointer-events: none; z-index: 9999;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
```

```js
function goTo(page) {
  const t = document.getElementById('toast');
  t.textContent = 'Navigating to ' + page;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
  setTimeout(() => { window.location.href = page; }, 300);
}
```

Add `<div class="toast" id="toast"></div>` just before `</body>` on every page.

---

## 16. Grid Patterns

| Section          | Grid                                | Gap   |
|------------------|-------------------------------------|-------|
| Services         | `repeat(3, 1fr)`                    | 22 px |
| Engines          | `repeat(3, 1fr)`                    | 20 px |
| Analytics        | `repeat(3, 1fr)`                    | 22 px |
| Footer columns   | `2fr 1fr 1fr`                       | 48 px |

---

## 17. Page Template (minimal boilerplate)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Page Title – StockAiVerse</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet"/>
  <style>
    /* ── PASTE :root block from Section 2 here ── */

    /* ── PASTE header CSS from Section 7 ── */

    /* ── PASTE footer CSS from Section 11 ── */

    /* ── PASTE animations from Section 14 ── */

    /* ── PASTE toast CSS from Section 15 ── */

    /* ── Page-specific styles below ── */
    .page-sec     { padding: 96px 0; background: var(--white); }
    .page-sec-alt { padding: 96px 0; background: var(--gray-50); }
    .container    { max-width: 1280px; margin: 0 auto; padding: 0 64px; }
  </style>
</head>
<body>

<!-- HEADER (copy from index.html) -->
<header> … </header>

<!-- PAGE CONTENT: offset top by header height -->
<div style="padding-top: 68px;">
  <div class="page-sec">
    <div class="container">
      <!-- content -->
    </div>
  </div>
</div>

<!-- FOOTER (copy from index.html) -->
<footer> … </footer>

<div class="toast" id="toast"></div>
<script>
  function goTo(page) {
    const t = document.getElementById('toast');
    t.textContent = 'Navigating to ' + page;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
    setTimeout(() => { window.location.href = page; }, 300);
  }
</script>
</body>
</html>
```
