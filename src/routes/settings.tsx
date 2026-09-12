import { useTheme } from "@/components/theme-provider"
import { useLanguage } from "@/components/language-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { db } from "@/lib/db"
import { getOperationErrorMessage } from "@/lib/operation-diagnostics"
import type { Theme } from "@/lib/theme"
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_GAP_PENALTY,
  DEFAULT_MAX_SENTENCES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  GAP_PENALTY_MAX,
  GAP_PENALTY_MIN,
  getStoredDevice,
  getStoredFontSize,
  getStoredGapPenalty,
  getStoredIncognitoNoticeDismissed,
  getStoredIntroDismissed,
  getStoredMaxSentences,
  getStoredModelId,
  setStoredDevice,
  setStoredFontSize,
  setStoredGapPenalty,
  setStoredIncognitoNoticeDismissed,
  setStoredIntroDismissed,
  setStoredMaxSentences,
  setStoredModelId,
  type DevicePreference,
} from "@/lib/user-settings"
import {
  checkModelCached,
  deleteModelFromCache,
  downloadModel,
} from "@/utils/model"
import { detectWebGPU, MODEL_REGISTRY } from "@/utils/model-registry"
import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

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

interface NumberSettings {
  maxSentences: number
  gapPenalty: number
  fontSize: number
}

function isInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max
}

function parseNumber(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value)
}

const THEME_OPTIONS: {
  value: Theme
  labelKey: string
  icon: React.ElementType
}[] = [
  { value: "light", labelKey: "settings.themeLight", icon: SunIcon },
  { value: "dark", labelKey: "settings.themeDark", icon: MoonIcon },
  { value: "system", labelKey: "settings.themeSystem", icon: DesktopIcon },
]

const DEVICE_OPTIONS: {
  value: DevicePreference
  labelKey: string
  descriptionKey: string
}[] = [
  {
    value: "auto",
    labelKey: "settings.deviceAuto",
    descriptionKey: "settings.deviceAutoDescription",
  },
  {
    value: "webgpu",
    labelKey: "settings.deviceWebgpuLabel",
    descriptionKey: "settings.deviceWebgpuDescription",
  },
  {
    value: "wasm",
    labelKey: "settings.deviceWasmLabel",
    descriptionKey: "settings.deviceWasmDescription",
  },
]

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  )
}

