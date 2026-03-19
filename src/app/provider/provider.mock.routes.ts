import { route } from "rwsdk/router";

import type { ProviderExecutionState } from "./provider.types";

type MockExecuteRequest = {
  tool_name?: string;
  arguments?: Record<string, unknown>;
};

const buildMockState = ({
  toolName,
  args,
}: {
  toolName: string;
  args: Record<string, unknown>;
}) => {
  const requestedState =
    typeof args.mock_state === "string" ? args.mock_state : null;

  if (
    requestedState === "accepted" ||
    requestedState === "in_progress" ||
    requestedState === "needs_clarification" ||
    requestedState === "failed" ||
    requestedState === "completed"
  ) {
    return requestedState satisfies ProviderExecutionState;
  }

  if (toolName === "spreadsheet.update_row") {
    const sheet = args.sheet;
    const rowId = args.row_id;
    const values = args.values;

    if (
      typeof sheet !== "string" ||
      !sheet.trim() ||
      typeof rowId !== "string" ||
      !rowId.trim() ||
      !values ||
      typeof values !== "object"
    ) {
      return "needs_clarification" satisfies ProviderExecutionState;
    }
  }

  return "completed" satisfies ProviderExecutionState;
};

export const providerMockRoutes = [
  route("/sandbox/mock-provider/tools/execute", async ({ request }) => {
    if (request.method !== "POST") {
      return Response.json(
        {
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
            details: null,
          },
        },
        { status: 405 },
      );
    }

    try {
      const payload = (await request.json()) as MockExecuteRequest;
      const toolName = payload.tool_name?.trim() || "";
      const args = payload.arguments ?? {};

      if (!toolName) {
        return Response.json(
          {
            ok: false,
            state: "failed",
            error: {
              code: "missing_tool_name",
              message: "tool_name is required.",
              details: null,
            },
          },
          { status: 400 },
        );
      }

      const state = buildMockState({ toolName, args });

      if (state === "failed") {
        return Response.json({
          ok: false,
          state,
          error: {
            code: "mock_failure",
            message: `Mock provider failed while running ${toolName}.`,
            details: null,
          },
        });
      }

      if (state === "needs_clarification") {
        return Response.json({
          ok: true,
          state,
          result: {
            summary: `Mock provider needs more information before running ${toolName}.`,
            data: {
              missing_fields: ["sheet", "row_id", "values"],
            },
          },
        });
      }

      if (state === "accepted") {
        return Response.json({
          ok: true,
          state,
          result: {
            summary: `Mock provider accepted ${toolName}.`,
            data: {
              queued: true,
            },
          },
        });
      }

      if (state === "in_progress") {
        return Response.json({
          ok: true,
          state,
          result: {
            summary: `Mock provider is running ${toolName}.`,
            data: {
              progress: "started",
            },
          },
        });
      }

      return Response.json({
        ok: true,
        state,
        result: {
          summary: `Mock provider completed ${toolName}.`,
          data: {
            echoed_arguments: args,
          },
        },
      });
    } catch {
      return Response.json(
        {
          ok: false,
          state: "failed",
          error: {
            code: "invalid_request",
            message: "Request body must be valid JSON.",
            details: null,
          },
        },
        { status: 400 },
      );
    }
  }),
];
