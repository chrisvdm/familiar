declare namespace Cloudflare {
  interface Env {
    BROWSER_SESSIONS: DurableObjectNamespace<
      import("../src/app/session/browser-session-do").BrowserSessionDurableObject
    >;
    CHAT_SESSIONS: DurableObjectNamespace<
      import("../src/app/chat/chat-session-do").ChatSessionDurableObject
    >;
    EXECUTOR_CONNECTIONS: DurableObjectNamespace<
      import("../src/app/provider/provider.websocket-do").ExecutorConnectionDurableObject
    >;
    OPENROUTER_API_KEY: string;
    OPENROUTER_MEMORY_MODEL?: string;
    OPENROUTER_MODEL?: string;
    OPENROUTER_SITE_NAME?: string;
    OPENROUTER_SITE_URL?: string;
    OPENROUTER_ROUTING_MODEL?: string;
    OPENROUTER_DECISION_MODEL?: string;
    OPENROUTER_ROUTER_MODEL?: string;
    OPENROUTER_EXTRACTION_MODEL?: string;
    OPENROUTER_MEMORY_SELECTOR_MODEL?: string;
    CLOUDFLARE_ROUTING_MODEL?: string;
    CLOUDFLARE_DECISION_MODEL?: string;
    CLOUDFLARE_EXTRACTION_MODEL?: string;
    TEXTY_USE_WORKERS_AI_ROUTING?: string;
  }
}
