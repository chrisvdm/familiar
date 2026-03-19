import styles from "./chat.module.css";
import { ChatClient } from "./chat.client";
import { loadBrowserChannelState } from "./channel-state";

export const Home = ({
  ctx,
  request,
}: {
  ctx: { session?: import("../session/session").BrowserSession };
  request: Request;
}) =>
  loadBrowserChannelState({
    ctx,
    request,
    channelType: "web",
  }).then((providerState) => (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.wordmark}>texty</span>
      </header>
      <ChatClient
        activeThreadId={providerState.activeThreadId}
        initialMessages={providerState.session.messages}
        initialThreads={providerState.threads}
        initialModel={providerState.selectedModel}
      />
    </main>
  ));
