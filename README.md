# CoursePilot

A proactive learning assistant for college-level ESL students.  
Built with **React + Vite** and **Supabase** (Auth, Database, Storage).

---

## Branch Guide

| Branch | Purpose |
|---|---|
| `main` | Agreed, shared version of the complete website. Only merge here when the team agrees. |
| `dashboard` | Dashboard page, layout, design, and background customization. |
| `learning-assistant` | Development of the AI learning assistant feature. |
| `planner` | Development of the assignment planner feature. |
| `vocabulary` | Development of the vocabulary builder feature. |

**Rule:** Each branch contains the full runnable website. Work on your own branch. Do not merge into `main` without team agreement.

---

## Where the website lives

All website code is in the **`website_structure/`** folder.  
Run all npm commands from inside that folder.

```
CoursePilot/
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   ← run once in Supabase SQL Editor
├── website_structure/
│   ├── .env.example                 ← copy to .env.local and fill in values
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx           ← header + nav + sign-out button
│   │   │   ├── RequireAuth.jsx      ← redirect unauthenticated users to /login
│   │   │   └── ComingSoon.jsx       ← placeholder for unfinished pages
│   │   ├── context/
│   │   │   └── AuthContext.jsx      ← AuthProvider + useAuth() hook
│   │   ├── lib/
│   │   │   ├── supabase.js          ← Supabase client (reads .env.local)
│   │   │   └── supabaseService.js   ← all shared DB + Storage methods
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx        ← live data from Supabase
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── ForgotPassword.jsx
│   │   │   ├── ResetPassword.jsx
│   │   │   ├── Planner.jsx
│   │   │   ├── StudyAssistant.jsx
│   │   │   └── Vocabulary.jsx
│   │   ├── App.jsx                  ← route definitions
│   │   ├── main.jsx                 ← app entry point (wraps with AuthProvider)
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── bob_sessions/
└── README.md
```

---

## One-time Supabase setup (do this once, shared by the whole team)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Choose a name (e.g. `CoursePilot`), a strong database password, and your nearest region.
3. Wait for provisioning (~1 minute).

### 2. Run the database migration

1. In the Supabase dashboard go to **SQL Editor**.
2. Open `supabase/migrations/001_initial_schema.sql` from this repo.
3. Paste the entire file and click **Run**.  
   This creates the `profiles`, `assignments`, `vocabulary`, and `study_suggestions` tables with Row Level Security enabled.

### 3. Create the storage bucket

1. Go to **Storage** → **New bucket**.
2. Name it exactly **`avatars`**, keep **Public** set to **off**, click **Create bucket**.
3. Go to **Storage → Policies** and add three policies for the `avatars` bucket:

| Policy name | Operation | `using` / `with check` expression |
|---|---|---|
| Users upload own files | INSERT | `(storage.foldername(name))[1] = auth.uid()::text` |
| Users view own files | SELECT | `(storage.foldername(name))[1] = auth.uid()::text` |
| Users delete own files | DELETE | `(storage.foldername(name))[1] = auth.uid()::text` |

### 4. Configure Auth redirect URLs

1. Go to **Authentication → URL Configuration**.
2. Set **Site URL** to `http://localhost:5173` (update to your production URL when you deploy).
3. Add these **Redirect URLs**:
   - `http://localhost:5173/`
   - `http://localhost:5173/reset-password`
   - *(add your production URL equivalents when you deploy)*

### 5. Supabase credentials (shared project — already set up)

The team project is already created. Use these values — they are the **public** anon key and are safe to include in frontend code:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://kwzhkwzrwahiejjlkycn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_WgNJEF9Q5EU4lPv9TXgZtA_-eKXWfd7` |

> ⚠️ **Never** copy the `service_role` key into frontend code — that one must stay private.

---

## Local development setup (every team member)

```bash
# 1. Clone the repo (or pull the latest main)
git clone https://github.com/hanxiao710-blip/CoursePilot.git
cd CoursePilot

# 2. Install dependencies
cd website_structure
npm install

# 3. Create your local environment file
cp .env.example .env.local
# Or create it manually with these exact values:
#   VITE_SUPABASE_URL=https://kwzhkwzrwahiejjlkycn.supabase.co
#   VITE_SUPABASE_ANON_KEY=sb_publishable_WgNJEF9Q5EU4lPv9TXgZtA_-eKXWfd7

# 4. Start the dev server
npm run dev
```

Open **http://localhost:5173** in your browser.  
You will be redirected to `/login` automatically if you are not signed in.

---

## Quick Start

```bash
cd website_structure
npm install
npm run dev
```

---

## Pages & File Map

| Page | Route | File |
|---|---|---|
| Login | `/login` | `website_structure/src/pages/Login.jsx` |
| Register | `/register` | `website_structure/src/pages/Register.jsx` |
| Forgot password | `/forgot-password` | `website_structure/src/pages/ForgotPassword.jsx` |
| Reset password | `/reset-password` | `website_structure/src/pages/ResetPassword.jsx` |
| Dashboard | `/` | `website_structure/src/pages/Dashboard.jsx` |
| Planner | `/planner` | `website_structure/src/pages/Planner.jsx` |
| Study Assistant | `/study-assistant` | `website_structure/src/pages/StudyAssistant.jsx` |
| Vocabulary | `/vocabulary` | `website_structure/src/pages/Vocabulary.jsx` |

