const todoStore = new Map();
const todoItemVerbPattern =
  /^(call|email|buy|send|pay|book|schedule|cancel|renew|reply|write|pick up|pickup|drop off|follow up|text|message|plan|order|get|wash|clean|groom|feed|walk|take|make|finish|submit|check|review|prepare)\b/i;

export const toolDefinitions = [
  {
    tool_name: "todos.add",
    description:
      "Add one item to the user's visible todo list. Use this only when the user clearly asks to add, capture, or remember a task. The todo field should contain only the task text itself.",
    input_schema: {
      type: "object",
      properties: {
        todo: {
          type: "string",
          description:
            "Only the todo text, for example buy dog food. Do not include phrases like add to my todo list.",
        },
      },
      required: ["todo"],
    },
    status: "active",
  },
];

const normalizeTodo = (value) => {
  const todo = typeof value === "string" ? value.trim() : "";

  if (!todo) {
    return "";
  }

  if (todo.toLowerCase() === "null" || todo.toLowerCase() === "undefined") {
    return "";
  }

  return todo;
};

const splitTodoItems = (todo) => {
  const normalized = todo
    .replace(/\b(?:to do|todo)\s+list\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const parts = normalized
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1 && parts.every((part) => todoItemVerbPattern.test(part))) {
    return parts;
  }

  return [normalized];
};

export const getTodosForUser = (userId) => [...(todoStore.get(userId) ?? [])];

const addTodoForUser = ({ userId, todo }) => {
  const currentTodos = getTodosForUser(userId);
  const nextTodo = {
    id: crypto.randomUUID(),
    text: todo,
    created_at: new Date().toISOString(),
  };
  const nextTodos = [...currentTodos, nextTodo];
  todoStore.set(userId, nextTodos);
  return nextTodos;
};

export const executeToolCall = ({
  payload,
  defaultUserId = "demo_user",
}) => {
  if (payload.tool_name !== "todos.add") {
    return {
      ok: false,
      state: "failed",
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${payload.tool_name || "missing"}.`,
      },
    };
  }

  const userId = String(payload.user_id || defaultUserId).trim();
  const todo = normalizeTodo(payload.arguments?.todo);
  const todoItems = todo ? splitTodoItems(todo) : [];

  if (todoItems.length === 0) {
    return {
      ok: true,
      state: "needs_clarification",
      result: {
        summary: "What should I add to the todo list?",
      },
    };
  }

  let todos = getTodosForUser(userId);

  for (const todoItem of todoItems) {
    todos = addTodoForUser({
      userId,
      todo: todoItem,
    });
  }

  return {
    ok: true,
    state: "completed",
    result: {
      summary:
        todoItems.length === 1
          ? `Added "${todoItems[0]}" to the todo list.`
          : `Added ${todoItems.length} items to the todo list: ${todoItems.join(", ")}.`,
      data: {
        added_todo: todoItems[0],
        added_todos: todoItems,
        todos,
      },
    },
  };
};
