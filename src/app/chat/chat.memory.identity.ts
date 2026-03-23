import type { ChatMessage, MemoryFact } from "./shared.ts";

const EXPLICIT_IDENTITY_FACT_PATTERNS: Record<string, RegExp[]> = {
  gender: [
    /\b(?:i am|i'm)\s+(?:a\s+)?(woman|female|girl)\b/i,
    /\b(?:i am|i'm)\s+(?:a\s+)?(man|male|boy)\b/i,
    /\bmy gender is\s+([a-z][a-z -]{1,40})\b/i,
  ],
  pronouns: [
    /\bmy pronouns are\s+([a-z/ -]{2,40})\b/i,
    /\bi use\s+([a-z/ -]{2,40})\s+pronouns\b/i,
    /\b(?:my|the)\s+pronouns\s*[:=-]\s*([a-z/ -]{2,40})\b/i,
  ],
};

const sanitizeIdentityValue = ({
  key,
  value,
}: {
  key: string;
  value: string;
}) => {
  const normalized = value.trim().toLowerCase();

  if (key === "gender") {
    if (["woman", "female", "girl"].includes(normalized)) {
      return "female";
    }

    if (["man", "male", "boy"].includes(normalized)) {
      return "male";
    }

    return normalized;
  }

  if (key === "pronouns") {
    return normalized.replace(/\s+/g, "");
  }

  return normalized;
};

const explicitlySupportsIdentityFact = ({
  key,
  value,
  sourceMessages,
}: {
  key: string;
  value: string;
  sourceMessages: ChatMessage[];
}) => {
  const patterns = EXPLICIT_IDENTITY_FACT_PATTERNS[key];

  if (!patterns || sourceMessages.length === 0) {
    return false;
  }

  const normalizedValue = sanitizeIdentityValue({ key, value });

  return sourceMessages.some((message) => {
    if (message.role !== "user") {
      return false;
    }

    const content = message.content.trim();

    return patterns.some((pattern) => {
      const match = content.match(pattern);
      const capturedValue = match?.[1]?.trim();

      if (!capturedValue) {
        return false;
      }

      return sanitizeIdentityValue({ key, value: capturedValue }) === normalizedValue;
    });
  });
};

export const sanitizeExtractedMemoryFact = ({
  fact,
  messagesById,
}: {
  fact: MemoryFact;
  messagesById: Map<string, ChatMessage>;
}) => {
  if (fact.key !== "gender" && fact.key !== "pronouns") {
    return fact;
  }

  const sourceMessages = (fact.sourceMessageIds ?? [])
    .map((messageId) => messagesById.get(messageId))
    .filter((message): message is ChatMessage => Boolean(message));

  if (
    !explicitlySupportsIdentityFact({
      key: fact.key,
      value: fact.value,
      sourceMessages,
    })
  ) {
    return null;
  }

  return {
    ...fact,
    value: sanitizeIdentityValue({
      key: fact.key,
      value: fact.value,
    }),
  };
};
