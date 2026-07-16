// Keeps diagnostic logs useful for correlating events without writing a
// full email address (PII) into plaintext, unrotated PM2 log files.
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local[0] ?? ''}***@${domain}`;
}
