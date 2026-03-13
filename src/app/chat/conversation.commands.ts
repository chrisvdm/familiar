import type { ChatThreadSummary } from "./shared";

export type ParsedConversationCommand =
  | { kind: "help" }
  | { kind: "current" }
  | { kind: "threads" }
  | { kind: "thread"; initialMessage: string }
  | { kind: "private"; initialMessage: string }
  | { kind: "switch"; rawThreadId: string }
  | { kind: "rename"; rawThreadId: string; title: string }
  | { kind: "delete"; rawThreadId: string };

export const shortThreadId = (threadId: string) => threadId.slice(0, 8);

export const parseConversationCommand = (
  rawInput: string,
): ParsedConversationCommand | null => {
  const input = rawInput.trim();

  if (!input.startsWith(":")) {
    return null;
  }

  const [command, ...rest] = input.slice(1).split(" ");
  const normalizedCommand = command.toLowerCase();
  const remainder = rest.join(" ").trim();

  if (normalizedCommand === "help") {
    return { kind: "help" };
  }

  if (normalizedCommand === "current") {
    return { kind: "current" };
  }

  if (normalizedCommand === "threads") {
    return { kind: "threads" };
  }

  if (normalizedCommand === "thread") {
    return { kind: "thread", initialMessage: remainder };
  }

  if (normalizedCommand === "private") {
    return { kind: "private", initialMessage: remainder };
  }

  if (normalizedCommand === "switch") {
    return { kind: "switch", rawThreadId: remainder };
  }

  if (normalizedCommand === "rename") {
    const [rawThreadId, ...titleParts] = remainder.split(" ");

    return {
      kind: "rename",
      rawThreadId: rawThreadId ?? "",
      title: titleParts.join(" ").trim(),
    };
  }

  if (normalizedCommand === "delete") {
    return { kind: "delete", rawThreadId: remainder };
  }

  return null;
};

export const resolveThreadId = ({
  rawThreadId,
  threads,
}: {
  rawThreadId: string;
  threads: ChatThreadSummary[];
}) => {
  const token = rawThreadId.trim().toLowerCase();

  if (!token) {
    return null;
  }

  const exactThread = threads.find((thread) => thread.id === token);

  if (exactThread) {
    return exactThread.id;
  }

  const prefixMatches = threads.filter((thread) =>
    shortThreadId(thread.id).toLowerCase().startsWith(token),
  );

  if (prefixMatches.length === 1) {
    return prefixMatches[0].id;
  }

  return null;
};

export const formatThreadsList = ({
  activeThreadId,
  threads,
}: {
  activeThreadId: string;
  threads: ChatThreadSummary[];
}) => {
  if (threads.length === 0) {
    return "No threads available.";
  }

  return [
    "Threads",
    ...threads.map((thread) => {
      const statusBits = [
        shortThreadId(thread.id),
        thread.id === activeThreadId ? "current" : "",
        thread.isTemporary ? "private" : "",
      ].filter(Boolean);

      return `- ${statusBits.join(" · ")}  ${thread.title}`;
    }),
  ].join("\n");
};

export const formatCurrentThread = (
  thread: ChatThreadSummary | undefined,
) =>
  thread
    ? [
        "Current thread",
        `- ${shortThreadId(thread.id)} · ${thread.title}`,
        `- ${thread.isTemporary ? "Private" : "Normal"}`,
        `- ${thread.messageCount} messages`,
      ].join("\n")
    : "No active thread.";

export const HELP_NOTICE = [
  "Commands",
  ":help",
  ":current",
  ":threads",
  ":thread [initial message]",
  ":private [initial message]",
  ":switch [thread id]",
  ":rename [thread id] [new title]",
  ":delete [thread id]",
].join("\n");
