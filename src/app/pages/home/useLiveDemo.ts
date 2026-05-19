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

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

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
    [isLoading, threadId],
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
