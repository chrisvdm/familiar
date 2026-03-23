import manifest from "./texty.json" with { type: "json" };

const todoStore = new Map();

export const toolDefinitions = manifest.tools.map((tool) => ({
  ...tool,
  status: "active",
}));

const normalizeTodoItems = (value) => {
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
  const todoItems = normalizeTodoItems(payload.arguments?.todo_items);

  if (todoItems.length === 0) {
    return {
      ok: true,
      state: "needs_clarification",
      result: {
        summary: "What todo items should I add?",
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
