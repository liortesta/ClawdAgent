/** Coerce any value to string safely (prevents "input.replace is not a function" crash) */
function toStr(input: unknown): string {
  if (typeof input === 'string') return input;
  return String(input ?? '');
}

export function sanitizeInput(input: unknown): string {
  return toStr(input)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // Control chars
    .trim()
    .slice(0, 10000);  // Max length
}

export function sanitizeForSQL(input: unknown): string {
  return toStr(input).replace(/['";\\]/g, '');
}

export function containsSuspiciousPatterns(input: unknown): boolean {
  const str = toStr(input);
  const patterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /\bexec\s*\(/i,
    /UNION\s+SELECT/i,
    /;\s*DROP\s/i,
    /--\s*$/m,
  ];
  return patterns.some(p => p.test(str));
}
