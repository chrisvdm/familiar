import { env } from "cloudflare:workers";
import { sanitizeExtractedMemoryFact } from "./chat.memory.identity.ts";
import { createDateTimeSystemPrompt, DEFAULT_MODEL } from "./conversation.runtime.ts";

import {
  addDynamicFactToGlobalMemory,
  addFactToGlobalMemory,
  addPersonalityFactToGlobalMemory,
  addStyleFactToGlobalMemory,
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
  pair?: [string, string];
  confidence?: number;
  source_message_ids?: string[];
};

type MemoryExtraction = {
  thread_summary?: string;
  thread_keywords?: string[];
  thread_facts?: RawMemoryFact[];
  profile_facts?: RawMemoryFact[];
  personality_observations?: RawMemoryFact[];
  style_observations?: RawMemoryFact[];
  dynamic_facts?: RawMemoryFact[];
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
  thread_drill_ids?: string[];
  snippet_ids?: string[];
};

type MemorySelectionIds = {
  threadFactIds: string[];
  globalFactIds: string[];
  derivedFactIds: string[];
  threadSummaryIds: string[];
  threadDrillIds: string[];
  snippetIds: string[];
};

type SelfMemoryRecallResponse = {
  should_recall?: boolean;
  focus?: "name" | "personal" | "broad" | "none";
  reasoning?: string;
};

type SelfMemoryRecallIntent = {
  shouldRecall: boolean;
  focus: "name" | "personal" | "broad" | "none";
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
  "first_name",
  "last_name",
  "nickname",
  "age",
  "nationality",
  "language",
  "location",
  "gender",
  "pronouns",
  "profession",
  "employer",
  "industry",
  "business",
  "relationship_status",
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
  "dog_name",
  "cat_name",
  "pet_name",
  "interest",
  "aspiration",
  "goal",
  "fear",
  "dietary",
  "favorite",
  "favorite_food",
  "favorite_drink",
  "favorite_music",
  "favorite_movie",
  "favorite_color",
  "likes",
  "dislikes",
]);

