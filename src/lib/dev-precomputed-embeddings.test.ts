// import { describe, expect, it } from "vitest"
// import {
//   decodeFloat32Array,
//   encodeFloat32Array,
// } from "./dev-precomputed-embeddings"

// describe("encodeFloat32Array / decodeFloat32Array", () => {
//   const original = new Float32Array([1, 1, 0, 0, 0, 1, 0, 0]) // 2 sentences × dim 4
//   const original2 = new Float32Array([0, 1, 0.5, 0, 0, 1, 0.5, 0]) // 2 sentences × dim 4
//   const DIM = 4
//   it("roundtrips a Float32Array unchanged", () => {
//     const b64 = encodeFloat32Array(original)
//     const back = decodeFloat32Array(b64)
//     console.log({ back })
//     expect(back).toEqual(original)

//     const b642 = encodeFloat32Array(original2)
//     const back2 = decodeFloat32Array(b642)
//     console.log({ back2 })
//     expect(back2).toEqual(original2)
//   })

//   it("throws when decoded bytes are not a multiple of 4", () => {
//     const badB64 = btoa("abc")
//     console.log({ badB64 })
//     expect(() => decodeFloat32Array(badB64)).toThrow(
//       "Decoded bytes are not a multiple of 4"
//     )
//   })
// })

// describe("validatePrecomputedFixture", () => {
//   it("accepts a valid two-sentence fixture", () => {})

//   it("rejects invalid srcSentenceCount", () => {})

//   it("rejects invalid tgtSentenceCount", () => {})

//   it("rejects invalid vectorLength", () => {})

//   it("rejects src buffer length mismatch (count × vectorLength)", () => {})

//   it("rejects tgt buffer length mismatch (count × vectorLength)", () => {})

//   it("rejects malformed srcVectorsB64 with a useful error", () => {})
// })

// describe("decodePrecomputedFixture", () => {
//   it("returns decoded src/tgt arrays and metadata for a valid fixture", () => {})

//   it("preserves row order (sentence i maps to row i)", () => {})

//   it("throws with the validator error message for an invalid fixture", () => {})
// })

// // Optional: shared helper to build a minimal 2-sentence × dim-4 fixture
