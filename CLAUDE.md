# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important notes

- If you need to test something with the dev server, check first if it is already running (usually port 3000). If it is, unless absolutely necessary don't kill/restart it — use the existing instance.
- After every edit session, give a full git command (header + body) that can be copy-pasted into the terminal.

## Product Requirements

Full requirements, target users, and feature specs: [`.docs/PRD.md`](.docs/PRD.md)

## Project Goal

ParallelTexts is a **browser-based multilingual sentence alignment tool** aimed at non-technical users. Users upload two EPUB/PDF/TXT books in different languages, the app extracts text, generates multilingual sentence embeddings (ONNX, fully in-browser), then aligns them via Needleman–Wunsch dynamic programming. The result is a readable parallel ebook and a downloadable TSV. No backend ML required.

## Commands

```bash
pnpm dev          # Vite dev server on port 3000
pnpm build        # Vite build, then strips any stray local model files from output
pnpm preview      # Build + serve via Wrangler (mirrors production)
pnpm deploy       # Build + deploy to Cloudflare Workers
pnpm test         # Vitest
pnpm lint         # ESLint (TanStack config) — ALWAYS run after every edit session; fix all errors before continuing
pnpm format       # Prettier (writes) — ALWAYS run after every edit session
pnpm typecheck    # tsc --noEmit
```

Run a single test file: `pnpm vitest run src/path/to/file.test.ts`

## Architecture

### Stack

- **Framework**: TanStack React Start (SSR) + TanStack Router (file-based routing)
- **Deployment**: Cloudflare Workers (`src/server.ts` entry) + R2 (`src/server/serve-models.ts`) for serving the sample-book EPUBs
- **Styling**: Tailwind CSS v4, shadcn/ui (Base UI + Maia style), Lucide icons
- **Storage**: Dexie v4 (IndexedDB ORM) — all books and alignments are stored client-side
- **ML**: Transformers.js 4 — runs ONNX sentence-transformer models in the browser via WASM or WebGPU

### Model Registry (`src/utils/model.ts`)

Four models are available (user picks in Settings or in the Align form):

| Label | HF ID | Size | Notes |
|---|---|---|---|
| mpnet multilingual | `Xenova/paraphrase-multilingual-mpnet-base-v2` | 1110 MB | **Recommended**, 50+ langs |
| MiniLM L12 | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | 470 MB | Fastest, smallest |
| DistilUSE base multilingual v2 | `Xenova/distiluse-base-multilingual-cased-v2` | 539 MB | Well-rounded |
| EmbeddingGemma 300M | `onnx-community/embeddinggemma-300m-ONNX` | 1230 MB | 100+ langs, 2048-token ctx |

`loadExtractor()` is a lazy singleton cached per (modelId, device). `downloadModel()` pre-warms the browser Cache API without touching the singleton.

### Model Serving

Embedding models are fetched directly from the Hugging Face Hub in the browser (`env.allowLocalModels = false` in `src/utils/model.ts`) — no backend involved. `downloadModel()` pre-warms the browser Cache API; `checkModelCached()` scans CacheStorage for a matching cached response (models are cached under the full HF resolve URL).

R2 is unrelated to models now — it exists solely to serve the two sample-book EPUBs used by the homepage's `SampleAlignmentBanner`, via the `/models/` Worker proxy (`src/server/serve-models.ts`). Those files are git-ignored (`public/models/sample_books/`) and uploaded to R2 with `pnpm upload-models`; the post-build script `scripts/strip-models-from-build.mjs` also strips any stray local model dumps (e.g. from manual testing) out of the Vite output so they never ship with the app.

### Data Flow

