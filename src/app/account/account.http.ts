import { getRequestId, jsonError, jsonResponse, readJson } from "../provider/provider.http.ts";

import {
  authenticateAccountToken,
  checkRateLimitByIp,
  createAccountToken,
  createAccountWithInitialToken,
  createBrowserLoginSession,
  getAccountUsage,
  getIntegrationStatus,
  listAccountTokens,
  normalizeIntegrationBaseUrl,
  revokeAccountToken,
  updateAccountIntegrationBaseUrl,
} from "./account.service.ts";
import { syncProviderTools } from "../provider/provider.service.ts";
import {
  createHandleAccountUsageEndpoint,
  createHandleCreateAccountEndpoint,
  createHandleCreateBrowserSessionEndpoint,
  createHandleCurrentIntegrationEndpoint,
  createHandleGetAccountEndpoint,
  createHandleIntegrationStatusEndpoint,
} from "./account.http-core.ts";
import {
  createHandleRevokeTokenEndpoint,
  createHandleTokensEndpoint,
} from "./account.tokens.http.ts";
import { createHandleGetModelsEndpoint } from "./account.models.http.ts";

const sharedDeps = {
  getRequestId,
  readJson,
  jsonResponse,
  jsonError,
  authenticateAccountToken,
  createAccountWithInitialToken,
  normalizeIntegrationBaseUrl,
  updateAccountIntegrationBaseUrl,
  createBrowserLoginSession,
  createAccountToken,
  listAccountTokens,
  revokeAccountToken,
  getAccountUsage,
  getIntegrationStatus,
  checkRateLimitByIp,
  syncProviderTools,
};

export const handleCreateAccountEndpoint =
  createHandleCreateAccountEndpoint(sharedDeps);

export const handleGetAccountEndpoint =
  createHandleGetAccountEndpoint(sharedDeps);

export const handleAccountUsageEndpoint =
  createHandleAccountUsageEndpoint(sharedDeps);

export const handleCurrentIntegrationEndpoint =
  createHandleCurrentIntegrationEndpoint(sharedDeps);

export const handleCreateBrowserSessionEndpoint =
  createHandleCreateBrowserSessionEndpoint(sharedDeps);

export const handleIntegrationStatusEndpoint =
  createHandleIntegrationStatusEndpoint(sharedDeps);

export const handleGetModelsEndpoint =
  createHandleGetModelsEndpoint(sharedDeps);

export const handleTokensEndpoint = createHandleTokensEndpoint(sharedDeps);

export const handleRevokeTokenEndpoint = createHandleRevokeTokenEndpoint(sharedDeps);
