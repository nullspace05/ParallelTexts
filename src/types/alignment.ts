export type AlignmentType = "1:1" | "1:0" | "0:1"

export interface ImageAsset {
  id: string
  mime_type: string
  data_base64: string
}

export interface SourceParagraph {
  para_idx: number
  text: string
  images: Array<ImageAsset>
}

export interface AlignedPair {
  src_text: string
  tgt_text: string
  /** Index of the sentence within its paragraph (0-based) */
  src_sent_idx: number | null
  /** Index of the paragraph within the document (0-based) */
  src_para_idx: number | null
  /** Global index of the sentence across all paragraphs (0-based) */
  src_global_idx: number | null
  /** Index of the sentence within its paragraph (0-based) */
  tgt_sent_idx: number | null
  /** Index of the paragraph within the document (0-based) */
  tgt_para_idx: number | null
  /** Global index of the sentence across all paragraphs (0-based) */
  tgt_global_idx: number | null
  alignment_type: AlignmentType
  confidence: number | null
  src_images: Array<ImageAsset> | null
  tgt_images: Array<ImageAsset> | null
}

export interface AlignmentResult {
  pairs: Array<AlignedPair>
  src_lang: string
  tgt_lang: string
  total_src_sentences: number
  total_tgt_sentences: number
  aligned_count: number
  src_gap_count: number
  tgt_gap_count: number
  source_paragraphs?: Array<SourceParagraph>
  target_paragraphs?: Array<SourceParagraph>
}

/** Runtime metadata recorded when an alignment is created. */
export interface AlignmentMeta {
  modelId: string
  device: "webgpu" | "wasm"
  dtype: string
  durationMs: number
}

/** Stored in IndexedDB. Links an alignment job to two books and its result. */
export interface AlignmentRecord {
  id: string
  sourceBookId: string
  targetBookId: string
  sourceBookTitle: string
  targetBookTitle: string
  result: AlignmentResult
  /** Present on records created after this field was introduced; absent on older records. */
  meta?: AlignmentMeta
  /** Set when the record was created by importing an external file rather than running the pipeline. */
  importedFrom?: "tsv" | "epub"
  createdAt: number
}
