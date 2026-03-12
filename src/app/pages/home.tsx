import { ChatShell } from "./chat-shell";

export const Home = ({ ctx }: { ctx: { chatSessionId: string } }) => {
  return <ChatShell chatSessionId={ctx.chatSessionId} />;
};
