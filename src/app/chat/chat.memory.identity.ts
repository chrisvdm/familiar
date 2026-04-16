import type { ChatMessage, MemoryFact } from "./shared.ts";

const EXPLICIT_FACT_PATTERNS: Record<string, RegExp[]> = {
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
  name: [
    /\bmy name is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    /\bi go by\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    /\bcall me\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
  ],
  profession: [
    /\bi work as\s+(?:a|an)\s+([a-z][a-z0-9 -]{1,60})\b/i,
    /\bi am\s+(?:a|an)\s+([a-z][a-z0-9 -]{1,60})\b/i,
    /\bi'm\s+(?:a|an)\s+([a-z][a-z0-9 -]{1,60})\b/i,
    /\bmy job is\s+([a-z][a-z0-9 -]{1,60})\b/i,
    /\bmy profession is\s+([a-z][a-z0-9 -]{1,60})\b/i,
  ],
  business: [
    /\bi run\s+(?:a|an)\s+([a-z][a-z0-9 -]{1,60})\b/i,
    /\bi own\s+(?:a|an)\s+([a-z][a-z0-9 -]{1,60})\b/i,
    /\bmy business is\s+([a-z][a-z0-9 -]{1,60})\b/i,
  ],
  spouse_name: [
    /\bmy spouse(?:'s)? name is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    /\bmy spouse is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
  ],
  partner_name: [
    /\bmy partner(?:'s)? name is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    /\bmy partner is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
  ],
  wife_name: [
    /\bmy wife(?:'s)? name is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    /\bmy wife is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
  ],
  husband_name: [
    /\bmy husband(?:'s)? name is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    /\bmy husband is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
  ],
  dog_name: [
    /\bmy dog(?:'s)? name is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    /\b([A-Z][a-z]+(?: [A-Z][a-z]+){0,2}) is my dog\b/i,
    /\bmy dog is named\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
  ],
  cat_name: [
    /\bmy cat(?:'s)? name is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    /\b([A-Z][a-z]+(?: [A-Z][a-z]+){0,2}) is my cat\b/i,
    /\bmy cat is named\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
  ],
  pet_name: [
    /\bmy pet(?:'s)? name is\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    /\b([A-Z][a-z]+(?: [A-Z][a-z]+){0,2}) is my pet\b/i,
    /\bmy pet is named\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    /\b([A-Z][a-z]+(?: [A-Z][a-z]+){0,2}) is my pet dog\b/i,
    /\b([A-Z][a-z]+(?: [A-Z][a-z]+){0,2}) is my pet cat\b/i,
  ],
};

const SUSPICIOUS_NAME_VALUES = new Set(["familiar", "texty", "assistant", "bot"]);
const SUSPICIOUS_PROFILE_PATTERN =
  /\b(semantic(?:ly)?|message|assistant|system prompt|tool|shortcut|executor)\b/i;

const sanitizeSupportedValue = ({
  key,
  value,
}: {
  key: string;
  value: string;
}) => {
  const trimmed = value.trim();

  if (key === "gender") {
    const normalized = trimmed.toLowerCase();

    if (["woman", "female", "girl"].includes(normalized)) {
      return "female";
    }

    if (["man", "male", "boy"].includes(normalized)) {
      return "male";
    }

    return normalized;
  }

  if (key === "pronouns") {
    return trimmed.toLowerCase().replace(/\s+/g, "");
  }

  if (key === "profession" || key === "business") {
    return trimmed.toLowerCase();
  }

  return trimmed;
};

const getSourceMessages = ({
  fact,
  messagesById,
}: {
  fact: MemoryFact;
  messagesById: Map<string, ChatMessage>;
}) =>
  (fact.sourceMessageIds ?? [])
    .map((messageId) => messagesById.get(messageId))
    .filter((message): message is ChatMessage => Boolean(message));

const extractSupportedValue = ({
  key,
  sourceMessages,
}: {
  key: string;
  sourceMessages: ChatMessage[];
}): string | null => {
  const patterns = EXPLICIT_FACT_PATTERNS[key];

  if (!patterns || sourceMessages.length === 0) {
    return null;
  }

  for (const message of sourceMessages) {
    if (message.role !== "user") {
      continue;
    }

    const content = message.content.trim();

    for (const pattern of patterns) {
      const match = content.match(pattern);
      const capturedValue = match?.[1]?.trim();

      if (capturedValue) {
        return sanitizeSupportedValue({ key, value: capturedValue });
      }
    }
  }

  return null;
};

const isSuspiciousFactValue = ({ key, value }: { key: string; value: string }) => {
  const normalized = value.trim().toLowerCase();

  if (key === "name") {
    return SUSPICIOUS_NAME_VALUES.has(normalized);
  }

  if (key === "profession" || key === "business") {
    return SUSPICIOUS_PROFILE_PATTERN.test(normalized);
  }

  return false;
};

const EXPLICIT_ONLY_KEYS = new Set([
  "gender",
  "pronouns",
  "name",
  "profession",
  "business",
  "spouse_name",
  "partner_name",
  "wife_name",
  "husband_name",
  "dog_name",
  "cat_name",
  "pet_name",
]);

export const sanitizeExtractedMemoryFact = ({
  fact,
  messagesById,
}: {
  fact: MemoryFact;
  messagesById: Map<string, ChatMessage>;
}) => {
  if (isSuspiciousFactValue({ key: fact.key, value: fact.value })) {
    return null;
  }

  if (!EXPLICIT_ONLY_KEYS.has(fact.key)) {
    return fact;
  }

  const sourceMessages = getSourceMessages({ fact, messagesById });

  const extractedValue = extractSupportedValue({
    key: fact.key,
    sourceMessages,
  });

  if (!extractedValue) {
    return null;
  }

  return {
    ...fact,
    value: extractedValue,
  };
};