const CANONICAL_SELF_RECALL_KEYS = new Set([
  "name",
  "first_name",
  "last_name",
  "nickname",
  "age",
  "nationality",
  "language",
  "location",
  "gender",
  "pronouns",
  "profession",
  "employer",
  "industry",
  "business",
  "relationship_status",
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
  "dog_name",
  "cat_name",
  "pet_name",
  "interest",
  "aspiration",
  "goal",
  "fear",
  "dietary",
  "favorite",
  "favorite_food",
  "favorite_drink",
  "favorite_music",
  "favorite_movie",
  "favorite_color",
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

const SELF_MEMORY_CONTEXT_PATTERN =
  /\b(what do you know about me|what can you tell me about (?:me|myself)|tell me about myself|what do you remember about me|do you know my name|what(?:'s| is) my name|your name is|you go by|i know that|i do not know your name yet)\b/i;

const MEMORY_EXTRACTION_SYSTEM_PROMPT =
  "You extract lightweight durable memory for a personal chat app. Return JSON only. Do not include markdown fences. Capture thread summary, keywords, thread facts, and stable user profile facts. Never invent facts. Prefer facts the user stated directly. Fact values must be atomic — extract only the specific value (e.g. for 'my name is alice and I want to dance', the name value is 'alice', not 'alice and'). Do not copy surrounding clauses or conjunctions into a fact value. Do not infer gender, sex, or pronouns from a name, writing style, relationship terms, or any other indirect cue. Only store gender or pronouns if the user explicitly stated them. Ignore transient tasks, moods, and one-off requests.";

const MEMORY_SELECTOR_SYSTEM_PROMPT =
  "You select the smallest useful subset of stored memory for another model. Return JSON only. Do not include markdown fences. Choose only memories that are explicitly relevant to the user's latest message. Prefer too little over too much. Never invent facts or ids. Use the provided ids exactly as given.";

const SELF_MEMORY_RECALL_SYSTEM_PROMPT =
  "You detect whether the user is asking this assistant to recall stored information about the user themselves. Return JSON only. Do not include markdown fences. Mark should_recall true for direct self-memory requests and natural follow-ups to an ongoing self-memory discussion. Use focus = name for name recall, personal for human or personal detail requests, broad for general self-summary requests, and none otherwise.";

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
      threadDrillIds: normalizeIds(parsed.thread_drill_ids),
      snippetIds: normalizeIds(parsed.snippet_ids),
    };
  } catch {
    return null;
  }
};



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

const isPersonalMemoryDeclaration = (query: string) =>
  /^(my name is|i am|i'm|my .+ is|i have|i work|i live|i want|i like|i love|i hate)\b/i.test(
    query.trim(),
  );

const isPersonalMemoryQuery = (query: string) =>
  !isPersonalMemoryDeclaration(query) &&
  /\b(my|me|i am|i'm|name|family|kids|children|wife|husband|partner|job|work|profession|bio|remember)\b/i.test(
    query,
  );

const isBroadPersonalMemoryQuery = (query: string) =>
  /\b(what do you know about me|who am i|tell me about myself|summari[sz]e (me|what you know)|what do you remember about me|what do you know of me)\b/i.test(
    query,
  );

const isNameRecallQuery = (query: string) =>
  /\b(do you know my name|what(?:'s| is) my name|tell me my name|remember my name|what name do i go by|the name i call myself)\b/i.test(
    query,
  ) || /^(?:my name|name|about my name)$/i.test(query.trim().replace(/[.?!]+$/, ""));

const shouldCheckSelfMemoryRecall = ({
  userMessage,
  messages,
}: {
  userMessage: string;
  messages: ChatMessage[];
}) =>
  isNameRecallQuery(userMessage) ||
  isPersonalMemoryQuery(userMessage) ||
  /\b(anything (?:you have|you've) stored|anything you know|what else|tell me more|human me|personal details|as much as possible|everything you have stored|stored)\b/i.test(
    userMessage,
  ) ||
  messages.slice(-6).some((message) => SELF_MEMORY_CONTEXT_PATTERN.test(message.content));

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
  const rawKey = (rawFact.pair?.[0] ?? rawFact.key)?.trim() ?? "";
  const value = (rawFact.pair?.[1] ?? rawFact.value)?.trim() ?? "";

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
    return null;
  }

  if (
    (fact.key === "name" || fact.key === "first_name" || fact.key === "last_name" || fact.key === "nickname") &&
    !isPlausibleName(fact.value)
  ) {
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

const parseSelfMemoryRecallResponse = (
  rawContent: string,
): SelfMemoryRecallIntent | null => {
  try {
    const parsed = JSON.parse(rawContent) as SelfMemoryRecallResponse;
    const focus =
      parsed.focus === "name" ||
      parsed.focus === "personal" ||
      parsed.focus === "broad" ||
      parsed.focus === "none"
        ? parsed.focus
        : "none";

    return {
      shouldRecall: parsed.should_recall === true,
      focus,
    };
  } catch {
    return null;
  }
};

const classifySelfMemoryRecallIntent = async ({
  userMessage,
  messages,
  timeZone,
}: {
  userMessage: string;
  messages: ChatMessage[];
  timeZone?: string | null;
}) => {
  if (isNameRecallQuery(userMessage)) {
    return {
      shouldRecall: true,
      focus: "name",
    } satisfies SelfMemoryRecallIntent;
  }

  if (!shouldCheckSelfMemoryRecall({ userMessage, messages })) {
    return {
      shouldRecall: false,
      focus: "none",
    } satisfies SelfMemoryRecallIntent;
  }

  const recentMessages = messages
    .slice(-6)
    .map((message) => `- ${message.role}: ${message.content}`)
    .join("\n");

  try {
    const rawContent = await callOpenRouter({
      model: getMemorySelectorModel(),
      timeZone,
      messages: [
        {
          role: "system",
          content: SELF_MEMORY_RECALL_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            "Recent conversation:",
            recentMessages || "(none)",
            "",
            `Latest user message: ${userMessage}`,
            "",
            'Return strict JSON with this shape: {"should_recall":true,"focus":"name|personal|broad|none","reasoning":"string"}',
          ].join("\n"),
        },
      ],
    });

    return (
      parseSelfMemoryRecallResponse(rawContent) || {
        shouldRecall: false,
        focus: "none",
      }
    );
  } catch {
    return {
      shouldRecall:
        isBroadPersonalMemoryQuery(userMessage) || isPersonalMemoryQuery(userMessage),
      focus: /\b(personal details|human me)\b/i.test(userMessage)
        ? "personal"
        : "broad",
    } satisfies SelfMemoryRecallIntent;
  }
};

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
      "X-Title": memoryEnv.OPENROUTER_SITE_NAME || "familiar",
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

const formatMemoryFactForReply = (fact: MemoryFact) => {
  switch (fact.key) {
    case "name":
      return `you go by ${fact.value}`;
    case "children_count":
      return `you have ${fact.value} children`;
    case "profession":
      return `you work as ${
        /^(a|an)\b/i.test(fact.value)
          ? fact.value
          : /^[aeiou]/i.test(fact.value)
            ? `an ${fact.value}`
            : `a ${fact.value}`
      }`;
    case "business":
      return `your business is ${fact.value}`;
    case "location":
      return `you are in ${fact.value}`;
    case "likes":
    case "interest":
    case "interests":
      return `you like ${fact.value}`;
    case "dislikes":
      return `you dislike ${fact.value}`;
    case "favorite":
    case "favorite_food":
    case "favorite_drink":
    case "favorite_music":
    case "favorite_movie":
    case "favorite_color":
    case "partner_name":
    case "spouse_name":
    case "wife_name":
    case "husband_name":
    case "dog_name":
    case "cat_name":
    case "pet_name":
      return `your ${fact.key.replace(/_/g, " ")} is ${fact.value}`;
    default:
      return `${fact.key.replace(/_/g, " ")}: ${fact.value}`;
  }
};

const joinMemoryPhrases = (phrases: string[]) => {
  if (phrases.length === 0) {
    return "";
  }

  if (phrases.length === 1) {
    return phrases[0];
  }

  if (phrases.length === 2) {
    return `${phrases[0]} and ${phrases[1]}`;
  }

  return `${phrases.slice(0, -1).join(", ")}, and ${phrases.at(-1)}`;
};

const getStoredName = ({
  threadMemory,
  globalMemory,
}: {
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
}) =>
  [...(globalMemory.identity.name ?? []), ...threadMemory.facts.filter((fact) => fact.key === "name")]
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })[0]?.value ?? null;

