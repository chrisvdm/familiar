import { route } from "rwsdk/router";

import {
  handleAccountUsageEndpoint,
  handleCompleteCliSessionEndpoint,
  handleCreateAccountEndpoint,
  handleCreateCliSessionEndpoint,
  handleCurrentIntegrationEndpoint,
  handleGetAccountEndpoint,
  handlePollCliSessionEndpoint,
} from "./account.http";

export const accountRoutes = [
  route("/api/v1/accounts", handleCreateAccountEndpoint),
  route("/api/v1/account", handleGetAccountEndpoint),
  route("/api/v1/account/usage", handleAccountUsageEndpoint),
  route("/api/v1/integration", handleCurrentIntegrationEndpoint),
  route("/api/v1/auth/cli/sessions", handleCreateCliSessionEndpoint),
  route("/api/v1/auth/cli/sessions/:session_id", handlePollCliSessionEndpoint),
  route(
    "/api/v1/auth/cli/sessions/:session_id/complete",
    handleCompleteCliSessionEndpoint,
  ),
];
