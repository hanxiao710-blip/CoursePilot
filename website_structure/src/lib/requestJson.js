export class RequestTimeoutError extends Error {
  constructor() {
    super('The request timed out. Please try again.')
    this.name = 'RequestTimeoutError'
  }
}

// The deadline includes response.json(), including error response bodies.
// The race also settles when an external transport fails to honour abort.
export async function requestJson(url, options = {}, timeoutMs = 40_000, fetchImpl = fetch) {
  const controller = new AbortController()
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestTimeoutError())
      controller.abort()
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { ...options, signal: controller.signal })
        const data = await response.json()
        return { response, data }
      })(),
      deadline,
    ])
  } finally {
    clearTimeout(timer)
  }
}
