/**
 * supabaseService.js
 *
 * Shared data-access layer for CoursePilot.
 * Import these functions in Dashboard, Planner, Vocabulary, and StudyAssistant
 * instead of writing Supabase queries directly in each page.
 *
 * Every function expects the caller to pass the authenticated user's id
 * (available from useAuth().user.id) unless otherwise noted.
 *
 * Usage example:
 *   import { getUpcomingDeadlines, getLatestSuggestion, getDailyVocab } from '../lib/supabaseService'
 *   const { data, error } = await getUpcomingDeadlines(user.id)
 */

import { supabase } from './supabase'
import { createVocabPersistence } from './vocabPersistence.js'
import { createReviewService } from './vocabReviewService.js'
import { localDay, buildStudyLists } from './vocabStudy.js'
export const reviewVocabulary = createReviewService(supabase)

export const { saveVocabItems, editVocabWord } = createVocabPersistence(supabase)

// ─────────────────────────────────────────────
// PROFILES
// ─────────────────────────────────────────────

/** Fetch the profile row for a given user. */
export async function getProfile(userId) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
}

/**
 * Update profile fields.
 * @param {string} userId
 * @param {{ display_name?: string, theme?: string, bg_image_path?: string }} updates
 */
export async function updateProfile(userId, updates) {
  return supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
}

// ─────────────────────────────────────────────
// ASSIGNMENTS
// ─────────────────────────────────────────────

/**
 * Return a user's incomplete assignments sorted by deadline (soonest first).
 * Used by Dashboard → Upcoming Deadlines.
 */
export async function getUpcomingDeadlines(userId) {
  return supabase
    .from('assignments')
    .select('id, course, title, deadline')
    .eq('user_id', userId)
    .eq('completed', false)
    .order('deadline', { ascending: true })
}

/** Return all assignments for a user (Planner page). */
export async function getAssignments(userId) {
  return supabase
    .from('assignments')
    .select('*')
    .eq('user_id', userId)
    .order('deadline', { ascending: true })
}

/**
 * Create a new assignment.
 * @param {string} userId
 * @param {{ course: string, title: string, deadline: string }} assignment  deadline = 'YYYY-MM-DD'
 */
export async function createAssignment(userId, assignment) {
  return supabase
    .from('assignments')
    .insert({ user_id: userId, ...assignment })
    .select()
    .single()
}

/**
 * Toggle the completed flag on an assignment.
 * @param {string} assignmentId
 * @param {boolean} completed
 */
export async function setAssignmentCompleted(assignmentId, completed) {
  return supabase
    .from('assignments')
    .update({ completed })
    .eq('id', assignmentId)
}

/** Delete an assignment by id. */
export async function deleteAssignment(assignmentId) {
  return supabase
    .from('assignments')
    .delete()
    .eq('id', assignmentId)
}

/**
 * Bulk-insert multiple assignments for a user (Syllabus Import).
 * Returns the inserted rows on success.
 *
 * @param {string} userId
 * @param {{ course: string, title: string, deadline: string }[]} assignments
 */
export async function bulkCreateAssignments(userId, assignments) {
  const rows = assignments.map(a => ({
    user_id:   userId,
    course:    a.course,
    title:     a.title,
    deadline:  a.deadline,
    completed: false,
  }))
  return supabase
    .from('assignments')
    .insert(rows)
    .select()
}

// ─────────────────────────────────────────────
// VOCABULARY
// ─────────────────────────────────────────────

/**
 * Return vocabulary words due for review today or earlier.
 * Used by Dashboard → Daily Vocabulary.
 */
export async function getDailyVocab(userId) {
  const today = localDay()
  const result = await supabase
    .from('vocabulary')
    .select('id, word, definition, example, status, next_review, last_reviewed_on, sessions(class_date)')
    .eq('user_id', userId)
    .lte('next_review', today)
    .order('next_review', { ascending: true })
  if (result.error) return result
  return { ...result, data: buildStudyLists(result.data ?? [], [], today).due }
}

/** Return all vocabulary words for a user (Vocabulary page). */
export async function getVocabulary(userId) {
  return supabase
    .from('vocabulary')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
}

