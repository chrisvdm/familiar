declare namespace Cloudflare {
  interface Env {
    CHAT_SESSIONS: DurableObjectNamespace<
      import("../src/app/chat/chat-session-do").ChatSessionDurableObject
    >;
    OPENROUTER_API_KEY: string;
    OPENROUTER_MODEL?: string;
    OPENROUTER_SITE_NAME?: string;
    OPENROUTER_SITE_URL?: string;
  }
}
