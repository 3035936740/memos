/**
 * Spots personal or secret details in a memo about to go public (phone and ID numbers, bank cards, email addresses,
 * keys and tokens, private keys, LAN addresses), so the editor can ask once before they are published.
 */

export type PrivacyKind = "phone" | "id-card" | "bank-card" | "email" | "secret" | "private-key" | "private-ip";

export const PRIVACY_KINDS: PrivacyKind[] = ["phone", "id-card", "bank-card", "email", "secret", "private-key", "private-ip"];

export interface PrivacyFinding {
  kind: PrivacyKind;
  /** The matched text, as written. */
  text: string;
}

const digitsOf = (text: string) => text.replace(/\D/g, "");

/** The ISO 7064 check digit every mainland ID number ends with. */
const isIdCardNumber = (text: string) => {
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(text[index]), 0);
  return "10X98765432"[sum % 11] === text[17].toUpperCase();
};

/** The Luhn check that card numbers pass and most other long numbers do not. */
const passesLuhn = (digits: string) => {
  let sum = 0;
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
};

/** Values people write in place of a real secret in docs and examples. */
const PLACEHOLDER = /^(?:[<{[$*]|x{3,}|\.{3})|your|example|示例|placeholder/i;

/** Key and token formats with a recognisable prefix. */
const TOKEN_PATTERNS = [
  String.raw`sk-(?:ant-|proj-)?[\w-]{20,}`, // OpenAI, Anthropic and the many APIs that copy their format
  String.raw`gh[pousr]_[A-Za-z0-9]{36,}`, // GitHub
  String.raw`github_pat_\w{22,}`,
  String.raw`AKIA[0-9A-Z]{16}`, // AWS access key
  String.raw`AIza[\w-]{35}`, // Google API key
  String.raw`xox[abprs]-[\w-]{10,}`, // Slack
  String.raw`memos_pat_\w{16,}`, // this site's own access tokens
  String.raw`eyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}`, // JWT
];

interface Rule {
  kind: PrivacyKind;
  pattern: RegExp;
  accept?: (match: RegExpExecArray) => boolean;
  /** The part of the match to report, when the pattern also matches a label around it. */
  pick?: (match: RegExpExecArray) => string;
}

const RULES: Rule[] = [
  { kind: "private-key", pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g },
  { kind: "secret", pattern: new RegExp(`(?<![\\w-])(?:${TOKEN_PATTERNS.join("|")})`, "g") },
  {
    kind: "secret",
    // Secrets are ASCII; stopping at the first other character keeps prose such as "token：词元" out.
    pattern: /(?:password|passwd|pwd|secret|token|api[_-]?key|密码|口令)\s*[:=：]\s*["']?([^\s"',;\u0080-\uffff]{4,})/gi,
    accept: (match) => !PLACEHOLDER.test(match[1]),
    pick: (match) => match[1],
  },
  {
    kind: "id-card",
    pattern: /(?<![\dA-Za-z])[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![\dA-Za-z])/g,
    accept: (match) => isIdCardNumber(match[0]),
  },
  { kind: "phone", pattern: /(?<![\d+])(?:\+?86[ -]?)?1[3-9]\d(?:[ -]?\d{4}){2}(?!\d)/g },
  {
    kind: "bank-card",
    pattern: /(?<!\d)[3-6]\d{3}(?:[ -]?\d{4}){2}[ -]?\d{4,7}(?!\d)/g,
    accept: (match) => {
      const digits = digitsOf(match[0]);
      return digits.length >= 16 && digits.length <= 19 && passesLuhn(digits);
    },
  },
  {
    kind: "email",
    pattern: /(?<![\w.%+-])[\w.%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    accept: (match) => !/@(?:example\.(?:com|org|net)|localhost)$/i.test(match[0]),
  },
  { kind: "private-ip", pattern: /(?<![\d.])(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}(?![\d.])/g },
];

/** Every distinct finding in `content`, in rule order; an ID number is not also reported as a bank card or phone. */
export const findPrivateInfo = (content: string): PrivacyFinding[] => {
  const findings: PrivacyFinding[] = [];
  const seen = new Set<string>();
  // Character ranges already reported, so one number is only reported once, under its most specific kind.
  const taken: Array<[number, number]> = [];
  for (const rule of RULES) {
    for (const match of content.matchAll(rule.pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (taken.some(([from, to]) => start < to && end > from)) continue;
      if (rule.accept && !rule.accept(match)) continue;
      taken.push([start, end]);
      const text = rule.pick ? rule.pick(match) : match[0];
      const key = `${rule.kind}\0${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ kind: rule.kind, text });
    }
  }
  return findings;
};

/** Enough of a finding to recognise it, without repeating the whole secret on screen. */
export const maskFinding = ({ kind, text }: PrivacyFinding): string => {
  if (kind === "private-ip" || kind === "private-key") return text;
  if (kind === "email") {
    const [name, domain] = text.split("@");
    return `${name.slice(0, 1)}***@${domain}`;
  }
  if (kind === "secret") return `${text.slice(0, Math.min(6, Math.floor(text.length / 2)))}…`;
  // A phone number without its +86; an ID number keeps a trailing X.
  const digits = kind === "phone" ? digitsOf(text).slice(-11) : text.replace(/[\s-]/g, "");
  return `${digits.slice(0, 3)}${"*".repeat(Math.max(4, digits.length - 7))}${digits.slice(-4)}`;
};
