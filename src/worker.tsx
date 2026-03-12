import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { ChatSessionDurableObject } from "@/app/chat/chat-session-do";
import {
  createChatCookie,
  createChatSessionId,
  getChatSessionId,
} from "@/app/chat/session";
import { Document } from "@/app/document";
import { setCommonHeaders } from "@/app/headers";
import { Home } from "@/app/pages/home";

export type AppContext = {
  chatSessionId: string;
};

export default defineApp([
  setCommonHeaders(),
  ({ request, response, ctx }) => {
    const existingSessionId = getChatSessionId(request);
    const chatSessionId = existingSessionId || createChatSessionId();

    if (!existingSessionId) {
      response.headers.set("Set-Cookie", createChatCookie(chatSessionId));
    }

    ctx.chatSessionId = chatSessionId;
  },
  render(Document, [route("/", Home)]),
]);

export { ChatSessionDurableObject };
