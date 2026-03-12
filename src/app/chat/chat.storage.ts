import { env } from "cloudflare:workers";

import type { ChatSessionState } from "./shared";

const getChatStub = (sessionId: string) => {
  const id = env.CHAT_SESSIONS.idFromName(sessionId);
  return env.CHAT_SESSIONS.get(id);
};

export const loadChatSession = async (sessionId: string) => {
  const result = await getChatStub(sessionId).getSession();

  if ("error" in result) {
    throw new Error(String(result.error));
  }

  return result.value;
};

export const saveChatSession = async (
  sessionId: string,
  state: ChatSessionState,
) => {
  await getChatStub(sessionId).saveSession(state);
  return state;
};
