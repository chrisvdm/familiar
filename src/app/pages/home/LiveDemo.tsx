"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

import Section from "@/app/components/Section/Section";
import Code from "@/app/components/Code/Code";
import { minimalExecutorTools } from "@/app/provider/demo-executors/manifests";
import { useLiveDemo } from "./useLiveDemo";

const LiveDemo = () => {
  const { messages, todos, isLoading, sendMessage, resetDemo } = useLiveDemo();
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState("");
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

  return (
    <Section title="Live Demo">
      <p>
        This demo connects up with the <code>todoList</code> tool.
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
                  {message.role === "user" ? (
                    <p style={{ margin: 0 }}>{message.content}</p>
                  ) : (
                    <div
                      style={{
                        fontSize: "12px",
                        lineHeight: 1.5,
                      }}
                    >
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => (
                            <p style={{ margin: "0 0 0.5em 0" }}>{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul style={{ margin: "0 0 0.5em 0", paddingLeft: "1.2em" }}>{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol style={{ margin: "0 0 0.5em 0", paddingLeft: "1.2em" }}>{children}</ol>
                          ),
                          li: ({ children }) => (
                            <li style={{ margin: "0.15em 0" }}>{children}</li>
                          ),
                          strong: ({ children }) => (
                            <strong style={{ color: "var(--action-intense)" }}>{children}</strong>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
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


            </div>
          </div>

          {/* Workpanel with accordions */}
          <div
            className="workpanel width--3 padding--small"
            style={{ overflowY: "auto", minHeight: 0 }}
          >
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
                onClick={() => handleAccordianClick("json")}
              >
                <h4>Tools config json</h4>
              </li>
              {open === "json" && (
                <div className="accordian__item__content padding--small border-radius">
                  <Code>{JSON.stringify(minimalExecutorTools, null, 2)}</Code>
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
          <i>Type <code>@todos.add</code> to call a tool directly — e.g. <code>@todos.add buy milk</code></i>
        </p>
      </div>
    </Section>
  );
};

export default LiveDemo;
