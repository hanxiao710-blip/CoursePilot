/**
 * syllabusAnalysis.js — RETIRED (AI path removed)
 *
 * The AI-powered syllabus analysis path (analyzeWithAI → Supabase Edge Function
 * "analyze-syllabus") is no longer used by the front-end.  Syllabus import now
 * runs entirely client-side via the rule-based parser in syllabusParser.js.
 *
 * The Edge Function itself (supabase/functions/analyze-syllabus/) is NOT deleted
 * here — it is a deployed cloud resource and must be managed through the Supabase
 * dashboard or CLI.
 *
 * PDF text extraction has been moved to lib/pdfExtract.js.
 * Rule-based parsing lives in lib/syllabusParser.js.
 *
 * This file is kept as a placeholder so that any import that may still reference
 * it produces a clear empty export rather than a module-not-found error during
 * a transition period.  It can be deleted once teammates have confirmed their
 * branches no longer import from it.
 */

// No exports — this module is intentionally empty.
