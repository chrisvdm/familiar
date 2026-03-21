export const getRequestId = (request: Request) =>
  request.headers.get("X-Request-Id")?.trim() || crypto.randomUUID();

export const getIdempotencyHeader = (request: Request) =>
  request.headers.get("Idempotency-Key")?.trim() || null;

export const jsonResponse = ({
  requestId,
  body,
  status = 200,
  retryAfterSeconds,
  idempotentReplay = false,
}: {
  requestId: string;
  body: Record<string, unknown>;
  status?: number;
  retryAfterSeconds?: number;
  idempotentReplay?: boolean;
}) =>
  Response.json(
    {
      ...body,
      request_id: requestId,
    },
    {
      status,
      headers: {
        "X-Request-Id": requestId,
        ...(typeof retryAfterSeconds === "number"
          ? {
              "Retry-After": String(retryAfterSeconds),
            }
          : {}),
        ...(idempotentReplay ? { "X-Idempotent-Replay": "true" } : {}),
      },
    },
  );

export const jsonError = ({
  requestId,
  status,
  code,
  message,
  details = null,
  retryAfterSeconds,
}: {
  requestId: string;
  status: number;
  code: string;
  message: string;
  details?: unknown;
  retryAfterSeconds?: number;
}) =>
  jsonResponse({
    requestId,
    status,
    retryAfterSeconds,
    body: {
      error: {
        code,
        message,
        details,
      },
    },
  });

export const readJson = async <T,>(request: Request) => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
};

export const replayIdempotentResponse = ({
  requestId,
  replay,
}: {
  requestId: string;
  replay: {
    status: number;
    body: Record<string, unknown>;
  };
}) =>
  jsonResponse({
    requestId,
    status: replay.status,
    body: replay.body,
    idempotentReplay: true,
  });
