import {
  formatCurrentThread,
  formatThreadsList,
  HELP_NOTICE,
  resolveThreadId,
  type ParsedConversationCommand,
} from "./conversation.commands";
import {
  parseConversationInput,
  type ParsedConversationInput,
} from "./conversation.input";
import type { ChatMessage, ChatThreadSummary } from "./shared";

export type ConversationThreadState = {
  activeThreadId: string;
  threads: ChatThreadSummary[];
  messages: ChatMessage[];
  model?: string;
};

export type ConversationCommandContext = {
  activeThreadId: string;
  threads: ChatThreadSummary[];
};

export type ConversationCommandActions = {
  createThread: (input: {
    isTemporary: boolean;
  }) => Promise<ConversationThreadState>;
  selectThread: (threadId: string) => Promise<ConversationThreadState>;
  renameThread: (input: {
    threadId: string;
    title: string;
  }) => Promise<ConversationThreadState>;
  deleteThread: (threadId: string) => Promise<ConversationThreadState>;
  sendMessage: (input: {
    content: string;
    threadId: string;
    model?: string;
  }) => Promise<ConversationThreadState>;
};

export type ConversationCommandExecution =
  | {
      kind: "notice";
      notice: string;
    }
  | {
      kind: "state";
      state: ConversationThreadState;
      notice?: string;
    };

export const executeConversationInput = async ({
  actions,
  context,
  input,
  model,
}: {
  actions: ConversationCommandActions;
  context: ConversationCommandContext;
  input: ParsedConversationInput;
  model?: string;
}): Promise<ConversationCommandExecution> => {
  if (input.kind === "command") {
    return executeConversationCommand({
      actions,
      command: input.command,
      context,
      model,
    });
  }

  const state = await actions.sendMessage({
    content: input.content,
    threadId: context.activeThreadId,
    model,
  });

  return {
    kind: "state",
    state,
  };
};

export { parseConversationInput };

export const executeConversationCommand = async ({
  actions,
  command,
  context,
  model,
}: {
  actions: ConversationCommandActions;
  command: ParsedConversationCommand;
  context: ConversationCommandContext;
  model?: string;
}): Promise<ConversationCommandExecution> => {
  const activeThread = context.threads.find(
    (thread) => thread.id === context.activeThreadId,
  );

  if (command.kind === "help") {
    return { kind: "notice", notice: HELP_NOTICE };
  }

  if (command.kind === "current") {
    return {
      kind: "notice",
      notice: formatCurrentThread(activeThread),
    };
  }

  if (command.kind === "threads") {
    return {
      kind: "notice",
      notice: formatThreadsList(context),
    };
  }

  if (command.kind === "switch") {
    const nextThreadId = resolveThreadId({
      rawThreadId: command.rawThreadId,
      threads: context.threads,
    });

    if (!nextThreadId) {
      throw new Error("Use :switch [thread id]. You can use the short id from :threads.");
    }

    const state = await actions.selectThread(nextThreadId);
    return {
      kind: "state",
      state,
      notice: `Switched to ${nextThreadId.slice(0, 8)}.`,
    };
  }

  if (command.kind === "thread" || command.kind === "private") {
    const state = await actions.createThread({
      isTemporary: command.kind === "private",
    });

    if (!command.initialMessage) {
      return {
        kind: "state",
        state,
        notice: `${command.kind === "private" ? "Private" : "New"} thread ready.`,
      };
    }

    const result = await actions.sendMessage({
      content: command.initialMessage,
      threadId: state.activeThreadId,
      model,
    });

    return {
      kind: "state",
      state: result,
    };
  }

  if (command.kind === "rename") {
    const nextThreadId = resolveThreadId({
      rawThreadId: command.rawThreadId,
      threads: context.threads,
    });

    if (!nextThreadId || !command.title) {
      throw new Error("Use :rename [thread id] [new title].");
    }

    const state = await actions.renameThread({
      threadId: nextThreadId,
      title: command.title,
    });

    return {
      kind: "state",
      state,
      notice: `Renamed ${nextThreadId.slice(0, 8)} to "${command.title}".`,
    };
  }

  const nextThreadId = resolveThreadId({
    rawThreadId: command.rawThreadId,
    threads: context.threads,
  });

  if (!nextThreadId) {
    throw new Error("Use :delete [thread id].");
  }

  const targetThread = context.threads.find((thread) => thread.id === nextThreadId);

  if (!targetThread) {
    throw new Error("That thread is no longer available.");
  }

  const state = await actions.deleteThread(nextThreadId);

  return {
    kind: "state",
    state,
    notice: `Deleted "${targetThread.title}".`,
  };
};
