import posthog from "posthog-js"

export class OperationTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    const seconds = Math.max(1, Math.round(timeoutMs / 1000))
    super(
      `${operation} timed out after ${seconds} second${seconds === 1 ? "" : "s"}.`
    )
    this.name = "OperationTimeoutError"
  }
}

export async function withTimeout<T>(
  operation: string,
  timeoutMs: number,
  promise: Promise<T>
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new OperationTimeoutError(operation, timeoutMs)),
      timeoutMs
    )
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

type OperationDetails = Record<string, boolean | number | string | undefined>

function errorDetails(error: unknown): OperationDetails {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    }
  }

  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    "message" in error &&
    typeof error.name === "string" &&
    typeof error.message === "string"
  ) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    }
  }

  return { errorName: typeof error }
}

function captureOperation(
  operation: string,
  status: "started" | "completed" | "failed",
  details: OperationDetails = {}
) {
  if (typeof window === "undefined") return
  posthog.capture("client_operation", { operation, status, ...details })
}

export async function trackOperation<T>(
  operation: string,
  details: OperationDetails,
  task: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now()
  captureOperation(operation, "started", details)

  try {
    const result = await task()
    captureOperation(operation, "completed", {
      ...details,
      durationMs: Date.now() - startedAt,
    })
    return result
  } catch (error) {
    captureOperation(operation, "failed", {
      ...details,
      durationMs: Date.now() - startedAt,
      ...errorDetails(error),
    })
    throw error
  }
}

export function captureStorageCheck(result: {
  indexedDb: boolean
  cacheStorage: boolean
  indexedDbError?: string
  cacheStorageError?: string
}) {
  captureOperation(
    "browser_storage_check",
    result.indexedDb && result.cacheStorage ? "completed" : "failed",
    result
  )
}

export function getOperationErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (error instanceof OperationTimeoutError) {
    return `${error.message} Please check your connection or browser storage, then try again.`
  }

  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return "Your browser has run out of space for ParallelTexts. Free up storage, then try again."
    }
    if (error.name === "SecurityError" || error.name === "InvalidStateError") {
      return "Browser storage is unavailable. Private browsing or privacy settings may be blocking it. Open ParallelTexts in a regular window and try again."
    }
  }

  return error instanceof Error && error.message ? error.message : fallback
}
