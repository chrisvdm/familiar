"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import { resetChatSession, sendChatMessage } from "../chat/chat.service";
import type { ChatMessage } from "../chat/shared";
import styles from "./chat.module.css";

type ChatClientProps = {
  starterPrompts: string[];
  initialMessages: ChatMessage[];
};

export const ChatClient = ({
  starterPrompts,
  initialMessages,
}: ChatClientProps) => {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>("openai/gpt-4o-mini");
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const container = logRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isPending]);

  const sendMessage = (rawMessage: string) => {
    const content = rawMessage.trim();

    if (!content || isPending) {
      return;
    }

    setDraft("");
    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const result = await sendChatMessage(content);
        setModel(result.model);
        setMessages(result.session.messages);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Something went wrong while generating a reply.";

        setError(message);
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

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(draft);
    }
  };

  const clearConversation = () => {
    if (isPending) {
      return;
    }

    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const nextSession = await resetChatSession();
        setMessages(nextSession.messages);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to reset the conversation.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  return (
    <section className={styles.shell}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarPanel}>
          <p className={styles.sidebarLabel}>Status</p>
          <p className={styles.sidebarValue}>
            {isPending ? "Saving and generating..." : "Persisted in session"}
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
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.resetButton}
              onClick={clearConversation}
              disabled={isPending}
            >
              Clear thread
            </button>
            <div className={styles.liveDot} aria-hidden="true" />
          </div>
        </div>

        <div className={styles.chatLog} ref={logRef}>
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
            onKeyDown={onKeyDown}
            placeholder="Ask for a launch plan, rewrite, code review, or customer insight summary."
            rows={5}
            disabled={isPending}
          />

          <div className={styles.composerFooter}>
            <p className={styles.helperText}>
              Full chat history survives refresh. Prompt context currently uses
              the last 3 exchanges.
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
