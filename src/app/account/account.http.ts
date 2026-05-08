import { getRequestId, jsonError, jsonResponse, readJson } from "../provider/provider.http";

import {
  authenticateAccountToken,
  completeCliSession,
  createAccountWithInitialToken,
  createCliSession,
  getAccountUsage,
  normalizeIntegrationBaseUrl,
  pollCliSession,
  updateAccountIntegrationBaseUrl,
} from "./account.service";
import {
  createHandleAccountUsageEndpoint,
  createHandleCompleteCliSessionEndpoint,
  createHandleCreateAccountEndpoint,
  createHandleCreateCliSessionEndpoint,
  createHandleCurrentIntegrationEndpoint,
  createHandleGetAccountEndpoint,
  createHandlePollCliSessionEndpoint,
} from "./account.http-core";

const sharedDeps = {
  getRequestId,
  readJson,
  jsonResponse,
  jsonError,
  authenticateAccountToken,
  createAccountWithInitialToken,
  normalizeIntegrationBaseUrl,
  updateAccountIntegrationBaseUrl,
  createCliSession,
  completeCliSession,
  pollCliSession,
  getAccountUsage,
};

export const handleCreateAccountEndpoint =
  createHandleCreateAccountEndpoint(sharedDeps);

export const handleGetAccountEndpoint =
  createHandleGetAccountEndpoint(sharedDeps);

export const handleAccountUsageEndpoint =
  createHandleAccountUsageEndpoint(sharedDeps);

export const handleCurrentIntegrationEndpoint =
  createHandleCurrentIntegrationEndpoint(sharedDeps);

export const handleCreateCliSessionEndpoint =
  createHandleCreateCliSessionEndpoint(sharedDeps);

export const handlePollCliSessionEndpoint =
  createHandlePollCliSessionEndpoint(sharedDeps);

export const handleCompleteCliSessionEndpoint =
  createHandleCompleteCliSessionEndpoint(sharedDeps);
