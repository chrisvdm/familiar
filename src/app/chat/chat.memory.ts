import { env } from "cloudflare:workers";
import { sanitizeExtractedMemoryFact } from "./chat.memory.identity.ts";
import { createDateTimeSystemPrompt, DEFAULT_MODEL } from "./conversation.runtime.ts";

import {
  addFactToGlobalMemory,
  buildGlobalMemoryMarkdown,
  buildThreadMemoryMarkdown,
  type ChatMessage,
  flattenGlobalMemoryFacts,
  type GlobalMemory,
  type GlobalThreadSummary,
  type MemoryFact,
  type ThreadMemory,
} from "./shared.ts";

const memoryEnv = env as typeof env & {
  OPENROUTER_MEMORY_MODEL?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_MEMORY_SELECTOR_MODEL?: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_SITE_NAME?: string;
  OPENROUTER_API_KEY?: string;
};

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type RawMemoryFact = {
  key?: string;
  value?: string;
  confidence?: number;
  source_message_ids?: string[];
};

type MemoryExtraction = {
  thread_summary?: string;
  thread_keywords?: string[];
  thread_facts?: RawMemoryFact[];
  profile_facts?: RawMemoryFact[];
};

type DerivedMemoryFact = {
  key: string;
  value: string;
  confidence: number;
  rationale: string;
};

type MemorySelectorResponse = {
  reasoning?: string;
  thread_fact_ids?: string[];
  global_fact_ids?: string[];
  derived_fact_ids?: string[];
  thread_summary_ids?: string[];
  snippet_ids?: string[];
};

type MemorySelectionIds = {
  threadFactIds: string[];
  globalFactIds: string[];
  derivedFactIds: string[];
  threadSummaryIds: string[];
  snippetIds: string[];
};

type MemoryContextCandidate<T> = {
  id: string;
  line: string;
  item: T;
};

const EXTRACTION_MESSAGE_LIMIT = 12;
const MEMORY_FACT_LIMIT = 6;
const MEMORY_SNIPPET_LIMIT = 3;
const MEMORY_THREAD_SUMMARY_LIMIT = 4;
const MEMORY_SELECTOR_FACT_LIMIT = 8;
const MEMORY_SELECTOR_SNIPPET_LIMIT = 5;
const MEMORY_SELECTOR_THREAD_SUMMARY_LIMIT = 6;
const GLOBAL_MEMORY_KEYS = new Set([
  "name",
  "children_count",
  "child_name",
  "children_names",
  "sibling_count",
  "sibling_name",
  "siblings",
  "spouse_name",
  "partner_name",
  "wife_name",
  "husband_name",
  "family_history",
  "profession",
  "business",
  "location",
  "dog_name",
  "cat_name",
  "pet_name",
  "interest",
  "interests",
  "preference",
  "preferences",
  "favorite",
  "favorite_food",
  "favorite_drink",
  "favorite_music",
  "favorite_movie",
  "favorite_color",
  "fear",
  "fears",
  "likes",
  "dislikes",
]);

const looksLikePreference = (value: string) =>
  /\b(love|like|prefer|favorite|fan|enthusiast|hobby|hobbyist|phile|obsessed)\b/i.test(
    value,
  );

const isPlausibleName = (value: string) =>
  /^[A-Z][a-z]+(?: [A-Z][a-z]+){0,2}$/.test(value.trim());

const isPlausibleCount = (value: string) => {
  const count = Number.parseInt(value.trim(), 10);

  return !Number.isNaN(count) && count >= 0 && count <= 20;
};

const isPlausibleProfileText = (value: string) => {
  const normalized = value.trim();

  if (!normalized || normalized.length > 60 || looksLikePreference(normalized)) {
    return false;
  }

  return /^[a-zA-Z][a-zA-Z0-9 -]{1,59}$/.test(normalized);
};

const isPlausiblePetName = (value: string) =>
  /^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/.test(value.trim());

