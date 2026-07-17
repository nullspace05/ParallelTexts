import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_MAX_SENTENCES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  type DevicePreference,
  getStoredDevice,
  getStoredFontSize,
  getStoredMaxSentences,
  getStoredModelId,
  setStoredDevice,
  setStoredFontSize,
  setStoredMaxSentences,
  setStoredModelId,
} from "@/lib/user-settings"
import {
  checkModelCached,
  deleteModelFromCache,
  detectWebGPU,
  downloadModel,
  MODEL_REGISTRY,
} from "@/utils/model"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})

type DownloadStatus = "idle" | "downloading" | "done" | "error"

interface DownloadState {
  status: DownloadStatus
  file: string
  progress: number
  message?: string
}

const DEVICE_OPTIONS: {
  value: DevicePreference
  label: string
  description: string
}[] = [
  {
    value: "auto",
    label: "Auto",
    description: "WebGPU if available, WASM otherwise",
  },
  {
    value: "webgpu",
    label: "WebGPU",
    description: "GPU — fast, but requires VRAM headroom",
  },
  {
    value: "wasm",
    label: "WASM",
    description: "CPU — always works, uses system RAM",
  },
]

function SettingsPage() {
  const [modelId, setModelId] = useState(() => getStoredModelId())
  const [maxSentences, setMaxSentences] = useState(() =>
    getStoredMaxSentences()
  )
  const [fontSize, setFontSize] = useState(() => getStoredFontSize())
  const [confirmClear, setConfirmClear] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [devicePref, setDevicePref] = useState<DevicePreference>(() =>
    getStoredDevice()
  )
  const [webgpuAvailable, setWebgpuAvailable] = useState(false)

  useEffect(() => {
    setWebgpuAvailable(detectWebGPU())
  }, [])

  // Download state keyed by modelId.
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({})

  // On mount: probe every model for local/cached presence.
  useEffect(() => {
    ;(async () => {
      const results = await Promise.all(
        MODEL_REGISTRY.map(async (m) => ({
          modelId: m.id,
          cached: await checkModelCached(m.id),
        }))
      )

      setDownloads((prev) => {
        const next = { ...prev }
        for (const r of results) {
          if (r.cached)
            next[r.modelId] = { status: "done", file: "", progress: 100 }
        }
        return next
      })
    })()
  }, [])

  function handleDevicePref(d: DevicePreference) {
    setDevicePref(d)
    setStoredDevice(d)
  }

  function handleModelPick(id: string) {
    setModelId(id)
    setStoredModelId(id)
  }

  function handleMaxSentencesChange(n: number) {
    setMaxSentences(n)
    setStoredMaxSentences(n)
  }

  async function handleClearAll() {
    await db.books.clear()
    await db.alignments.clear()
    setConfirmClear(false)
    setCleared(true)
  }

  async function handleDownload(id: string) {
    setDownloads((prev) => ({
      ...prev,
      [id]: { status: "downloading", file: "", progress: 0 },
    }))
    try {
      await downloadModel(id, "auto", (info) => {
        if (info.status === "progress") {
          setDownloads((prev) => ({
            ...prev,
            [id]: {
              status: "downloading",
              file: info.file ?? "",
              progress: Math.round(info.progress ?? 0),
            },
          }))
        }
      })
      setDownloads((prev) => ({
        ...prev,
        [id]: { status: "done", file: "", progress: 100 },
      }))
    } catch (err) {
      setDownloads((prev) => ({
        ...prev,
        [id]: {
          status: "error",
          file: "",
          progress: 0,
          message: String(err),
        },
      }))
    }
  }

  async function handleDelete(id: string) {
    await deleteModelFromCache(id)
    setDownloads((prev) => ({
      ...prev,
      [id]: { status: "idle", file: "", progress: 0 },
    }))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-8">
      <h1 className="text-2xl font-light tracking-tight">Settings</h1>

      {/* ── Model ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">Embedding model</h2>
        <p className="text-sm text-muted-foreground">
          Select the model used when aligning books. Download it to avoid
          fetching from the network during alignment.
        </p>
        <div className="space-y-2">
          {MODEL_REGISTRY.map((m) => {
            const isActive = modelId === m.id
            const dl: DownloadState = downloads[m.id] ?? {
              status: "idle",
              file: "",
              progress: 0,
            }

            return (
              <div
                key={m.id}
                className={`rounded-md border p-3 transition-colors ${
                  isActive
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background"
                }`}
              >
                {/* Model header — click to select as active model */}
                <button
                  type="button"
                  onClick={() => handleModelPick(m.id)}
                  className="w-full text-left"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`text-sm font-medium ${isActive ? "text-primary" : ""}`}
                    >
                      {m.label}
                    </span>
                    {m.recommended && (
                      <span className="rounded bg-primary/15 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                        Recommended
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {m.description}
                  </span>
                </button>

                {/* Download row */}
                <div className="mt-2 border-t border-border/50 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="w-20 font-mono text-xs text-muted-foreground/60">
                      ~{m.sizeMb} MB
                    </span>

                    <div className="flex flex-1 items-center gap-1">
                      {dl.status === "done" ? (
                        import.meta.env.DEV ? (
                          <span className="text-xs text-muted-foreground">
                            On disk
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled
                              className="cursor-not-allowed rounded border border-border px-2 py-0.5 text-xs text-muted-foreground/40"
                            >
                              Downloaded
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(m.id)}
                              className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
                            >
                              Delete
                            </button>
                          </>
                        )
                      ) : dl.status === "downloading" ? (
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {dl.progress}%
                        </span>
                      ) : dl.status === "error" ? (
                        <button
                          type="button"
                          onClick={() => handleDownload(m.id)}
                          className="rounded border border-destructive px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10"
                        >
                          Retry
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownload(m.id)}
                          className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
                        >
                          Download
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {dl.status === "downloading" && (
                    <>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all duration-200"
                          style={{ width: `${dl.progress}%` }}
                        />
                      </div>
                      {dl.file && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
                          {dl.file}
                        </p>
                      )}
                    </>
                  )}

                  {/* Error message */}
                  {dl.status === "error" && dl.message && (
                    <p className="mt-0.5 text-xs text-destructive">
                      {dl.message}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Inference device ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">Inference device</h2>
        <p className="text-sm text-muted-foreground">
          Where the embedding model runs. WebGPU is fastest but needs enough GPU
          VRAM — switch to WASM if you hit memory errors with large models.
        </p>
        <div className="flex flex-wrap gap-2">
          {DEVICE_OPTIONS.map((opt) => {
            const unavailable = opt.value === "webgpu" && !webgpuAvailable
            const isSelected = devicePref === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                disabled={unavailable}
                onClick={() => !unavailable && handleDevicePref(opt.value)}
                title={opt.description}
                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : unavailable
                      ? "cursor-not-allowed border-border text-muted-foreground/30"
                      : "border-border bg-background hover:bg-muted"
                }`}
              >
                <span className="block font-medium">{opt.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {unavailable
                    ? "not available in this browser"
                    : opt.description}
                </span>
              </button>
            )
          })}
        </div>
        {devicePref === "webgpu" && webgpuAvailable && (
          <p className="text-xs text-muted-foreground">
            If you see "bad_alloc" or memory errors, switch to WASM or choose a
            smaller model.
          </p>
        )}
      </section>

      {/* ── Max sentences ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">Max sentences per book</h2>
        <p className="text-sm text-muted-foreground">
          Sentences beyond this limit are truncated before alignment. Higher
          values use more memory and take longer.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={10}
            max={20_000}
            step={500}
            value={maxSentences}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n) && n > 0) handleMaxSentencesChange(n)
            }}
            className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm"
          />
          <span className="text-sm text-muted-foreground">
            sentences (default: {DEFAULT_MAX_SENTENCES.toLocaleString()})
          </span>
        </div>
      </section>

      {/* ── Reader font size ── */}
      <section className="space-y-4">
        <h2 className="text-base font-medium">Reader font size</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={1}
            value={fontSize}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value))
              if (
                Number.isInteger(n) &&
                n >= FONT_SIZE_MIN &&
                n <= FONT_SIZE_MAX
              ) {
                setFontSize(n)
                setStoredFontSize(n)
              }
            }}
            className="w-20 rounded-md border bg-background px-2 py-1.5 text-sm"
          />
          <span className="text-sm text-muted-foreground">
            px (default: {DEFAULT_FONT_SIZE})
          </span>
        </div>

        {/* Live preview */}
        <div
          className="rounded-lg border bg-background p-5"
          style={{ fontSize, lineHeight: 1.75 }}
        >
          <p className="mb-[0.50em]">Ancient temples in Kyoto.</p>
          <p>京都の古い寺院た。</p>
        </div>
      </section>

      {/* ── Data ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">Data</h2>
        <p className="text-sm text-muted-foreground">
          All books and alignments are stored locally in your browser. This
          action cannot be undone.
        </p>

        {cleared ? (
          <p className="text-sm text-primary">All data cleared.</p>
        ) : confirmClear ? (
          <div className="flex items-center gap-3">
            <span className="text-sm">Delete all books and alignments?</span>
            <Button variant="destructive" size="sm" onClick={handleClearAll}>
              Yes, delete
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmClear(true)}
          >
            Clear all data
          </Button>
        )}
      </section>
    </div>
  )
}