1. User drops EPUB/PDF/TXT → `src/components/drop-zone.tsx` + `src/lib/epub.ts` / `src/lib/pdf.ts` / `src/lib/txt.ts` extract metadata and the full file blob → stored in Dexie via `src/store/books.ts`
2. On alignment trigger (`src/components/align-books-form.tsx`): text is extracted on-demand, preprocessed (optional regex rules; furigana stripping for Japanese), split into sentences via `src/lib/sentence-splitter.ts`, embedded via `src/utils/model.ts` in a Web Worker (`src/workers/alignment.worker.ts`)
3. Banded Needleman–Wunsch (`src/lib/banded-nw.ts`) aligns sentence pairs globally
4. `AlignmentRecord` (with full `AlignmentResult` + `AlignmentMeta`) is written to Dexie via `src/store/alignments.ts`
5. Alternatively, alignments can be imported from a TSV via `src/lib/import-tsv.ts`

### State Management

No global state library. Persistent state lives entirely in Dexie (IndexedDB). Components use `useState` / `useLiveQuery` (dexie-react-hooks). The `src/store/` functions are simple async CRUD wrappers around Dexie tables. Reading progress and UI preferences (font size, device, model) are persisted to localStorage via `src/lib/user-settings.ts`.

### Database Schema

- **v1** — `books` table (indexed: `id`, `title`, `type`, `fileName`)
- **v2** — adds `alignments` table (indexed: `id`, `sourceBookId`, `targetBookId`, `createdAt`)

Types: `src/types/book.ts`, `src/types/alignment.ts`.

### Routes

| Path | Component | Purpose |
|---|---|---|
| `/` | `index.tsx` | Homepage — DropZone + AlignBooksForm + SampleAlignmentBanner |
| `/books` | `books.tsx` | Library — DropZone + book grid + delete |
| `/book/$id` | `book.$id.tsx` | Book detail (stats) + paginated book reader |
| `/alignments` | `alignments.tsx` | Alignment list + TSV import |
| `/alignment/$id` | `alignment.$id.tsx` | Alignment viewer (popover + side-by-side) |
| `/about` | `about.tsx` | Feature overview / how it works |
| `/settings` | `settings.tsx` | Model cache management, font size, device preference |

### Key Components

**`PaginatedReader`** (`src/components/paginated-reader.tsx`)
- Shared CSS multi-column paginated reader used by both the book reader and alignment viewer
- `forwardRef` with `PaginatedReaderHandle`: `jumpToParaIdx`, `getPageForParaIdx`, `jumpToPage`, `getTotalPages`
- Progress tracked as cumulative character count; saved/restored on resize via ResizeObserver
- `onPageChange` callback uses a ref pattern to avoid spurious effect re-triggers
- `searchSlot?: ReactNode` prop renders an absolute child (used for `ReaderSearch`)

**`ReaderSearch`** (`src/components/reader-search.tsx`)
- Floating search panel, absolute-positioned inside the reader wrapper
- Two tabs: **Search text** (find + jump to matching paragraph) and **Go to page** (validated number input)
- Closed state: round icon button. Open state: panel with tab bar + content
- Keyboard: Ctrl/Cmd+F (text mode), Ctrl/Cmd+G (page mode), Escape (close), Enter/Shift+Enter (cycle results)
- Callbacks stabilised via `cbRef` to avoid re-registering the global key listener on every render

**`AlignBooksForm`** (`src/components/align-books-form.tsx`)
- Main alignment form; always visible (even before books are uploaded)
- Handles model auto-download when no model is cached, with progress feedback
- Advanced panel: model selector, max sentences, regex preprocessing rules
- Alignment runs in a Web Worker; cancellable via `cancelRef`

**`DropZone`** (`src/components/drop-zone.tsx`)
- react-dropzone wrapper; accepts EPUB/PDF/TXT; calls `addBook()` on drop
- Used on both `/` and `/books`

### Path Alias

`@/*` resolves to `src/*` (configured in `tsconfig.json` and `vite.config.ts`).

### Formatting Conventions

- No semicolons, double quotes, 80-char line width, trailing commas — enforced by `.prettierrc`
- Tailwind class sorting uses `prettier-plugin-tailwindcss` with custom functions `cn` and `cva`
