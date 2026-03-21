import { authenticateProviderRequest } from "./provider-auth";
import { createHandleConversationInputEndpoint } from "./provider.conversation.endpoint.core";
import {
  getIdempotencyHeader,
  getRequestId,
  jsonError,
  jsonResponse,
  readJson,
  replayIdempotentResponse,
} from "./provider.http";
import {
  buildIdempotencyKey,
  hashIdempotencyRequest,
  readIdempotencyReplay,
  storeIdempotencyReplay,
} from "./provider.idempotency";
import {
  handleProviderConversationInput,
  isProviderRateLimitError,
} from "./provider.service";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "./provider.storage";

export { createHandleConversationInputEndpoint } from "./provider.conversation.endpoint.core";

export const handleConversationInputEndpoint =
  createHandleConversationInputEndpoint({
    getRequestId,
    getIdempotencyHeader,
    readJson,
    jsonResponse,
    jsonError,
    replayIdempotentResponse,
    authenticateProviderRequest,
    loadOrCreateProviderUserContext,
    saveProviderUserContext,
    buildIdempotencyKey,
    hashIdempotencyRequest,
    readIdempotencyReplay,
    storeIdempotencyReplay,
    handleProviderConversationInput,
    isProviderRateLimitError,
  });
