import * as os from 'os';

let hostnamePattern: RegExp | undefined;
let usernamePattern: RegExp | undefined;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureDynamicPatterns(): void {
  if (hostnamePattern === undefined) {
    hostnamePattern = new RegExp(`\\b${escapeRegExp(os.hostname())}\\b`, 'g');
  }
  if (usernamePattern === undefined) {
    usernamePattern = new RegExp(`\\b${escapeRegExp(os.userInfo().username)}\\b`, 'g');
  }
}

/** Specific before general — order must not change (private IPv4 before public IPv4). */
const staticRules: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /(?:C:\\Users\\[^\\]+\\|C:\/Users\/[^/]+\/)/g,
    replacement: 'C:\\Users\\[user]\\',
  },
  {
    pattern: /([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/g,
    replacement: '[MAC hidden]',
  },
  {
    pattern: /(?:192\.168|10\.|172\.(?:1[6-9]|2[0-9]|3[01]))\.\d+\.\d+/g,
    replacement: '[local IP hidden]',
  },
  {
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    replacement: '[IP hidden]',
  },
  {
    pattern: /([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}/g,
    replacement: '[IPv6 hidden]',
  },
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[email hidden]',
  },
  {
    pattern: /(?<!NT AUTHORITY\\)(?<!BUILTIN\\)\b[A-Z][A-Z0-9_-]+\\[a-zA-Z0-9._-]+/g,
    replacement: '[domain\\account hidden]',
  },
  {
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    replacement: 'Bearer [token hidden]',
  },
  {
    pattern: /(api[_-]?key|token|password|secret|credential)[=:]\s*\S+/gi,
    replacement: '$1=[hidden]',
  },
  {
    pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
    replacement: '[AWS key hidden]',
  },
  {
    pattern: /(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+/g,
    replacement: '[Stripe key hidden]',
  },
  {
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: '[JWT hidden]',
  },
  {
    pattern: /(?:mongodb|postgres|mysql|redis|amqp):\/\/\S+/gi,
    replacement: '[connection string hidden]',
  },
  {
    pattern: /AccountKey=[A-Za-z0-9+/=]+/g,
    replacement: 'AccountKey=[hidden]',
  },
  {
    pattern: /-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]*?-----END/g,
    replacement: '[private key hidden]',
  },
  {
    pattern: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    replacement: '[ID hidden]',
  },
];

export function scrubPII(text: string): string {
  ensureDynamicPatterns();
  let result = text.replace(hostnamePattern!, '[computer name hidden]');
  result = result.replace(usernamePattern!, '[user]');
  for (const rule of staticRules) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}
