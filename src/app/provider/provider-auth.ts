import { env } from "cloudflare:workers";

import {
  authenticateProviderRequestWithConfigs,
  normalizeProviderConfigMap,
} from "./provider.auth-core";
import { logProviderAudit } from "./provider.audit";
import {
  BUILT_IN_DEMO_PROVIDER_ID,
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
  const origin = new URL(request.url).origin;

  return {
    ...providerConfigs,
    [BUILT_IN_DEMO_PROVIDER_ID]: {
      token: BUILT_IN_DEMO_TOKEN,
      baseUrl: `${origin}/sandbox/demo-executor`,
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
  providerId: string;
  requestId?: string;
}) => {
  return authenticateProviderRequestWithConfigs({
    request,
    providerId,
    requestId,
    providerConfigs: withBuiltInProviders({
      providerConfigs: getProviderConfigs(),
      request,
    }),
    logAudit: logProviderAudit,
  });
};
