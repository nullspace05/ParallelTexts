import {
  decodeFloat32Array,
  decodePrecomputedFixture,
  encodeFloat32Array,
  validatePrecomputedFixture,
  type PrecomputedEmbeddingFixture,
} from "@/lib/dev-precomputed-embeddings"

// const original = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0]) // 2 sentences × dim 4
const original = new Float32Array([1, 1.0001001, 0, 0, 0, 1, 0, 0]) // 2 sentences × dim 4
const b64 = encodeFloat32Array(original)
const back = decodeFloat32Array(b64)
// console.log("original:", [...original])
// console.log("b64:", b64)
// console.log("decoded:", [...back])
// console.log(
//   "roundtrip ok:",
//   back.length === original.length && back.every((v, i) => v === original[i])
// )

// ---------
// second test
const DIM = 4
const src = new Float32Array([
  1,
  0,
  0,
  0, // sentence 0 (first 4 digits)
  0,
  1,
  0,
  0, // sentence 1
])
const tgt = new Float32Array([0.9, 0.1, 0, 0, 0, 0.9, 0.1, 0])

const fixture: PrecomputedEmbeddingFixture = {
  srcSentenceCount: 2,
  tgtSentenceCount: 2,
  vectorLength: DIM,
  modelId: "Xenova/paraphrase-multilingual-mpnet-base-v2",
  label: "manual-test",
  srcVectorsB64: encodeFloat32Array(src),
  tgtVectorsB64: encodeFloat32Array(tgt),
}

console.log(JSON.stringify(fixture, null, 2))

// validating precomputed fixtures
function show(
  label: string,
  result: ReturnType<typeof validatePrecomputedFixture>
) {
  console.log(label, result)
}

show("good fixture", validatePrecomputedFixture(fixture))

console.log("\n-----")
console.log(
  `original srcSentenceCount: ${fixture.srcSentenceCount}, to be replaced with 3`
)
show(
  "bad count",
  validatePrecomputedFixture({
    ...fixture,
    srcSentenceCount: 3,
  })
)

console.log("\n-----")
console.log(
  `original embedding Dim: ${fixture.vectorLength}, to be replaced with 5`
)
show(
  "bad embedding dim",
  validatePrecomputedFixture({
    ...fixture,
    vectorLength: 5,
  })
)

show(
  "bad base64",
  validatePrecomputedFixture({
    ...fixture,
    srcVectorsB64: "%%%not-base64%%%",
  })
)

// --------------
// actually trying the full decode pipeline on a precomputed fixture

// get the correspnding vector slice from the contiguous embedding
function _row(vec: Float32Array, dim: number, row: number): number[] {
  const off = dim * row
  return [...vec.slice(off, off + dim)]
}

const decoded = decodePrecomputedFixture(fixture)
console.log("row 0 src: ", _row(decoded.src, decoded.vectorLength, 0))
console.log("row 1 src: ", _row(decoded.src, decoded.vectorLength, 1))
console.log()
console.log("row 0 tgt: ", _row(decoded.tgt, decoded.vectorLength, 0))
console.log("row 1 tgt: ", _row(decoded.tgt, decoded.vectorLength, 1))
console.log("\n original data:")
console.log("src")
console.log(src)
console.log("tgt")
console.log(tgt)
