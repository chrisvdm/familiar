import { loadChatSession } from "../chat/chat.storage";
import type { ChatMessage, ChatThreadSummary } from "../chat/shared";
import type { BrowserSession } from "../session/session";
import { SandboxMessengerClient } from "./sandbox-messenger.client";

export const SandboxMessenger = async ({
  ctx,
}: {
  ctx: { session: BrowserSession };
}) => {
  const activeThread = await loadChatSession(ctx.session.activeThreadId);
  const messages: ChatMessage[] = activeThread.messages;
  const threads: ChatThreadSummary[] = ctx.session.threads;

  return (
    <SandboxMessengerClient
      activeThreadId={ctx.session.activeThreadId}
      initialMessages={messages}
      initialModel={ctx.session.selectedModel}
      initialThreads={threads}
    />
  );
};
