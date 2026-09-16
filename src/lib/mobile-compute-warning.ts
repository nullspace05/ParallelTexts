const CONSENTED_SIZE_KEY = "pt:mobile-compute-consented-size-mb"

interface MobileWindow {
  innerHeight: number
  innerWidth: number
  matchMedia?: (query: string) => { matches: boolean }
}

function getConsentedSize(): number {
  try {
    const size = Number(sessionStorage.getItem(CONSENTED_SIZE_KEY))
    return Number.isFinite(size) && size > 0 ? size : 0
  } catch {
    return 0
  }
}

/** Treat a coarse-pointer viewport narrower than a tablet as phone-like. */
export function isPhoneLikeDevice(target: MobileWindow = window): boolean {
  return (
    target.matchMedia?.("(pointer: coarse)").matches === true &&
    Math.min(target.innerWidth, target.innerHeight) < 768
  )
}

export function needsMobileComputeWarning(sizeMb: number): boolean {
  return isPhoneLikeDevice() && getConsentedSize() < sizeMb
}

/** Alignment can be expensive even when its model is already cached. */
export function needsMobileAlignmentWarning(): boolean {
  return isPhoneLikeDevice()
}

export function rememberMobileComputeConsent(sizeMb: number): void {
  try {
    const current = getConsentedSize()
    sessionStorage.setItem(
      CONSENTED_SIZE_KEY,
      String(Math.max(current, sizeMb))
    )
  } catch {}
}
