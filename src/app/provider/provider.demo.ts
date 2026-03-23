export const BUILT_IN_DEMO_PROVIDER_ID = "demo_executor";
export const BUILT_IN_DEMO_TOKEN = "dev-token";
export const BUILT_IN_DEMO_USER_ID = "demo_user";
export const BUILT_IN_DEMO_CHANNEL_ID = "minimal-executor-playground";

const todoStore = new Map<
  string,
  Array<{
    id: string;
    text: string;
    created_at: string;
  }>
>();

const normalizeDemoTodo = (value: unknown) => {
  const todo = typeof value === "string" ? value.trim() : "";

  if (!todo) {
    return "";
  }

  if (todo.toLowerCase() === "null" || todo.toLowerCase() === "undefined") {
    return "";
  }

  return todo;
};

export const getBuiltInDemoTodos = (userId: string) => [
  ...(todoStore.get(userId) ?? []),
];

const addBuiltInDemoTodo = ({
  userId,
  todo,
}: {
  userId: string;
  todo: string;
}) => {
  const currentTodos = getBuiltInDemoTodos(userId);
  const nextTodo = {
    id: crypto.randomUUID(),
    text: todo,
    created_at: new Date().toISOString(),
  };
  const nextTodos = [...currentTodos, nextTodo];
  todoStore.set(userId, nextTodos);
  return nextTodos;
};

export const executeBuiltInDemoTool = ({
  toolName,
  args,
  userId,
}: {
  toolName: string;
  args: Record<string, unknown>;
  userId?: string;
}) => {
  if (toolName !== "todos.add") {
    return {
      state: "failed" as const,
      message: `Unknown tool: ${toolName || "missing"}.`,
      data: null,
    };
  }

  const todo = normalizeDemoTodo(args.todo);

  if (!todo) {
    return {
      state: "needs_clarification" as const,
      message: "What should I add to the todo list?",
      data: null,
    };
  }

  const todos = addBuiltInDemoTodo({
    userId: userId || BUILT_IN_DEMO_USER_ID,
    todo,
  });

  return {
    state: "completed" as const,
    message: `Added "${todo}" to the todo list.`,
    data: {
      added_todo: todo,
      todos,
    },
  };
};
