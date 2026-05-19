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
const COUNTDOWN_DURATION = 10;

export const useLiveDemo = () => {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [todos, setTodos] = useState<DemoTodo[]>([]);
  const [countdowns, setCountdowns] = useState<DemoCountdown[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tickCountdowns = useCallback(() => {
    setCountdowns((prev) =>
      prev.map((cd) => {
        if (cd.status === "completed") return cd;
        const nextSeconds = Math.max(0, cd.seconds_remaining - 1);
        const now = new Date().toISOString();
        return nextSeconds === 0
          ? {
              ...cd,
              status: "completed" as const,
              seconds_remaining: 0,
              completed_at: now,
            }
          : { ...cd, seconds_remaining: nextSeconds };
      }),
    );
  }, []);

  useEffect(() => {
    const interval = setInterval(tickCountdowns, 1000);
    return () => clearInterval(interval);
  }, [tickCountdowns]);

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

  const startCountdown = useCallback(async () => {
    const executionId = crypto.randomUUID();
    const now = new Date();
    const completesAt = new Date(now.getTime() + COUNTDOWN_DURATION * 1000);

    const newCountdown: DemoCountdown = {
      execution_id: executionId,
      status: "running",
      started_at: now.toISOString(),
      completes_at: completesAt.toISOString(),
      completed_at: null,
      seconds_remaining: COUNTDOWN_DURATION,
      completion_message: "Countdown complete.",
    };

    setCountdowns((prev) => [...prev, newCountdown]);

    // Best-effort server sync — works in production where waitUntil runs
    try {
      const res = await fetch("/sandbox/async-countdown/tools/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEMO_TOKEN}`,
        },
        body: JSON.stringify({
          tool_name: "countdown.start",
          user_id: DEMO_USER_ID,
          execution_id: executionId,
          arguments: { duration_seconds: COUNTDOWN_DURATION },
          context: {
            executor_result_webhook_url: `${window.location.origin}/sandbox/async-countdown/channels/messages`,
            channel: { type: "web", id: "async-countdown-playground" },
          },
        }),
      });
      const text = await res.text();
      console.log("[LiveDemo] Countdown start response:", res.status, text.slice(0, 200));
    } catch (err) {
      console.error("[LiveDemo] Countdown start failed:", err);
    }
  }, []);

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
    setCountdowns([]);
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
