import homeStyles from "./pages/home/home.css?url";

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
        content="familiar makes tools and workflows easier to use through conversation."
      />
      <link rel="icon" href="/familiar-mark.svg" type="image/svg+xml" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={homeStyles} />
    </head>
    <body>{children}</body>
  </html>
);
