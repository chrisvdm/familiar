export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type PendingToolConfirmation = {
  mode: "confirmation" | "follow_up";
  toolName: string;
  arguments: Record<string, unknown>;
  rawInputText?: string;
  confidence: number;
  createdAt: string;
  question?: string;
};

export type ActiveToolShortcut = {
  toolName: string;
  createdAt: string;
};

export type MemoryFact = {
  key: string;
  value: string;
  confidence: number;
  updatedAt: string;
  sourceThreadId?: string;
  sourceMessageIds?: string[];
};

export type ThreadMemory = {
  summary: string;
  keywords: string[];
  facts: MemoryFact[];
  markdown: string;
  updatedAt: string;
};

export type GlobalThreadSummary = {
  threadId: string;
  title: string;
  summary: string;
  keywords: string[];
  updatedAt: string;
};

export type MemoryFactGroup = Record<string, MemoryFact[]>;

export type PreferenceMemory = {
  favorite: Record<string, MemoryFact[]>;
  likes: MemoryFact[];
  dislikes: MemoryFact[];
  interests: MemoryFact[];
  aspirations: MemoryFact[];
  goals: MemoryFact[];
  fears: MemoryFact[];
  dietary: MemoryFact[];
  general: Record<string, MemoryFact[]>;
};

export type GlobalMemory = {
  identity: MemoryFactGroup;
  family: MemoryFactGroup;
  work: MemoryFactGroup;
  preferences: PreferenceMemory;
  personality: MemoryFactGroup;
  style: MemoryFactGroup;
  dynamic: MemoryFactGroup;
  threadSummaries: GlobalThreadSummary[];
  markdown: string;
  updatedAt: string;
};

export type ChatSessionState = {
  messages: ChatMessage[];
  memory: ThreadMemory;
  pendingToolConfirmation: PendingToolConfirmation | null;
  activeToolShortcut: ActiveToolShortcut | null;
};

export type ChatThreadSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isTemporary: boolean;
  isTitleEdited: boolean;
  archivedAt?: string;
};

export const MAX_CONTEXT_MESSAGES = 6;
export const DEFAULT_THREAD_TITLE = "Untitled thread";
export const INITIAL_MESSAGE_COUNT = 0;

const MULTI_VALUE_KEYS = new Set([
  "children_names",
  "siblings",
  "language",
  "likes",
  "dislikes",
  "interest",
  "aspiration",
  "goal",
  "dietary",
  "fear",
  "favorite",
  "favorite_food",
  "favorite_drink",
  "favorite_music",
  "favorite_movie",
  "favorite_color",
]);

const FAMILY_MEMORY_KEYS = new Set([
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
]);

const SUSPICIOUS_NAME_VALUES = new Set(["familiar", "texty", "assistant", "bot"]);
const SUSPICIOUS_PROFILE_PATTERN =
  /\b(semantic(?:ly)?|message|assistant|system prompt|tool|shortcut|executor)\b/i;

const formatFactLine = (fact: MemoryFact) =>
  `- \`${fact.key}\`: ${fact.value} (${Math.round(fact.confidence * 100)}%)`;

const sortFacts = (facts: MemoryFact[]) =>
  [...facts].sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });

const mergeFactArray = ({
  currentFacts,
  incomingFact,
  allowMultiple,
}: {
  currentFacts: MemoryFact[];
  incomingFact: MemoryFact;
  allowMultiple: boolean;
}) => {
  const sameValueIndex = currentFacts.findIndex(
    (fact) => fact.value.trim().toLowerCase() === incomingFact.value.trim().toLowerCase(),
  );

  if (sameValueIndex !== -1) {
    const sameValueFact = currentFacts[sameValueIndex];
    const nextFacts = [...currentFacts];

    if (
      incomingFact.confidence >= sameValueFact.confidence ||
      incomingFact.updatedAt >= sameValueFact.updatedAt
    ) {
      nextFacts[sameValueIndex] = incomingFact;
    }

    return sortFacts(nextFacts);
  }

  if (!allowMultiple) {
    if (currentFacts.length === 0) {
      return [incomingFact];
    }

    const bestCurrent = sortFacts(currentFacts)[0];

    if (
      incomingFact.confidence > bestCurrent.confidence ||
      (incomingFact.confidence === bestCurrent.confidence &&
        incomingFact.updatedAt >= bestCurrent.updatedAt)
    ) {
      return [incomingFact];
    }

    return [bestCurrent];
  }

  return sortFacts([...currentFacts, incomingFact]);
};

