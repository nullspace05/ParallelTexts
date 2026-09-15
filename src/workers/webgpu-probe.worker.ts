import { probeWebGPU, type WebGPUProbeResult } from "@/lib/webgpu-probe"

export interface WebGPUProbeWorkerOutput {
  type: "webgpu-probe-result"
  result: WebGPUProbeResult
}

self.onmessage = async () => {
  const result = await probeWebGPU()
  self.postMessage({
    type: "webgpu-probe-result",
    result,
  } satisfies WebGPUProbeWorkerOutput)
}
