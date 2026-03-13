"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import {
  createChatThread,
  deleteChatThread,
  renameChatThread,
  selectChatThread,
  setChatModel,
  sendChatMessage,
} from "../chat/chat.service";
import {
  executeConversationCommand,
  type ConversationThreadState,
} from "../chat/conversation.engine";
import {
  parseConversationCommand,
} from "../chat/conversation.commands";
import type {
  ChatMessage,
  ChatThreadSummary,
} from "../chat/shared";
import type { ReactNode } from "react";
import styles from "./chat.module.css";

type ChatClientProps = {
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

const sortThreadsByRecency = (threads: ChatThreadSummary[]) =>
  [...threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const createClientNotice = (content: string): ChatMessage => ({
  id: `client-notice-${crypto.randomUUID()}`,
  role: "assistant",
  content,
  createdAt: new Date().toISOString(),
});

const renderInlineMarkdown = (content: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith("`")) {
      nodes.push(
        <code key={`code-${match.index}`} className={styles.inlineCode}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={`strong-${match.index}`}>{token.slice(2, -2)}</strong>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(<em key={`em-${match.index}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

      if (linkMatch) {
        nodes.push(
          <a
            key={`link-${match.index}`}
            className={styles.messageLink}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
};

const renderMarkdownBlocks = (content: string): ReactNode[] => {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockKey = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push(
        <pre key={`pre-${blockKey++}`} className={styles.codeBlock}>
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];

      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`ul-${blockKey++}`} className={styles.messageList}>
          {items.map((item, itemIndex) => (
            <li key={`li-${blockKey}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ol key={`ol-${blockKey++}`} className={styles.messageList}>
          {items.map((item, itemIndex) => (
            <li key={`oli-${blockKey}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length) {
      const current = lines[index].trim();

      if (!current || current.startsWith("```") || /^[-*]\s+/.test(current)) {
        break;
      }

      paragraphLines.push(current);
      index += 1;
    }

    blocks.push(
      <p key={`p-${blockKey++}`} className={styles.messageParagraph}>
        {renderInlineMarkdown(paragraphLines.join(" "))}
      </p>,
    );
  }

  return blocks;
};

const WorkingMessage = () => (
  <div className={styles.workingMessage} aria-live="polite" aria-label="Working">
    <span className={styles.workingLabel}>working</span>
    <span className={styles.workingDots} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  </div>
);

export const ChatClient = ({
  activeThreadId: initialActiveThreadId,
  initialMessages,
  initialThreads,
  initialModel,
}: ChatClientProps) => {
  const [activeThreadId, setActiveThreadId] = useState(initialActiveThreadId);
  const [messages, setMessages] = useState(initialMessages);
  const [threads, setThreads] = useState(initialThreads);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>(initialModel);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [threadMenu, setThreadMenu] = useState<{
    threadId: string;
    x: number;
    y: number;
  } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const sortedThreads = sortThreadsByRecency(threads);

  useEffect(() => {
    setActiveThreadId(initialActiveThreadId);
    setMessages(initialMessages);
    setThreads(initialThreads);
    setModel(initialModel);
  }, [initialActiveThreadId, initialMessages, initialThreads, initialModel]);

  useEffect(() => {
    const closeMenus = () => {
      setIsNewMenuOpen(false);
      setThreadMenu(null);
    };

    window.addEventListener("click", closeMenus);
    window.addEventListener("contextmenu", closeMenus);

    return () => {
      window.removeEventListener("click", closeMenus);
      window.removeEventListener("contextmenu", closeMenus);
    };
  }, []);

  useEffect(() => {
    const container = logRef.current;
    const pendingAssistantId = pendingAssistantIdRef.current;

    if (!container || !pendingAssistantId) {
      return;
    }

    const pendingAssistant = container.querySelector<HTMLElement>(
      `[data-message-id="${pendingAssistantId}"]`,
    );

    if (!pendingAssistant) {
      return;
    }

    container.scrollTo({
      top: Math.max(0, pendingAssistant.offsetTop - 16),
      behavior: "smooth",
    });
  }, [messages]);

  const sendMessageToThread = ({
    content,
    threadId,
  }: {
    content: string;
    threadId: string;
  }) => {
    if (!content || isPending) {
      return;
    }

    const previousMessages = messages;
    const optimisticUserMessage: ChatMessage = {
      id: `optimistic-user-${crypto.randomUUID()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const optimisticAssistantMessage: ChatMessage = {
      id: `optimistic-assistant-${crypto.randomUUID()}`,
      role: "assistant",
      content: "Thinking through the request...",
      createdAt: new Date().toISOString(),
    };

    setDraft("");
    setError(null);
    setIsPending(true);
    pendingAssistantIdRef.current = optimisticAssistantMessage.id;
    setMessages([
      ...previousMessages,
      optimisticUserMessage,
      optimisticAssistantMessage,
    ]);

    startTransition(async () => {
      try {
        const result = await sendChatMessage({
          content,
          threadId,
          model,
        });
        setActiveThreadId(result.activeThreadId);
        setThreads(result.threads);
        setModel(result.model ?? "openai/gpt-4o-mini");
        setMessages(result.session.messages);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Something went wrong while generating a reply.";

        setError(message);
        setMessages(previousMessages);
        setDraft(content);
      } finally {
        pendingAssistantIdRef.current = null;
        setIsPending(false);
      }
    });
  };

  const sendMessage = (rawMessage: string) => {
    const content = rawMessage.trim();

    if (!content || isPending) {
      return;
    }

    sendMessageToThread({ content, threadId: activeThreadId });
  };

  const openThread = (threadId: string) => {
    if (threadId === activeThreadId || isPending) {
      return;
    }

    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const nextThread = await selectChatThread(threadId);
        applyThreadState({
          activeThreadId: nextThread.activeThreadId,
          threads: nextThread.threads,
          messages: nextThread.session.messages,
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to open that thread.",
        );
      } finally {
        pendingAssistantIdRef.current = null;
        setIsPending(false);
      }
    });
  };

  const addThread = () => {
    if (isPending) {
      return;
    }

    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const nextThread = await createChatThread({ isTemporary: false });
        applyThreadState({
          activeThreadId: nextThread.activeThreadId,
          threads: nextThread.threads,
          messages: nextThread.session.messages,
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to create a new thread.",
        );
      } finally {
        pendingAssistantIdRef.current = null;
        setIsPending(false);
      }
    });
  };

  const addPrivateThread = () => {
    if (isPending) {
      return;
    }

    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const nextThread = await createChatThread({ isTemporary: true });
        applyThreadState({
          activeThreadId: nextThread.activeThreadId,
          threads: nextThread.threads,
          messages: nextThread.session.messages,
          model: nextThread.model,
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to create a private thread.",
        );
      } finally {
        pendingAssistantIdRef.current = null;
        setIsPending(false);
      }
    });
  };

  const showNotice = (content: string) => {
    setMessages((previousMessages) => [...previousMessages, createClientNotice(content)]);
  };

  const applyThreadState = (
    state: ConversationThreadState,
    notice?: string,
  ) => {
    setActiveThreadId(state.activeThreadId);
    setThreads(state.threads);
    if (state.model) {
      setModel(state.model);
    }
    setMessages(
      notice
        ? [...state.messages, createClientNotice(notice)]
        : state.messages,
    );
  };

  const runCommand = (rawCommand: string) => {
    const command = parseConversationCommand(rawCommand);

    if (!command || isPending) {
      return false;
    }

    setDraft("");
    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const result = await executeConversationCommand({
          command,
          context: {
            activeThreadId,
            threads,
          },
          actions: {
            createThread: async ({ isTemporary }) => {
              const nextThread = await createChatThread({ isTemporary });

              return {
                activeThreadId: nextThread.activeThreadId,
                threads: nextThread.threads,
                messages: nextThread.session.messages,
              };
            },
            selectThread: async (threadId) => {
              const nextThread = await selectChatThread(threadId);

              return {
                activeThreadId: nextThread.activeThreadId,
                threads: nextThread.threads,
                messages: nextThread.session.messages,
              };
            },
            renameThread: async ({ threadId, title }) => {
              const nextState = await renameChatThread({ threadId, title });

              return {
                activeThreadId: nextState.activeThreadId,
                threads: nextState.threads,
                messages: nextState.session.messages,
              };
            },
            deleteThread: async (threadId) => {
              const nextState = await deleteChatThread(threadId);

              return {
                activeThreadId: nextState.activeThreadId,
                threads: nextState.threads,
                messages: nextState.session.messages,
              };
            },
            sendMessage: async ({ content, threadId }) => {
              const result = await sendChatMessage({ content, threadId });

              return {
                activeThreadId: result.activeThreadId,
                threads: result.threads,
                messages: result.session.messages,
                model: result.model ?? "openai/gpt-4o-mini",
              };
            },
          },
        });

        if (result.kind === "notice") {
          showNotice(result.notice);
          return;
        }

        applyThreadState(result.state, result.notice);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to run that command.",
        );
      } finally {
        pendingAssistantIdRef.current = null;
        setIsPending(false);
      }
    });

    return true;
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (runCommand(draft)) {
      return;
    }

    sendMessage(draft);
  };

  const onThreadContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    threadId: string,
  ) => {
    event.preventDefault();
    setIsNewMenuOpen(false);
    setThreadMenu({
      threadId,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const onRenameThread = () => {
    if (!threadMenu || isPending) {
      return;
    }

    renameThread(threadMenu.threadId);
    setThreadMenu(null);
  };

  const renameThread = (threadId: string) => {
    if (isPending) {
      return;
    }

    const thread = threads.find((candidate) => candidate.id === threadId);

    if (!thread) {
      return;
    }

    const nextTitle = window.prompt("Rename thread", thread.title)?.trim();

    if (!nextTitle) {
      return;
    }

    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const nextState = await renameChatThread({
          threadId: thread.id,
          title: nextTitle,
        });
        applyThreadState({
          activeThreadId: nextState.activeThreadId,
          threads: nextState.threads,
          messages: nextState.session.messages,
          model: nextState.model,
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to rename that thread.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  const onDeleteThread = () => {
    if (!threadMenu || isPending) {
      return;
    }

    deleteThread(threadMenu.threadId);
    setThreadMenu(null);
  };

  const deleteThread = (threadId: string) => {
    if (isPending) {
      return;
    }

    if (!window.confirm("Delete this thread?")) {
      return;
    }

    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const nextState = await deleteChatThread(threadId);
        applyThreadState({
          activeThreadId: nextState.activeThreadId,
          threads: nextState.threads,
          messages: nextState.session.messages,
          model: nextState.model,
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to delete that thread.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  const onModelChange = (nextModel: string) => {
    setModel(nextModel);
    setError(null);

    startTransition(async () => {
      try {
        const nextState = await setChatModel(nextModel);
        applyThreadState({
          activeThreadId: nextState.activeThreadId,
          threads: nextState.threads,
          messages: nextState.session.messages,
          model: nextState.model,
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

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (runCommand(draft)) {
        return;
      }

      sendMessage(draft);
    }
  };

  return (
    <section className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.brand}>texty.</span>
          <button
            type="button"
            className={styles.newThreadButton}
            onClick={(event) => {
              event.stopPropagation();
              setThreadMenu(null);
              setIsNewMenuOpen((current) => !current);
            }}
            disabled={isPending}
          >
            + New
          </button>
          {isNewMenuOpen ? (
            <div
              className={styles.newMenu}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setIsNewMenuOpen(false);
                  addThread();
                }}
              >
                New thread
              </button>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setIsNewMenuOpen(false);
                  addPrivateThread();
                }}
              >
                New private thread
              </button>
            </div>
          ) : null}
        </div>
        <div className={styles.threadList}>
          {sortedThreads.map((thread) => (
            <div
              key={thread.id}
              className={
                thread.id === activeThreadId
                  ? styles.threadRowActive
                  : styles.threadRow
              }
            >
              <button
                type="button"
                className={
                  thread.id === activeThreadId
                    ? styles.threadButtonActive
                    : styles.threadButton
                }
                onClick={() => openThread(thread.id)}
                disabled={isPending}
                onContextMenu={(event) => onThreadContextMenu(event, thread.id)}
                title={thread.title}
              >
                <span className={styles.threadButtonTextWrap}>
                  <span className={styles.threadButtonText}>{thread.title}</span>
                  <span className={styles.threadActions}>
                    <button
                      type="button"
                      className={styles.threadActionButton}
                      aria-label={`Rename ${thread.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        renameThread(thread.id);
                      }}
                      disabled={isPending}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className={styles.threadActionButton}
                      aria-label={`Delete ${thread.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteThread(thread.id);
                      }}
                      disabled={isPending}
                    >
                      🗑
                    </button>
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className={styles.chatFrame}>
        <header className={styles.chatHeader}>
          <select
            aria-label="Select model"
            className={styles.modelPicker}
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={isPending}
          >
            {AVAILABLE_MODELS.map((availableModel) => (
              <option key={availableModel} value={availableModel}>
                {availableModel}
              </option>
            ))}
          </select>
        </header>
        <div className={styles.chatLogFrame}>
          <div className={styles.chatLog} ref={logRef}>
            {messages.map((message) => (
              <article
                key={message.id}
                data-message-id={message.id}
                className={
                  message.role === "user"
                    ? styles.userMessage
                    : message.id === pendingAssistantIdRef.current
                      ? styles.pendingAssistantMessage
                      : styles.assistantMessage
                }
              >
                <div className={styles.messageBody}>
                  {message.role === "assistant"
                    ? message.id === pendingAssistantIdRef.current
                      ? <WorkingMessage />
                      : renderMarkdownBlocks(message.content)
                    : <p className={styles.messageParagraph}>{message.content}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>

        <form className={styles.composer} onSubmit={onSubmit}>
          <div className={styles.composerTop}>
            <textarea
              id="message"
              name="message"
              className={styles.textarea}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder='// type ":help" for commands'
              rows={1}
              disabled={isPending}
            />
          </div>
          <div className={styles.composerBottom}>
            <div className={styles.composerTools}>
              <button type="button" className={styles.toolButton} disabled={isPending}>
                +
              </button>
              <button type="button" className={styles.toolButton} disabled={isPending}>
                🎤
              </button>
            </div>
            <button className={styles.submitButton} type="submit" disabled={isPending}>
              ↵
            </button>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </div>

      {threadMenu ? (
        <div
          className={styles.contextMenu}
          style={{ left: threadMenu.x, top: threadMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className={styles.menuItem} onClick={onRenameThread}>
            Rename
          </button>
          <button type="button" className={styles.menuItem} onClick={onDeleteThread}>
            Delete
          </button>
        </div>
      ) : null}
    </section>
  );
};
