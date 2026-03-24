export const BUILT_IN_DEMO_PROVIDER_ID = "demo_executor";
export const BUILT_IN_DEMO_TOKEN = "dev-token";
export const BUILT_IN_DEMO_USER_ID = "demo_user";
export const BUILT_IN_DEMO_CHANNEL_ID = "minimal-executor-playground";
export const BUILT_IN_COUNTDOWN_PROVIDER_ID = "demo_countdown";
export const BUILT_IN_COUNTDOWN_CHANNEL_ID = "async-countdown-playground";
export const BUILT_IN_PINNED_TOOL_PROVIDER_ID = "demo_pinned_tool";
export const BUILT_IN_PINNED_TOOL_CHANNEL_ID = "pinned-tool-playground";

const todoStore = new Map<
  string,
  Array<{
    id: string;
    text: string;
    created_at: string;
  }>
>();

const normalizeDemoTodoItems = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(
      (item) =>
        item &&
        item.toLowerCase() !== "null" &&
        item.toLowerCase() !== "undefined",
    );
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

  const todoItems = normalizeDemoTodoItems(args.todo_items);

  if (todoItems.length === 0) {
    return {
      state: "needs_clarification" as const,
      message: "What todo items should I add?",
      data: null,
    };
  }

  let todos = getBuiltInDemoTodos(userId || BUILT_IN_DEMO_USER_ID);

  for (const todoItem of todoItems) {
    todos = addBuiltInDemoTodo({
      userId: userId || BUILT_IN_DEMO_USER_ID,
      todo: todoItem,
    });
  }

  return {
    state: "completed" as const,
    message:
      todoItems.length === 1
        ? `Added "${todoItems[0]}" to the todo list.`
        : `Added ${todoItems.length} items to the todo list: ${todoItems.join(", ")}.`,
    data: {
      added_todo: todoItems[0],
      added_todos: todoItems,
      todos,
    },
  };
};