const createEmptyPreferenceMemory = (): PreferenceMemory => ({
  favorite: {},
  likes: [],
  dislikes: [],
  interests: [],
  aspirations: [],
  goals: [],
  fears: [],
  dietary: [],
  general: {},
});

const normalizeFactGroup = (group: MemoryFactGroup | undefined): MemoryFactGroup =>
  Object.fromEntries(
    Object.entries(group ?? {})
      .map(([key, facts]) => [key, sortFacts(Array.isArray(facts) ? facts : [])])
      .filter(([, facts]) => facts.length > 0),
  );

const isValidStructuredFact = ({
  bucket,
  fact,
}: {
  bucket: "identity" | "family" | "work";
  fact: MemoryFact;
}) => {
  const normalizedValue = fact.value.trim().toLowerCase();

  if (bucket === "family" && !FAMILY_MEMORY_KEYS.has(fact.key)) {
    return false;
  }

  if (fact.key === "name" && SUSPICIOUS_NAME_VALUES.has(normalizedValue)) {
    return false;
  }

  if (
    (fact.key === "profession" || fact.key === "business") &&
    SUSPICIOUS_PROFILE_PATTERN.test(normalizedValue)
  ) {
    return false;
  }

  return true;
};

const sanitizeStructuredFactGroup = ({
  bucket,
  group,
}: {
  bucket: "identity" | "family" | "work";
  group: MemoryFactGroup | undefined;
}) =>
  Object.fromEntries(
    Object.entries(group ?? {})
      .map(([key, facts]) => [
        key,
        sortFacts(Array.isArray(facts) ? facts : []).filter((fact) =>
          isValidStructuredFact({
            bucket,
            fact,
          }),
        ),
      ])
      .filter(([, facts]) => facts.length > 0),
  );

const normalizePreferenceMemory = (
  preferences: Partial<PreferenceMemory> | undefined,
): PreferenceMemory => ({
  favorite: normalizeFactGroup(preferences?.favorite),
  likes: sortFacts(preferences?.likes ?? []),
  dislikes: sortFacts(preferences?.dislikes ?? []),
  interests: sortFacts(preferences?.interests ?? []),
  aspirations: sortFacts(preferences?.aspirations ?? []),
  goals: sortFacts(preferences?.goals ?? []),
  fears: sortFacts(preferences?.fears ?? []),
  dietary: sortFacts(preferences?.dietary ?? []),
  general: normalizeFactGroup(preferences?.general),
});

const createEmptyStructuredGlobalMemory = () => ({
  identity: {},
  family: {},
  work: {},
  preferences: createEmptyPreferenceMemory(),
  personality: {},
  style: {},
  dynamic: {},
});

const isMultiValueFactKey = (key: string) => MULTI_VALUE_KEYS.has(key);

const placeFactInGroup = (
  group: MemoryFactGroup,
  bucketKey: string,
  fact: MemoryFact,
  allowMultiple = false,
) => {
  group[bucketKey] = mergeFactArray({
    currentFacts: group[bucketKey] ?? [],
    incomingFact: fact,
    allowMultiple,
  });
};

