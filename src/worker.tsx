import { env } from "cloudflare:workers";
import { layout, render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { ChatSessionDurableObject } from "@/app/chat/chat-session-do";
import { AccountRegistryDurableObject } from "@/app/account/account-registry-do";
import { ExecutorConnectionDurableObject } from "@/app/provider/provider.websocket-do";
import { Document } from "@/app/document";
import { DocsLayout } from "@/app/layouts/DocsLayout/";
import { PublicLayout } from "@/app/layouts/public-layout";
import { setCommonHeaders, setCorsHeaders } from "@/app/headers";
import { Debug } from "@/app/pages/debug";
import { DocsPage } from "@/app/pages/docs";
import { DocsAiPage } from "@/app/pages/docs-ai";
import { Home } from "@/app/pages/home/index";
import { Dashboard } from "@/app/pages/dashboard/index";

import { Setup } from "@/app/pages/setup";
import { SandboxMessenger } from "@/app/pages/sandbox-messenger";
import { SandboxProvider } from "@/app/pages/sandbox-provider";
import { providerRoutes } from "@/app/provider/provider.routes";
import { providerDemoRoutes } from "@/app/provider/provider.demo.routes";
import { providerMockRoutes } from "@/app/provider/provider.mock.routes";
import { ProviderUserContextDurableObject } from "@/app/provider/provider-user-context-do";
import { accountRoutes } from "@/app/account/account.routes";
import { BrowserSessionDurableObject } from "@/app/session/browser-session-do";
import {
  browserSessionStore,
  createBrowserSession,
  normalizeBrowserSession,
  type BrowserSession,
} from "@/app/session/session";
import { jsonResponse, jsonError } from "@/app/provider/provider.http";
import {
  checkRateLimitByIp,
  createAccountWithInitialToken,
  registerAccountUser,
  authenticateUser,
  storeContactSubmission,
  consumeBrowserLoginSession,
  authenticateAccountToken,
} from "@/app/account/account.service";
import { Contact } from "@/app/pages/contact";

export type AppContext = {
  session?: BrowserSession;
};

export default defineApp([
  setCommonHeaders(),
  setCorsHeaders(),
  async ({ request, response, ctx }) => {
    const pathname = new URL(request.url).pathname;

    if (
      pathname === "/" ||
      pathname === "/docs" ||
      pathname === "/docs/" ||
      pathname.startsWith("/docs/") ||
      pathname.startsWith("/api/v1/")
    ) {
      return;
    }

    let existingSession: Awaited<ReturnType<typeof browserSessionStore.load>> | null =
      null;

    try {
      existingSession = await browserSessionStore.load(request);
    } catch {
      existingSession = null;
    }

    if (existingSession) {
      const normalizedSession = normalizeBrowserSession(existingSession);

      if (
        !("globalMemory" in existingSession) ||
        normalizedSession.activeThreadId !==
          (existingSession as BrowserSession).activeThreadId ||
        normalizedSession.threads !== (existingSession as BrowserSession).threads
      ) {
        await browserSessionStore.save(response.headers, normalizedSession, {
          maxAge: true,
        });
      }

      ctx.session = normalizedSession;
      return;
    }

    const threadId = crypto.randomUUID();
    const session = createBrowserSession(threadId);

    await browserSessionStore.save(response.headers, session, { maxAge: true });

    ctx.session = session;
  },
  route("/api/v1/session/token", async ({ request, response }) => {
    if (request.method !== "POST") {
      return jsonError({
        requestId: crypto.randomUUID(),
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const body = (await request.json()) as { token?: string };
      const token = body.token?.trim();

      if (!token) {
        return jsonError({
          requestId: crypto.randomUUID(),
          status: 400,
          code: "invalid_request",
          message: "Token is required.",
        });
      }

      let session = await browserSessionStore.load(request);

      if (session) {
        session = normalizeBrowserSession(session);
        session.apiToken = token;
      } else {
        session = createBrowserSession(crypto.randomUUID());
        session.apiToken = token;
      }

      await browserSessionStore.save(response.headers, session, { maxAge: true });

      return jsonResponse({
        requestId: crypto.randomUUID(),
        body: { ok: true },
      });
    } catch {
      return jsonError({
        requestId: crypto.randomUUID(),
        status: 400,
        code: "invalid_request",
        message: "Unable to store token.",
      });
    }
  }),
  route("/dashboard/login", async ({ request, response }) => {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const loginRateLimit = await checkRateLimitByIp({
      request,
      action: "login",
      maxRequests: 10,
      windowMs: 15 * 60 * 1_000,
    });

    if (!loginRateLimit.allowed) {
      return new Response("Too many login attempts. Try again later.", {
        status: 429,
        headers: { "Retry-After": String(loginRateLimit.retryAfterSeconds ?? 60) },
      });
    }

    try {
      const formData = await request.formData();
      const token = (formData.get("token")?.toString() ?? "").trim();
      const email = (formData.get("email")?.toString() ?? "").trim();
      const password = formData.get("password")?.toString() ?? "";

      let tokenValue: string | null = null;

      if (token) {
        tokenValue = token;
      } else if (email && password) {
        const authResult = await authenticateUser({ email, password });
        if ("error" in authResult) {
          return new Response(authResult.error, { status: 401 });
        }
        tokenValue = authResult.value.apiTokenValue;
      }

      if (!tokenValue) {
        return new Response("Token or email and password are required", { status: 400 });
      }

      let session = await browserSessionStore.load(request);

      if (session) {
        session = normalizeBrowserSession(session);
        session.apiToken = tokenValue;
      } else {
        session = createBrowserSession(crypto.randomUUID());
        session.apiToken = tokenValue;
      }

      await browserSessionStore.save(response.headers, session, { maxAge: true });

      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard" },
      });
    } catch {
      return new Response("Unable to sign in", { status: 400 });
    }
  }),
  route("/setup/create", async ({ request, response }) => {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const createRateLimit = await checkRateLimitByIp({
      request,
      action: "create_account",
      maxRequests: 5,
      windowMs: 60 * 60 * 1_000,
    });

    if (!createRateLimit.allowed) {
      return new Response("Too many account creation attempts. Try again later.", {
        status: 429,
        headers: { "Retry-After": String(createRateLimit.retryAfterSeconds ?? 3600) },
      });
    }

    try {
      const formData = await request.formData();
      const email = (formData.get("email")?.toString() ?? "").trim();
      const password = formData.get("password")?.toString() ?? "";

      let tokenValue: string;

      if (email && password) {
        const result = await registerAccountUser({ email, password });
        if ("error" in result) {
          return new Response(result.error, { status: 400 });
        }
        tokenValue = result.value.token;
      } else {
        const result = await createAccountWithInitialToken({});
        tokenValue = result.token.value;
      }

      let session = await browserSessionStore.load(request);

      if (session) {
        session = normalizeBrowserSession(session);
        session.apiToken = tokenValue;
      } else {
        session = createBrowserSession(crypto.randomUUID());
        session.apiToken = tokenValue;
      }

      await browserSessionStore.save(response.headers, session, { maxAge: true });

      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard" },
      });
    } catch {
      return new Response("Unable to create account", { status: 400 });
    }
  }),
  route("/dashboard/select-integration", async ({ request, response }) => {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const formData = await request.formData();
      const integrationId = (formData.get("integrationId")?.toString() ?? "").trim();

      if (!integrationId) {
        return new Response("Integration ID is required", { status: 400 });
      }

      let session = await browserSessionStore.load(request);

      if (session) {
        session = normalizeBrowserSession(session);
        session.selectedIntegrationId = integrationId;
      } else {
        session = createBrowserSession(crypto.randomUUID());
        session.selectedIntegrationId = integrationId;
      }

      await browserSessionStore.save(response.headers, session, { maxAge: true });

      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard" },
      });
    } catch {
      return new Response("Unable to select integration", { status: 400 });
    }
  }),
  route("/contact/submit", async ({ request }) => {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const contactRateLimit = await checkRateLimitByIp({
      request,
      action: "contact_submit",
      maxRequests: 3,
      windowMs: 60 * 60 * 1_000,
    });

    if (!contactRateLimit.allowed) {
      return new Response("Too many contact submissions. Try again later.", {
        status: 429,
        headers: { "Retry-After": String(contactRateLimit.retryAfterSeconds ?? 3600) },
      });
    }

    try {
      const formData = await request.formData();
      const name = (formData.get("name")?.toString() ?? "").trim();
      const email = (formData.get("email")?.toString() ?? "").trim();
      const message = (formData.get("message")?.toString() ?? "").trim();

      if (!name || !email || !message) {
        return new Response("All fields are required", { status: 400 });
      }

      await storeContactSubmission({ name, email, message });

      return new Response(null, {
        status: 302,
        headers: { Location: "/contact?sent=1" },
      });
    } catch {
      return new Response("Unable to send message", { status: 400 });
    }
  }),
  route("/ws/executor", async ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token")?.trim();

    if (!token) {
      return new Response("Missing token query parameter.", { status: 401 });
    }

    const auth = await authenticateAccountToken(token);

    if (!auth) {
      return new Response("Invalid token.", { status: 401 });
    }

    if (auth.integration.transport !== "websocket") {
      return new Response(
        "Integration not configured for WebSocket transport. Set transport to 'websocket' via PATCH /api/v1/integration.",
        { status: 400 },
      );
    }

    const id = env.EXECUTOR_CONNECTIONS.idFromName(auth.integration.id);
    const stub = env.EXECUTOR_CONNECTIONS.get(id);

    return stub.fetch(request);
  }),
  ...accountRoutes,
  ...providerRoutes,
  ...providerDemoRoutes,
  ...providerMockRoutes,
  render(
    Document,
    [
      route("/", Home),
      route("/temp-home", Home),
      route("/dashboard", Dashboard),
      layout(PublicLayout, [
        route("/setup", Setup),
        route("/auth/browser", async ({ request, response }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code")?.trim();

        if (!code) {
          return new Response("Login code is required.", { status: 400 });
        }

        const sessionResult = await consumeBrowserLoginSession(code);

        if (!sessionResult) {
          return new Response("Login link expired or invalid.", { status: 400 });
        }

        let session = await browserSessionStore.load(request);

        if (session) {
          session = normalizeBrowserSession(session);
          session.apiToken = sessionResult.tokenValue;
        } else {
          session = createBrowserSession(crypto.randomUUID());
          session.apiToken = sessionResult.tokenValue;
        }

        await browserSessionStore.save(response.headers, session, { maxAge: true });

        return new Response(null, {
          status: 302,
          headers: { Location: "/dashboard" },
        });
      }),
        route("/contact", Contact),
      ]),
      layout(DocsLayout, [
        route("/docs", DocsPage),
        route("/docs/", DocsPage),
        route("/docs/ai-copy", DocsAiPage),
        route("/docs/:slug", DocsPage),
      ]),
    ],
  ),
  render(Document, [
    route("/debug", Debug),
    route("/sandbox/messenger", SandboxMessenger),
    route("/sandbox/provider", SandboxProvider),
  ]),
]);

export {
  AccountRegistryDurableObject,
  BrowserSessionDurableObject,
  ChatSessionDurableObject,
  ExecutorConnectionDurableObject,
  ProviderUserContextDurableObject,
};
