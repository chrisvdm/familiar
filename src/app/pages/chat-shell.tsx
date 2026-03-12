import { loadChatSession } from "../chat/chat.storage";
import type { ChatMessage } from "../chat/shared";
import styles from "./chat.module.css";
import { ChatClient } from "./chat.client";

const starterPrompts = [
  "Plan a 3-day launch sequence for a new SaaS feature.",
  "Rewrite this into a sharper sales email with a strong CTA.",
  "Summarize customer feedback and suggest product priorities.",
];

type ChatShellProps = {
  chatSessionId: string;
};

export const ChatShell = async ({ chatSessionId }: ChatShellProps) => {
  const session = await loadChatSession(chatSessionId);
  const messages: ChatMessage[] = session.messages;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.badge}>RedwoodSDK x OpenRouter</div>
        <h1 className={styles.title}>Texty AI chat for fast product work.</h1>
        <p className={styles.subtitle}>
          A custom RedwoodSDK app with a server-side OpenRouter integration,
          real-time chat UX, and a focused workspace for prompts that need more
          than a toy demo.
        </p>
        <div className={styles.promptStrip}>
          {starterPrompts.map((prompt) => (
            <span key={prompt} className={styles.promptChip}>
              {prompt}
            </span>
          ))}
        </div>
      </section>

      <ChatClient starterPrompts={starterPrompts} initialMessages={messages} />
    </main>
  );
};
