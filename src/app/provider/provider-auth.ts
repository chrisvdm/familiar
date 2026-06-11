import { env } from "cloudflare:workers";

import { authenticateAccountToken } from "../account/account.service";
import {
  authenticateProviderRequestWithConfigs,
  getBearerToken,
  normalizeProviderConfigMap,
} from "./provider.auth-core";
import { logProviderAudit } from "./provider.audit";
import {
  BUILT_IN_COUNTDOWN_PROVIDER_ID,
  BUILT_IN_DEMO_PROVIDER_ID,
  BUILT_IN_PINNED_TOOL_PROVIDER_ID,
  BUILT_IN_DEMO_TOKEN,
} from "./provider.demo";
import type { ProviderConfig } from "./provider.types";

const providerEnv = env as typeof env & {
  TEXTY_EXECUTOR_CONFIG?: string;
  TEXTY_INTEGRATION_CONFIG?: string;
};

let cachedRawConfig: string | undefined;
let cachedProviderConfigs: Record<string, ProviderConfig> = {};
let cachedConfigLabel: string | undefined;

const withBuiltInProviders = ({
  providerConfigs,
  request,
}: {
  providerConfigs: Record<string, ProviderConfig>;
  request: Request;
}) => {
  if (!import.meta.env.VITE_IS_DEV_SERVER) {
    return providerConfigs;
  }

  const origin = new URL(request.url).origin;

  return {
    ...providerConfigs,
    [BUILT_IN_DEMO_PROVIDER_ID]: {
      token: BUILT_IN_DEMO_TOKEN,
      baseUrl: `${origin}/sandbox/demo-executor`,
    },
    [BUILT_IN_COUNTDOWN_PROVIDER_ID]: {
      token: BUILT_IN_DEMO_TOKEN,
      baseUrl: `${origin}/sandbox/async-countdown`,
    },
    [BUILT_IN_PINNED_TOOL_PROVIDER_ID]: {
      token: BUILT_IN_DEMO_TOKEN,
      baseUrl: `${origin}/sandbox/pinned-tool`,
    },
  };
};

const getProviderConfigSource = () => {
  if (providerEnv.TEXTY_EXECUTOR_CONFIG?.trim()) {
    return {
      rawConfig: providerEnv.TEXTY_EXECUTOR_CONFIG,
      configLabel: "TEXTY_EXECUTOR_CONFIG",
    };
  }

  return {
    rawConfig: providerEnv.TEXTY_INTEGRATION_CONFIG,
    configLabel: "TEXTY_INTEGRATION_CONFIG",
  };
};

const getProviderConfigs = () => {
  const { rawConfig, configLabel } = getProviderConfigSource();

  if (rawConfig === cachedRawConfig && configLabel === cachedConfigLabel) {
    return cachedProviderConfigs;
  }

  cachedRawConfig = rawConfig;
  cachedConfigLabel = configLabel;
  cachedProviderConfigs = normalizeProviderConfigMap(rawConfig, configLabel);
  return cachedProviderConfigs;
};

export const authenticateProviderRequest = ({
  request,
  providerId,
  requestId,
}: {
  request: Request;
  providerId?: string;
  requestId?: string;
}) => {
  const providerConfigs = withBuiltInProviders({
    providerConfigs: getProviderConfigs(),
    request,
  });
  const configAuth = authenticateProviderRequestWithConfigs({
    request,
    providerId,
    requestId,
    providerConfigs,
    logAudit: logProviderAudit,
  });

  if (configAuth.ok || configAuth.status === 401) {
    return configAuth;
  }

  return (async () => {
    const token = getBearerToken(request);

    if (!token) {
      return configAuth;
    }

    const accountAuth = await authenticateAccountToken(token);

    if (!accountAuth) {
      if (!configAuth.ok && configAuth.error.code === "unauthenticated") {
        return {
          ok: false as const,
          status: 401,
          error: { code: "unauthenticated" as const, message: "Unknown or invalid token." },
        };
      }
      return configAuth;
    }

    const resolvedProviderId = providerId?.trim()
      ? providerId
      : accountAuth.account.defaultSetupId;

    if (resolvedProviderId !== accountAuth.account.defaultSetupId) {
      return {
        ok: false as const,
        status: 403,
        error: {
          code: "forbidden",
          message: "Invalid API token.",
        },
      };
    }

    const withinFreeTier = (accountAuth.account.actionCount || 0) < 5;

    if (!accountAuth.integration.aiApiKey && !withinFreeTier) {
      return {
        ok: false as const,
        status: 400,
        error: {
          code: "configuration_required" as const,
          message: "No AI provider key configured. Set one via PATCH /api/v1/integration with your OpenRouter key.",
        },
      };
    }

    return {
      ok: true as const,
      providerId: resolvedProviderId,
      providerConfig: {
        token,
        ...(accountAuth.integration.baseUrl
          ? { baseUrl: accountAuth.integration.baseUrl }
          : {}),
        ...(accountAuth.integration.aiApiKey
          ? { aiApiKey: accountAuth.integration.aiApiKey }
          : {}),
        ...(Object.keys(accountAuth.integration.toolUrls ?? {}).length > 0
          ? { toolUrls: accountAuth.integration.toolUrls }
          : {}),
        ...(accountAuth.integration.webhookSecret
          ? { webhookSecret: accountAuth.integration.webhookSecret }
          : {}),
        ...(accountAuth.integration.transport
          ? { transport: accountAuth.integration.transport }
          : {}),
      },
      accountId: accountAuth.account.id,
    };
  })();
};
