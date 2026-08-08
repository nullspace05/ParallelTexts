const MODELS_URL_PREFIX = "/models/"

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".onnx": "application/octet-stream",
  ".txt": "text/plain",
  ".epub": "application/epub+zip",
}

function contentTypeForKey(key: string): string | undefined {
  const extension = key.slice(key.lastIndexOf("."))
  return CONTENT_TYPES[extension]
}

function cacheHeaders(): Headers {
  const headers = new Headers()
  headers.set("Cache-Control", "public, max-age=31536000, immutable")
  headers.set("CDN-Cache-Control", "max-age=31536000")
  headers.set("Accept-Ranges", "bytes")
  return headers
}

export async function serveModelFromR2(
  request: Request,
  bucket: R2Bucket
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  if (!pathname.startsWith(MODELS_URL_PREFIX)) {
    return null
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  const key = decodeURIComponent(pathname.slice(MODELS_URL_PREFIX.length))
  if (!key) {
    return new Response("Not Found", { status: 404 })
  }

  const rangeHeader = request.headers.get("Range") ?? undefined
  const object = await bucket.get(
    key,
    rangeHeader ? { range: rangeHeader } : undefined
  )

  if (!object) {
    return new Response("Not Found", { status: 404 })
  }

  const headers = cacheHeaders()
  object.writeHttpMetadata(headers)

  const explicitType = contentTypeForKey(key)
  if (explicitType) {
    headers.set("Content-Type", explicitType)
  }

  if (object.httpEtag) {
    headers.set("etag", object.httpEtag)
  }

  const status = rangeHeader && object.range ? 206 : 200

  return new Response(request.method === "HEAD" ? null : object.body, {
    status,
    headers,
  })
}