const filterFactsForSelfMemoryFocus = ({
  facts,
  focus,
}: {
  facts: MemoryFact[];
  focus: "personal" | "broad";
}) =>
  focus === "personal"
    ? facts.filter(
        (fact) =>
          !["profession", "business", "project", "product", "app", "company"].includes(
            fact.key,
          ),
      )
    : facts;

const dedupeReplyFacts = (facts: MemoryFact[]) => {
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

const filterCanonicalSelfRecallFacts = (facts: MemoryFact[]) =>
  facts.filter((fact) => CANONICAL_SELF_RECALL_KEYS.has(fact.key));

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
    '{"reasoning":"string","thread_fact_ids":["tf_1"],"global_fact_ids":["gf_1"],"derived_fact_ids":["df_1"],"thread_summary_ids":["ts_1"],"thread_drill_ids":["ts_1"],"snippet_ids":["sn_1"]}',
    "If a category has nothing useful, return an empty array for that category.",
    "Use thread_drill_ids to list any thread_summary_ids whose full message history would significantly improve your answer — only when a summary alone is not enough.",
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

    // --GROK--: drillThreadIds maps the ts_N candidate ids back to real threadId strings
    // so callers can fetch full message history for those threads.
    const drillSummaries = selectCandidatesByIds(
      threadSummaryCandidates,
      selection.threadDrillIds,
    );

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
      drillThreadIds: drillSummaries.map((s) => s.threadId),
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

Rules:
- profile_facts use pair format: ["key", "value"]. Each element must be a single atomic string.
  Example: "my name is alice and i want to dance" → { "pair": ["name", "Alice"], ... }
- Only extract facts the user stated directly. Never infer.
- Skip transient information: moods, one-off tasks, questions, greetings.
- Extract name facts from any phrasing where the user identifies themselves: "my name is X" or "I am X" → first_name (or name if full name given); "my last name is X" / "my surname is X" → last_name; "call me X" / "everyone calls me X" → nickname. Values must be the name only — no surrounding words.
- Use grammatical tense and mood to determine the right key for everything else: current or past reality ("I am a", "I work as", "I was") → use the most specific matching key; enjoyment or preference ("I like", "I enjoy", "I love") → use interest or likes; aspiration, dream, or desire to become or achieve ("I want to be", "I'd like to be", "I hope to", "I wish I could") → use aspiration.
- Valid profile_facts keys: name, first_name, last_name, nickname, age, nationality, language, location, gender, pronouns, profession, employer, industry, business, relationship_status, children_count, child_name, children_names, sibling_count, sibling_name, siblings, spouse_name, partner_name, wife_name, husband_name, family_history, dog_name, cat_name, pet_name, interest, aspiration, goal, fear, dietary, favorite, favorite_food, favorite_drink, favorite_music, favorite_movie, favorite_color, likes, dislikes. Use no other keys.
- Confidence scale: 0.95 = user stated it explicitly and unambiguously; 0.8 = stated clearly but with some context-dependence; 0.6 = mentioned in passing or slightly indirect; 0.4 = uncertain or easily retracted.
- dynamic_facts: identity-defining traits that do not fit any profile_facts key. Use only for stable characteristics central to who the person is — things that would appear in a biography (e.g. religion, philosophy, sport, skill, belief). Also use for composite passion-level interests when multiple signals converge on a label: cultural interest + language learning + lifestyle mentions → a label like "japanophile"; deep film knowledge + regular watching → "cinephile". Do not use for moods, tasks, or one-off events. Keys are free-form snake_case.

Return strict JSON with this shape:
{
  "thread_summary": "string",
  "thread_keywords": ["string"],
  "thread_facts": [
    {
      "key": "string",
      "value": "string",
      "confidence": 0.95,
      "source_message_ids": ["message-id"]
    }
  ],
  "profile_facts": [
    {
      "pair": ["key", "value"],
      "confidence": 0.95,
      "source_message_ids": ["message-id"]
    }
  ],
  "dynamic_facts": [
    {
      "pair": ["key", "value"],
      "confidence": 0.95,
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
    .filter((rawFact) => Array.isArray(rawFact.pair) && rawFact.pair.length === 2)
    .map((rawFact) => toMemoryFact({ rawFact, timestamp, threadId }))
    .filter((fact): fact is MemoryFact => fact !== null)
    .map((fact) => sanitizeGlobalFact(fact))
    .filter((fact): fact is MemoryFact => fact !== null)
    .slice(0, MEMORY_FACT_LIMIT);
  const extractedDynamicFacts = (extraction.dynamic_facts ?? [])
    .filter((rawFact) => Array.isArray(rawFact.pair) && rawFact.pair.length === 2)
    .map((rawFact) => toMemoryFact({ rawFact, timestamp, threadId }))
    .filter((fact): fact is MemoryFact => fact !== null)
    .slice(0, MEMORY_FACT_LIMIT);
  const promotedThreadFacts = promoteThreadFactsToGlobalFacts(threadFacts);
  let nextGlobalMemoryFacts = globalMemory;

  for (const fact of mergeFactLists(extractedProfileFacts, promotedThreadFacts)) {
    nextGlobalMemoryFacts = addFactToGlobalMemory(nextGlobalMemoryFacts, fact);
  }

  for (const fact of extractedDynamicFacts) {
    nextGlobalMemoryFacts = addDynamicFactToGlobalMemory(nextGlobalMemoryFacts, fact);
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

const SYNTHESIS_SYSTEM_PROMPT =
  "You synthesize a user's personality and communication style from conversation history. Return JSON only. Do not include markdown fences. Infer traits only when there is consistent evidence across multiple messages — never from a single mention. Accurate observation is the goal; do not filter for positive traits.";

export const synthesizeUserProfile = async ({
  messages,
  globalMemory,
  timeZone,
}: {
  messages: ChatMessage[];
  globalMemory: GlobalMemory;
  timeZone?: string | null;
}): Promise<GlobalMemory> => {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .slice(-30);

  if (userMessages.length < 3) {
    return globalMemory;
  }

  const messageBlock = userMessages
    .map((message) => `- ${message.content}`)
    .join("\n");

  const synthesisPrompt = `Review these user messages and infer their personality and communication style.

User messages:
${messageBlock}

Return strict JSON with this shape:
{
  "personality_observations": [
    {
      "pair": ["key", "value"],
      "confidence": 0.6,
      "source_message_ids": []
    }
  ],
  "style_observations": [
    {
      "pair": ["key", "value"],
      "confidence": 0.7,
      "source_message_ids": []
    }
  ]
}

Rules:
- personality_observations: observable traits inferred from behaviour patterns across multiple messages. Keys are free-form snake_case (e.g. practical, curious, methodical, direct, impulsive). Only include traits with consistent evidence. Confidence 0.5–0.75.
- style_observations: observable writing style traits. Keys: verbosity (concise/verbose), tone (casual/formal/technical), humor (dry/playful/none), format (prose/bullets/mixed). Confidence 0.5–0.8.
- If there is insufficient evidence for a trait, omit it — do not guess.
- Return empty arrays if evidence is thin.`;

  const rawContent = await callOpenRouter({
    timeZone,
    messages: [
      {
        role: "system",
        content: SYNTHESIS_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: synthesisPrompt,
      },
    ],
  });

  const extraction = parseExtraction(rawContent) ?? {};
  const timestamp = new Date().toISOString();
  const syntheticThreadId = "synthesis";

  // --GROK--: Synthesis replaces the personality and style buckets entirely — the full
  // picture is rebuilt from recent messages on each synthesis run.
  let nextMemory: GlobalMemory = {
    ...globalMemory,
    personality: {},
    style: {},
  };

  for (const rawFact of extraction.personality_observations ?? []) {
    if (!Array.isArray(rawFact.pair) || rawFact.pair.length !== 2) {
      continue;
    }

    const fact = toMemoryFact({ rawFact, timestamp, threadId: syntheticThreadId });

    if (fact) {
      nextMemory = addPersonalityFactToGlobalMemory(nextMemory, fact);
    }
  }

  for (const rawFact of extraction.style_observations ?? []) {
    if (!Array.isArray(rawFact.pair) || rawFact.pair.length !== 2) {
      continue;
    }

    const fact = toMemoryFact({ rawFact, timestamp, threadId: syntheticThreadId });

    if (fact) {
      nextMemory = addStyleFactToGlobalMemory(nextMemory, fact);
    }
  }

  nextMemory.markdown = buildGlobalMemoryMarkdown({
    memory: nextMemory,
    threadSummaries: nextMemory.threadSummaries,
  });

  return nextMemory;
};

export const buildMemoryContext = async ({
  userMessage,
  messages,
  threadMemory,
  globalMemory,
  timeZone,
  getThreadHistory,
}: {
  userMessage: string;
  messages: ChatMessage[];
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
  timeZone?: string | null;
  getThreadHistory?: (threadId: string) => Promise<ChatMessage[]>;
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

  // --GROK--: Drill-deeper path — if the AI selector flagged thread IDs for full history
  // and a getThreadHistory callback was provided, fetch those messages now.
  const drillThreadIds = selectorResult?.drillThreadIds ?? [];
  const drillHistories: { threadId: string; messages: ChatMessage[] }[] =
    getThreadHistory && drillThreadIds.length > 0
      ? await Promise.all(
          drillThreadIds.map(async (threadId) => ({
            threadId,
            messages: await getThreadHistory(threadId),
          })),
        )
      : [];

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

  const drillLines = drillHistories.flatMap(({ messages: historyMessages }) =>
    historyMessages.map((m) => `History (${m.role}): ${m.content}`),
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
      title: "Thread history",
      lines: drillLines,
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

export const buildSelfMemoryRecallReply = async ({
  userMessage,
  messages,
  threadMemory,
  globalMemory,
  timeZone,
  classifyRecallIntent = classifySelfMemoryRecallIntent,
  selectMemory = selectMemoryContextWithAi,
}: {
  userMessage: string;
  messages: ChatMessage[];
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
  timeZone?: string | null;
  classifyRecallIntent?: typeof classifySelfMemoryRecallIntent;
  selectMemory?: typeof selectMemoryContextWithAi;
}) => {
  const recallIntent = await classifyRecallIntent({
    userMessage,
    messages,
    timeZone,
  });

  if (!recallIntent.shouldRecall || recallIntent.focus === "none") {
    return null;
  }

  if (recallIntent.focus === "name") {
    const storedName = getStoredName({
      threadMemory,
      globalMemory,
    });

    return storedName
      ? `You go by ${storedName}.`
      : "I do not know your name yet.";
  }

  const queryTokens = expandQueryTokens(tokenize(userMessage));
  const globalFacts = flattenGlobalMemoryFacts(globalMemory);
  const derivedFacts = deriveFactsFromMemory(globalFacts);
  const selectorResult = await selectMemory({
    userMessage,
    threadFacts: dedupeFactList([
      ...getRelevantFacts(threadMemory.facts, queryTokens),
      ...getTopSelectorFacts(threadMemory.facts),
    ]),
    globalFacts: dedupeFactList([
      ...getRelevantFacts(globalFacts, queryTokens),
      ...getTopSelectorFacts(globalFacts),
    ]),
    derivedFacts: dedupeDerivedFactList([
      ...getRelevantDerivedFacts(derivedFacts, queryTokens),
      ...derivedFacts.slice(0, MEMORY_SELECTOR_FACT_LIMIT),
    ]),
    threadSummaries: dedupeThreadSummaryList([
      ...getRelevantThreadSummaries({
        summaries: globalMemory.threadSummaries,
        queryTokens,
      }),
      ...getTopSelectorThreadSummaries(globalMemory.threadSummaries),
    ]),
    snippets: dedupeMessageList([
      ...getRelevantSnippets({ messages, queryTokens }),
      ...getTopRecentSnippets(messages),
    ]),
    timeZone,
  });

  const relevantFacts = filterFactsForSelfMemoryFocus({
    facts: filterCanonicalSelfRecallFacts(
      dedupeReplyFacts([
        ...(selectorResult?.relevantGlobalFacts ?? []),
        ...(selectorResult?.relevantThreadFacts ?? []),
        ...globalFacts,
        ...threadMemory.facts,
      ]),
    ),
    focus: recallIntent.focus,
  }).slice(0, MEMORY_FACT_LIMIT);

  if (relevantFacts.length === 0) {
    return "I do not know much about you yet.";
  }

  return `I know that ${joinMemoryPhrases(
    relevantFacts.map((fact) => formatMemoryFactForReply(fact)),
  )}.`;
};
