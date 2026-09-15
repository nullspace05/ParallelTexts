import { describe, expect, it } from "vitest"
import { probeWebGPU } from "./webgpu-probe"

describe("probeWebGPU", () => {
  it("reports a missing WebGPU API", async () => {
    await expect(probeWebGPU({})).resolves.toEqual({
      available: false,
      failure: "api_unavailable",
    })
  })

  it("reports an unavailable adapter", async () => {
    await expect(
      probeWebGPU({ gpu: { requestAdapter: async () => null } })
    ).resolves.toEqual({
      available: false,
      failure: "adapter_unavailable",
    })
  })

  it("captures an adapter error", async () => {
    await expect(
      probeWebGPU({
        gpu: {
          requestAdapter: async () => {
            throw new Error("GPU process is disabled")
          },
        },
      })
    ).resolves.toEqual({
      available: false,
      failure: "adapter_unavailable",
      errorName: "Error",
      errorMessage: "GPU process is disabled",
    })
  })

  it("destroys a successfully created test device", async () => {
    let destroyed = false

    await expect(
      probeWebGPU({
        gpu: {
          requestAdapter: async () => ({
            requestDevice: async () => ({
              destroy: () => {
                destroyed = true
              },
            }),
          }),
        },
      })
    ).resolves.toEqual({ available: true })

    expect(destroyed).toBe(true)
  })

  it("captures a device creation error", async () => {
    await expect(
      probeWebGPU({
        gpu: {
          requestAdapter: async () => ({
            requestDevice: async () => {
              throw new DOMException("Device lost", "OperationError")
            },
          }),
        },
      })
    ).resolves.toEqual({
      available: false,
      failure: "device_unavailable",
      errorName: "OperationError",
      errorMessage: "Device lost",
    })
  })
})