const isPlausiblePreferenceText = (value: string) => {
  const normalized = value.trim();

  if (!normalized || normalized.length > 80) {
    return false;
  }

  return /^[a-zA-Z][a-zA-Z0-9 ,&'-]{1,79}$/.test(normalized);
};

const isPlausibleFamilyText = (value: string) => {
  const normalized = value.trim();

  if (!normalized || normalized.length > 100) {
    return false;
  }

  return /^[a-zA-Z0-9][a-zA-Z0-9 ,&'-]{1,99}$/.test(normalized);
};
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "some",
  "than",
  "that",
  "them",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

const QUERY_ALIASES: Record<string, string[]> = {
  color: ["colour", "favorite_color"],
  colour: ["color", "favorite_color"],
  favorite: ["favourite", "preference", "preferences"],
  favourite: ["favorite", "preference", "preferences"],
  fear: ["fears", "afraid", "phobia"],
  fears: ["fear", "afraid", "phobia"],
  afraid: ["fear", "fears", "phobia"],
  kids: ["children", "family"],
  children: ["kids", "family"],
  husband: ["spouse", "partner", "family"],
  married: ["marriage", "spouse", "husband", "wife", "partner"],
  marriage: ["married", "spouse", "husband", "wife", "partner"],
  wife: ["spouse", "partner", "family"],
  spouse: ["husband", "wife", "partner", "family"],
  partner: ["spouse", "husband", "wife", "family"],
  parent: ["children", "kids", "family"],
  job: ["work", "profession", "business"],
  work: ["job", "profession", "business"],
  profession: ["job", "work", "business"],
};

const MEMORY_EXTRACTION_SYSTEM_PROMPT =
  "You extract lightweight durable memory for a personal chat app. Return JSON only. Do not include markdown fences. Capture thread summary, keywords, thread facts, and stable user profile facts. Never invent facts. Prefer facts the user stated directly. Do not infer gender, sex, or pronouns from a name, writing style, relationship terms, or any other indirect cue. Only store gender or pronouns if the user explicitly stated them. Ignore transient tasks, moods, and one-off requests.";

const MEMORY_SELECTOR_SYSTEM_PROMPT =
  "You select the smallest useful subset of stored memory for another model. Return JSON only. Do not include markdown fences. Choose only memories that are explicitly relevant to the user's latest message. Prefer too little over too much. Never invent facts or ids. Use the provided ids exactly as given.";

const clampConfidence = (value: number | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.7;
  }

  return Math.min(0.99, Math.max(0.1, value));
};

const normalizeFactKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

const dedupeStrings = (values: string[]) =>
  Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

const dedupeFactList = (facts: MemoryFact[]) => {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const key = `${fact.key}:${fact.value.trim().toLowerCase()}:${
      fact.sourceThreadId ?? ""
    }`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const dedupeDerivedFactList = (facts: DerivedMemoryFact[]) => {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const key = `${fact.key}:${fact.value.trim().toLowerCase()}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const dedupeThreadSummaryList = (summaries: GlobalThreadSummary[]) => {
  const seen = new Set<string>();

  return summaries.filter((summary) => {
    if (seen.has(summary.threadId)) {
      return false;
    }

    seen.add(summary.threadId);
    return true;
  });
};

const dedupeMessageList = (messages: ChatMessage[]) => {
  const seen = new Set<string>();

  return messages.filter((message) => {
    if (seen.has(message.id)) {
      return false;
    }

    seen.add(message.id);
    return true;
  });
};

const extractJsonObject = (content: string) => {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? trimmed;
};

const parseExtraction = (content: string): MemoryExtraction | null => {
  try {
    return JSON.parse(extractJsonObject(content)) as MemoryExtraction;
  } catch {
    return null;
  }
};

const parseMemorySelectorResponse = (
  content: string,
): MemorySelectionIds | null => {
  try {
    const parsed = JSON.parse(extractJsonObject(content)) as MemorySelectorResponse;
    const normalizeIds = (value: unknown) =>
      Array.isArray(value)
        ? value
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];

    return {
      threadFactIds: normalizeIds(parsed.thread_fact_ids),
      globalFactIds: normalizeIds(parsed.global_fact_ids),
      derivedFactIds: normalizeIds(parsed.derived_fact_ids),
      threadSummaryIds: normalizeIds(parsed.thread_summary_ids),
      snippetIds: normalizeIds(parsed.snippet_ids),
    };
  } catch {
    return null;
  }
};


const createHeuristicFact = ({
  key,
  value,
  confidence,
  timestamp,
  threadId,
  messageId,
}: {
  key: string;
  value: string;
  confidence: number;
  timestamp: string;
  threadId: string;
  messageId: string;
}): MemoryFact => ({
  key,
  value,
  confidence,
  updatedAt: timestamp,
  sourceThreadId: threadId,
  sourceMessageIds: [messageId],
});

const tokenize = (input: string) =>
  Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
    ),
  );

const expandQueryTokens = (tokens: string[]) =>
  Array.from(
    new Set(
      tokens.flatMap((token) => [token, ...(QUERY_ALIASES[token] ?? [])]),
    ),
  );

const scoreTextAgainstQuery = (text: string, queryTokens: string[]) => {
  if (queryTokens.length === 0) {
    return 0;
  }

  const haystack = tokenize(text);
  return queryTokens.reduce(
    (score, token) => (haystack.includes(token) ? score + 1 : score),
    0,
  );
};

const isPersonalMemoryQuery = (query: string) =>
  /\b(my|me|i am|i'm|name|family|kids|children|wife|husband|partner|job|work|profession|bio|remember)\b/i.test(
    query,
  );

const isBroadPersonalMemoryQuery = (query: string) =>
  /\b(what do you know about me|who am i|tell me about myself|summari[sz]e (me|what you know)|what do you remember about me|what do you know of me)\b/i.test(
    query,
  );

const getMessagesForExtraction = (messages: ChatMessage[]) =>
  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-EXTRACTION_MESSAGE_LIMIT)
    .map(
      (message) =>
        `- id=${message.id}; role=${message.role}; at=${message.createdAt}; content=${JSON.stringify(message.content)}`,
    )
    .join("\n");

const toMemoryFact = ({
  rawFact,
  timestamp,
  threadId,
}: {
  rawFact: RawMemoryFact;
  timestamp: string;
  threadId: string;
}): MemoryFact | null => {
  const rawKey = rawFact.key?.trim() ?? "";
  const value = rawFact.value?.trim() ?? "";

  if (!rawKey || !value) {
    return null;
  }

  const key = normalizeFactKey(rawKey);

  if (!key) {
    return null;
  }

  return {
    key,
    value,
    confidence: clampConfidence(rawFact.confidence),
    updatedAt: timestamp,
    sourceThreadId: threadId,
    sourceMessageIds: dedupeStrings(rawFact.source_message_ids ?? []),
  };
};

const mergeFactLists = (...factLists: MemoryFact[][]) =>
  factLists
    .flat()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const mergeThreadSummaries = (
  currentSummaries: GlobalThreadSummary[],
  nextSummary: GlobalThreadSummary,
) =>
  [
    nextSummary,
    ...currentSummaries.filter((entry) => entry.threadId !== nextSummary.threadId),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const sanitizeGlobalFact = (fact: MemoryFact) => {
  if (!GLOBAL_MEMORY_KEYS.has(fact.key)) {
    if (fact.key === "gender" || fact.key === "pronouns") {
      return fact;
    }

    return null;
  }

  if (fact.key === "name" && !isPlausibleName(fact.value)) {
    return null;
  }

  if (fact.key === "children_count" && !isPlausibleCount(fact.value)) {
    return null;
  }

  if (
    ["profession", "business", "location"].includes(fact.key) &&
    !isPlausibleProfileText(fact.value)
  ) {
    return null;
  }

  if (
    [
      "interest",
      "interests",
      "preference",
      "preferences",
      "favorite",
      "favorite_food",
      "favorite_drink",
      "favorite_music",
      "favorite_movie",
      "favorite_color",
      "fear",
      "fears",
      "likes",
      "dislikes",
    ].includes(fact.key) &&
    !isPlausiblePreferenceText(fact.value)
  ) {
    return null;
  }

  if (
    [
      "child_name",
      "children_names",
      "sibling_name",
      "siblings",
      "spouse_name",
      "partner_name",
      "wife_name",
      "husband_name",
      "family_history",
    ].includes(fact.key) &&
    !isPlausibleFamilyText(fact.value)
  ) {
    return null;
  }

  if (fact.key === "sibling_count" && !isPlausibleCount(fact.value)) {
    return null;
  }

  if (
    ["dog_name", "cat_name", "pet_name"].includes(fact.key) &&
    !isPlausiblePetName(fact.value)
  ) {
    return null;
  }

  return fact;
};

const promoteThreadFactsToGlobalFacts = (facts: MemoryFact[]) =>
  facts
    .map((fact) => sanitizeGlobalFact(fact))
    .filter((fact): fact is MemoryFact => fact !== null);

const parseCount = (rawValue: string) => {
  const normalized = rawValue.trim().toLowerCase();
  const numericValue = Number.parseInt(normalized, 10);

  if (!Number.isNaN(numericValue)) {
    return numericValue;
  }

  return NUMBER_WORDS[normalized] ?? null;
};

const extractProfileFactsHeuristically = ({
  messages,
  threadId,
  timestamp,
}: {
  messages: ChatMessage[];
  threadId: string;
  timestamp: string;
}) => {
  const heuristicFacts: MemoryFact[] = [];

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    const content = message.content.trim();

    const nameMatch = content.match(
      /\bmy name is ([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    );

    if (nameMatch) {
      heuristicFacts.push(
        createHeuristicFact({
          key: "name",
          value: nameMatch[1].trim(),
          confidence: 0.98,
          timestamp,
          threadId,
          messageId: message.id,
        }),
      );
    }

    const childrenMatch = content.match(
      /\bi have (\d+|one|two|three|four|five|six|seven|eight|nine|ten) (kids|children)\b/i,
    );

    if (childrenMatch) {
      const count = parseCount(childrenMatch[1]);

      if (count !== null) {
        heuristicFacts.push(
          createHeuristicFact({
            key: "children_count",
            value: String(count),
            confidence: 0.96,
            timestamp,
            threadId,
            messageId: message.id,
          }),
        );
      }
    }

    const professionMatch = content.match(
      /\b(?:i work as|i am|i'm) an? ([a-z][a-z0-9 -]{1,60})\b/i,
    );

    if (
      professionMatch &&
      !/\b(tired|hungry|busy|ready|excited|sad|happy|stressed)\b/i.test(
        professionMatch[1],
      )
    ) {
      heuristicFacts.push(
        createHeuristicFact({
          key: "profession",
          value: professionMatch[1].trim(),
          confidence: 0.88,
          timestamp,
          threadId,
          messageId: message.id,
        }),
      );
    }

    const businessMatch = content.match(
      /\bi (run|own) an? ([a-z][a-z0-9 -]{1,60})\b/i,
    );

    if (businessMatch) {
      heuristicFacts.push(
        createHeuristicFact({
          key: "business",
          value: businessMatch[2].trim(),
          confidence: 0.86,
          timestamp,
          threadId,
          messageId: message.id,
        }),
      );
    }

    const favoriteColorMatch = content.match(
      /\b(?:my )?favo(?:u)?rite colo(?:u)?r is ([a-z][a-z -]{1,30})\b/i,
    );

    if (favoriteColorMatch) {
      heuristicFacts.push(
        createHeuristicFact({
          key: "favorite_color",
          value: favoriteColorMatch[1].trim().toLowerCase(),
          confidence: 0.98,
          timestamp,
          threadId,
          messageId: message.id,
        }),
      );
    }

    const fearMatch = content.match(
      /\b(?:i am|i'm) afraid of ([a-z][a-z -]{1,40})\b/i,
    ) ?? content.match(/\bmy fear is ([a-z][a-z -]{1,40})\b/i);

    if (fearMatch) {
      heuristicFacts.push(
        createHeuristicFact({
          key: "fear",
          value: fearMatch[1].trim().toLowerCase(),
          confidence: 0.96,
          timestamp,
          threadId,
          messageId: message.id,
        }),
      );
    }
  }

  return mergeFactLists(heuristicFacts).slice(0, MEMORY_FACT_LIMIT);
};

const getRelevantFacts = (facts: MemoryFact[], queryTokens: string[]) =>
  facts
    .map((fact) => ({
      fact,
      score: scoreTextAgainstQuery(`${fact.key} ${fact.value}`, queryTokens),
    }))
    .filter(({ score }, index) => score > 0 || (queryTokens.length === 0 && index < 3))
    .sort((left, right) => right.score - left.score)
    .slice(0, MEMORY_FACT_LIMIT)
    .map(({ fact }) => fact);

const getTopFacts = (facts: MemoryFact[]) =>
  [...facts]
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, MEMORY_FACT_LIMIT);

const getTopSelectorFacts = (facts: MemoryFact[]) =>
  [...facts]
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, MEMORY_SELECTOR_FACT_LIMIT);

const deriveFactsFromMemory = (facts: MemoryFact[]): DerivedMemoryFact[] => {
  const derivedFacts: DerivedMemoryFact[] = [];
  const factsByKey = new Map<string, MemoryFact[]>();

  for (const fact of facts) {
    const currentFacts = factsByKey.get(fact.key) ?? [];
    currentFacts.push(fact);
    factsByKey.set(fact.key, currentFacts);
  }

  const husbandFact = factsByKey.get("husband_name")?.[0];
  const wifeFact = factsByKey.get("wife_name")?.[0];
  const spouseFact = factsByKey.get("spouse_name")?.[0];
  const partnerFact = factsByKey.get("partner_name")?.[0];
  const childrenCountFact = factsByKey.get("children_count")?.[0];

  if (husbandFact) {
    derivedFacts.push({
      key: "marital_status",
      value: "married",
      confidence: 0.98,
      rationale: `Stored fact husband_name = ${husbandFact.value}`,
    });
  } else if (wifeFact) {
    derivedFacts.push({
      key: "marital_status",
      value: "married",
      confidence: 0.98,
      rationale: `Stored fact wife_name = ${wifeFact.value}`,
    });
  } else if (spouseFact) {
    derivedFacts.push({
      key: "marital_status",
      value: "married",
      confidence: 0.95,
      rationale: `Stored fact spouse_name = ${spouseFact.value}`,
    });
  } else if (partnerFact) {
    derivedFacts.push({
      key: "relationship_status",
      value: "partnered",
      confidence: 0.75,
      rationale: `Stored fact partner_name = ${partnerFact.value}`,
    });
  }

  if (childrenCountFact) {
    const count = Number.parseInt(childrenCountFact.value, 10);

    if (!Number.isNaN(count) && count > 0) {
      derivedFacts.push({
        key: "parent_status",
        value: "parent",
        confidence: 0.97,
        rationale: `Stored fact children_count = ${childrenCountFact.value}`,
      });
    }
  }

  return derivedFacts;
};

const getRelevantDerivedFacts = (
  facts: DerivedMemoryFact[],
  queryTokens: string[],
) =>
  facts
    .map((fact) => ({
      fact,
      score: scoreTextAgainstQuery(
        `${fact.key} ${fact.value} ${fact.rationale}`,
        queryTokens,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.fact.confidence - left.fact.confidence;
    })
    .slice(0, MEMORY_FACT_LIMIT)
    .map(({ fact }) => fact);

const getRelevantThreadSummaries = ({
  summaries,
  queryTokens,
}: {
  summaries: GlobalThreadSummary[];
  queryTokens: string[];
}) =>
  summaries
    .map((summary) => ({
      summary,
      score: scoreTextAgainstQuery(
        `${summary.title} ${summary.summary} ${summary.keywords.join(" ")}`,
        queryTokens,
      ),
    }))
    .filter(({ score }, index) => score > 0 || (queryTokens.length === 0 && index < 2))
    .sort((left, right) => right.score - left.score)
    .slice(0, MEMORY_THREAD_SUMMARY_LIMIT)
    .map(({ summary }) => summary);

const getTopThreadSummaries = (summaries: GlobalThreadSummary[]) =>
  [...summaries]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MEMORY_THREAD_SUMMARY_LIMIT);

const getTopSelectorThreadSummaries = (summaries: GlobalThreadSummary[]) =>
  [...summaries]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MEMORY_SELECTOR_THREAD_SUMMARY_LIMIT);

const getTopRecentSnippets = (messages: ChatMessage[]) =>
  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-MEMORY_SELECTOR_SNIPPET_LIMIT);

const getRelevantSnippets = ({
  messages,
  queryTokens,
}: {
  messages: ChatMessage[];
  queryTokens: string[];
}) =>
  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      message,
      score: scoreTextAgainstQuery(message.content, queryTokens),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MEMORY_SNIPPET_LIMIT)
    .map(({ message }) => message);

const createMemoryContextSection = ({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) => {
  if (lines.length === 0) {
    return "";
  }

  return `${title}\n${lines.join("\n")}`;
};

const callOpenRouter = async ({
  messages,
  model,
  timeZone,
}: {
  messages: OpenRouterMessage[];
  model?: string;
  timeZone?: string | null;
}) => {
  const apiKey = memoryEnv.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured. Add it to .dev.vars for local development and as a Wrangler secret for deployment.",
    );
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": memoryEnv.OPENROUTER_SITE_URL || "http://localhost:5173",
      "X-Title": memoryEnv.OPENROUTER_SITE_NAME || "Texty",
    },
    body: JSON.stringify({
      model:
        model ||
        memoryEnv.OPENROUTER_MEMORY_MODEL ||
        memoryEnv.OPENROUTER_MODEL ||
        DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content: createDateTimeSystemPrompt({ timeZone }),
        },
        ...messages,
      ],
    }),
  });

  const payload = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message || "OpenRouter returned an unexpected error.",
    );
  }

  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenRouter did not return a response message.");
  }

  return content;
};

const getMemorySelectorModel = () =>
  memoryEnv.OPENROUTER_MEMORY_SELECTOR_MODEL?.trim() ||
  memoryEnv.OPENROUTER_MEMORY_MODEL?.trim() ||
  memoryEnv.OPENROUTER_MODEL?.trim() ||
  DEFAULT_MODEL;

const buildThreadFactCandidate = (
  fact: MemoryFact,
  index: number,
): MemoryContextCandidate<MemoryFact> => ({
  id: `tf_${index + 1}`,
  line: `- tf_${index + 1}: ${fact.key} = ${fact.value} (${Math.round(
    fact.confidence * 100,
  )}% confidence)`,
  item: fact,
});

const buildGlobalFactCandidate = (
  fact: MemoryFact,
  index: number,
): MemoryContextCandidate<MemoryFact> => ({
  id: `gf_${index + 1}`,
  line: `- gf_${index + 1}: ${fact.key} = ${fact.value} (${Math.round(
    fact.confidence * 100,
  )}% confidence)`,
  item: fact,
});

const buildDerivedFactCandidate = (
  fact: DerivedMemoryFact,
  index: number,
): MemoryContextCandidate<DerivedMemoryFact> => ({
  id: `df_${index + 1}`,
  line: `- df_${index + 1}: ${fact.key} = ${fact.value} (${fact.rationale})`,
  item: fact,
});

const buildThreadSummaryCandidate = (
  summary: GlobalThreadSummary,
  index: number,
): MemoryContextCandidate<GlobalThreadSummary> => ({
  id: `ts_${index + 1}`,
  line: `- ts_${index + 1}: ${summary.title} -> ${summary.summary}${
    summary.keywords.length > 0 ? ` [${summary.keywords.join(", ")}]` : ""
  }`,
  item: summary,
});

const buildSnippetCandidate = (
  message: ChatMessage,
  index: number,
): MemoryContextCandidate<ChatMessage> => ({
  id: `sn_${index + 1}`,
  line: `- sn_${index + 1}: (${message.role}) ${message.content}`,
  item: message,
});

const selectCandidatesByIds = <T,>(
  candidates: MemoryContextCandidate<T>[],
  ids: string[],
) => {
  const idSet = new Set(ids);
  return candidates.filter((candidate) => idSet.has(candidate.id)).map((candidate) => candidate.item);
};

const buildMemorySelectorPrompt = ({
  userMessage,
  threadFactCandidates,
  globalFactCandidates,
  derivedFactCandidates,
  threadSummaryCandidates,
  snippetCandidates,
}: {
  userMessage: string;
  threadFactCandidates: MemoryContextCandidate<MemoryFact>[];
  globalFactCandidates: MemoryContextCandidate<MemoryFact>[];
  derivedFactCandidates: MemoryContextCandidate<DerivedMemoryFact>[];
  threadSummaryCandidates: MemoryContextCandidate<GlobalThreadSummary>[];
  snippetCandidates: MemoryContextCandidate<ChatMessage>[];
}) =>
  [
    `Latest user message: ${JSON.stringify(userMessage)}`,
    "",
    "Select the smallest set of relevant memory ids for answering this message well.",
    "Return strict JSON with this shape:",
    '{"reasoning":"string","thread_fact_ids":["tf_1"],"global_fact_ids":["gf_1"],"derived_fact_ids":["df_1"],"thread_summary_ids":["ts_1"],"snippet_ids":["sn_1"]}',
    "If a category has nothing useful, return an empty array for that category.",
    "",
    "Thread facts:",
    threadFactCandidates.map((candidate) => candidate.line).join("\n") || "(none)",
    "",
    "User facts:",
    globalFactCandidates.map((candidate) => candidate.line).join("\n") || "(none)",
    "",
    "Derived facts:",
    derivedFactCandidates.map((candidate) => candidate.line).join("\n") || "(none)",
    "",
    "Memory tree:",
    threadSummaryCandidates.map((candidate) => candidate.line).join("\n") || "(none)",
    "",
    "Conversation snippets:",
    snippetCandidates.map((candidate) => candidate.line).join("\n") || "(none)",
  ].join("\n");

const selectMemoryContextWithAi = async ({
  userMessage,
  threadFacts,
  globalFacts,
  derivedFacts,
  threadSummaries,
  snippets,
  timeZone,
}: {
  userMessage: string;
  threadFacts: MemoryFact[];
  globalFacts: MemoryFact[];
  derivedFacts: DerivedMemoryFact[];
  threadSummaries: GlobalThreadSummary[];
  snippets: ChatMessage[];
  timeZone?: string | null;
}) => {
  const threadFactCandidates = threadFacts.map(buildThreadFactCandidate);
  const globalFactCandidates = globalFacts.map(buildGlobalFactCandidate);
  const derivedFactCandidates = derivedFacts.map(buildDerivedFactCandidate);
  const threadSummaryCandidates = threadSummaries.map(buildThreadSummaryCandidate);
  const snippetCandidates = snippets.map(buildSnippetCandidate);

  if (
    threadFactCandidates.length === 0 &&
    globalFactCandidates.length === 0 &&
    derivedFactCandidates.length === 0 &&
    threadSummaryCandidates.length === 0 &&
    snippetCandidates.length === 0
  ) {
    return null;
  }

  try {
    const rawContent = await callOpenRouter({
      model: getMemorySelectorModel(),
      timeZone,
      messages: [
        {
          role: "system",
          content: MEMORY_SELECTOR_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildMemorySelectorPrompt({
            userMessage,
            threadFactCandidates,
            globalFactCandidates,
            derivedFactCandidates,
            threadSummaryCandidates,
            snippetCandidates,
          }),
        },
      ],
    });

    const selection = parseMemorySelectorResponse(rawContent);

    if (!selection) {
      return null;
    }

    return {
      relevantThreadFacts: selectCandidatesByIds(
        threadFactCandidates,
        selection.threadFactIds,
      ),
      relevantGlobalFacts: selectCandidatesByIds(
        globalFactCandidates,
        selection.globalFactIds,
      ),
      relevantDerivedFacts: selectCandidatesByIds(
        derivedFactCandidates,
        selection.derivedFactIds,
      ),
      selectedThreadSummaries: selectCandidatesByIds(
        threadSummaryCandidates,
        selection.threadSummaryIds,
      ),
      relevantSnippets: selectCandidatesByIds(snippetCandidates, selection.snippetIds),
    };
  } catch (error) {
    console.warn("Memory selector model failed, falling back to heuristic retrieval.", error);
    return null;
  }
};

export const refreshMemories = async ({
  threadId,
  messages,
  previousThreadMemory,
  globalMemory,
  timeZone,
}: {
  threadId: string;
  messages: ChatMessage[];
  previousThreadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
  timeZone?: string | null;
}) => {
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const extractionPrompt = `Previous thread summary: ${
    previousThreadMemory.summary || "(none)"
  }

Existing user facts:
${flattenGlobalMemoryFacts(globalMemory).map((fact) => `- ${fact.key}: ${fact.value}`).join("\n") || "(none)"}

Conversation slice:
${getMessagesForExtraction(messages)}

Return strict JSON with this shape:
{
  "thread_summary": "string",
  "thread_keywords": ["string"],
  "thread_facts": [
    {
      "key": "string",
      "value": "string",
      "confidence": 0.0,
      "source_message_ids": ["message-id"]
    }
  ],
  "profile_facts": [
    {
      "key": "string",
      "value": "string",
      "confidence": 0.0,
      "source_message_ids": ["message-id"]
    }
  ]
}`;

  const rawContent = await callOpenRouter({
    timeZone,
    messages: [
      {
        role: "system",
        content: MEMORY_EXTRACTION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: extractionPrompt,
      },
    ],
  });

  const extraction = parseExtraction(rawContent) ?? {};

  const timestamp = new Date().toISOString();
  const threadFacts = (extraction.thread_facts ?? [])
    .map((rawFact) => toMemoryFact({ rawFact, timestamp, threadId }))
    .filter((fact): fact is MemoryFact => fact !== null)
    .map((fact) => sanitizeExtractedMemoryFact({ fact, messagesById }))
    .filter((fact): fact is MemoryFact => fact !== null)
    .slice(0, MEMORY_FACT_LIMIT);
  const threadKeywords = dedupeStrings(extraction.thread_keywords ?? []).slice(0, 12);
  const threadSummary = extraction.thread_summary?.trim() || previousThreadMemory.summary;

  const nextThreadMemory: ThreadMemory = {
    summary: threadSummary,
    keywords: threadKeywords,
    facts: threadFacts,
    markdown: buildThreadMemoryMarkdown({
      summary: threadSummary,
      keywords: threadKeywords,
      facts: threadFacts,
      messages,
    }),
    updatedAt: timestamp,
  };

  const extractedProfileFacts = (extraction.profile_facts ?? [])
    .map((rawFact) => toMemoryFact({ rawFact, timestamp, threadId }))
    .filter((fact): fact is MemoryFact => fact !== null)
    .map((fact) => sanitizeExtractedMemoryFact({ fact, messagesById }))
    .filter((fact): fact is MemoryFact => fact !== null)
    .map((fact) => sanitizeGlobalFact(fact))
    .filter((fact): fact is MemoryFact => fact !== null)
    .slice(0, MEMORY_FACT_LIMIT);
  const heuristicProfileFacts = extractProfileFactsHeuristically({
    messages,
    threadId,
    timestamp,
  });
  const promotedThreadFacts = promoteThreadFactsToGlobalFacts(threadFacts);
  let nextGlobalMemoryFacts = globalMemory;

  for (const fact of mergeFactLists(
    extractedProfileFacts,
    heuristicProfileFacts,
    promotedThreadFacts,
  )) {
    nextGlobalMemoryFacts = addFactToGlobalMemory(nextGlobalMemoryFacts, fact);
  }

  const nextGlobalMemory: GlobalMemory = {
    ...nextGlobalMemoryFacts,
    threadSummaries: mergeThreadSummaries(globalMemory.threadSummaries, {
      threadId,
      title:
        messages.find((message) => message.role === "user")?.content
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 48) || "Untitled thread",
      summary: nextThreadMemory.summary,
      keywords: nextThreadMemory.keywords,
      updatedAt: timestamp,
    }),
    markdown: "",
    updatedAt: timestamp,
  };
  nextGlobalMemory.markdown = buildGlobalMemoryMarkdown({
    memory: nextGlobalMemory,
    threadSummaries: nextGlobalMemory.threadSummaries,
  });

  return {
    threadMemory: nextThreadMemory,
    globalMemory: nextGlobalMemory,
  };
};

export const buildMemoryContext = async ({
  userMessage,
  messages,
  threadMemory,
  globalMemory,
  timeZone,
}: {
  userMessage: string;
  messages: ChatMessage[];
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
  timeZone?: string | null;
}) => {
  const queryTokens = expandQueryTokens(tokenize(userMessage));
  const isBroadSelfQuery = isBroadPersonalMemoryQuery(userMessage);
  const globalFacts = flattenGlobalMemoryFacts(globalMemory);
  const derivedFacts = deriveFactsFromMemory(globalFacts);
  const heuristicRelevantThreadFacts = getRelevantFacts(threadMemory.facts, queryTokens);
  const heuristicRelevantGlobalFacts = isBroadSelfQuery
    ? (() => {
        const matchedFacts = getRelevantFacts(globalFacts, queryTokens);

        if (matchedFacts.length > 0) {
          return matchedFacts;
        }

        return getTopFacts(globalFacts);
      })()
    : getRelevantFacts(globalFacts, queryTokens).filter(
        (fact) => scoreTextAgainstQuery(`${fact.key} ${fact.value}`, queryTokens) > 0,
      );
  const heuristicRelevantThreadSummaries = getRelevantThreadSummaries({
    summaries: globalMemory.threadSummaries,
    queryTokens,
  });
  const heuristicSelectedThreadSummaries = isBroadSelfQuery
    ? (() => {
        if (heuristicRelevantThreadSummaries.length > 0) {
          return heuristicRelevantThreadSummaries;
        }

        return getTopThreadSummaries(globalMemory.threadSummaries);
      })()
    : heuristicRelevantThreadSummaries;
  const heuristicRelevantDerivedFacts = getRelevantDerivedFacts(derivedFacts, queryTokens);
  const heuristicRelevantSnippets = getRelevantSnippets({ messages, queryTokens });
  const isTargetedPersonalQuery =
    isPersonalMemoryQuery(userMessage) && !isBroadSelfQuery;

  const selectorResult = await selectMemoryContextWithAi({
    userMessage,
    threadFacts: dedupeFactList([
      ...heuristicRelevantThreadFacts,
      ...getTopSelectorFacts(threadMemory.facts),
    ]),
    globalFacts: dedupeFactList([
      ...heuristicRelevantGlobalFacts,
      ...getTopSelectorFacts(globalFacts),
    ]),
    derivedFacts: dedupeDerivedFactList([
      ...heuristicRelevantDerivedFacts,
      ...derivedFacts.slice(0, MEMORY_SELECTOR_FACT_LIMIT),
    ]),
    threadSummaries: dedupeThreadSummaryList([
      ...heuristicSelectedThreadSummaries,
      ...getTopSelectorThreadSummaries(globalMemory.threadSummaries),
    ]),
    snippets: dedupeMessageList([
      ...heuristicRelevantSnippets,
      ...getTopRecentSnippets(messages),
    ]),
    timeZone,
  });

  const relevantThreadFacts =
    selectorResult && selectorResult.relevantThreadFacts.length > 0
      ? selectorResult.relevantThreadFacts.slice(0, MEMORY_FACT_LIMIT)
      : heuristicRelevantThreadFacts;
  const relevantGlobalFacts =
    selectorResult && selectorResult.relevantGlobalFacts.length > 0
      ? selectorResult.relevantGlobalFacts.slice(0, MEMORY_FACT_LIMIT)
      : heuristicRelevantGlobalFacts;
  const relevantDerivedFacts =
    selectorResult && selectorResult.relevantDerivedFacts.length > 0
      ? selectorResult.relevantDerivedFacts.slice(0, MEMORY_FACT_LIMIT)
      : heuristicRelevantDerivedFacts;
  const selectedThreadSummaries =
    selectorResult && selectorResult.selectedThreadSummaries.length > 0
      ? selectorResult.selectedThreadSummaries.slice(0, MEMORY_THREAD_SUMMARY_LIMIT)
      : heuristicSelectedThreadSummaries;
  const relevantSnippets =
    selectorResult && selectorResult.relevantSnippets.length > 0
      ? selectorResult.relevantSnippets.slice(0, MEMORY_SNIPPET_LIMIT)
      : heuristicRelevantSnippets;

  const threadLines = [
    threadMemory.summary ? `Summary: ${threadMemory.summary}` : "",
    ...relevantThreadFacts.map((fact) => `Fact: ${fact.key} = ${fact.value}`),
    ...threadMemory.keywords.slice(0, 6).map((keyword) => `Keyword: ${keyword}`),
    ...relevantSnippets.map(
      (message) => `Snippet (${message.role}): ${message.content}`,
    ),
  ].filter(Boolean);

  const globalLines = relevantGlobalFacts.map(
    (fact) => `Profile: ${fact.key} = ${fact.value}`,
  );
  const derivedLines = relevantDerivedFacts.map((fact) => {
    const confidenceLabel =
      fact.confidence >= 0.9
        ? "high confidence"
        : fact.confidence >= 0.75
          ? "medium confidence"
          : "low confidence";

    return `Derived: ${fact.key} = ${fact.value} (${confidenceLabel}; basis: ${fact.rationale})`;
  });
  const summaryLines = selectedThreadSummaries.map(
    (summary) =>
      `Thread node: ${summary.title} -> ${summary.summary}${
        summary.keywords.length > 0 ? ` [${summary.keywords.join(", ")}]` : ""
      }`,
  );

  const sections = [
    createMemoryContextSection({
      title: "Thread memory",
      lines: threadLines,
    }),
    createMemoryContextSection({
      title: "User memory",
      lines: globalLines,
    }),
    createMemoryContextSection({
      title: "Derived memory",
      lines: derivedLines,
    }),
    createMemoryContextSection({
      title: "Memory tree",
      lines: summaryLines,
    }),
    createMemoryContextSection({
      title: "Memory guardrail",
      lines:
        isTargetedPersonalQuery &&
        relevantGlobalFacts.length === 0 &&
        relevantDerivedFacts.length === 0 &&
        selectedThreadSummaries.length === 0 &&
        relevantThreadFacts.length === 0 &&
        relevantSnippets.length === 0
          ? [
              "No explicit stored memory matched this requested personal detail. If the user asks for it directly, say you do not know rather than inferring.",
            ]
          : [],
    }),
  ].filter(Boolean);

  if (sections.length === 0) {
    return null;
  }

  return sections.join("\n\n");
};
