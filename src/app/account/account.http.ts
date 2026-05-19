import { getRequestId, jsonError, jsonResponse, readJson } from "../provider/provider.http";

import {
  authenticateAccountToken,
  checkRateLimitByIp,
  createAccountWithInitialToken,
  createBrowserLoginSession,
  getAccountUsage,
  getIntegrationStatus,
  normalizeIntegrationBaseUrl,
  updateAccountIntegrationBaseUrl,
} from "./account.service";
import {
  createHandleAccountUsageEndpoint,
  createHandleCreateAccountEndpoint,
  createHandleCreateBrowserSessionEndpoint,
  createHandleCurrentIntegrationEndpoint,
  createHandleGetAccountEndpoint,
  createHandleIntegrationStatusEndpoint,
} from "./account.http-core";
import { createHandleGetModelsEndpoint } from "./account.models.http";

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
  getAccountUsage,
  getIntegrationStatus,
  checkRateLimitByIp,
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
