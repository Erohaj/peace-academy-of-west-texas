import { requireSupabase } from '../supabaseClient';

export interface ContactMessageInput {
  fullName: string;
  email: string;
  message: string;
  /**
   * Honeypot. A real person never sees or fills this field; bots that submit
   * every input they find do. The Edge Function silently discards anything
   * with a value here.
   */
  website?: string;
}

/**
 * Posts the contact form to the `send-contact-message` Edge Function, which
 * stores the message and emails the org.
 *
 * It goes through a function rather than a direct insert because the Resend
 * API key must never reach the browser, and because `contact_messages` has no
 * public insert policy — a table anyone can write to is a spam target.
 */
export async function sendContactMessage(input: ContactMessageInput): Promise<void> {
  const { error } = await requireSupabase().functions.invoke('send-contact-message', {
    body: {
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      message: input.message.trim(),
      website: input.website ?? ''
    }
  });

  if (error) throw error;
}
