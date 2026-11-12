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

// ─────────────────────────────────────────────
// VOCABULARY
// ─────────────────────────────────────────────

/**
 * Return vocabulary words due for review today or earlier.
 * Used by Dashboard → Daily Vocabulary.
 */
export async function getDailyVocab(userId) {
  const today = new Date().toISOString().slice(0, 10)
  return supabase
    .from('vocabulary')
    .select('id, word, definition, example, status, next_review')
    .eq('user_id', userId)
    .lte('next_review', today)
    .order('next_review', { ascending: true })
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
