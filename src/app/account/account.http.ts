import { getRequestId, jsonError, jsonResponse, readJson } from "../provider/provider.http";

import {
  authenticateAccountToken,
  createAccountWithInitialToken,
  normalizeIntegrationBaseUrl,
  updateAccountIntegrationBaseUrl,
} from "./account.service";
import {
  createHandleCreateAccountEndpoint,
  createHandleCurrentIntegrationEndpoint,
  createHandleGetAccountEndpoint,
} from "./account.http-core";

export const handleCreateAccountEndpoint = createHandleCreateAccountEndpoint({
  getRequestId,
  readJson,
  jsonResponse,
  jsonError,
  authenticateAccountToken,
  createAccountWithInitialToken,
  normalizeIntegrationBaseUrl,
  updateAccountIntegrationBaseUrl,
});

export const handleGetAccountEndpoint = createHandleGetAccountEndpoint({
  getRequestId,
  readJson,
  jsonResponse,
  jsonError,
  authenticateAccountToken,
  createAccountWithInitialToken,
  normalizeIntegrationBaseUrl,
  updateAccountIntegrationBaseUrl,
});

export const handleCurrentIntegrationEndpoint =
  createHandleCurrentIntegrationEndpoint({
    getRequestId,
    readJson,
    jsonResponse,
    jsonError,
    authenticateAccountToken,
    createAccountWithInitialToken,
    normalizeIntegrationBaseUrl,
    updateAccountIntegrationBaseUrl,
});
