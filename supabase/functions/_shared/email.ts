/**
 * Transactional email via Resend.
 *
 * RESEND_API_KEY lives only in Edge Function secrets
 * (`supabase secrets set RESEND_API_KEY=...`). It must never be exposed to the
 * browser — anyone holding it can send mail as the organization.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * The verified sender. Until the org's own domain is verified in Resend, this
 * falls back to Resend's shared onboarding sender, which only delivers to the
 * account owner's address — fine for testing, not for production.
 */
const FROM_ADDRESS = Deno.env.get('MAIL_FROM') ?? 'PAWTX <onboarding@resend.dev>';

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');

  if (!apiKey) {
    // Not fatal: a donation must still be recorded and an RSVP must still be
    // booked even when mail is misconfigured. Log loudly instead of throwing.
    console.error('[PAWTX] RESEND_API_KEY is not set — skipping email:', input.subject);
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { reply_to: input.replyTo } : {})
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend rejected the message (${response.status}): ${detail}`);
  }
}

/** Escapes user-supplied text before it goes into an HTML email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shared shell so every PAWTX email looks like it came from the same place. */
export function emailLayout(heading: string, bodyHtml: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FDFBF7;padding:32px 16px;color:#2A2A2A;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E5E0D8;border-radius:16px;padding:32px;">
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#A64D32;font-weight:700;">
          Peace Academy of West Texas
        </div>
        <h1 style="font-size:22px;margin:12px 0 20px;color:#2A2A2A;">${escapeHtml(heading)}</h1>
        ${bodyHtml}
        <hr style="border:none;border-top:1px solid #E5E0D8;margin:28px 0 16px;" />
        <p style="font-size:12px;color:#5A5A5A;margin:0;">
          Peace Academy of West Texas &bull; 3411 Brentwood Dr, Odessa, TX 79762<br />
          501(c)(3) non-profit &bull; Engaging Minds, Building Community
        </p>
      </div>
    </div>
  `;
}
