# CoursePilot — Shared Data Integration Guide

> **Scope:** Dashboard and shared data layer.  
> **Last updated:** 2026-11-12  
> **Author:** Dashboard implementation pass

---

## 1. Database Tables

All tables live in the `public` Supabase schema with Row Level Security (RLS) enabled.  
Every table is scoped to the authenticated user via `user_id = auth.uid()` — no cross-user access is possible.

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users.id` |
| `display_name` | `text` | Optional friendly name |
| `theme` | `text` | Reserved for future theming |
| `bg_image_path` | `text` | Storage path for Dashboard background (e.g. `<uid>/background.jpg`) |
| `updated_at` | `timestamptz` | Auto-updated on write |

A row is auto-created for every new user by the `handle_new_user` trigger.

### `assignments`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id` |
| `course` | `text` | Course name (e.g. "ENG 101") |
| `title` | `text` | Assignment title |
| `deadline` | `date` | Due date, `YYYY-MM-DD` |
| `completed` | `boolean` | `false` by default |
| `created_at` | `timestamptz` | |

**Used by:** Planner (full CRUD), Dashboard (read + toggle `completed`).

### `vocabulary`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK |
| `word` | `text` | |
| `definition` | `text` | |
| `example` | `text` | Optional |
| `status` | `text` | `new` \| `learning` \| `mastered` |
| `next_review` | `date` | Date of next spaced-repetition review |
| `created_at` | `timestamptz` | |

**Used by:** Vocabulary/Workhub (full CRUD + update `status`/`next_review`), Dashboard (read words where `next_review ≤ today`).

### `study_suggestions`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK |
| `content` | `text` | Suggestion text |
| `assignment_id` | `uuid` | Optional FK → `assignments.id` (set null on delete) |
| `created_at` | `timestamptz` | |

**Used by:** Study Assistant/Learning Assistant (create + list), Dashboard (read latest 1).

---

## 2. Storage Bucket

**Bucket name:** `avatars` (private, not publicly accessible)  
**Path convention:** `<user_id>/background.<ext>`  
**Policies (in `002_storage_policies.sql`):** SELECT / INSERT / UPDATE / DELETE restricted to `(storage.foldername(name))[1] = auth.uid()::text`

---

## 3. Shared Service Functions

All functions are exported from [`src/lib/supabaseService.js`](../website_structure/src/lib/supabaseService.js).  
Import what you need — do **not** write Supabase queries directly in page components.

### Profiles
| Function | Signature | Used by |
|---|---|---|
| `getProfile` | `(userId) → { data, error }` | Dashboard |
| `updateProfile` | `(userId, updates) → { data, error }` | Dashboard (bg image path) |

### Assignments
| Function | Signature | Used by |
|---|---|---|
| `getAssignments` | `(userId)` | Planner (all, sorted by deadline) |
| `getUpcomingDeadlines` | `(userId)` | Dashboard (incomplete only, sorted) |
| `createAssignment` | `(userId, { course, title, deadline })` | Planner |
| `setAssignmentCompleted` | `(assignmentId, completed)` | Dashboard ✓ button, Planner |
| `deleteAssignment` | `(assignmentId)` | Planner |

### Vocabulary
| Function | Signature | Used by |
|---|---|---|
| `getVocabulary` | `(userId)` | Vocabulary page (all words) |
| `getDailyVocab` | `(userId)` | Dashboard (due today or earlier) |
| `createVocabWord` | `(userId, { word, definition, example?, status?, next_review? })` | Vocabulary page |
| `updateVocabWord` | `(wordId, { status?, next_review? })` | Vocabulary page (after review) |
| `deleteVocabWord` | `(wordId)` | Vocabulary page |

### Study Suggestions
| Function | Signature | Used by |
|---|---|---|
| `getSuggestions` | `(userId)` | Study Assistant page (all) |
| `getLatestSuggestion` | `(userId)` | Dashboard (most recent 1) |
| `createSuggestion` | `(userId, { content, assignment_id? })` | Study Assistant page |
| `deleteSuggestion` | `(suggestionId)` | Study Assistant page |

### Storage — Background Images
| Function | Signature | Used by |
|---|---|---|
| `uploadBackgroundImage` | `(userId, File) → path` | Dashboard upload |
| `getBackgroundImageUrl` | `(path) → signedUrl` | Dashboard display (URL valid 1 h) |
| `removeBackgroundImage` | `(storagePath)` | Dashboard remove (also call `updateProfile` to clear `bg_image_path`) |

---

## 4. Dashboard Data Flow

```
Dashboard mounts / window regains focus
  └─ loadData() (parallel Promise.all)
       ├─ getProfile()            → restore bg_image_path → getBackgroundImageUrl()
       ├─ getUpcomingDeadlines()  → incomplete assignments sorted by deadline
       ├─ getLatestSuggestion()   → most recent study tip
       └─ getDailyVocab()         → vocabulary words due ≤ today
```

