"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DemoMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DemoTodo = {
  id: string;
  text: string;
  created_at: string;
};

export type DemoCountdown = {
  execution_id: string;
  status: "running" | "completed";
  started_at: string;
  completes_at: string;
  completed_at: string | null;
  seconds_remaining: number;
  completion_message: string;
};

const DEMO_TOKEN = "dev-token";
const DEMO_USER_ID = "demo_user";

export const useLiveDemo = () => {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [todos, setTodos] = useState<DemoTodo[]>([]);
  const [countdowns, setCountdowns] = useState<DemoCountdown[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCountdowns = useCallback(async () => {
    try {
      const response = await fetch(
        `/sandbox/async-countdown/playground/texty?token=${DEMO_TOKEN}&user_id=${DEMO_USER_ID}`,
        { method: "GET" },
      );
      const payload = (await response.json()) as Record<string, unknown>;
      if (payload.ok && Array.isArray(payload.countdowns)) {
        setCountdowns(payload.countdowns as DemoCountdown[]);
      }
    } catch {
      // silently ignore polling errors
    }
  }, []);

  useEffect(() => {
    fetchCountdowns();
    pollRef.current = setInterval(fetchCountdowns, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchCountdowns]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      setIsLoading(true);
      setError(null);

      const userMessage: DemoMessage = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const response = await fetch("/sandbox/demo-executor/playground/texty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: DEMO_TOKEN,
            text: text.trim(),
            user_id: DEMO_USER_ID,
            thread_id: threadId,
          }),
        });

        const payload = (await response.json()) as Record<string, unknown>;

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

  const startCountdown = useCallback(async () => {
    try {
      const executionId = crypto.randomUUID();
      await fetch("/sandbox/async-countdown/tools/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEMO_TOKEN}`,
        },
        body: JSON.stringify({
          tool_name: "countdown.start",
          user_id: DEMO_USER_ID,
          execution_id: executionId,
          arguments: { duration_seconds: 10 },
          context: {
            executor_result_webhook_url: `${window.location.origin}/sandbox/async-countdown/channels/messages`,
            channel: { type: "web", id: "async-countdown-playground" },
          },
        }),
      });
      await fetchCountdowns();
    } catch {
      // best effort
    }
  }, [fetchCountdowns]);

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
    countdowns,
    isLoading,
    error,
    sendMessage,
    startCountdown,
    resetDemo,
  };
};
