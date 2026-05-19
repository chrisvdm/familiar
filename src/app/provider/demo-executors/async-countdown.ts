const COUNTDOWN_SECONDS = 10;

const countdownStore = new Map<
  string,
  Array<{
    execution_id: string;
    status: "running" | "completed";
    started_at: string;
    completes_at: string;
    completed_at: string | null;
    seconds_remaining: number;
    completion_message: string;
  }>
>();

export const getCountdownsForUser = (userId: string) =>
  [...(countdownStore.get(userId) ?? [])].sort((left, right) =>
    left.started_at.localeCompare(right.started_at),
  );

const saveCountdown = ({
  userId,
  countdown,
}: {
  userId: string;
  countdown: ReturnType<typeof getCountdownsForUser>[number];
}) => {
  const current = getCountdownsForUser(userId);
  countdownStore.set(userId, [...current, countdown]);
};

export const markCountdownComplete = ({
  userId,
  executionId,
  completedAt,
}: {
  userId: string;
  executionId: string;
  completedAt: string;
}) => {
  const current = getCountdownsForUser(userId);
  const next = current.map((countdown) =>
    countdown.execution_id === executionId
      ? {
          ...countdown,
          status: "completed" as const,
          completed_at: completedAt,
          seconds_remaining: 0,
        }
      : countdown,
  );
  countdownStore.set(userId, next);
  return next.find((countdown) => countdown.execution_id === executionId) ?? null;
};

export const executeToolCall = ({
  payload,
  defaultUserId = "demo_user",
}: {
  payload: Record<string, unknown>;
  defaultUserId?: string;
}) => {
  const toolName = String(payload.tool_name || "").trim();

  if (toolName !== "countdown.start") {
    return {
      ok: false,
      state: "failed" as const,
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${toolName || "missing"}.`,
      },
    };
  }

  const userId = String(payload.user_id || defaultUserId).trim();
  const executionId = String(payload.execution_id || "").trim();
  const args = payload.arguments as Record<string, unknown> | undefined;
  const completionMessage =
    typeof args?.message === "string" && args.message.trim()
      ? args.message.trim()
      : "Countdown complete.";
  const startedAt = new Date().toISOString();
  const completesAt = new Date(Date.now() + COUNTDOWN_SECONDS * 1000).toISOString();

  saveCountdown({
    userId,
    countdown: {
      execution_id: executionId,
      status: "running",
      started_at: startedAt,
      completes_at: completesAt,
      completed_at: null,
      seconds_remaining: COUNTDOWN_SECONDS,
      completion_message: completionMessage,
    },
  });

  return {
    ok: true,
    state: "accepted" as const,
    result: {
      summary: `Started a ${COUNTDOWN_SECONDS} second countdown.`,
      data: {
        execution_id: executionId,
        seconds: COUNTDOWN_SECONDS,
        completion_message: completionMessage,
      },
    },
  };
};
