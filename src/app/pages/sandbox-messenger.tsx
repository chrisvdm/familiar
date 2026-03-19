import { SandboxMessengerClient } from "./sandbox-messenger.client";
import { loadBrowserChannelState } from "./channel-state";

export const SandboxMessenger = async ({
  ctx,
  request,
}: {
  ctx: { session?: import("../session/session").BrowserSession };
  request: Request;
}) => {
  const providerState = await loadBrowserChannelState({
    ctx,
    request,
    channelType: "sandbox_messenger",
  });

  return (
    <SandboxMessengerClient
      activeThreadId={providerState.activeThreadId}
      initialMessages={providerState.session.messages}
      initialModel={providerState.selectedModel}
      initialThreads={providerState.threads}
    />
  );
};
