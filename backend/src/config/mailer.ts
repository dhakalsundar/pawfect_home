import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env.js';
import { logger } from './logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.isConfigured.mail) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transporter;
}

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends mail if SMTP is configured; otherwise logs the message and continues.
 *
 * Deliberately never throws. A failed welcome email must not roll back a successful registration —
 * the user would see an error and their account would already exist, leaving them unable to retry.
 * Delivery failures are logged for follow-up instead.
 */
export async function sendMail({ to, subject, html, text }: MailOptions): Promise<void> {
  const transport = getTransporter();

  if (!transport) {
    logger.info(
      { to, subject, preview: text.slice(0, 300) },
      'SMTP not configured — email logged instead of sent',
    );
    return;
  }

  try {
    await transport.sendMail({ from: env.MAIL_FROM, to, subject, html, text });
    logger.info({ to, subject }, 'Email sent');
  } catch (err) {
    logger.error({ err, to, subject }, 'Email delivery failed');
  }
}
