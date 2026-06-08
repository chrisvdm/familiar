import { defineConfig } from "vite";
import { redwood } from "rwsdk/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "worker" },
      remoteBindings: false,
    }),
    redwood(),
  ],
  optimizeDeps: {
    exclude: ["node:process", "@cloudflare/unenv-preset"],
  },
  ssr: {
    optimizeDeps: {
      exclude: ["node:process", "@cloudflare/unenv-preset"],
    },
  },
  environments: {
    worker: {
      optimizeDeps: {
        exclude: ["node:process", "@cloudflare/unenv-preset"],
      },
    },
  },
});
