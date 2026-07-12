-- Move+ Web Marketplace account linking (one-time link token + short web session).
-- Identity is auth.uid() / user_id only — never email matching.
-- Plain tokens are never stored; only SHA-256 hashes.

CREATE TABLE IF NOT EXISTS public.marketplace_link_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_hash text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_link_sessions_token_hash
  ON public.marketplace_link_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_marketplace_link_sessions_user_id
  ON public.marketplace_link_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_link_sessions_expires_at
  ON public.marketplace_link_sessions (expires_at);

COMMENT ON TABLE public.marketplace_link_sessions IS
  'One-time hashed tokens for linking Move+ app user to web marketplace. Raw token only in ?link_token= URL.';

ALTER TABLE public.marketplace_link_sessions ENABLE ROW LEVEL SECURITY;
-- No client policies: service-role Edge Functions only.

CREATE TABLE IF NOT EXISTS public.marketplace_web_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_web_sessions_session_hash
  ON public.marketplace_web_sessions (session_hash);

CREATE INDEX IF NOT EXISTS idx_marketplace_web_sessions_user_id
  ON public.marketplace_web_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_web_sessions_expires_at
  ON public.marketplace_web_sessions (expires_at);

COMMENT ON TABLE public.marketplace_web_sessions IS
  'Short-lived web marketplace sessions after link verify. Capability token hash only; no Supabase JWT.';

ALTER TABLE public.marketplace_web_sessions ENABLE ROW LEVEL SECURITY;
-- No client policies: service-role Edge Functions only.
