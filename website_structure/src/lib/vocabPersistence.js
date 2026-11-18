import { localDay } from './vocabStudy.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildVocabRow(userId, sessionId, materialName, item) {
  if (!UUID.test(item?._id ?? '')) throw new Error('This candidate has no valid save ID. Please extract it again.')
  const word = item.english?.trim()
  const chinese = item.chinese?.trim()
  if (!word || !chinese) throw new Error('Fill in both the English expression and its Chinese equivalent.')
  return {
    user_id: userId,
    candidate_id: item._id,
    session_id: sessionId || null,
    word,
    definition: item.en_definition?.trim() || item.zh_explanation?.trim() || word,
    example: item.en_example || null,
    status: 'new',
    // Today's learning and Dashboard filter future classes. The review RPC
    // sets the next date after a preview or recall exercise.
    next_review: localDay(),
    item_type: item.item_type ?? null,
    chinese,
    zh_explanation: item.zh_explanation || null,
    course_context: item.course_context || null,
    en_example: item.en_example || null,
    zh_example: item.zh_example || null,
    abbreviation: item.abbreviation || null,
    source_note: item.source_excerpt ? item.source_note : 'ai_generated',
    source_excerpt: item.source_excerpt || null,
    source_material_name: materialName || null,
    user_edited: item.user_edited === true,
  }
}

const CONTENT_FIELDS = [
  'session_id', 'word', 'definition', 'example', 'item_type', 'chinese',
  'zh_explanation', 'course_context', 'en_example', 'zh_example', 'abbreviation',
  'source_note', 'source_excerpt', 'source_material_name', 'user_edited',
]

// Pass the real Supabase client in production. Tests exercise this same service
// through the SDK's HTTP boundary, without replacing the query builder.
export function createVocabPersistence(client) {
  async function saveVocabItems(userId, sessionId, materialName, items) {
    const result = { saved: 0, skipped: 0, errors: [], results: [] }
    for (const item of items ?? []) {
      try {
        const row = buildVocabRow(userId, sessionId, materialName, item)
        const { data, error } = await client.from('vocabulary').insert(row).select('id').single()
        if (!error) {
          if (!data?.id) throw new Error('The save could not be confirmed. Retry this item.')
          result.saved++
          result.results.push({ id: item._id, status: 'saved', wordId: data.id })
          continue
        }
        if (error.code !== '23505') throw error

        // A unique constraint, not a prior SELECT, arbitrates concurrent writes.
        // Only acknowledge a conflict after confirming this exact candidate and
        // its content. A failed lookup must never masquerade as a successful save.
        const existing = await client.from('vocabulary')
          .select(['id', ...CONTENT_FIELDS].join(','))
          .eq('user_id', userId).eq('candidate_id', item._id).maybeSingle()
        if (existing.error) throw existing.error
        if (!existing.data) throw error
        if (!CONTENT_FIELDS.every(field => (existing.data[field] ?? null) === (row[field] ?? null))) {
          throw new Error('This candidate is already saved with different content or a different session. Open My Library to edit the saved item.')
        }
        result.skipped++
        result.results.push({ id: item._id, status: 'skipped', wordId: existing.data.id })
      } catch (error) {
        result.errors.push({ id: item?._id, word: item?.english ?? '', error: error.message || 'Save failed. Please retry.' })
        result.results.push({ id: item?._id, status: 'failed' })
      }
    }
    return result
  }

  async function editVocabWord(wordId, updates) {
    const allowed = ['word', 'definition', 'chinese', 'zh_explanation', 'course_context', 'en_example', 'zh_example', 'abbreviation']
    const clean = Object.fromEntries(allowed.filter(key => key in updates).map(key => [key, updates[key]]))
    if (['word', 'definition'].some(key => key in clean && !clean[key]?.trim())) {
      return { error: { message: 'The English expression and definition cannot be empty.' } }
    }
    if ('en_example' in clean) clean.example = clean.en_example
    // Never accept ownership, provenance or candidate ID changes through editing.
    return client.from('vocabulary').update({ ...clean, user_edited: true })
      .eq('id', wordId).select('id').single()
  }

  return { saveVocabItems, editVocabWord }
}
