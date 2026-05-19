"use client";

import { useRef, useEffect, useState } from "react";

import Section from "@/app/components/Section/Section";
import Code from "@/app/components/Code/Code";
import { useLiveDemo } from "./useLiveDemo";

const LiveDemo = () => {
  const { messages, todos, countdowns, isLoading, sendMessage, startCountdown, resetDemo } =
    useLiveDemo();
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleAccordianClick = (item = "") => {
    const newItem = item === open ? "" : item;
    setOpen(newItem);
  };

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
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
        This demo connects up with <code>todoList</code> and <code>countDown</code> tools.
      </p>

      <div className="live-demo bg--primary flex--column">
        <div className="flex--row flex--1">
          {/* Chat history */}
          <div
            className="chat-history border-right flex--1 padding--small"
            style={{ minHeight: 0, overflowY: "auto" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {messages.length === 0 && (
                <p className="text--muted" style={{ fontStyle: "italic" }}>
                  chat history
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
                    overflowWrap: "break-word",
                  }}
                >
                  <p style={{ margin: 0 }}>{message.content}</p>
                </div>
              ))}

              {isLoading && (
                <div
                  className="padding--small border-radius bg--tertiary"
                  style={{ alignSelf: "flex-start", maxWidth: "80%", overflowWrap: "break-word" }}
                >
                  <p style={{ margin: 0, fontStyle: "italic" }}>Thinking…</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Workpanel with accordions */}
          <div className="workpanel width--3 padding--small">
            <ul className="accordian flex--gap padding--small">
              <h4>Tools</h4>

              <li
                className="accordian__item"
                role="button"
                onClick={() => handleAccordianClick("todoList")}
              >
                <code>todoList</code>
              </li>
              {open === "todoList" && (
                <div className="accordian__item__content padding--small border-radius">
                  {todos.length === 0 ? (
                    <p className="text--muted" style={{ margin: 0, fontStyle: "italic" }}>
                      No todos yet.
                    </p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {todos.map((todo) => (
                        <li key={todo.id} className="padding--small">
                          {todo.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <li
                className="accordian__item"
                role="button"
                onClick={() => handleAccordianClick("countDown")}
              >
                <code>countDown</code>
              </li>
              {open === "countDown" && (
                <div className="accordian__item__content padding--small border-radius">
                  {countdowns.length === 0 ? (
                    <div>
                      <p className="text--muted" style={{ margin: 0, fontStyle: "italic" }}>
                        No countdowns running.
                      </p>
                      <button
                        className="button padding--small"
                        style={{ marginTop: "0.5rem" }}
                        onClick={startCountdown}
                      >
                        Start 10s countdown
                      </button>
                    </div>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {countdowns.map((cd) => (
                        <li key={cd.execution_id} className="padding--small">
                          <span>
                            {cd.status === "running" ? "⏱" : "✅"} {" "}
                            {cd.status === "running"
                              ? `${cd.seconds_remaining}s…`
                              : cd.completion_message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <li
                className="accordian__item"
                role="button"
                onClick={() => handleAccordianClick("json")}
              >
                <h4>Tools config json</h4>
              </li>
              {open === "json" && (
                <div className="accordian__item__content padding--small border-radius">
                  <Code>{`[
  {
    "tool_name": "todos.add",
    "description": "Add items to a todo list",
    "input_schema": {
      "type": "object",
      "properties": {
        "todo_items": {
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["todo_items"]
    }
  }
]`}</Code>
                </div>
              )}
            </ul>
          </div>
        </div>

        {/* Input bar */}
        <div className="border-top padding--small">
          <input
            className="input--text padding--small"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <div className="button-group">
            <button
              className="button padding--small"
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
            >
              send
            </button>
            <button
              className="button padding--small"
              onClick={resetDemo}
              disabled={isLoading}
            >
              clear memory
            </button>
          </div>
        </div>

        <p className="border-top padding--small">
          <i>Use @ to shortcut tools</i>
        </p>
      </div>
    </Section>
  );
};

export default LiveDemo;
