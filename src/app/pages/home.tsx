import styles from "./home.module.css";

const EXAMPLES = [
  {
    title: "Minimal Executor",
    href: "/sandbox/demo-executor",
    summary:
      "The smallest end-to-end flow: sync tools, send input, trigger a real executor, and watch the thread update.",
    accent: "sync tool execution",
  },
  {
    title: "Async Countdown",
    href: "/sandbox/async-countdown",
    summary:
      "Starts immediately, finishes later, and posts the delayed result back through the executor webhook.",
    accent: "async executor callback",
  },
  {
    title: "Pinned Tool",
    href: "/sandbox/pinned-tool",
    summary:
      "Shows explicit tool calls with a thread-level pinned tool that stays in place until the user ends or switches it.",
    accent: "explicit tool calls",
  },
];

export const Home = () => (
  <main className={styles.page}>
    <section className={styles.hero}>
      <p className={styles.eyebrow}>familiar</p>
      <h1 className={styles.title}>Examples for the current MVP.</h1>
      <p className={styles.copy}>
        familiar is a conversation layer for executable systems. These hosted
        examples show the product shape without asking you to wire anything up
        first.
      </p>
      <div className={styles.swatches} aria-hidden="true">
        <span className={styles.swatchPrimary} />
        <span className={styles.swatchSecondary} />
        <span className={styles.swatchSoft} />
        <span className={styles.swatchWhite} />
      </div>
    </section>

    <section className={styles.grid}>
      {EXAMPLES.map((example) => (
        <a key={example.href} className={styles.card} href={example.href}>
          <span className={styles.cardTag}>{example.accent}</span>
          <h2 className={styles.cardTitle}>{example.title}</h2>
          <p className={styles.cardCopy}>{example.summary}</p>
          <span className={styles.cardLink}>Open demo</span>
        </a>
      ))}
    </section>
  </main>
);
