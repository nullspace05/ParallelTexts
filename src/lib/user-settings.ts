import { DEFAULT_MODEL_ID } from "@/utils/model"

export type DevicePreference = "auto" | "webgpu" | "wasm"

const KEY_MODEL_ID = "pt:modelId"
const KEY_MAX_SENTENCES = "pt:maxSentences"
const KEY_FONT_SIZE = "pt:fontSize"

export const DEFAULT_MAX_SENTENCES = 10_000
export const DEFAULT_FONT_SIZE = 18
export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 32

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

export function getStoredModelId(): string {
  return safeGet(KEY_MODEL_ID) ?? DEFAULT_MODEL_ID
}

export function setStoredModelId(id: string): void {
  safeSet(KEY_MODEL_ID, id)
}

export function getStoredMaxSentences(): number {
  const v = safeGet(KEY_MAX_SENTENCES)
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_SENTENCES
}

export function setStoredMaxSentences(n: number): void {
  safeSet(KEY_MAX_SENTENCES, String(n))
}

export function getStoredFontSize(): number {
  const v = safeGet(KEY_FONT_SIZE)
  const n = v ? Number(v) : NaN
  return Number.isInteger(n) && n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX
    ? n
    : DEFAULT_FONT_SIZE
}

export function setStoredFontSize(n: number): void {
  safeSet(KEY_FONT_SIZE, String(n))
}

const KEY_DEVICE = "pt:device"

export function getStoredDevice(): DevicePreference {
  const v = safeGet(KEY_DEVICE)
  if (v === "webgpu" || v === "wasm") return v
  return "auto"
}

export function setStoredDevice(d: DevicePreference): void {
  safeSet(KEY_DEVICE, d)
}

export type ImageMode = "source" | "target" | "both" | "none"

const KEY_IMAGE_MODE = "pt:imageMode"

export function getStoredImageMode(): ImageMode {
  const v = safeGet(KEY_IMAGE_MODE)
  if (v === "target" || v === "both" || v === "none") return v
  return "source"
}

export function setStoredImageMode(m: ImageMode): void {
  safeSet(KEY_IMAGE_MODE, m)
}

const KEY_LINE_NUMBERS = "pt:lineNumbers"

export function getStoredLineNumbers(): boolean {
  return safeGet(KEY_LINE_NUMBERS) === "1"
}

export function setStoredLineNumbers(enabled: boolean): void {
  safeSet(KEY_LINE_NUMBERS, enabled ? "1" : "0")
}

const KEY_SHOW_EQUIVALENCE = "pt:showEquivalence"

export function getStoredShowEquivalence(): boolean {
  return safeGet(KEY_SHOW_EQUIVALENCE) === "1"
}

export function setStoredShowEquivalence(enabled: boolean): void {
  safeSet(KEY_SHOW_EQUIVALENCE, enabled ? "1" : "0")
}
