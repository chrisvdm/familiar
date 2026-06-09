import { route } from "rwsdk/router";

import {
  handleCreateAccountEndpoint,
  handleCreateBrowserSessionEndpoint,
  handleCurrentIntegrationEndpoint,
  handleGetAccountEndpoint,
  handleGetModelsEndpoint,
  handleIntegrationStatusEndpoint,
} from "./account.http";

export const accountRoutes = [
  route("/api/v1/accounts", handleCreateAccountEndpoint),
  route("/api/v1/account", handleGetAccountEndpoint),
  route("/api/v1/integration", handleCurrentIntegrationEndpoint),
  route("/api/v1/integration/status", handleIntegrationStatusEndpoint),
  route("/api/v1/auth/browser-sessions", handleCreateBrowserSessionEndpoint),
  route("/api/v1/models", handleGetModelsEndpoint),
];
