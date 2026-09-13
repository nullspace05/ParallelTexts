import handler from "@tanstack/react-start/server-entry"

import { serveR2Asset } from "./server/serve-r2-assets"

function applyCountryLanguage(request: Request, response: Response): Response {
  if (
    request.cf?.country !== "JP" ||
    !response.headers.get("content-type")?.includes("text/html")
  ) {
    return response
  }

  return new HTMLRewriter()
    .on("html", {
      element(element) {
        element.setAttribute("lang", "ja")
      },
    })
    .transform(response)
}

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

    return applyCountryLanguage(request, await handler.fetch(request))
  },
}