export const addFactToGlobalMemory = (
  memory: GlobalMemory,
  fact: MemoryFact,
): GlobalMemory => {
  const nextMemory: GlobalMemory = {
    ...memory,
    identity: { ...memory.identity },
    family: { ...memory.family },
    work: { ...memory.work },
    preferences: {
      favorite: { ...memory.preferences.favorite },
      likes: [...memory.preferences.likes],
      dislikes: [...memory.preferences.dislikes],
      interests: [...memory.preferences.interests],
      aspirations: [...memory.preferences.aspirations],
      goals: [...memory.preferences.goals],
      fears: [...memory.preferences.fears],
      dietary: [...memory.preferences.dietary],
      general: { ...memory.preferences.general },
    },
    personality: { ...memory.personality },
    style: { ...memory.style },
    dynamic: { ...memory.dynamic },
  };

  if (
    fact.key === "name" ||
    fact.key === "first_name" ||
    fact.key === "last_name" ||
    fact.key === "nickname" ||
    fact.key === "age" ||
    fact.key === "nationality" ||
    fact.key === "location" ||
    fact.key === "gender" ||
    fact.key === "pronouns"
  ) {
    placeFactInGroup(nextMemory.identity, fact.key, fact);
    return nextMemory;
  }

  if (fact.key === "language") {
    placeFactInGroup(nextMemory.identity, fact.key, fact, true);
    return nextMemory;
  }

  if (
    fact.key === "profession" ||
    fact.key === "employer" ||
    fact.key === "industry" ||
    fact.key === "business"
  ) {
    placeFactInGroup(nextMemory.work, fact.key, fact);
    return nextMemory;
  }

  if (fact.key === "likes") {
    nextMemory.preferences.likes = mergeFactArray({
      currentFacts: nextMemory.preferences.likes,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "dislikes") {
    nextMemory.preferences.dislikes = mergeFactArray({
      currentFacts: nextMemory.preferences.dislikes,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "interest" || fact.key === "interests") {
    nextMemory.preferences.interests = mergeFactArray({
      currentFacts: nextMemory.preferences.interests,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "aspiration") {
    nextMemory.preferences.aspirations = mergeFactArray({
      currentFacts: nextMemory.preferences.aspirations,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "goal") {
    nextMemory.preferences.goals = mergeFactArray({
      currentFacts: nextMemory.preferences.goals,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "fear" || fact.key === "fears") {
    nextMemory.preferences.fears = mergeFactArray({
      currentFacts: nextMemory.preferences.fears,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "dietary") {
    nextMemory.preferences.dietary = mergeFactArray({
      currentFacts: nextMemory.preferences.dietary,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "favorite" || fact.key.startsWith("favorite_")) {
    const category = fact.key === "favorite" ? "general" : fact.key.slice("favorite_".length);
    placeFactInGroup(nextMemory.preferences.favorite, category, fact, true);
    return nextMemory;
  }

  if (fact.key === "preference" || fact.key === "preferences") {
    placeFactInGroup(nextMemory.preferences.general, "general", fact, true);
    return nextMemory;
  }

  if (FAMILY_MEMORY_KEYS.has(fact.key)) {
    placeFactInGroup(
      nextMemory.family,
      fact.key,
      fact,
      isMultiValueFactKey(fact.key),
    );
    return nextMemory;
  }

  return nextMemory;
};

export const addPersonalityFactToGlobalMemory = (
  memory: GlobalMemory,
  fact: MemoryFact,
): GlobalMemory => {
  const nextMemory: GlobalMemory = { ...memory, personality: { ...memory.personality } };
  placeFactInGroup(nextMemory.personality, fact.key, fact, false);
  return nextMemory;
};

export const addStyleFactToGlobalMemory = (
  memory: GlobalMemory,
  fact: MemoryFact,
): GlobalMemory => {
  const nextMemory: GlobalMemory = { ...memory, style: { ...memory.style } };
  placeFactInGroup(nextMemory.style, fact.key, fact, false);
  return nextMemory;
};

export const addDynamicFactToGlobalMemory = (
  memory: GlobalMemory,
  fact: MemoryFact,
): GlobalMemory => {
  const nextMemory: GlobalMemory = { ...memory, dynamic: { ...memory.dynamic } };
  placeFactInGroup(nextMemory.dynamic, fact.key, fact, true);
  return nextMemory;
};

const flattenFactGroup = (group: MemoryFactGroup) =>
  Object.values(group)
    .flat()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const formatFactGroupMarkdown = (title: string, group: MemoryFactGroup) => {
  const entries = Object.entries(group);

  if (entries.length === 0) {
    return `## ${title}\n\n_None yet._`;
  }

  const lines = entries
    .map(
      ([bucket, facts]) =>
        `### ${bucket}\n\n${facts.map((fact) => formatFactLine(fact)).join("\n")}`,
    )
    .join("\n\n");

  return `## ${title}\n\n${lines}`;
};

export const flattenGlobalMemoryFacts = (memory: GlobalMemory) =>
  [
    ...flattenFactGroup(memory.identity),
    ...flattenFactGroup(memory.family),
    ...flattenFactGroup(memory.work),
    ...flattenFactGroup(memory.preferences.favorite),
    ...memory.preferences.likes,
    ...memory.preferences.dislikes,
    ...memory.preferences.interests,
    ...memory.preferences.aspirations,
    ...memory.preferences.goals,
    ...memory.preferences.fears,
    ...memory.preferences.dietary,
    ...flattenFactGroup(memory.preferences.general),
    ...flattenFactGroup(memory.personality),
    ...flattenFactGroup(memory.style),
    ...flattenFactGroup(memory.dynamic),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const pruneFactArrayByThreadId = (facts: MemoryFact[], threadId: string) =>
  facts.filter((fact) => fact.sourceThreadId !== threadId);

const pruneFactGroupByThreadId = (
  group: MemoryFactGroup,
  threadId: string,
): MemoryFactGroup =>
  Object.fromEntries(
    Object.entries(group)
      .map(([key, facts]) => [key, pruneFactArrayByThreadId(facts, threadId)])
      .filter(([, facts]) => facts.length > 0),
  );

export const pruneGlobalMemoryByThreadId = (
  memory: GlobalMemory,
  threadId: string,
): GlobalMemory => {
  const nextMemory: GlobalMemory = {
    ...memory,
    identity: pruneFactGroupByThreadId(memory.identity, threadId),
    family: pruneFactGroupByThreadId(memory.family, threadId),
    work: pruneFactGroupByThreadId(memory.work, threadId),
    preferences: {
      favorite: pruneFactGroupByThreadId(memory.preferences.favorite, threadId),
      likes: pruneFactArrayByThreadId(memory.preferences.likes, threadId),
      dislikes: pruneFactArrayByThreadId(memory.preferences.dislikes, threadId),
      interests: pruneFactArrayByThreadId(memory.preferences.interests, threadId),
      aspirations: pruneFactArrayByThreadId(memory.preferences.aspirations, threadId),
      goals: pruneFactArrayByThreadId(memory.preferences.goals, threadId),
      fears: pruneFactArrayByThreadId(memory.preferences.fears, threadId),
      dietary: pruneFactArrayByThreadId(memory.preferences.dietary, threadId),
      general: pruneFactGroupByThreadId(memory.preferences.general, threadId),
    },
    personality: pruneFactGroupByThreadId(memory.personality, threadId),
    style: pruneFactGroupByThreadId(memory.style, threadId),
    dynamic: pruneFactGroupByThreadId(memory.dynamic, threadId),
    threadSummaries: memory.threadSummaries.filter(
      (summary) => summary.threadId !== threadId,
    ),
    markdown: "",
  };

  nextMemory.markdown = buildGlobalMemoryMarkdown({
    memory: nextMemory,
    threadSummaries: nextMemory.threadSummaries,
  });

  return nextMemory;
};

export const buildThreadMemoryMarkdown = ({
  summary,
  keywords,
  facts,
  messages,
}: {
  summary: string;
  keywords: string[];
  facts: MemoryFact[];
  messages: ChatMessage[];
}) => {
  const summaryBlock = summary || "_No thread summary yet._";
  const keywordBlock =
    keywords.length > 0 ? keywords.map((keyword) => `- ${keyword}`).join("\n") : "_None yet._";
  const factBlock =
    facts.length > 0 ? facts.map(formatFactLine).join("\n") : "_No stable thread facts yet._";
  const transcriptBlock = messages
    .map(
      (message) =>
        `### ${message.role}\n\n${message.content}\n\n_At: ${message.createdAt}_`,
    )
    .join("\n\n");

  return `# Thread Memory

## Summary

${summaryBlock}

## Keywords

${keywordBlock}

## Facts

${factBlock}

## Transcript

${transcriptBlock}`;
};

export const buildGlobalMemoryMarkdown = ({
  memory,
  threadSummaries,
}: {
  memory: GlobalMemory;
  threadSummaries: GlobalThreadSummary[];
}) => {
  const summaryBlock =
    threadSummaries.length > 0
      ? threadSummaries
          .map(
            (entry) =>
              `- ${entry.title || "Untitled thread"} [${entry.threadId.slice(0, 8)}]: ${entry.summary}`,
          )
          .join("\n")
      : "_No thread summaries indexed yet._";

  return `# User Memory

${formatFactGroupMarkdown("Identity", memory.identity)}

${formatFactGroupMarkdown("Family", memory.family)}

${formatFactGroupMarkdown("Work", memory.work)}

## Preferences

### Favorite

${
  Object.keys(memory.preferences.favorite).length > 0
    ? Object.entries(memory.preferences.favorite)
        .map(
          ([bucket, facts]) =>
            `#### ${bucket}\n\n${facts.map((fact) => formatFactLine(fact)).join("\n")}`,
        )
        .join("\n\n")
    : "_None yet._"
}

### Likes

${
  memory.preferences.likes.length > 0
    ? memory.preferences.likes.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

### Dislikes

${
  memory.preferences.dislikes.length > 0
    ? memory.preferences.dislikes.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

### Interests

${
  memory.preferences.interests.length > 0
    ? memory.preferences.interests.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

### Aspirations

${
  memory.preferences.aspirations.length > 0
    ? memory.preferences.aspirations.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

### Goals

${
  memory.preferences.goals.length > 0
    ? memory.preferences.goals.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

### Fears

${
  memory.preferences.fears.length > 0
    ? memory.preferences.fears.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

### Dietary

${
  memory.preferences.dietary.length > 0
    ? memory.preferences.dietary.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

${formatFactGroupMarkdown("Personality", memory.personality)}

${formatFactGroupMarkdown("Style", memory.style)}

${formatFactGroupMarkdown("Dynamic", memory.dynamic)}

## Thread Summaries

${summaryBlock}`;
};

export const createEmptyThreadMemory = (): ThreadMemory => {
  const timestamp = new Date().toISOString();

  return {
    summary: "",
    keywords: [],
    facts: [],
    markdown: buildThreadMemoryMarkdown({
      summary: "",
      keywords: [],
      facts: [],
      messages: [],
    }),
    updatedAt: timestamp,
  };
};

export const createEmptyGlobalMemory = (): GlobalMemory => {
  const timestamp = new Date().toISOString();
  const memory = {
    ...createEmptyStructuredGlobalMemory(),
    threadSummaries: [],
    markdown: "",
    updatedAt: timestamp,
  } satisfies GlobalMemory;

  memory.markdown = buildGlobalMemoryMarkdown({
    memory,
    threadSummaries: [],
  });

  return memory;
};

export const normalizeThreadMemory = (
  memory: Partial<ThreadMemory> | undefined,
  messages: ChatMessage[],
): ThreadMemory => {
  const normalizedFacts = memory?.facts ?? [];
  const normalizedKeywords = memory?.keywords ?? [];
  const normalizedSummary = memory?.summary ?? "";
  const updatedAt = memory?.updatedAt ?? new Date().toISOString();

  return {
    summary: normalizedSummary,
    keywords: normalizedKeywords,
    facts: normalizedFacts,
    markdown:
      memory?.markdown ??
      buildThreadMemoryMarkdown({
        summary: normalizedSummary,
        keywords: normalizedKeywords,
        facts: normalizedFacts,
        messages,
      }),
    updatedAt,
  };
};

export const normalizeGlobalMemory = (
  memory:
    | (Partial<GlobalMemory> & {
        facts?: MemoryFact[];
      })
    | undefined,
): GlobalMemory => {
  const threadSummaries = memory?.threadSummaries ?? [];
  const updatedAt = memory?.updatedAt ?? new Date().toISOString();
  const structuredMemory: GlobalMemory = {
    ...createEmptyStructuredGlobalMemory(),
    identity: sanitizeStructuredFactGroup({
      bucket: "identity",
      group: memory?.identity,
    }),
    family: sanitizeStructuredFactGroup({
      bucket: "family",
      group: memory?.family,
    }),
    work: sanitizeStructuredFactGroup({
      bucket: "work",
      group: memory?.work,
    }),
    preferences: normalizePreferenceMemory(memory?.preferences),
    personality: normalizeFactGroup(memory?.personality),
    style: normalizeFactGroup(memory?.style),
    dynamic: normalizeFactGroup(memory?.dynamic),
    threadSummaries,
    markdown: "",
    updatedAt,
  };

  for (const legacyFact of memory?.facts ?? []) {
    const migrated = addFactToGlobalMemory(structuredMemory, legacyFact);
    structuredMemory.identity = migrated.identity;
    structuredMemory.family = migrated.family;
    structuredMemory.work = migrated.work;
    structuredMemory.preferences = migrated.preferences;
  }

  return {
    ...structuredMemory,
    markdown: buildGlobalMemoryMarkdown({
      memory: structuredMemory,
      threadSummaries,
    }),
  };
};

export const normalizeChatSessionState = (
  state: Partial<ChatSessionState> & Pick<ChatSessionState, "messages">,
): ChatSessionState => ({
  messages: state.messages,
  memory: normalizeThreadMemory(state.memory, state.messages),
  pendingToolConfirmation:
    state.pendingToolConfirmation &&
    typeof state.pendingToolConfirmation.toolName === "string" &&
    state.pendingToolConfirmation.arguments &&
    typeof state.pendingToolConfirmation.arguments === "object" &&
    typeof state.pendingToolConfirmation.confidence === "number"
      ? {
          mode:
            state.pendingToolConfirmation.mode === "follow_up"
              ? "follow_up"
              : "confirmation",
          toolName: state.pendingToolConfirmation.toolName,
          arguments: state.pendingToolConfirmation.arguments,
          confidence: state.pendingToolConfirmation.confidence,
          createdAt:
            state.pendingToolConfirmation.createdAt ?? new Date().toISOString(),
          question:
            typeof state.pendingToolConfirmation.question === "string"
              ? state.pendingToolConfirmation.question
              : undefined,
        }
      : null,
  activeToolShortcut:
    state.activeToolShortcut &&
    typeof state.activeToolShortcut.toolName === "string"
      ? {
          toolName: state.activeToolShortcut.toolName,
          createdAt:
            state.activeToolShortcut.createdAt ?? new Date().toISOString(),
        }
      : null,
});

export const createAssistantMessage = (content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content,
  createdAt: new Date().toISOString(),
});

export const createUserMessage = (content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
  createdAt: new Date().toISOString(),
});

export const createInitialChatState = (): ChatSessionState => ({
  messages: [],
  memory: createEmptyThreadMemory(),
  pendingToolConfirmation: null,
  activeToolShortcut: null,
});

export const createThreadSummary = (
  id: string,
  messageCount = INITIAL_MESSAGE_COUNT,
  options?: {
    isTemporary?: boolean;
    isTitleEdited?: boolean;
    title?: string;
  },
): ChatThreadSummary => {
  const timestamp = new Date().toISOString();

  return {
    id,
    title: options?.title ?? DEFAULT_THREAD_TITLE,
    createdAt: timestamp,
    updatedAt: timestamp,
    messageCount,
    isTemporary: options?.isTemporary ?? false,
    isTitleEdited: options?.isTitleEdited ?? false,
  };
};

export const normalizeThreadSummary = (
  summary: Partial<ChatThreadSummary> & Pick<ChatThreadSummary, "id">,
): ChatThreadSummary => ({
  id: summary.id,
  title: summary.title ?? DEFAULT_THREAD_TITLE,
  createdAt: summary.createdAt ?? new Date().toISOString(),
  updatedAt: summary.updatedAt ?? summary.createdAt ?? new Date().toISOString(),
  messageCount: summary.messageCount ?? INITIAL_MESSAGE_COUNT,
  isTemporary: summary.isTemporary ?? false,
  isTitleEdited: summary.isTitleEdited ?? false,
});

export const normalizeThreadSummaries = (
  summaries: ChatThreadSummary[],
): ChatThreadSummary[] =>
  summaries.every(
    (summary) =>
      typeof summary.title === "string" &&
      typeof summary.createdAt === "string" &&
      typeof summary.updatedAt === "string" &&
      typeof summary.messageCount === "number" &&
      typeof summary.isTemporary === "boolean" &&
      typeof summary.isTitleEdited === "boolean",
  )
    ? summaries
    : summaries.map(normalizeThreadSummary);

export const getThreadTitleFromMessages = (messages: ChatMessage[]) => {
  const firstUserMessage = messages.find(
    (message) =>
      message.role === "user" && !message.content.trim().startsWith(":"),
  );

  if (!firstUserMessage) {
    return DEFAULT_THREAD_TITLE;
  }

  return firstUserMessage.content.replace(/\s+/g, " ").trim().slice(0, 48);
};
