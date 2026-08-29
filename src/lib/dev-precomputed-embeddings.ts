export interface PrecomputedEmbeddingFixture {
  // required for validaton
  srcSentenceCount: number
  tgtSentenceCount: number
  vectorLength: number
  // base 64-encoded Float32Array Bytes
  srcVectorsB64: string
  tgtVectorsB64: string
  // optional, display only
  modelId?: string
  label?: string
}

export interface DecodedPrecomputedEmbeddings {
  src: Float32Array
  tgt: Float32Array
  vectorLength: number
  srcSentenceCount: number
  tgtSentenceCount: number
  modelId?: string
  label?: string
}

export function encodeFloat32Array(data: Float32Array): string {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  let binary = ""
  for (const b of bytes) {
    binary += String.fromCharCode(b)
  }
  return btoa(binary)
}
export function decodeFloat32Array(b64: string): Float32Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  if (bytes.byteLength % 4 !== 0) {
    throw new Error("Decoded bytes are not a multiple of 4")
  }
  return new Float32Array(bytes.buffer)
}

// checks that the fixture is actually decodeable
export function validatePrecomputedFixture(
  fixture: PrecomputedEmbeddingFixture
): { ok: true } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error })

  if (
    !Number.isInteger(fixture.srcSentenceCount) ||
    fixture.srcSentenceCount < 0
  )
    return fail("invalid srcSentenceCount")
  if (
    !Number.isInteger(fixture.tgtSentenceCount) ||
    fixture.tgtSentenceCount < 0
  )
    return fail("invalid tgtSentenceCount")
  if (!Number.isInteger(fixture.vectorLength) || fixture.vectorLength <= 0)
    return fail("invalid vectorLength")

  let src: Float32Array
  let tgt: Float32Array
  try {
    src = decodeFloat32Array(fixture.srcVectorsB64)
    tgt = decodeFloat32Array(fixture.tgtVectorsB64)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "invalid base64")
  }

  const expectedSrcLen = fixture.srcSentenceCount * fixture.vectorLength
  const expectedTgtLen = fixture.tgtSentenceCount * fixture.vectorLength
  if (expectedSrcLen !== src.length)
    return fail(`src length ${src.length} !== ${expectedSrcLen}`)
  if (expectedTgtLen !== tgt.length)
    return fail(`src length ${tgt.length} !== ${expectedTgtLen}`)

  return { ok: true }
}

export function decodePrecomputedFixture(
  fixture: PrecomputedEmbeddingFixture
): DecodedPrecomputedEmbeddings {
  const check = validatePrecomputedFixture(fixture)
  if (!check.ok) throw new Error(check.error)

  return {
    src: decodeFloat32Array(fixture.srcVectorsB64),
    tgt: decodeFloat32Array(fixture.tgtVectorsB64),
    vectorLength: fixture.vectorLength,
    srcSentenceCount: fixture.srcSentenceCount,
    tgtSentenceCount: fixture.tgtSentenceCount,
    modelId: fixture.modelId,
    label: fixture.label,
  }
}
