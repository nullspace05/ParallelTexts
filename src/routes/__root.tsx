import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

import { Header } from "@/components/header"
import { PostHogProvider } from "@posthog/react"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        name: "description",
        content:
          "Parallel Texts is a multilingual sentence alignment tool that runs entirely in the browser. The goal is to make it easy for non-technical people to create their own parallel corpora — no server-side processing, no command line, no Python notebooks.",
      },
      {
        title: "Parallel Texts ||",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/png",
        href: "/favicon-96x96.png",
        sizes: "96x96",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "shortcut icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "manifest",
        href: "/site.webmanifest",
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

const options = {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  defaults: "2025-11-30",
} as const

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider
      apiKey={import.meta.env.VITE_POSTHOG_PROJECT_TOKEN}
      options={options}
    >
      {" "}
      <html lang="en">
        <head>
          <HeadContent />
        </head>
        <body>
          <Header />
          <main className="flex-1">{children}</main>
          {/* <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        /> */}
          <Scripts />
        </body>
      </html>
    </PostHogProvider>
  )
}
