// Public endpoints of the Neon project `diabetes-chatbot`, branch `production`.
// Public by design (ADR-0010): what anyone can do with them is decided by sign-in and
// row-level security (ADR-0011). Never put the database connection string here.
// A development build can point at another branch (e.g. rls-dev) with
// VITE_NEON_AUTH_URL / VITE_NEON_DATA_API_URL.

export const NEON_AUTH_URL: string =
  import.meta.env.VITE_NEON_AUTH_URL ??
  'https://ep-raspy-surf-beqr8avd.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth'

export const NEON_DATA_API_URL: string =
  import.meta.env.VITE_NEON_DATA_API_URL ??
  'https://ep-raspy-surf-beqr8avd.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1'

// The model proxy (ADR-0014, QST-KEY-SHARING: C): Neon Function "llm" on the production
// branch, which holds the shared OpenRouter key. Public by design, like the URLs above:
// it answers only signed-in members and caps each tester at $1. Never put the key here.
export const LLM_PROXY_URL: string =
  import.meta.env.VITE_LLM_PROXY_URL ?? 'https://br-winter-forest-beewzuyw-llm.compute.c-9.us-east-2.aws.neon.tech'
