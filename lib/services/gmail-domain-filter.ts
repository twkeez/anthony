/**
 * Foundation for Gmail ingestion: match messages whose From/Reply-To domain
 * equals the client's primary email domain (e.g. clientcompany.com).
 *
 * Not wired to the Gmail API yet — use this predicate when listing or syncing mail.
 */
export function senderEmailMatchesClientDomain(
  senderEmail: string,
  clientDomain: string | null | undefined,
): boolean {
  const domain = (clientDomain ?? "").trim().toLowerCase().replace(/^@+/, "");
  if (!domain) return false;
  const at = senderEmail.lastIndexOf("@");
  if (at === -1) return false;
  const fromDomain = senderEmail.slice(at + 1).trim().toLowerCase();
  return fromDomain === domain;
}

export function buildGmailQueryForDomain(domain: string | null | undefined): string {
  const d = (domain ?? "").trim().toLowerCase();
  if (!d) return "";
  // Gmail search supports "from:@domain.com" style filters.
  return `from:@${d}`;
}
