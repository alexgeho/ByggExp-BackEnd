// Pure helpers for the faktura@ mailbox reader (kept apart for tests).

// Codes from every recipient header of a mail: faktura+<code>@… → <code>.
// The local part is configurable via INBOUND_ADDRESS_TEMPLATE, but the
// "+<code>@" shape is what every template uses.
export const codesFromHeaders = (values: string[]): string[] => {
  const found = new Set<string>();
  for (const value of values) {
    const re = /\+([a-z0-9]{6,32})@/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(value || "")))) found.add(m[1].toLowerCase());
  }
  return [...found];
};

// IMAP keyword marking a mail as handled. Each environment (prod, dev) uses
// its own, so both can read the same catch-all mailbox without taking mails
// from each other; nothing is moved or deleted.
export const handledFlag = () =>
  (process.env.INBOUND_IMAP_FLAG || "ByggexpHandled").replace(/[^\w]/g, "");
