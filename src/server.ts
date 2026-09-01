import handler from "@tanstack/react-start/server-entry"

import { serveR2Asset } from "./server/serve-r2-assets"

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const assetResponse = await serveR2Asset(request, env.ASSETS)
    if (assetResponse) {
      return assetResponse
    }

    return handler.fetch(request)
  },
}
