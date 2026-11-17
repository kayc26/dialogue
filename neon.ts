import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  auth: true,
  dataApi: true,
  aiGateway: true,
  // ADR-0014 (QST-KEY-SHARING: C): the model proxy. It holds the shared OpenRouter key,
  // read from .env.local when deploying (`neon deploy --env .env.local`), so the key never
  // enters the repo or the site. Testers are capped at $1 each (CAP_DOLLARS); the admin
  // is metered but not capped (UNCAPPED_ROLES).
  functions: {
    llm: {
      name: "Model proxy (shared OpenRouter key, $1 per tester)",
      source: "./functions/llm/index.ts",
      env: {
        OPENROUTER_API_KEY: { value: process.env.OPENROUTER_API_KEY, required: true },
        CAP_DOLLARS: { value: "1" },
        UNCAPPED_ROLES: { value: "admin" },
        ALLOWED_ORIGINS: { value: "https://kayc26.github.io,http://localhost:5173" },
      },
    },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
