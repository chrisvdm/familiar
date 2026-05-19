"use client";

import { useCallback, useState } from "react";

export type DemoMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DemoTodo = {
  id: string;
  text: string;
  created_at: string;
};

const DEMO_TOKEN = "dev-token";
const DEMO_USER_ID = "demo_user";

export const useLiveDemo = () => {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [todos, setTodos] = useState<DemoTodo[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendDirectToolCall = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const match = trimmed.match(/^@(\S+)(?:\s+(.+))?$/);
      if (!match) return false;

      const toolName = match[1];
      const rawArgs = match[2] || "";

      let args: Record<string, unknown> = {};
      if (toolName === "todos.add") {
        const items = rawArgs
          .split(/,\s*|\s+and\s+/i)
          .map((s) => s.trim())
          .filter(Boolean);
        args = { todo_items: items.length > 0 ? items : [rawArgs.trim()] };
      } else {
        args = { text: rawArgs.trim() };
      }

      setIsLoading(true);
      setError(null);

      const userMessage: DemoMessage = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const response = await fetch("/sandbox/demo-executor/tools/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DEMO_TOKEN}`,
          },
          body: JSON.stringify({
            tool_name: toolName,
            user_id: DEMO_USER_ID,
            arguments: args,
          }),
        });

        const responseText = await response.text();
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(responseText) as Record<string, unknown>;
        } catch {
          console.error("[LiveDemo] Tool non-JSON:", response.status, responseText.slice(0, 500));
          throw new Error(`Tool returned ${response.status} (not JSON). Check console.`);
        }

        console.log("[LiveDemo] Tool response:", payload);

        if (!response.ok || !payload.ok) {
          const errorMessage =
            (payload.error as Record<string, string>)?.message ||
            `Tool failed: ${response.status}`;
          throw new Error(errorMessage);
        }

        const result = payload.result as Record<string, unknown> | undefined;
        const summary = typeof result?.summary === "string" ? result.summary : "Done.";
        const data = result?.data as Record<string, unknown> | undefined;
        const resultTodos = data?.todos as DemoTodo[] | undefined;

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: summary },
        ]);
        if (resultTodos) {
          setTodos(resultTodos);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool call failed.";
        setError(message);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${message}` },
        ]);
      } finally {
        setIsLoading(false);
      }

      return true;
    },
    [isLoading],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const isDirect = await sendDirectToolCall(text);
      if (isDirect) return;

      setIsLoading(true);
      setError(null);

      const userMessage: DemoMessage = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMessage]);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      let response: Response;

      try {
        response = await fetch("/sandbox/demo-executor/playground/texty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            token: DEMO_TOKEN,
            text: text.trim(),
            user_id: DEMO_USER_ID,
            thread_id: threadId,
          }),
        });
        clearTimeout(timeoutId);
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }

      try {
        const responseText = await response.text();
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(responseText) as Record<string, unknown>;
        } catch {
          console.error("[LiveDemo] Non-JSON response:", response.status, responseText.slice(0, 500));
          throw new Error(`Server returned ${response.status} (not JSON). Check console for details.`);
        }

        console.log("[LiveDemo] Response:", payload);

        if (!response.ok || !payload.ok) {
          const errorMessage =
            (payload.error as Record<string, string>)?.message ||
            `Request failed: ${response.status}`;
          throw new Error(errorMessage);
        }

        const assistantReply =
          typeof payload.assistant_reply === "string" ? payload.assistant_reply : "";

        const task = payload.task as Record<string, unknown> | undefined;
        const nextThreadId =
          typeof task?.thread_id === "string" ? task.thread_id : null;

        const payloadTodos = payload.todos as DemoTodo[] | undefined;

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantReply },
        ]);
        setThreadId(nextThreadId);
        if (payloadTodos) {
          setTodos(payloadTodos);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setError(message);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${message}` },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, threadId, sendDirectToolCall],
  );

  const resetDemo = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await fetch("/sandbox/demo-executor/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEMO_TOKEN}`,
        },
        body: JSON.stringify({ user_id: DEMO_USER_ID }),
      });
    } catch {
      // best effort
    }

    setMessages([]);
    setTodos([]);
    setThreadId(null);
    setIsLoading(false);
  }, []);

  return {
    messages,
    todos,
    isLoading,
    error,
    sendMessage,
    resetDemo,
  };
};
