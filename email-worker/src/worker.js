import PostalMime from 'postal-mime';

// Cloudflare Email Worker: receives invoice e-mails forwarded to
// faktura@<domain>, extracts the PDF/image attachments, and POSTs them to the
// ByggExp inbound webhook, which OCRs them into draft supplier invoices.
//
// Configure (see README.md):
//   vars    : INBOUND_WEBHOOK_URL, INBOUND_COMPANY_ID
//   secret  : INBOUND_INVOICE_TOKEN  (same value as the backend secret)
const isInvoiceAttachment = (attachment) => {
  const type = (attachment.mimeType || '').toLowerCase();
  const name = (attachment.filename || '').toLowerCase();
  return (
    type === 'application/pdf'
    || type.startsWith('image/')
    || name.endsWith('.pdf')
    || /\.(png|jpe?g|heic|heif|webp)$/.test(name)
  );
};

export default {
  async email(message, env) {
    if (!env.INBOUND_INVOICE_TOKEN || !env.INBOUND_WEBHOOK_URL || !env.INBOUND_COMPANY_ID) {
      console.error('Email worker is missing INBOUND_* configuration');
      message.setReject('Invoice intake is not configured');
      return;
    }

    const raw = await new Response(message.raw).arrayBuffer();
    const email = await new PostalMime().parse(raw);
    const attachments = (email.attachments || []).filter(isInvoiceAttachment);

    if (!attachments.length) {
      // No invoice file to ingest — accept the mail silently so the sender
      // isn't bounced; a human can still look at the mailbox if needed.
      console.log(`No PDF/image attachments from ${message.from} ("${email.subject || ''}")`);
      return;
    }

    const form = new FormData();
    for (const attachment of attachments) {
      const blob = new Blob([attachment.content], {
        type: attachment.mimeType || 'application/octet-stream',
      });
      form.append('attachments', blob, attachment.filename || 'invoice.pdf');
    }

    const url = new URL(env.INBOUND_WEBHOOK_URL);
    url.searchParams.set('token', env.INBOUND_INVOICE_TOKEN);
    url.searchParams.set('companyId', env.INBOUND_COMPANY_ID);

    const response = await fetch(url.toString(), { method: 'POST', body: form });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`Inbound webhook failed: ${response.status} ${body}`);
      // Reject so Cloudflare retries / the sender is notified rather than the
      // invoice being lost.
      message.setReject(`Invoice intake failed (${response.status})`);
      return;
    }

    console.log(`Ingested ${attachments.length} attachment(s) from ${message.from}`);
  },
};
