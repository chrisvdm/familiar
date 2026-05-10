import { appendProviderAuditEvent } from "./provider.storage";

type ProviderAuditEvent = {
  event: string;
  requestId?: string;
  providerId?: string;
  userId?: string;
  threadId?: string;
  channelType?: string;
  channelId?: string;
  status?: "ok" | "error";
  code?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
};

export const logProviderAudit = (event: ProviderAuditEvent) => {
  console.info(
    JSON.stringify({
      scope: "familiar.provider",
      at: new Date().toISOString(),
      ...event,
    }),
  );

  if (event.providerId && event.userId) {
    appendProviderAuditEvent({
      providerId: event.providerId,
      userId: event.userId,
      event: {
        event: event.event,
        requestId: event.requestId,
        status: event.status,
        code: event.code,
        detail: event.detail,
        metadata: event.metadata,
      },
    }).catch(() => {
      // best-effort persistence; don't fail the request
    });
  }
};