### Shared components

| Component | File | Purpose |
|---|---|---|
| Layout | `src/components/Layout.jsx` | Header + nav + sign-out button |
| RequireAuth | `src/components/RequireAuth.jsx` | Redirects unauthenticated users to /login |
| ComingSoon | `src/components/ComingSoon.jsx` | Placeholder for unfinished pages |

---

## Shared data access — `supabaseService.js`

All database and storage operations are centralised in  
`website_structure/src/lib/supabaseService.js`.  
Import from there instead of writing raw Supabase queries in page files.

### Auth (via `useAuth` hook)

```jsx
import { useAuth } from '../context/AuthContext'

function MyComponent() {
  const { user, loading, signOut } = useAuth()
  // user.id    — UUID, use as user_id in DB calls
  // user.email — the user's email address
  // loading    — true while the initial session is being read
}
```

### Planner developer — assignments

```jsx
import {
  getAssignments,
  createAssignment,
  setAssignmentCompleted,
  deleteAssignment,
} from '../lib/supabaseService'

// Fetch all assignments
const { data, error } = await getAssignments(user.id)

// Create a new assignment
await createAssignment(user.id, {
  course: 'ENGL 101',
  title: 'Essay draft',
  deadline: '2024-11-15',   // YYYY-MM-DD
})

// Mark complete
await setAssignmentCompleted(assignmentId, true)

// Delete
await deleteAssignment(assignmentId)
```

### Vocabulary developer — vocabulary words

```jsx
import {
  getVocabulary,
  createVocabWord,
  updateVocabWord,
  deleteVocabWord,
} from '../lib/supabaseService'

// Fetch all words
const { data, error } = await getVocabulary(user.id)

// Add a word
await createVocabWord(user.id, {
  word: 'Analyze',
  definition: 'To examine carefully and in detail.',
  example: 'We will analyze the poem in class.',
  status: 'new',            // 'new' | 'learning' | 'mastered'
  next_review: '2024-11-15', // YYYY-MM-DD, defaults to today
})

// Update status after review
await updateVocabWord(wordId, {
  status: 'learning',
  next_review: '2024-11-18',
})
```

### Study Assistant developer — suggestions

```jsx
import {
  getSuggestions,
  createSuggestion,
  deleteSuggestion,
} from '../lib/supabaseService'

// Fetch all suggestions
const { data, error } = await getSuggestions(user.id)

// Save a suggestion (optionally link to an assignment)
await createSuggestion(user.id, {
  content: 'Review your ENGL 101 outline before the deadline.',
  assignment_id: 'some-uuid-or-null',
})

// The Dashboard automatically shows the most recent suggestion.
```

### Profile and background image

```jsx
import {
  getProfile,
  updateProfile,
  uploadBackgroundImage,
  getBackgroundImageUrl,
} from '../lib/supabaseService'

// Read profile
const { data: profile } = await getProfile(user.id)

// Upload a background image (File object from <input type="file">)
const path = await uploadBackgroundImage(user.id, file)

// Save the path to the profile
await updateProfile(user.id, { bg_image_path: path })

// Get a signed URL to display it (valid 60 minutes)
const url = await getBackgroundImageUrl(profile.bg_image_path)
```

---

## Database schema overview

| Table | Key columns |
|---|---|
| `profiles` | `id` (= auth user id), `display_name`, `theme`, `bg_image_path` |
| `assignments` | `id`, `user_id`, `course`, `title`, `deadline` (date), `completed` (bool) |
| `vocabulary` | `id`, `user_id`, `word`, `definition`, `example`, `status`, `next_review` (date) |
| `study_suggestions` | `id`, `user_id`, `content`, `assignment_id` (nullable FK), `created_at` |

All personal data tables have **Row Level Security** enabled.  
Users can only read, create, update, and delete their own rows.

---

## Working on a feature branch

```bash
# Start work on your branch
git checkout planner       # or vocabulary, learning-assistant

# Merge the latest shared foundation from main
git merge main

# Install dependencies (if package.json changed)
cd website_structure && npm install

# Open your page file and build your feature
# Use supabaseService.js for all data access (see examples above)

# Run the dev server
npm run dev

# Before committing, verify the build is clean
npm run build
npm run lint

# Commit and push to YOUR branch only
git add .
git commit -m "describe your change"
git push origin planner
```

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
# Save your work
git add .
git commit -m "describe what you changed"
git push origin your-branch     # push to YOUR branch only

# Never push directly to main — open a PR and get team approval first
```

---

## Security notes

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` go in the frontend.  
  The anon key is safe to expose — it only allows what Row Level Security permits.
- **Never** put the `service_role` key, JWT secret, or database password in any frontend file or commit them to git.
- `.env.local` is in `.gitignore` (via `*.local`) and will not be committed.
