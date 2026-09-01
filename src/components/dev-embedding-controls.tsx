import { useState } from "react"

const STAND_IN_FIXTURES = ["i-am-a-cat-ja-en.json", "short-alignment.json"]

export function DevEmbeddingControls() {
  const [usePrecomputed, setUsePrecomputed] = useState(false)
  const [fixtureFile, setFixtureFile] = useState(STAND_IN_FIXTURES[0])

  return (
    <div className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2">
        <input
          id="use-precomputed-embeddings"
          type="checkbox"
          checked={usePrecomputed}
          onChange={(event) => setUsePrecomputed(event.target.checked)}
          className="size-4 accent-primary"
        />
        <label
          htmlFor="use-precomputed-embeddings"
          className="text-sm font-medium"
        >
          Use precomputed embeddings
        </label>
        <span className="rounded border border-amber-500/40 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
          Development only
        </span>
      </div>

      <label
        htmlFor="precomputed-embedding-fixture"
        className="mt-3 block text-sm text-muted-foreground"
      >
        Fixture file
      </label>
      <select
        id="precomputed-embedding-fixture"
        value={fixtureFile}
        onChange={(event) => setFixtureFile(event.target.value)}
        disabled={!usePrecomputed}
        className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {STAND_IN_FIXTURES.map((file) => (
          <option key={file} value={file}>
            {file}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-muted-foreground">
        This control does not change an alignment yet.
      </p>
    </div>
  )
}
