import { authenticateProviderRequest } from "./provider-auth";
import { getRequestId, jsonError, jsonResponse, readJson } from "./provider.http";
import { loadOrCreateProviderUserContext } from "./provider.storage";
import { addProviderTool, isProviderRateLimitError } from "./provider.service";
import { createHandleToolAddEndpoint } from "./provider.tool-add.endpoint.core";

export const handleToolAddEndpoint = createHandleToolAddEndpoint({
  getRequestId,
  readJson,
  jsonResponse,
  jsonError,
  authenticateProviderRequest,
  loadOrCreateProviderUserContext,
  addProviderTool,
  isProviderRateLimitError,
});