**Refresh triggers:**
1. Component mount (`useEffect` on `user`)
2. `window focus` event — fires when the user tabs back or returns from another page

**Optimistic update on task completion:**  
Clicking ✓ on a deadline immediately removes it from the list (optimistic), then calls `setAssignmentCompleted(id, true)`. On error, `loadData()` is called to restore the accurate server state.

---

## 5. Background Image Lifecycle

1. User picks a file via the hidden `<input type="file">` (JPEG/PNG/WebP/GIF, max 5 MB).
2. `uploadBackgroundImage(userId, file)` upserts to `avatars/<uid>/background.<ext>`.
3. `updateProfile(userId, { bg_image_path: path })` saves the path to `profiles`.
4. `getBackgroundImageUrl(path)` generates a 1-hour signed URL for display.
5. On next load, `getProfile()` returns `bg_image_path`; the signed URL is refreshed.
6. On remove: `updateProfile(userId, { bg_image_path: null })` clears the reference.  
   The storage file itself is left in place (avoiding a round-trip delete); if you want to purge it, call `removeBackgroundImage(storagePath)` first.

---

## 6. Module Integration Status

| Module | Tables written | Dashboard reads | Integration status |
|---|---|---|---|
| **Dashboard** | `profiles` (bg path) | `assignments`, `vocabulary`, `study_suggestions`, `profiles` | ✅ Complete |
| **Planner** | `assignments` | — | ⏳ Pending — stub (`ComingSoon`) |
| **Vocabulary / Workhub** | `vocabulary` | — | ⏳ Pending — stub (`ComingSoon`) |
| **Study Assistant / Learning Assistant** | `study_suggestions` | — | ⏳ Pending — stub (`ComingSoon`) |

When Planner is built:
- Import `getAssignments`, `createAssignment`, `setAssignmentCompleted`, `deleteAssignment` from `supabaseService`.
- Dashboard will automatically reflect any `completed = true` changes next time it loads or the window refocuses — no extra wiring needed.

When Vocabulary is built:
- Import `getVocabulary`, `createVocabWord`, `updateVocabWord`, `deleteVocabWord`.
- Dashboard's "Vocabulary Due for Review" card will update automatically.

When Study Assistant is built:
- Import `getSuggestions`, `createSuggestion`, `deleteSuggestion`.
- Dashboard's "Study Suggestion" card shows `getLatestSuggestion()` — updates automatically.

---

## 7. Supabase Realtime — Assessment

**Decision: not used in this implementation.**

Rationale:
- The Dashboard already refreshes on mount and on window focus, which covers all realistic cross-page update scenarios (user switches tab to Planner, marks task done, returns).
- Adding `channel.on('postgres_changes', ...)` subscriptions would require: careful cleanup on unmount, deduplication logic (Supabase delivers each change to every active subscriber), and handling reconnection edge cases.
- With all three peer modules still stubs, there is no live cross-page data change to subscribe to yet.

**Recommendation:** Revisit once Planner or Vocabulary is live. At that point, a single `useRealtimeRefresh(table, userId, onRefresh)` hook would be the right abstraction — subscribe in that hook, unsubscribe in its cleanup, call `loadData()` on each `INSERT`/`UPDATE`/`DELETE` event.

---

## 8. Security Checklist

| Check | Status |
|---|---|
| All tables have RLS enabled | ✅ |
| All policies enforce `user_id = auth.uid()` | ✅ |
| Storage policies enforce `foldername[1] = auth.uid()` | ✅ |
| No service-role key exposed to frontend | ✅ (only `VITE_SUPABASE_ANON_KEY`) |
| No hardcoded sample data presented as real user data | ✅ (empty states shown when tables empty) |
| Background image URL is signed (not public) | ✅ (1-hour signed URL, refreshed on load) |

---

## 9. Configuration Required

The following items require action from you or a teammate before the Dashboard is fully functional in production:

### Required
- [ ] **Run `001_initial_schema.sql`** in Supabase SQL Editor (creates all tables + RLS policies + trigger)
- [ ] **Run `002_storage_policies.sql`** in Supabase SQL Editor (creates storage policies for the `avatars` bucket)
- [ ] **Create the `avatars` storage bucket** in Supabase Dashboard → Storage → New bucket, name `avatars`, set to **Private**
- [ ] **Set environment variables** — copy `website_structure/.env.example` to `website_structure/.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### For teammates (when building peer modules)
- [ ] **Planner team:** use `getAssignments` / `createAssignment` / `setAssignmentCompleted` / `deleteAssignment` from `supabaseService.js`
- [ ] **Vocabulary/Workhub team:** use `getVocabulary` / `createVocabWord` / `updateVocabWord` / `deleteVocabWord` from `supabaseService.js`
- [ ] **Study Assistant/Learning Assistant team:** use `getSuggestions` / `createSuggestion` / `deleteSuggestion` from `supabaseService.js`; save suggestions with `assignment_id` set when relevant
