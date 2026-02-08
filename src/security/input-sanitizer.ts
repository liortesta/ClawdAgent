export function sanitizeInput(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // Control chars
    .trim()
    .slice(0, 10000);  // Max length
}

export function sanitizeForSQL(input: string): string {
  return input.replace(/['";\\]/g, '');
}

export function containsSuspiciousPatterns(input: string): boolean {
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
  return patterns.some(p => p.test(input));
}
