export function createReviewService(client) {
  return async function reviewVocabulary(word, rating, day, operationId) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
    return await client.rpc('record_vocab_review', {
      p_word_id: word.id,
      p_rating: rating,
      p_day: day,
      p_expected_revision: word.review_revision ?? 0,
      p_review_id: operationId,
    }).abortSignal(controller.signal).single()
    } finally { clearTimeout(timer) }
  }
}
