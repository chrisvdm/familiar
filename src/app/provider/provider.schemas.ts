import { z } from "zod";

// ─── Integration schemas ────────────────────────────────────────────────────

export const integrationPatchSchema = z.object({
  base_url: z.string().url().nullable().optional(),
  ai_api_key: z
    .union([
      z.string().startsWith("sk-or-v1-", {
        message: "Unrecognised API key format. Expected an OpenRouter key starting with sk-or-v1-.",
      }),
      z.null(),
    ])
    .optional(),
  transport: z.enum(["webhook", "websocket"]).optional(),
});

export type IntegrationPatchInput = z.infer<typeof integrationPatchSchema>;

// ─── Provider tool sync schema ──────────────────────────────────────────────

export const providerToolSchema = z.object({
  tool_name: z.string().min(1),
  description: z.string().min(1),
  input_schema: z.record(z.string(), z.unknown()),
  input_mode: z.enum(["processed", "raw"]).optional(),
  executor_payload: z.unknown().optional(),
  policy: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  base_url: z.string().url().optional(),
});

export const providerToolSyncSchema = z.object({
  integration_id: z.string().min(1),
  user_id: z.string().min(1),
  tools: z.array(providerToolSchema).min(1).max(500),
});

export type ProviderToolSyncInput = z.infer<typeof providerToolSyncSchema>;

// ─── Provider conversation input schema ─────────────────────────────────────

export const providerConversationInputSchema = z.object({
  integration_id: z.string().min(1),
  user_id: z.string().min(1),
  thread_id: z.string().min(1).optional(),
  channel: z.object({
    type: z.string().min(1),
    id: z.string().min(1),
  }),
  input: z.object({
    kind: z.literal("text"),
    text: z.string().min(1).max(500 * 1024),
    append: z.boolean().optional(),
    final: z.boolean().optional(),
  }),
  timezone: z.string().optional(),
  context: z
    .object({
      external_memories: z.array(z.string()).optional(),
    })
    .optional(),
  tools: z.array(providerToolSchema).optional(),
  model: z.string().optional(),
});

export type ProviderConversationInput = z.infer<
  typeof providerConversationInputSchema
>;

// ─── Provider executor result schema ────────────────────────────────────────

export const providerExecutorResultSchema = z.object({
  integration_id: z.string().min(1).optional(),
  user_id: z.string().min(1).optional(),
  thread_id: z.string().min(1).optional(),
  channel: z
    .object({
      type: z.string().min(1),
      id: z.string().min(1),
    })
    .optional(),
  result: z.object({
    execution_id: z.string().optional(),
    tool_name: z.string().optional(),
    state: z.enum(["completed", "needs_clarification", "accepted", "in_progress", "failed"]),
    content: z.string().min(1),
    data: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ProviderExecutorResultInput = z.infer<
  typeof providerExecutorResultSchema
>;

// ─── Thread create schema ───────────────────────────────────────────────────

export const threadCreateSchema = z.object({
  integration_id: z.string().min(1).optional(),
  user_id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  is_private: z.boolean().optional(),
  channel: z.object({
    type: z.string().min(1),
    id: z.string().min(1),
  }),
});

export type ThreadCreateInput = z.infer<typeof threadCreateSchema>;

// ─── Thread mutation schema ─────────────────────────────────────────────────

export const threadMutationSchema = z.object({
  integration_id: z.string().min(1).optional(),
  user_id: z.string().min(1).optional(),
  thread_id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
});

export type ThreadMutationInput = z.infer<typeof threadMutationSchema>;
