// IDs identify a candidate across edits and retries, independently of spelling
// or course assignment. A new extraction creates a fresh set of UUIDs.
export function attachIds(items) {
  return items.map(item => ({ ...item, _id: crypto.randomUUID(), user_edited: false }))
}

export function editCandidate(items, id, field, value) {
  return items.map(item => item._id === id
    ? { ...item, [field]: value, user_edited: true }
    : item)
}

export function remainingSelection(selectedIds, result) {
  const failedIds = new Set(result.errors.map(error => error.id))
  return new Set([...selectedIds].filter(id => failedIds.has(id)))
}
