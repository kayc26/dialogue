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
