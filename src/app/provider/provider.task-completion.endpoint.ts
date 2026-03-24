import { authenticateProviderRequest } from "./provider-auth";
import { getRequestId, jsonError, jsonResponse, readJson } from "./provider.http";
import { handleProviderTaskCompletion } from "./provider.service";
import { loadOrCreateProviderUserContext } from "./provider.storage";
import { createHandleTaskCompletionEndpoint } from "./provider.task-completion.endpoint.core";

export { createHandleTaskCompletionEndpoint } from "./provider.task-completion.endpoint.core";

export const handleTaskCompletionEndpoint =
  createHandleTaskCompletionEndpoint({
    getRequestId,
    readJson,
    jsonResponse,
    jsonError,
    authenticateProviderRequest,
    loadOrCreateProviderUserContext,
    handleProviderTaskCompletion,
  });
