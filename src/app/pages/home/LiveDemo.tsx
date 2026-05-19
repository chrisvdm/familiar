"use client";

import { useRef, useEffect, useState } from "react";

import Section from "@/app/components/Section/Section";
import { useLiveDemo } from "./useLiveDemo";

const LiveDemo = () => {
  const { messages, todos, isLoading, sendMessage, resetDemo } = useLiveDemo();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <Section title="Live Demo" id="live-demo">
      <p>
        Try it out. Add todos by typing things like{" "}
        <em>"buy milk and call mom"</em>.
      </p>

      <div className="live-demo bg--primary flex--column">
        <div className="flex--row flex--1" style={{ minHeight: "320px" }}>
          {/* Chat panel */}
          <div className="chat-history border-right flex--1 padding--small">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                height: "100%",
                overflowY: "auto",
              }}
            >
              {messages.length === 0 && (
                <p className="text--muted" style={{ fontStyle: "italic" }}>
                  Your conversation will appear here…
                </p>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`padding--small border-radius ${
                    message.role === "user"
                      ? "bg--secondary"
                      : "bg--tertiary"
                  }`}
                  style={{
                    alignSelf:
                      message.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                  }}
                >
                  <p style={{ margin: 0 }}>{message.content}</p>
                </div>
              ))}

              {isLoading && (
                <div
                  className="padding--small border-radius bg--tertiary"
                  style={{ alignSelf: "flex-start", maxWidth: "80%" }}
                >
                  <p style={{ margin: 0, fontStyle: "italic" }}>Thinking…</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Todo sidebar */}
          <div className="workpanel width--3 padding--small">
            <h4 style={{ marginTop: 0 }}>Todo List</h4>
            {todos.length === 0 ? (
              <p className="text--muted" style={{ fontStyle: "italic" }}>
                No todos yet.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {todos.map((todo) => (
                  <li
                    key={todo.id}
                    className="padding--small border-radius bg--secondary"
                  >
                    {todo.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div className="border-top padding--small">
          <div className="flex--row flex--gap">
            <input
              className="input--text padding--small flex--1"
              type="text"
              placeholder="Type a message…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button
              className="button padding--small"
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
            >
              Send
            </button>
            <button
              className="button padding--small button--secondary"
              onClick={resetDemo}
              disabled={isLoading}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
};

export default LiveDemo;
