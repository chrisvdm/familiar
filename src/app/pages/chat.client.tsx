"use client";

import { startTransition, useState } from "react";

import { generateReply, type ChatMessageInput } from "./chat.actions";
import styles from "./chat.module.css";

type ChatClientProps = {
  starterPrompts: string[];
};

type ChatMessage = ChatMessageInput & {
  id: string;
};

const initialMessages: ChatMessage[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    content:
      "Ask for product strategy, copy rewrites, code help, or research summaries. I’ll answer through OpenRouter.",
  },
];

const createMessage = (
  role: ChatMessage["role"],
  content: string,
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
});

export const ChatClient = ({ starterPrompts }: ChatClientProps) => {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>("openai/gpt-4o-mini");

  const sendMessage = (rawMessage: string) => {
    const content = rawMessage.trim();

    if (!content || isPending) {
      return;
    }

    const nextUserMessage = createMessage("user", content);
    const nextHistory = [...messages, nextUserMessage];

    setDraft("");
    setError(null);
    setIsPending(true);
    setMessages(nextHistory);

    startTransition(async () => {
      try {
        const result = await generateReply(
          nextHistory.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
        );

        setModel(result.model);
        setMessages((current) => [
          ...current,
          createMessage("assistant", result.content),
        ]);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Something went wrong while generating a reply.";

        setError(message);
        setMessages((current) => current.filter((message) => message.id !== nextUserMessage.id));
        setDraft(content);
      } finally {
        setIsPending(false);
      }
    });
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage(draft);
  };

  return (
    <section className={styles.shell}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarPanel}>
          <p className={styles.sidebarLabel}>Status</p>
          <p className={styles.sidebarValue}>
            {isPending ? "Generating response..." : "Ready"}
          </p>
        </div>
        <div className={styles.sidebarPanel}>
          <p className={styles.sidebarLabel}>Model</p>
          <p className={styles.sidebarValue}>{model}</p>
        </div>
        <div className={styles.sidebarPanel}>
          <p className={styles.sidebarLabel}>Quick starts</p>
          <div className={styles.quickStarts}>
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className={styles.quickStart}
                onClick={() => sendMessage(prompt)}
                disabled={isPending}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.chatFrame}>
        <div className={styles.chatHeader}>
          <div>
            <p className={styles.eyebrow}>Custom AI Workspace</p>
            <h2 className={styles.chatTitle}>Conversation</h2>
          </div>
          <div className={styles.liveDot} aria-hidden="true" />
        </div>

        <div className={styles.chatLog}>
          {messages.map((message) => (
            <article
              key={message.id}
              className={
                message.role === "user" ? styles.userMessage : styles.assistantMessage
              }
            >
              <p className={styles.messageRole}>{message.role}</p>
              <p className={styles.messageBody}>{message.content}</p>
            </article>
          ))}

          {isPending ? (
            <article className={styles.assistantMessage}>
              <p className={styles.messageRole}>assistant</p>
              <p className={styles.messageBody}>Thinking through the request...</p>
            </article>
          ) : null}
        </div>

        <form className={styles.composer} onSubmit={onSubmit}>
          <label className={styles.composerLabel} htmlFor="message">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            className={styles.textarea}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask for a launch plan, rewrite, code review, or customer insight summary."
            rows={5}
            disabled={isPending}
          />

          <div className={styles.composerFooter}>
            <p className={styles.helperText}>
              Server requests go through RedwoodSDK server functions and call
              OpenRouter from the worker.
            </p>
            <button className={styles.submitButton} type="submit" disabled={isPending}>
              {isPending ? "Working..." : "Send"}
            </button>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </div>
    </section>
  );
};
