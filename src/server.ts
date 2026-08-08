import handler from "@tanstack/react-start/server-entry"

import { serveModelFromR2 } from "./server/serve-models"

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const modelResponse = await serveModelFromR2(request, env.MODELS)
    if (modelResponse) {
      return modelResponse
    }

    return handler.fetch(request)
  },
}
