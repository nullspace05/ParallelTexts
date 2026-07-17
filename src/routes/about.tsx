import { GITHUB_REPO_URL } from "@/lib/site-links"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  BookOpen,
  Brain,
  Download,
  FileText,
  GitMerge,
  Users,
} from "@phosphor-icons/react"

export const Route = createFileRoute("/about")({ component: AboutPage })

const LICENSE_URL = `${GITHUB_REPO_URL}/blob/main/LICENSE`

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
          <Icon className="size-4 text-primary" />
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="space-y-2 pl-10 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-10">
      {/* Hero */}
      <div className="space-y-3">
        <h1 className="text-2xl font-light tracking-tight">
          About ParallelTexts
        </h1>
        <p className="leading-relaxed text-muted-foreground">
          A free, fully in-browser tool for creating parallel texts from two
          books in different languages — no accounts, no uploads, no Python.
        </p>
      </div>

      <div className="space-y-8">
        <Section icon={BookOpen} title="What is it?">
          <p>
            ParallelTexts takes two versions of the same book — one in your
            native language, one in the language you are learning — and
            automatically aligns their sentences so you can read them side by
            side, sentence by sentence.
          </p>
          <p>
            The output is a{" "}
            <strong className="text-foreground">parallel corpus</strong>: a
            structured list of sentence pairs where each source sentence is
            matched to its translation. You can read it directly in the browser
            as a paginated ebook-style view, or export it for use in other
            tools.
          </p>
        </Section>

        <Section icon={Users} title="Who is it for?">
          <ul className="list-none space-y-1.5">
            <li>
              <span className="font-medium text-foreground">
                Language learners
              </span>{" "}
              who want to read a novel in a foreign language with a trusted
              translation always one tap away.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Linguists and translators
              </span>{" "}
              who need to build small parallel corpora quickly, without setting
              up a pipeline.
            </li>
            <li>
              <span className="font-medium text-foreground">Researchers</span>{" "}
              looking for a lightweight, reproducible alignment tool that runs
              entirely on their own machine.
            </li>
          </ul>
          <p className="mt-2">
            The tool is designed to be approachable to anyone — no command-line
            knowledge required.
          </p>
        </Section>

        <Section icon={Brain} title="How does the alignment work?">
          <p>
            Under the hood, ParallelTexts runs a three-stage ML pipeline —
            entirely inside your browser using WebAssembly:
          </p>
          <ol className="mt-2 list-none space-y-2">
            <li>
              <span className="font-medium text-foreground">
                1. Sentence splitting
              </span>{" "}
              — Each book is split into individual sentences.
            </li>
            <li>
              <span className="font-medium text-foreground">
                2. Multilingual embedding
              </span>{" "}
              — Every sentence is converted to a vector (a list of numbers that
              captures its meaning) using a multilingual AI model. Because the
              model understands 50+ languages at once, semantically equivalent
              sentences in different languages end up with similar vectors.
            </li>
            <li>
              <span className="font-medium text-foreground">
                3. Needleman–Wunsch alignment
              </span>{" "}
              — A dynamic-programming algorithm (the same family used in DNA
              sequence alignment) finds the globally optimal pairing of source
              and target sentences based on their vector similarity.
            </li>
          </ol>
          <p className="mt-2">
            The result is a list of aligned pairs tagged as 1:1 matches, or
            source/target gaps where no counterpart was found.
          </p>
        </Section>

        <Section icon={Download} title="The model download">
          <p>
            The AI model (~500 MB–1.1 GB depending on which you choose) is
            downloaded once from our servers and then cached permanently in your
            browser. Subsequent alignments reuse the cached version — no
            re-download needed.
          </p>
          <p>
            Alignment is compute-intensive. A dedicated GPU is highly
            recommended — it can be 10–20× faster than running on CPU alone.
            Browsers with WebGPU support (Chrome 113+, Edge) will use your GPU
            automatically; others fall back to WebAssembly on the CPU.
          </p>
          <p>
            You can manage which models are cached from the{" "}
            <Link
              to="/settings"
              className="text-primary underline-offset-4 hover:underline"
            >
              Settings page
            </Link>
            .
          </p>
        </Section>

        <Section icon={FileText} title="Supported file formats">
          <ul className="list-none space-y-1">
            <li>
              <span className="font-medium text-foreground">EPUB</span> — full
              support including cover art and chapter structure.
            </li>
            <li>
              <span className="font-medium text-foreground">PDF</span> — text
              extraction via PDF.js (quality depends on the PDF).
            </li>
            <li>
              <span className="font-medium text-foreground">TXT</span> — plain
              text files.
            </li>
          </ul>
          <p className="mt-1">
            Japanese EPUBs are preprocessed to strip furigana before alignment
            so that phonetic readings do not interfere with the embeddings.
          </p>
        </Section>

        <Section icon={GitMerge} title="Reading your alignment">
          <p>After alignment completes you get two reading modes:</p>
          <ul className="mt-1 list-none space-y-1.5">
            <li>
              <span className="font-medium text-foreground">Popover view</span>{" "}
              — Read the source text as a paginated ebook. Tap any sentence to
              see its aligned translation in a popover.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Side-by-side view
              </span>{" "}
              — Both languages displayed in parallel columns, every sentence
              pair on the same row.
            </li>
          </ul>
          <p className="mt-2">
            You can also export any alignment in two formats:
          </p>
          <ul className="mt-1 list-none space-y-1.5">
            <li>
              <span className="font-medium text-foreground">EPUB</span> — a
              fully readable parallel ebook. Source sentences are shown by
              default; click any entry to reveal its translation. Images from
              the original books are preserved. The EPUB also embeds a hidden
              manifest so it can be imported back into ParallelTexts with the
              full alignment intact (see below).
            </li>
            <li>
              <span className="font-medium text-foreground">TSV</span> — a
              tab-separated file with one sentence pair per row and an optional
              confidence score in the third column. Gap rows are preserved with
              an empty cell on the missing side. Any 2- or 3-column TSV works on
              import — not just files from ParallelTexts.
            </li>
          </ul>
          <p className="mt-2">
            Both formats can be{" "}
            <span className="font-medium text-foreground">imported back</span>{" "}
            into ParallelTexts from the{" "}
            <Link
              to="/alignments"
              className="text-primary underline-offset-4 hover:underline"
            >
              Alignments page
            </Link>
            . Importing a ParallelTexts-exported EPUB restores the alignment
            exactly — pairs, images, and metadata — with no need to re-run the
            AI model. Importing the same EPUB as a{" "}
            <span className="font-medium text-foreground">book</span> (on the{" "}
            <Link
              to="/books"
              className="text-primary underline-offset-4 hover:underline"
            >
              Books page
            </Link>
            ) shows only the source text, making it usable as a standalone
            foreign-language book.
          </p>
        </Section>
      </div>

      {/* Back link */}
      <div className="border-t pt-6">
        <Link
          to="/"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to home
        </Link>
      </div>

      {/* Footer credit */}
      <div className="text-center text-xs text-muted-foreground">
        created by{" "}
        <a
          href="https://nullspace.nz"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4 hover:opacity-80"
        >
          nullspace
        </a>{" "}
        with <span title="∅">∅</span>
        {" · "}
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4 hover:opacity-80"
        >
          Source on GitHub
        </a>
        {" · "}
        <a
          href={LICENSE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4 hover:opacity-80"
        >
          BSD-3-Clause
        </a>
      </div>
    </div>
  )
}
