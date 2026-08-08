# Product Requirements Document — ParallelTexts

## Overview

ParallelTexts is a browser-based multilingual sentence alignment tool. The primary goal is to make parallel corpus creation accessible to **non-technical users** — no command line, no Python, no server uploads. A user drops two books (in different languages) and gets a aligned parallel text out.

All ML inference runs client-side via ONNX/WASM. Nothing is ever sent to a backend for processing.

---

## Target Users

- Language learners who want to read a book side-by-side in two languages
- Linguists and translators building small parallel corpora without programming skills
- Researchers who need a quick alignment without setting up a Python pipeline

The UI must be approachable to someone who has never used a command-line tool.

---

## Core Features

### 1. File Import

| Format | Status |
|--------|--------|
| EPUB   | Planned |
| PDF    | Planned |
| TXT    | Planned |

- Files are parsed entirely in the browser (EPUB.js, pdfjs-dist).
- Book metadata (title, cover image) is extracted and displayed.
- Full file blob is stored in IndexedDB (Dexie) so re-processing doesn't require re-uploading.
- Japanese EPUB preprocessing: strip furigana (`<ruby>` tags) before alignment.

### 2. Model Download

- The multilingual embedding model (`distiluse-base-multilingual-cased-v2`) is fetched directly from the Hugging Face Hub on first use.
- A **progress bar** must be shown during download, reporting bytes received vs. total.
- The model is cached in the browser after first download (Transformers.js handles this via the Cache API).

### 3. Alignment Pipeline

The pipeline runs in three distinct, sequential phases. Each phase must expose its own **progress indicator**:

| Phase | Description | Progress signal |
|-------|-------------|-----------------|
| Embedding | Encode each sentence with the multilingual model | Sentences processed / total |
| Similarity | Compute pairwise cosine similarity matrix | % of dot-product batches done |
| Needleman–Wunsch | Global DP alignment over similarity matrix | Row / total rows of DP table |

- Output: a list of `AlignedPair` entries (1:1, 1:0 gap, 0:1 gap) with a confidence score per pair.
- The full `AlignmentRecord` is written to IndexedDB after completion.

### 4. Reading Modes

#### Monolingual

- Render the source or target text on its own as a paginated ebook-style view.

#### Parallel / Side-by-Side

- Render aligned sentence pairs side by side.
- **Pagination is the hardest UX problem here**: text that overflows the current page must continue on the next page at exactly the right position — the browser cannot do this natively for two synchronized columns. Study how [ttu-ttu/ebook-reader](https://github.com/ttu-ttu/ebook-reader) handles reflow as a reference implementation.
- Pairs should be visually linked (highlight, color coding, or indentation) so the reader can see which sentences correspond.

### 5. Export

- Export the aligned pairs as a downloadable file (format TBD — TSV, JSON, or interleaved plain text are all candidates).
- Export/import EPUB with the alignment embedded and original layout/images preserved.

---

## Non-Functional Requirements

### Performance

- The model is large (~250 MB); download must be non-blocking and clearly communicated.
- Embedding computation for a full novel-length text will take minutes in WASM — the UI must remain responsive and show granular progress so the user doesn't think it has hung.
- IndexedDB reads/writes should be the only persistent I/O; avoid storing extracted text (re-extract on demand to save storage quota).

### Privacy

- No text, no book files, and no embeddings ever leave the user's device.
- Model weights are the only thing fetched from a remote server (Hugging Face Hub, directly from the browser).

### Browser Support

- Target: modern Chromium (Chrome, Edge) and Firefox with WASM support.
- Safari compatibility is secondary due to WASM threading limitations.

---

## Out of Scope (for now)

- Server-side alignment or any user account / cloud storage
- More than 2 books per alignment session
- Real-time collaborative editing of alignment pairs
- Training or fine-tuning the embedding model
