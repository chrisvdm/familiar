"use client";

import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createChatThread,
  handleConversationInput,
  selectChatThread,
  setChatModel,
} from "../chat/chat.service";
import { parseConversationInput } from "../chat/conversation.engine";
import type { ChatMessage, ChatThreadSummary } from "../chat/shared";
import styles from "./sandbox-messenger.module.css";

type SandboxMessengerClientProps = {
  activeThreadId: string;
  initialMessages: ChatMessage[];
  initialThreads: ChatThreadSummary[];
  initialModel: string;
};

const AVAILABLE_MODELS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1",
  "anthropic/claude-3.7-sonnet",
  "google/gemini-2.5-flash",
];

const formatTime = (timestamp: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

const createClientNotice = (content: string): ChatMessage => ({
  id: `sandbox-notice-${crypto.randomUUID()}`,
  role: "assistant",
  content,
  createdAt: new Date().toISOString(),
});

const renderWhatsappInline = (content: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*[^*]+\*)|(_[^_]+_)|(~[^~]+~)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith("`")) {
      nodes.push(
        <code key={`wa-code-${match.index}`} className={styles.inlineCode}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <strong key={`wa-strong-${match.index}`}>{token.slice(1, -1)}</strong>,
      );
    } else if (token.startsWith("_")) {
      nodes.push(<em key={`wa-em-${match.index}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("~")) {
      nodes.push(<s key={`wa-s-${match.index}`}>{token.slice(1, -1)}</s>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
};

const renderWhatsappText = (content: string): ReactNode[] =>
  content.split("\n").map((line, index, lines) => (
    <span key={`wa-line-${index}`}>
      {renderWhatsappInline(line)}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));

export const SandboxMessengerClient = ({
  activeThreadId: initialActiveThreadId,
  initialMessages,
  initialThreads,
  initialModel,
}: SandboxMessengerClientProps) => {
  const [activeThreadId, setActiveThreadId] = useState(initialActiveThreadId);
  const [messages, setMessages] = useState(initialMessages);
  const [threads, setThreads] = useState(initialThreads);
  const [model, setModel] = useState(initialModel);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showThreadPicker, setShowThreadPicker] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  const sortedThreads = useMemo(
    () => [...threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [threads],
  );

  const activeThread = sortedThreads.find((thread) => thread.id === activeThreadId);

  useEffect(() => {
    setActiveThreadId(initialActiveThreadId);
    setMessages(initialMessages);
    setThreads(initialThreads);
    setModel(initialModel);
  }, [initialActiveThreadId, initialMessages, initialThreads, initialModel]);

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

  const applyState = ({
    nextActiveThreadId,
    nextThreads,
    nextMessages,
    nextModel,
  }: {
    nextActiveThreadId: string;
    nextThreads: ChatThreadSummary[];
    nextMessages: ChatMessage[];
    nextModel?: string;
  }) => {
    setActiveThreadId(nextActiveThreadId);
    setThreads(nextThreads);
    setMessages(nextMessages);
    if (nextModel) {
      setModel(nextModel);
    }
  };

  const openThread = (threadId: string) => {
    if (threadId === activeThreadId || isPending) {
      return;
    }

    setError(null);
    setIsPending(true);
    setShowThreadPicker(false);

    startTransition(async () => {
      try {
        const nextThread = await selectChatThread(threadId);
        applyState({
          nextActiveThreadId: nextThread.activeThreadId,
          nextThreads: nextThread.threads,
          nextMessages: nextThread.session.messages,
          nextModel: nextThread.model,
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to open that conversation.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  const createPrivateThread = () => {
    if (isPending) {
      return;
    }

    setError(null);
    setIsPending(true);
    setShowThreadPicker(false);

    startTransition(async () => {
      try {
        const nextThread = await createChatThread({ isTemporary: true });
        applyState({
          nextActiveThreadId: nextThread.activeThreadId,
          nextThreads: nextThread.threads,
          nextMessages: nextThread.session.messages,
          nextModel: nextThread.model,
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to create a private conversation.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  const handleModelChange = (nextModel: string) => {
    setModel(nextModel);

    startTransition(async () => {
      try {
        const nextState = await setChatModel(nextModel);
        applyState({
          nextActiveThreadId: nextState.activeThreadId,
          nextThreads: nextState.threads,
          nextMessages: nextState.session.messages,
          nextModel: nextState.model,
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to switch models.",
        );
      }
    });
  };

  const sendMessage = () => {
    const rawInput = draft;
    const parsedInput = parseConversationInput(rawInput);

    if (!parsedInput || isPending) {
      return;
    }
    const previousMessages = messages;

    setDraft("");
    setError(null);
    setIsPending(true);

    if (parsedInput.kind === "message") {
      const optimisticUserMessage: ChatMessage = {
        id: `optimistic-user-${crypto.randomUUID()}`,
        role: "user",
        content: parsedInput.content,
        createdAt: new Date().toISOString(),
      };
      const optimisticAssistantMessage: ChatMessage = {
        id: `optimistic-assistant-${crypto.randomUUID()}`,
        role: "assistant",
        content: "working",
        createdAt: new Date().toISOString(),
      };

      setMessages([...previousMessages, optimisticUserMessage, optimisticAssistantMessage]);
    } else {
      const optimisticCommandMessage: ChatMessage = {
        id: `optimistic-command-${crypto.randomUUID()}`,
        role: "user",
        content: rawInput.trim(),
        createdAt: new Date().toISOString(),
      };

      setMessages([...previousMessages, optimisticCommandMessage]);
    }

    startTransition(async () => {
      try {
        const result = await handleConversationInput({
          rawInput,
          threadId: activeThreadId,
          model,
        });

        if (result.kind === "notice") {
          setMessages((currentMessages) => [
            ...currentMessages,
            createClientNotice(result.notice),
          ]);
          return;
        }

        applyState({
          nextActiveThreadId: result.state.activeThreadId,
          nextThreads: result.state.threads,
          nextMessages: result.notice
            ? [...result.state.messages, createClientNotice(result.notice)]
            : result.state.messages,
          nextModel: result.state.model,
        });
      } catch (caughtError) {
        setMessages(previousMessages);
        setDraft(rawInput);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to send that message.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  return (
    <main className={styles.page}>
      <div className={styles.stage}>
        <aside className={styles.notes}>
          <p className={styles.eyebrow}>Sandbox</p>
          <h1 className={styles.title}>Messenger Simulator</h1>
          <p className={styles.copy}>
            This route mimics a WhatsApp-style phone conversation while still using
            the same Texty threads, memory, and models underneath.
          </p>
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setShowThreadPicker((current) => !current)}
            >
              Conversations
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={createPrivateThread}
            >
              New private
            </button>
          </div>
          <label className={styles.modelWrap}>
            <span className={styles.modelLabel}>Model</span>
            <select
              className={styles.modelPicker}
              value={model}
              onChange={(event) => handleModelChange(event.target.value)}
            >
              {AVAILABLE_MODELS.map((availableModel) => (
                <option key={availableModel} value={availableModel}>
                  {availableModel}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.meta}>
            Active thread: {activeThread?.title || "Untitled thread"}
          </p>
        </aside>

        <section className={styles.phoneShell}>
          <div className={styles.phone}>
            <div className={styles.phoneTop} />
            <header className={styles.chatTopbar}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setShowThreadPicker((current) => !current)}
              >
                ←
              </button>
              <div className={styles.avatar}>T</div>
              <div className={styles.chatMeta}>
                <strong className={styles.chatTitle}>Texty</strong>
                <span className={styles.chatSubtitle}>
                  {activeThread?.isTemporary ? "Private conversation" : "Online"}
                </span>
              </div>
              <button type="button" className={styles.iconButton}>
                ⋮
              </button>
            </header>

            {showThreadPicker ? (
              <div className={styles.threadSheet}>
                {sortedThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={
                      thread.id === activeThreadId
                        ? styles.threadOptionActive
                        : styles.threadOption
                    }
                    onClick={() => openThread(thread.id)}
                  >
                    <span>{thread.title}</span>
                    <span className={styles.threadOptionMeta}>
                      {thread.isTemporary ? "Private" : formatTime(thread.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.chatBody} ref={logRef}>
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={
                    message.role === "user" ? styles.userMessage : styles.assistantMessage
                  }
                >
                  <div
                    className={
                      message.role === "user"
                        ? styles.userBubble
                        : message.content === "working"
                          ? styles.pendingBubble
                          : styles.assistantBubble
                    }
                  >
                    <p className={styles.messageText}>
                      {renderWhatsappText(message.content)}
                    </p>
                    <span className={styles.messageTime}>{formatTime(message.createdAt)}</span>
                  </div>
                </article>
              ))}
            </div>

            <footer className={styles.composer}>
              <button type="button" className={styles.composerIcon}>
                ＋
              </button>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Message"
                />
                <button type="button" className={styles.inlineIcon}>
                  📎
                </button>
              </div>
              <button
                type="button"
                className={styles.sendButton}
                onClick={sendMessage}
                disabled={isPending}
              >
                ➤
              </button>
            </footer>
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
};