/**
 * Add a new vocabulary word.
 * @param {string} userId
 * @param {{ word: string, definition: string, example?: string, status?: string, next_review?: string }} word
 */
export async function createVocabWord(userId, word) {
  return supabase
    .from('vocabulary')
    .insert({ user_id: userId, ...word })
    .select()
    .single()
}

/**
 * Update a vocabulary word (e.g. after review — update status and next_review).
 * @param {string} wordId
 * @param {{ status?: string, next_review?: string }} updates
 */
export async function updateVocabWord(wordId, updates) {
  return supabase
    .from('vocabulary')
    .update(updates)
    .eq('id', wordId)
}

/** Delete a vocabulary word by id. */
export async function deleteVocabWord(wordId) {
  return supabase
    .from('vocabulary')
    .delete()
    .eq('id', wordId)
}

// ─────────────────────────────────────────────
// STUDY SUGGESTIONS
// ─────────────────────────────────────────────

/**
 * Return the single most recent study suggestion.
 * Used by Dashboard → Study Suggestion.
 */
export async function getLatestSuggestion(userId) {
  return supabase
    .from('study_suggestions')
    .select('id, content, created_at, assignment_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

/** Return all suggestions for a user (Study Assistant page). */
export async function getSuggestions(userId) {
  return supabase
    .from('study_suggestions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
}

/**
 * Save a new study suggestion.
 * @param {string} userId
 * @param {{ content: string, assignment_id?: string }} suggestion
 */
export async function createSuggestion(userId, suggestion) {
  return supabase
    .from('study_suggestions')
    .insert({ user_id: userId, ...suggestion })
    .select()
    .single()
}

/** Delete a suggestion by id. */
export async function deleteSuggestion(suggestionId) {
  return supabase
    .from('study_suggestions')
    .delete()
    .eq('id', suggestionId)
}

// ─────────────────────────────────────────────
// STORAGE — background images
// ─────────────────────────────────────────────

const STORAGE_BUCKET = 'avatars'
const MAX_FILE_SIZE_MB = 5
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/** The fixed storage path used for a user's background image. */
function bgPath(userId, ext) {
  return `${userId}/background.${ext}`
}

/**
 * Upload a background image for a user.
 * Returns the storage path on success, or throws on error.
 *
 * @param {string} userId
 * @param {File}   file
 * @returns {Promise<string>}  storage path (store this in profiles.bg_image_path)
 */
export async function uploadBackgroundImage(userId, file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`File type not allowed. Use: ${ALLOWED_TYPES.join(', ')}`)
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`File must be smaller than ${MAX_FILE_SIZE_MB} MB`)
  }

  const ext = file.name.split('.').pop()
  const path = bgPath(userId, ext)

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true })

  if (error) throw error
  return path
}

/**
 * Get a short-lived signed URL for a background image path.
 * @param {string} path  value stored in profiles.bg_image_path
 * @returns {Promise<string>}  signed URL (valid 60 minutes)
 */
export async function getBackgroundImageUrl(path) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

/**
 * Remove a user's background image from storage.
 * Call updateProfile(userId, { bg_image_path: null }) before or after this
 * to clear the reference in the profiles table.
 *
 * @param {string} storagePath  value previously returned by uploadBackgroundImage
 */
export async function removeBackgroundImage(storagePath) {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([storagePath])
  if (error) throw error
}

// ─────────────────────────────────────────────
// VOCABULARY MODULE — COURSES
// Added/repaired in migration 004_vocab_integrity.sql
// ─────────────────────────────────────────────

/**
 * Return all courses belonging to a user, ordered by creation time.
 * @param {string} userId
 */
