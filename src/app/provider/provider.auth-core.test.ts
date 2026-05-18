import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticateProviderRequestWithConfigs,
  normalizeProviderConfigMap,
  validateExecutorUrl,
} from "./provider.auth-core.ts";

test("normalizeProviderConfigMap accepts string token shorthand", () => {
  const result = normalizeProviderConfigMap(
    '{"provider_a":"dev-token"}',
  );

  assert.deepEqual(result, {
    provider_a: {
      token: "dev-token",
    },
  });
});

test("normalizeProviderConfigMap trims tokens and base URLs", () => {
  const result = normalizeProviderConfigMap(
    '{"provider_a":{"token":"  dev-token  ","baseUrl":"https://example.com/root/"}}',
  );

  assert.deepEqual(result, {
    provider_a: {
      token: "dev-token",
      baseUrl: "https://example.com/root",
    },
  });
});

test("normalizeProviderConfigMap rejects invalid JSON", () => {
  assert.throws(
    () => normalizeProviderConfigMap("{nope"),
    /TEXTY_EXECUTOR_CONFIG is not valid JSON\./,
  );
});

test("normalizeProviderConfigMap rejects empty tokens", () => {
  assert.throws(
    () =>
      normalizeProviderConfigMap(
        '{"provider_a":{"token":"   "}}',
      ),
    /missing a token/i,
  );
});

test("normalizeProviderConfigMap rejects invalid base URLs", () => {
  assert.throws(
    () =>
      normalizeProviderConfigMap(
        '{"provider_a":{"token":"dev-token","baseUrl":"ftp://example.com"}}',
      ),
    /must use http or https/i,
  );
});

test("authenticateProviderRequestWithConfigs rejects missing bearer tokens", () => {
  const result = authenticateProviderRequestWithConfigs({
    request: new Request("https://example.com"),
    providerId: "provider_a",
    providerConfigs: {
      provider_a: {
        token: "dev-token",
      },
    },
  });

  assert.deepEqual(result, {
    ok: false,
    status: 401,
    error: {
      code: "unauthenticated",
      message: "Missing bearer token.",
    },
  });
});

test("authenticateProviderRequestWithConfigs rejects unknown executors", () => {
  const result = authenticateProviderRequestWithConfigs({
    request: new Request("https://example.com", {
      headers: {
        Authorization: "Bearer dev-token",
      },
    }),
    providerId: "missing_executor",
    providerConfigs: {
      provider_a: {
        token: "dev-token",
      },
    },
  });

  assert.deepEqual(result, {
    ok: false,
    status: 403,
    error: {
      code: "forbidden",
      message: "Invalid provider token.",
    },
  });
});

test("authenticateProviderRequestWithConfigs accepts matching bearer tokens", () => {
  const result = authenticateProviderRequestWithConfigs({
    request: new Request("https://example.com", {
      headers: {
        Authorization: "Bearer dev-token",
      },
    }),
    providerId: "provider_a",
    providerConfigs: {
      provider_a: {
        token: "dev-token",
        baseUrl: "https://example.com/root",
      },
    },
  });

  assert.deepEqual(result, {
    ok: true,
    providerId: "provider_a",
    providerConfig: {
      token: "dev-token",
      baseUrl: "https://example.com/root",
    },
  });
});

test("authenticateProviderRequestWithConfigs resolves provider from a unique token", () => {
  const result = authenticateProviderRequestWithConfigs({
    request: new Request("https://example.com", {
      headers: {
        Authorization: "Bearer dev-token",
      },
    }),
    providerConfigs: {
      provider_a: {
        token: "dev-token",
      },
    },
  });

  assert.deepEqual(result, {
    ok: true,
    providerId: "provider_a",
    providerConfig: {
      token: "dev-token",
    },
  });
});

test("validateExecutorUrl accepts valid public URLs", () => {
  assert.equal(validateExecutorUrl("https://example.com"), "https://example.com");
  assert.equal(validateExecutorUrl("https://example.com/root/"), "https://example.com/root");
  assert.equal(validateExecutorUrl("http://api.example.com:8080/path"), "http://api.example.com:8080/path");
});

test("validateExecutorUrl rejects invalid protocols", () => {
  assert.throws(() => validateExecutorUrl("ftp://example.com"), /must use http or https/);
  assert.throws(() => validateExecutorUrl("file:///etc/passwd"), /must use http or https/);
});

test("validateExecutorUrl rejects query and hash", () => {
  assert.throws(() => validateExecutorUrl("https://example.com?foo=bar"), /must not include query or hash/);
  assert.throws(() => validateExecutorUrl("https://example.com#frag"), /must not include query or hash/);
});

test("validateExecutorUrl rejects localhost", () => {
  assert.throws(() => validateExecutorUrl("http://localhost:8787"), /private or local/);
  assert.throws(() => validateExecutorUrl("http://localhost"), /private or local/);
});

test("validateExecutorUrl rejects private IPv4 ranges", () => {
  assert.throws(() => validateExecutorUrl("http://127.0.0.1"), /private or local/);
  assert.throws(() => validateExecutorUrl("http://10.0.0.1"), /private or local/);
  assert.throws(() => validateExecutorUrl("http://172.16.0.1"), /private or local/);
  assert.throws(() => validateExecutorUrl("http://172.31.255.255"), /private or local/);
  assert.throws(() => validateExecutorUrl("http://192.168.1.1"), /private or local/);
  assert.throws(() => validateExecutorUrl("http://169.254.169.254"), /private or local/);
  assert.throws(() => validateExecutorUrl("http://0.0.0.0"), /private or local/);
});

test("validateExecutorUrl rejects private IPv6 addresses", () => {
  assert.throws(() => validateExecutorUrl("http://[::1]"), /private or local/);
  assert.throws(() => validateExecutorUrl("http://[fc00::1]"), /private or local/);
  assert.throws(() => validateExecutorUrl("http://[fe80::1]"), /private or local/);
});

test("validateExecutorUrl allows public IPs", () => {
  assert.equal(validateExecutorUrl("http://8.8.8.8"), "http://8.8.8.8");
  assert.equal(validateExecutorUrl("http://1.1.1.1:8080"), "http://1.1.1.1:8080");
});
