/** Safe Edge Function log helpers — never emit secrets, JWTs, or full tokens. */

const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-+/=]+/gi;
const EVM_ADDR_RE = /0x[a-fA-F0-9]{40}/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function shortAddress(address?: string | null): string | null {
  if (!address) return null;
  const trimmed = String(address).trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

/** @deprecated use shortAddress */
export function truncateWalletAddress(address: string): string {
  return shortAddress(address) ?? '—';
}

export function maskToken(token: string): string {
  const s = token.trim();
  if (s.length <= 10) return '[redacted]';
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function sanitizeString(value: string): string {
  let s = value;
  s = s.replace(JWT_RE, '[jwt]');
  s = s.replace(BEARER_RE, 'Bearer [redacted]');
  s = s.replace(EVM_ADDR_RE, (m) => shortAddress(m) ?? '[addr]');
  s = s.replace(EMAIL_RE, '[email]');
  return s;
}

const SENSITIVE_FIELD_RE =
  /(token|secret|authorization|signature|password|mnemonic|api[_-]?key|bearer|jwt|turnstile|email|session|nonce|message|header|body|rpc|private)/i;

export function sanitizeLogFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = `[array len=${value.length}]`;
      continue;
    }
    const s = String(value);
    if (key.endsWith('_truncated') || key.endsWith('_prefix') || key.endsWith('_suffix')) {
      out[key] = s;
      continue;
    }
    if (/wallet.*address|bound_wallet|submitted_wallet/i.test(key)) {
      out[key] = shortAddress(s);
      continue;
    }
    if (SENSITIVE_FIELD_RE.test(key)) {
      out[key] = maskToken(s);
      continue;
    }
    if (JWT_RE.test(s) || BEARER_RE.test(s) || EMAIL_RE.test(s) ||
      (s.startsWith('0x') && s.length >= 20)) {
      out[key] = sanitizeString(s);
      continue;
    }
    out[key] = s.length > 240 ? `${s.slice(0, 240)}…` : s;
  }
  return out;
}

export function safeLog(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    event,
    ...sanitizeLogFields(data),
  }));
}

export function safeWarn(event: string, data: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({
    event,
    ...sanitizeLogFields(data),
  }));
}

export function safeError(event: string, data: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({
    event,
    ...sanitizeLogFields(data),
  }));
}
