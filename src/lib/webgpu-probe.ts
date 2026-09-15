export type WebGPUProbeFailure =
  | "api_unavailable"
  | "adapter_unavailable"
  | "device_unavailable"

export interface WebGPUProbeResult {
  available: boolean
  failure?: WebGPUProbeFailure
  errorName?: string
  errorMessage?: string
}

interface ProbeDevice {
  destroy?: () => void
}

interface ProbeAdapter {
  requestDevice: () => Promise<ProbeDevice>
}

interface ProbeNavigator {
  gpu?: {
    requestAdapter: () => Promise<ProbeAdapter | null>
  }
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message }
  }

  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    "message" in error &&
    typeof error.name === "string" &&
    typeof error.message === "string"
  ) {
    return { errorName: error.name, errorMessage: error.message }
  }

  return { errorName: "Error", errorMessage: "Unable to create a GPU device." }
}

/**
 * Test WebGPU in the context that will run inference. navigator.gpu existing
 * alone is not enough: Chromium can expose it while refusing a GPU adapter.
 */
export async function probeWebGPU(
  target: ProbeNavigator = navigator
): Promise<WebGPUProbeResult> {
  if (!target.gpu) {
    return { available: false, failure: "api_unavailable" }
  }

  let adapter: ProbeAdapter | null
  try {
    adapter = await target.gpu.requestAdapter()
  } catch (error) {
    return {
      available: false,
      failure: "adapter_unavailable",
      ...errorDetails(error),
    }
  }

  if (!adapter) {
    return { available: false, failure: "adapter_unavailable" }
  }

  try {
    const device = await adapter.requestDevice()
    device.destroy?.()
    return { available: true }
  } catch (error) {
    return {
      available: false,
      failure: "device_unavailable",
      ...errorDetails(error),
    }
  }
}
