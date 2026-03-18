import {
  parseConversationCommand,
  type ParsedConversationCommand,
} from "./conversation.commands";

export type ParsedConversationInput =
  | {
      kind: "command";
      command: ParsedConversationCommand;
    }
  | {
      kind: "message";
      content: string;
    };

export const parseConversationInput = (
  rawInput: string,
): ParsedConversationInput | null => {
  const command = parseConversationCommand(rawInput);

  if (command) {
    return {
      kind: "command",
      command,
    };
  }

  const content = rawInput.trim();

  if (!content) {
    return null;
  }

  return {
    kind: "message",
    content,
  };
};
