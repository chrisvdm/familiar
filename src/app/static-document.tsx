import styles from "./styles/index.css?url";

export const StaticDocument: React.FC<{ children: React.ReactNode }> = ({
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
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={styles} />
    </head>
    <body>{children}</body>
  </html>
);
