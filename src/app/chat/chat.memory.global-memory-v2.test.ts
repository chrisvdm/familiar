// worklog: docs/worklogs/2026-04-14-global-memory-v2.md
import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeExtractedMemoryFact } from "./chat.memory.identity.ts";
import {
  addFactToGlobalMemory,
  createEmptyGlobalMemory,
  type ChatMessage,
  type MemoryFact,
} from "./shared.ts";

const createUserMessage = ({
  id,
  content,
}: {
  id: string;
  content: string;
}): ChatMessage => ({
  id,
  role: "user",
  content,
  createdAt: "2026-04-14T10:00:00.000Z",
});

const createFact = ({
  key,
  value,
  sourceMessageIds,
}: {
  key: string;
  value: string;
  sourceMessageIds: string[];
}): MemoryFact => ({
  key,
  value,
  confidence: 0.95,
  updatedAt: "2026-04-14T10:00:01.000Z",
  sourceThreadId: "thread_test",
  sourceMessageIds,
});

// --- Name extraction ---

test("name fact is accepted when stated in lowercase", () => {
  const messages = [
    createUserMessage({ id: "msg_1", content: "my name is alice" }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({ key: "name", value: "alice", sourceMessageIds: ["msg_1"] }),
    messagesById: new Map(messages.map((m) => [m.id, m])),
  });

  assert.equal(result?.value, "alice");
});

test("name fact is accepted when message has a greeting prefix", () => {
  const messages = [
    createUserMessage({ id: "msg_1", content: "hello my name is alice" }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({ key: "name", value: "alice", sourceMessageIds: ["msg_1"] }),
    messagesById: new Map(messages.map((m) => [m.id, m])),
  });

  assert.equal(result?.value, "alice");
});

test("name fact is accepted from 'hi, my name is...' with comma", () => {
  const messages = [
    createUserMessage({ id: "msg_1", content: "hi, my name is alice" }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({ key: "name", value: "alice", sourceMessageIds: ["msg_1"] }),
    messagesById: new Map(messages.map((m) => [m.id, m])),
  });

  assert.equal(result?.value, "alice");
});

test("name fact is rejected when message contains no explicit name declaration", () => {
  const messages = [
    createUserMessage({ id: "msg_1", content: "i want to be a dancer" }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({ key: "name", value: "dancer", sourceMessageIds: ["msg_1"] }),
    messagesById: new Map(messages.map((m) => [m.id, m])),
  });

  assert.equal(result, null);
});

test("name fact is rejected when source message is unrelated to the fact", () => {
  const messages = [
    createUserMessage({ id: "msg_1", content: "hello there" }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({ key: "name", value: "familiar", sourceMessageIds: ["msg_1"] }),
    messagesById: new Map(messages.map((m) => [m.id, m])),
  });

  assert.equal(result, null);
});

// --- Fact routing ---

test("aspiration fact is stored in preferences.aspirations", () => {
  const memory = createEmptyGlobalMemory();

  const next = addFactToGlobalMemory(
    memory,
    createFact({ key: "aspiration", value: "dancer", sourceMessageIds: ["msg_1"] }),
  );

  assert.equal(next.preferences.aspirations[0]?.value, "dancer");
});

test("aspiration fact does not land in work bucket", () => {
  const memory = createEmptyGlobalMemory();

  const next = addFactToGlobalMemory(
    memory,
    createFact({ key: "aspiration", value: "dancer", sourceMessageIds: ["msg_1"] }),
  );

  assert.equal(next.work.profession, undefined);
});

test("first_name fact is stored in identity bucket", () => {
  const memory = createEmptyGlobalMemory();

  const next = addFactToGlobalMemory(
    memory,
    createFact({ key: "first_name", value: "alice", sourceMessageIds: ["msg_1"] }),
  );

  assert.equal(next.identity.first_name?.[0]?.value, "alice");
});

test("last_name fact is stored in identity bucket", () => {
  const memory = createEmptyGlobalMemory();

  const next = addFactToGlobalMemory(
    memory,
    createFact({ key: "last_name", value: "smith", sourceMessageIds: ["msg_1"] }),
  );

  assert.equal(next.identity.last_name?.[0]?.value, "smith");
});

test("nickname fact is stored in identity bucket", () => {
  const memory = createEmptyGlobalMemory();

  const next = addFactToGlobalMemory(
    memory,
    createFact({ key: "nickname", value: "ace", sourceMessageIds: ["msg_1"] }),
  );

  assert.equal(next.identity.nickname?.[0]?.value, "ace");
});