export async function getCourses(userId) {
  return supabase
    .from('courses')
    .select('id, course_code, course_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
}

/**
 * Create a new course for a user.
 * @param {string} userId
 * @param {{ course_code: string, course_name?: string }} course
 */
export async function createCourse(userId, course) {
  return supabase
    .from('courses')
    .insert({ user_id: userId, ...course })
    .select()
    .single()
}

/**
 * Update an existing course (e.g. rename).
 * @param {string} courseId
 * @param {{ course_code?: string, course_name?: string }} updates
 */
export async function updateCourse(courseId, updates) {
  return supabase
    .from('courses')
    .update(updates)
    .eq('id', courseId)
}

/**
 * Delete a course and all its sessions (cascade).
 * Note: vocabulary words linked to sessions of this course will have
 * their session_id set to NULL (on delete set null).
 * @param {string} courseId
 */
export async function deleteCourse(courseId) {
  return supabase
    .from('courses')
    .delete()
    .eq('id', courseId)
}

// ─────────────────────────────────────────────
// VOCABULARY MODULE — SESSIONS
// ─────────────────────────────────────────────

/**
 * Return all sessions for a given course, ordered by session_number then created_at.
 * @param {string} courseId
 */
export async function getSessions(courseId) {
  return supabase
    .from('sessions')
    .select('id, course_id, user_id, session_number, session_title, class_date, class_end_time, timezone, created_at')
    .eq('course_id', courseId)
    .order('session_number', { ascending: true, nullsFirst: true })
}

export async function getStudySessions(userId) {
  return supabase.from('sessions')
    .select('id,course_id,session_number,session_title,class_date,courses(course_code,course_name)')
    .eq('user_id', userId).order('class_date', { ascending: true, nullsFirst: false })
}

/**
 * Create a new session within a course.
 * class_date must be explicitly supplied (or omitted to leave as NULL = "unscheduled").
 * Never infer class_date from file names or assignment deadlines.
 *
 * @param {string} userId
 * @param {string} courseId
 * @param {{
 *   session_number?: number,
 *   session_title?: string,
 *   class_date?: string,       // YYYY-MM-DD, confirmed by user
 *   class_end_time?: string,   // HH:MM, optional
 *   timezone?: string,         // e.g. "America/Toronto"
 * }} session
 */
export async function createSession(userId, courseId, session) {
  return supabase
    .from('sessions')
    .insert({ user_id: userId, course_id: courseId, ...session })
    .select()
    .single()
}

/**
 * Update session fields (e.g. confirm a class_date, correct a session number).
 * @param {string} sessionId
 * @param {Partial<{ session_number, session_title, class_date, class_end_time, timezone }>} updates
 */
export async function updateSession(sessionId, updates) {
  return supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId)
}

/**
 * Delete a session. Linked vocabulary words will have session_id set to NULL.
 * @param {string} sessionId
 */
export async function deleteSession(sessionId) {
  return supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId)
}

// ─────────────────────────────────────────────
// VOCABULARY MODULE — BILINGUAL WORD OPERATIONS
// Extended functions that work with the new columns added in migration 003.
// The original getVocabulary / createVocabWord / updateVocabWord / deleteVocabWord
// are unchanged and continue to work for legacy rows.
// ─────────────────────────────────────────────

/**
 * Return all vocabulary words for a session, with all bilingual fields.
 * Falls back gracefully for legacy rows that have NULL in new columns.
 * @param {string} sessionId
 */
export async function getVocabularyBySession(sessionId) {
  return supabase
    .from('vocabulary')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
}

/**
 * Return full vocabulary list for a user, joining session and course info.
 * Words without a session_id are returned with null session/course fields.
 * Used by the My Terms & Phrases tab.
 *
 * @param {string} userId
 * @param {{ itemType?: 'term'|'phrase', sessionId?: string }} [filters]
 */
export async function getFullVocabulary(userId, filters = {}) {
  let query = supabase
    .from('vocabulary')
    .select(`
      id, word, definition, example, status, next_review, created_at,
      review_stage, review_revision, last_reviewed_on,
      item_type, chinese, zh_explanation, course_context,
      en_example, zh_example, abbreviation,
      source_note, source_excerpt, source_material_name, user_edited,
      session_id,
      sessions (
        id, session_number, session_title, class_date, timezone,
        courses ( id, course_code, course_name )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (filters.itemType) {
    query = query.eq('item_type', filters.itemType)
  }
  if (filters.sessionId) {
    query = query.eq('session_id', filters.sessionId)
  }

  return query
}
