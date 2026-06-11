import { WEB_PROVIDER_ID } from "../provider/provider.logic.ts";
import { getProviderHydratedState } from "../provider/provider.threads.ts";
import {
  getBrowserSessionIdFromRequest,
  type BrowserSession,
} from "../session/session";
import { authenticateAccountToken } from "../account/account.service";

type PageContext = {
  session?: BrowserSession;
};

const requireSession = (session: BrowserSession | undefined) => {
  if (!session) {
    throw new Error("Browser session is required for this page.");
  }

  return session;
};

export const loadBrowserChannelState = async ({
  ctx,
  request,
  channelType,
}: {
  ctx: PageContext;
  request: Request;
  channelType: "web" | "sandbox_messenger";
}) => {
  const session = requireSession(ctx.session);

  // If user is authenticated, use their account identity for cross-device continuity
  if (session.apiToken) {
    const auth = await authenticateAccountToken(session.apiToken);
    if (auth) {
      return getProviderHydratedState({
        providerId: auth.account.defaultSetupId,
        userId: "default",
        channel: {
          type: channelType,
          id: auth.account.id,
        },
      });
    }
  }

  const browserUserId =
    getBrowserSessionIdFromRequest(request) || session.activeThreadId;

  return getProviderHydratedState({
    providerId: WEB_PROVIDER_ID,
    userId: browserUserId,
    channel: {
      type: channelType,
      id: browserUserId,
    },
  });
};
