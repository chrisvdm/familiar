import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeExtractedMemoryFact } from "./chat.memory.identity.ts";
import {
  addFactToGlobalMemory,
  createEmptyGlobalMemory,
  normalizeGlobalMemory,
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
  createdAt: "2026-03-23T12:00:00.000Z",
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
  confidence: 0.92,
  updatedAt: "2026-03-23T12:00:01.000Z",
  sourceThreadId: "thread_123",
  sourceMessageIds,
});

test("drops inferred gender facts that are not explicitly stated", () => {
  const messages = [
    createUserMessage({
      id: "msg_1",
      content: "My name is Chris",
    }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({
      key: "gender",
      value: "male",
      sourceMessageIds: ["msg_1"],
    }),
    messagesById: new Map(messages.map((message) => [message.id, message])),
  });

  assert.equal(result, null);
});

test("keeps explicit gender facts and normalizes the stored value", () => {
  const messages = [
    createUserMessage({
      id: "msg_1",
      content: "I am female",
    }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({
      key: "gender",
      value: "woman",
      sourceMessageIds: ["msg_1"],
    }),
    messagesById: new Map(messages.map((message) => [message.id, message])),
  });

  assert.deepEqual(result, {
    ...createFact({
      key: "gender",
      value: "woman",
      sourceMessageIds: ["msg_1"],
    }),
    value: "female",
  });
});

test("drops inferred pronouns unless the user stated them explicitly", () => {
  const messages = [
    createUserMessage({
      id: "msg_1",
      content: "My name is Chris",
    }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({
      key: "pronouns",
      value: "he/him",
      sourceMessageIds: ["msg_1"],
    }),
    messagesById: new Map(messages.map((message) => [message.id, message])),
  });

  assert.equal(result, null);
});

test("stores accepted pronouns under identity memory", () => {
  const memory = createEmptyGlobalMemory();

  const nextMemory = addFactToGlobalMemory(
    memory,
    createFact({
      key: "pronouns",
      value: "she/her",
      sourceMessageIds: ["msg_1"],
    }),
  );

  assert.equal(nextMemory.identity.pronouns?.[0]?.value, "she/her");
  assert.equal(nextMemory.family.pronouns, undefined);
});

test("drops extracted name facts that were not explicitly stated", () => {
  const messages = [
    createUserMessage({
      id: "msg_1",
      content: "hello there",
    }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({
      key: "name",
      value: "familiar",
      sourceMessageIds: ["msg_1"],
    }),
    messagesById: new Map(messages.map((message) => [message.id, message])),
  });

  assert.equal(result, null);
});

test("keeps explicit profession facts and normalizes casing", () => {
  const messages = [
    createUserMessage({
      id: "msg_1",
      content: "I work as a Web Developer",
    }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({
      key: "profession",
      value: "Web Developer",
      sourceMessageIds: ["msg_1"],
    }),
    messagesById: new Map(messages.map((message) => [message.id, message])),
  });

  assert.deepEqual(result, {
    ...createFact({
      key: "profession",
      value: "Web Developer",
      sourceMessageIds: ["msg_1"],
    }),
    value: "web developer",
  });
});

test("drops extracted profession facts that are not explicitly supported", () => {
  const messages = [
    createUserMessage({
      id: "msg_1",
      content: "hi there",
    }),
  ];

  const result = sanitizeExtractedMemoryFact({
    fact: createFact({
      key: "profession",
      value: "semanticly found message",
      sourceMessageIds: ["msg_1"],
    }),
    messagesById: new Map(messages.map((message) => [message.id, message])),
  });

  assert.equal(result, null);
});

test("keeps explicit pet facts and drops unknown global fact keys", () => {
  const messages = [
    createUserMessage({
      id: "msg_1",
      content: "Emmett is my pet dog",
    }),
  ];

  const petFact = sanitizeExtractedMemoryFact({
    fact: createFact({
      key: "pet_name",
      value: "Emmett",
      sourceMessageIds: ["msg_1"],
    }),
    messagesById: new Map(messages.map((message) => [message.id, message])),
  });

  assert.equal(petFact?.value, "Emmett");

  const memory = createEmptyGlobalMemory();
  const nextMemory = addFactToGlobalMemory(
    memory,
    createFact({
      key: "user_name",
      value: "Chris",
      sourceMessageIds: ["msg_1"],
    }),
  );

  assert.equal(nextMemory.family.user_name, undefined);
});

test("normalizeGlobalMemory drops obviously bogus stored facts", () => {
  const normalized = normalizeGlobalMemory({
    identity: {
      name: [
        createFact({
          key: "name",
          value: "familiar",
          sourceMessageIds: ["msg_1"],
        }),
      ],
    },
    work: {
      profession: [
        createFact({
          key: "profession",
          value: "semanticly found message",
          sourceMessageIds: ["msg_1"],
        }),
      ],
    },
    family: {
      user_name: [
        createFact({
          key: "user_name",
          value: "Chris",
          sourceMessageIds: ["msg_1"],
        }),
      ],
    },
  });

  assert.equal(normalized.identity.name, undefined);
  assert.equal(normalized.work.profession, undefined);
  assert.equal(normalized.family.user_name, undefined);
});