function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { language, ready: languageReady, setLanguage } = useLanguage()
  const { t } = useTranslation()
  const [modelId, setModelId] = useState("")
  const [savedNumberSettings, setSavedNumberSettings] =
    useState<NumberSettings>(() => ({
      maxSentences: getStoredMaxSentences(),
      gapPenalty: getStoredGapPenalty(),
      fontSize: getStoredFontSize(),
    }))
  const [numberDrafts, setNumberDrafts] = useState(() => ({
    maxSentences: String(savedNumberSettings.maxSentences),
    gapPenalty: String(savedNumberSettings.gapPenalty),
    fontSize: String(savedNumberSettings.fontSize),
  }))
  const [confirmClear, setConfirmClear] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [devicePref, setDevicePref] = useState<DevicePreference>(() =>
    getStoredDevice()
  )
  const [webgpuAvailable, setWebgpuAvailable] = useState(false)
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(true)
  const [showIncognitoNotice, setShowIncognitoNotice] = useState(true)

  useEffect(() => {
    setWebgpuAvailable(detectWebGPU())
    setShowWelcomeBanner(!getStoredIntroDismissed())
    setShowIncognitoNotice(!getStoredIncognitoNoticeDismissed())
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

      // Default selection must be a downloaded model — never a
      // non-cached one, and none at all when nothing is cached yet.
      const cached = results.filter((r) => r.cached).map((r) => r.modelId)
      if (cached.length > 0) {
        const stored = getStoredModelId()
        const resolved = cached.includes(stored) ? stored : cached[0]
        setModelId(resolved)
        setStoredModelId(resolved)
      }
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

  const numberSettings: NumberSettings = {
    maxSentences: parseNumber(numberDrafts.maxSentences),
    gapPenalty: parseNumber(numberDrafts.gapPenalty),
    fontSize: parseNumber(numberDrafts.fontSize),
  }

  const numberSettingsAreValid =
    Number.isInteger(numberSettings.maxSentences) &&
    isInRange(numberSettings.maxSentences, 10, 20_000) &&
    isInRange(numberSettings.gapPenalty, GAP_PENALTY_MIN, GAP_PENALTY_MAX) &&
    Number.isInteger(numberSettings.fontSize) &&
    isInRange(numberSettings.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX)

  const numberSettingsHaveChanges =
    numberSettings.maxSentences !== savedNumberSettings.maxSentences ||
    numberSettings.gapPenalty !== savedNumberSettings.gapPenalty ||
    numberSettings.fontSize !== savedNumberSettings.fontSize

  const previewFontSize = isInRange(
    numberSettings.fontSize,
    FONT_SIZE_MIN,
    FONT_SIZE_MAX
  )
    ? numberSettings.fontSize
    : savedNumberSettings.fontSize

  function handleNumberDraftChange(
    setting: keyof NumberSettings,
    value: string
  ) {
    setNumberDrafts((drafts) => ({ ...drafts, [setting]: value }))
  }

  function handleSaveNumberSettings() {
    if (!numberSettingsAreValid) {
      toast.error(t("settings.numberSettingsError"), {
        description: t("settings.numberSettingsRange"),
      })
      return
    }

    const saved = [
      setStoredMaxSentences(numberSettings.maxSentences),
      setStoredGapPenalty(numberSettings.gapPenalty),
      setStoredFontSize(numberSettings.fontSize),
    ].every(Boolean)

    if (!saved) {
      toast.error(t("settings.numberSettingsError"), {
        description: t("settings.numberSettingsStorage"),
      })
      return
    }

    setSavedNumberSettings(numberSettings)
    toast.message(t("settings.numberSettingsSaved"))
  }

  function handleWelcomeBannerToggle() {
    setShowWelcomeBanner((v) => {
      const next = !v
      setStoredIntroDismissed(!next)
      return next
    })
  }

  function handleIncognitoNoticeToggle() {
    setShowIncognitoNotice((v) => {
      const next = !v
      setStoredIncognitoNoticeDismissed(!next)
      return next
    })
  }

  async function handleClearAll() {
    await db.books.clear()
    await db.alignments.clear()
    await db.paragraphExclusions.clear()
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
      // If nothing was selected as the active default yet (e.g. this is
      // the first model ever downloaded), make this one the default.
      if (!modelId) {
        setModelId(id)
        setStoredModelId(id)
      }
    } catch (err) {
      const message = getOperationErrorMessage(err, "Could not download model.")
      setDownloads((prev) => ({
        ...prev,
        [id]: {
          status: "error",
          file: "",
          progress: 0,
          message,
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

    // If the deleted model was the active default, fall back to another
    // cached model, or to no default at all if none remain.
    if (modelId === id) {
      const fallback = MODEL_REGISTRY.find(
        (m) => m.id !== id && downloads[m.id]?.status === "done"
      )
      const nextModelId = fallback?.id ?? ""
      setModelId(nextModelId)
      setStoredModelId(nextModelId)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-8">
      <h1 className="text-2xl font-light tracking-tight">
        {t("settings.title")}
      </h1>

      {/* ── Appearance ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">{t("settings.appearance")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.appearanceDescription")}
        </p>
        <div className="flex flex-wrap gap-2">
          {THEME_OPTIONS.map((opt) => {
            const isSelected = theme === opt.value
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                <Icon className="size-4" />
                {t(opt.labelKey)}
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">
          {t("settings.uiLanguage.heading")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.uiLanguage.description")}
        </p>
        <div
          className="flex flex-wrap gap-2"
          aria-label={t("settings.uiLanguage.heading")}
        >
          <button
            type="button"
            disabled={!languageReady}
            aria-pressed={language === "en"}
            onClick={() => setLanguage("en")}
            className={`rounded-md border px-3 py-2 text-sm transition-colors ${
              language === "en"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            {t("settings.uiLanguage.english")}
          </button>
          <button
            type="button"
            disabled={!languageReady}
            aria-pressed={language === "ja"}
            onClick={() => setLanguage("ja")}
            className={`rounded-md border px-3 py-2 text-sm transition-colors ${
              language === "ja"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            {t("settings.uiLanguage.japanese")}
          </button>
        </div>
      </section>

      {/* ── Model ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">{t("settings.model")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.modelDescription")}
        </p>
        <div className="space-y-2">
          {MODEL_REGISTRY.map((m) => {
            const dl: DownloadState = downloads[m.id] ?? {
              status: "idle",
              file: "",
              progress: 0,
            }
            const isCached = dl.status === "done"
            const isActive = modelId === m.id && isCached

            return (
              <div
                key={m.id}
                className={`rounded-md border p-3 transition-colors ${
                  isActive
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background"
                }`}
              >
                {/* Model header — click to select as active model (only once downloaded) */}
                <button
                  type="button"
                  onClick={() => isCached && handleModelPick(m.id)}
                  disabled={!isCached}
                  className={`w-full text-left ${!isCached ? "cursor-default" : ""}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`text-sm font-medium ${isActive ? "text-primary" : ""}`}
                    >
                      {m.label}
                    </span>
                    {m.recommended && (
                      <span className="rounded bg-primary/15 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                        {t("align.recommended")}
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
                        <>
                          <button
                            type="button"
                            disabled
                            className="cursor-not-allowed rounded border border-border px-2 py-0.5 text-xs text-muted-foreground/40"
                          >
                            {t("settings.downloaded")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(m.id)}
                            className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
                          >
                            {t("settings.delete")}
                          </button>
                        </>
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
                          {t("settings.retry")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownload(m.id)}
                          className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
                        >
                          {t("settings.download")}
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
        <h2 className="text-base font-medium">{t("settings.device")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.deviceDescription")}
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
                title={t(opt.descriptionKey)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : unavailable
                      ? "cursor-not-allowed border-border text-muted-foreground/30"
                      : "border-border bg-background hover:bg-muted"
                }`}
              >
                <span className="block font-medium">{t(opt.labelKey)}</span>
                <span className="block text-xs text-muted-foreground">
                  {unavailable
                    ? t("settings.notAvailable")
                    : t(opt.descriptionKey)}
                </span>
              </button>
            )
          })}
        </div>
        {devicePref === "webgpu" && webgpuAvailable && (
          <p className="text-xs text-muted-foreground">
            {t("settings.webgpuMemoryWarning")}
          </p>
        )}
      </section>

      {/* ── Numeric settings ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-medium">
            {t("settings.alignmentReader")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.alignmentReaderDescription")}
          </p>
        </div>

        <div className="space-y-10 rounded-lg border bg-background p-5">
          <section className="space-y-3">
            <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
              {t("settings.alignmentSectionHeading")}
            </h3>
            <h4 className="text-base font-medium">
              {t("settings.maxSentences")}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t("settings.maxSentencesDescription")}
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={10}
                max={20_000}
                step={500}
                inputMode="numeric"
                aria-label={t("settings.maxSentences")}
                value={numberDrafts.maxSentences}
                onChange={(e) =>
                  handleNumberDraftChange("maxSentences", e.target.value)
                }
                className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
              <span className="text-sm text-muted-foreground">
                {t("settings.maxSentencesUnit", {
                  count: DEFAULT_MAX_SENTENCES.toLocaleString(),
                })}
              </span>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-base font-medium">
              {t("settings.gapPenalty")}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t("settings.gapPenaltyDescription")}
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={GAP_PENALTY_MIN}
                max={GAP_PENALTY_MAX}
                step={0.05}
                inputMode="decimal"
                aria-label={t("settings.gapPenalty")}
                value={numberDrafts.gapPenalty}
                onChange={(e) =>
                  handleNumberDraftChange("gapPenalty", e.target.value)
                }
                className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
              <span className="text-sm text-muted-foreground">
                {t("settings.gapPenaltyDefault", {
                  value: DEFAULT_GAP_PENALTY,
                })}
              </span>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
              {t("settings.readerSectionHeading")}
            </h3>
            <h4 className="text-base font-medium">
              {t("settings.readerFontSize")}
            </h4>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                inputMode="numeric"
                aria-label={t("settings.readerFontSize")}
                value={numberDrafts.fontSize}
                onChange={(e) =>
                  handleNumberDraftChange("fontSize", e.target.value)
                }
                className="w-20 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
              <span className="text-sm text-muted-foreground">
                {t("settings.fontSizeUnit", { value: DEFAULT_FONT_SIZE })}
              </span>
            </div>

            {/* Live preview */}
            <div
              className="rounded-lg border bg-background p-5"
              style={{ fontSize: previewFontSize, lineHeight: 1.75 }}
            >
              <p className="mb-[0.50em]">Ancient temples in Kyoto.</p>
              <p>京都の古い寺院た。</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={!numberSettingsAreValid || !numberSettingsHaveChanges}
                onClick={handleSaveNumberSettings}
              >
                {t("settings.saveChanges")}
              </Button>
              {numberSettingsHaveChanges && numberSettingsAreValid && (
                <p className="text-sm text-muted-foreground">
                  {t("settings.unsavedChanges")}
                </p>
              )}
              {!numberSettingsAreValid && (
                <p className="w-full text-sm text-destructive">
                  {t("settings.numberSettingsRange")}
                </p>
              )}
            </div>
          </section>
        </div>
      </section>

      {/* ── Homepage welcome banner ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">{t("settings.welcomeBanner")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.welcomeBannerDescription")}
        </p>
        <ToggleSwitch
          checked={showWelcomeBanner}
          onChange={handleWelcomeBannerToggle}
          label={t("settings.showWelcomeBanner")}
        />
      </section>

      {/* ── Incognito notice ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">
          {t("settings.incognitoNotice")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.incognitoNoticeDescription")}
        </p>
        <ToggleSwitch
          checked={showIncognitoNotice}
          onChange={handleIncognitoNoticeToggle}
          label={t("settings.showIncognitoNotice")}
        />
      </section>

      {/* ── Data ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">{t("settings.data")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.dataDescription")}
        </p>

        {cleared ? (
          <p className="text-sm text-primary">{t("settings.allDataCleared")}</p>
        ) : confirmClear ? (
          <div className="flex items-center gap-3">
            <span className="text-sm">{t("settings.deleteAll")}</span>
            <Button variant="destructive" size="sm" onClick={handleClearAll}>
              {t("settings.yesDelete")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClear(false)}
            >
              {t("settings.cancel")}
            </Button>
          </div>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmClear(true)}
          >
            {t("settings.clearData")}
          </Button>
        )}
      </section>
    </div>
  )
}
