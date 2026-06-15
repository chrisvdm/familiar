import styles from "./styles/index.css?url";

export const Document: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>familiar</title>
      <meta
        name="description"
        content="Your scripts, but you can text them. familiar adds reach, memory, and routing to your existing tools."
      />
      <meta property="og:title" content="familiar" />
      <meta
        property="og:description"
        content="Your scripts, but you can text them. familiar adds reach, memory, and routing to your existing tools."
      />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <link rel="modulepreload" href="/src/client.tsx" />
      <link rel="stylesheet" href={styles} />
    </head>
    <body>
      {children}
      <script>import("/src/client.tsx")</script>
    </body>
  </html>
);
