# CoursePilot

A proactive learning assistant for college-level ESL students.  
Built with **React** and **Vite**.

---

## Quick Start

Make sure you have **Node.js 18+** installed, then run:

```bash
npm install
npm run dev
```

Open your browser at **http://localhost:5173**

To build for production:

```bash
npm run build
npm run preview   # preview the production build locally
```

---

## Pages & File Map

| Page | Route | File |
|---|---|---|
| Dashboard | `/` | `src/pages/Dashboard.jsx` |
| Planner | `/planner` | `src/pages/Planner.jsx` |
| Study Assistant | `/study-assistant` | `src/pages/StudyAssistant.jsx` |
| Vocabulary | `/vocabulary` | `src/pages/Vocabulary.jsx` |

### Shared components

| Component | File | Purpose |
|---|---|---|
| Layout (header + nav + footer) | `src/components/Layout.jsx` | Wraps every page; contains navigation links |
| Layout styles | `src/components/Layout.module.css` | Header, nav-link, footer styles |
| ComingSoon | `src/components/ComingSoon.jsx` | Placeholder card shown on unfinished pages |
| ComingSoon styles | `src/components/ComingSoon.module.css` | Styles for the placeholder card |

### Routing

Routes are defined in `src/App.jsx`.  
The app uses **React Router v7** with `BrowserRouter` (wrapped in `src/main.jsx`).

---

## Working on a page

Each page is a separate file. You only need to edit your own page file (and its matching `.module.css` if you create one). You do not need to touch the Layout or other pages.

Example — adding content to the Planner page:

```jsx
// src/pages/Planner.jsx
export default function Planner() {
  return (
    <div>
      <h1>Planner</h1>
      {/* your content here */}
    </div>
  )
}
```

---

## Demo data

The Dashboard contains example data clearly labelled **Demo**.  
Replace it with real data when your feature is ready.  
The demo data lives at the top of `src/pages/Dashboard.jsx`.

---

## Project structure

```
CoursePilot/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx          ← app entry point, sets up Router
    ├── App.jsx           ← route definitions
    ├── index.css         ← global reset & base styles
    ├── components/
    │   ├── Layout.jsx
    │   ├── Layout.module.css
    │   ├── ComingSoon.jsx
    │   └── ComingSoon.module.css
    └── pages/
        ├── Dashboard.jsx
        ├── Dashboard.module.css
        ├── Planner.jsx
        ├── StudyAssistant.jsx
        └── Vocabulary.jsx
```
