import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, Script, ViteClient } from 'vite-ssr-components/hono'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Near-real-time Indonesian volcano monitoring with Himawari context and indicative wind guidance."
        />
        <title>Himawari Volcano Monitor</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
        <ViteClient />
        <Link href="/src/style.css" rel="stylesheet" />
        <Script src="/src/client.ts" />
      </head>
      <body>{children}</body>
    </html>
  )
})
