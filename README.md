# CoursePilot

A proactive learning assistant for college-level ESL students.  
Built with **React** and **Vite**.

---

## Branch Guide

| Branch | Purpose |
|---|---|
| `main` | Agreed, shared version of the complete website. Only merge here when the team agrees. |
| `dashboard` |Development of dashboard page, layout, design, and background customization. |
| `learning-assistant` | Development of the AI learning assistant feature. |
| `planner` | Development of the assignment planner feature. |
| `vocabulary` | Development of the vocabulary builder feature. |

**Rule:** Each branch contains the full runnable website. Work on your own branch. Do not merge into `main` without team agreement.

---

## Where the website lives

All website code is in the **`website_structure/`** folder.  
Run all npm commands from inside that folder.

```
CoursePilot/                ← git repo root
├── website_structure/      ← ALL website source code is here
│   ├── src/
│   │   ├── components/     ← Layout, ComingSoon (shared)
│   │   ├── pages/          ← Dashboard, Planner, StudyAssistant, Vocabulary
│   │   ├── App.jsx         ← route definitions
│   │   ├── main.jsx        ← app entry point
│   │   └── index.css       ← global styles
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── bob_sessions/           ← internal session files (do not edit)
└── README.md
```

---

## Quick Start

```bash
cd website_structure
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Pages & File Map

| Page | Route | File |
|---|---|---|
| Dashboard | `/` | `website_structure/src/pages/Dashboard.jsx` |
| Planner | `/planner` | `website_structure/src/pages/Planner.jsx` |
| Study Assistant | `/study-assistant` | `website_structure/src/pages/StudyAssistant.jsx` |
| Vocabulary | `/vocabulary` | `website_structure/src/pages/Vocabulary.jsx` |

### Shared components

| Component | File | Purpose |
|---|---|---|
| Layout (header + nav + footer) | `src/components/Layout.jsx` | Wraps every page; contains nav links |
| ComingSoon | `src/components/ComingSoon.jsx` | Placeholder card for unfinished pages |

---

## Working on a page

1. Check out your feature branch: `git checkout planner`
2. `cd website_structure && npm install`
3. Open your page file (e.g. `src/pages/Planner.jsx`) and replace the `ComingSoon` component with your content.
4. Run `npm run dev` to preview.
5. When ready: `npm run build` to check for errors.
6. Commit and push to **your branch only**.

---

## Demo data

The Dashboard contains example data clearly labelled **Demo**.  
Replace it with real data when your feature is ready.  
The demo data lives at the top of `website_structure/src/pages/Dashboard.jsx`.

---

## Production build

```bash
cd website_structure
npm run build    # output goes to website_structure/dist/ (gitignored)
npm run preview  # preview the production build locally
```

---

## Git workflow summary

```bash
# Start a new session on your branch
git checkout dashboard        # or planner, vocabulary, learning-assistant
cd website_structure
npm run dev

# Save your work
git add .
git commit -m "describe what you changed"
git push origin dashboard     # push to YOUR branch only

# Never push directly to main — open a PR and get team approval first
```
