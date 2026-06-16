import { env } from '../../config/env.js';
import { sendMail } from '../../config/mailer.js';

const frontend = env.allowedOrigins[0] ?? 'http://localhost:3000';

/**
 * Shared shell. Table-based with inline styles because email clients — Outlook especially —
 * ignore most modern CSS, including flexbox and CSS variables.
 */
function layout(heading: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f4f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(60,40,30,.08);">
        <tr><td style="background:linear-gradient(135deg,#ff6b5b,#ffa94d);padding:24px 32px;">
          <span style="color:#fff;font-size:20px;font-weight:700;">PawfectHome</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#251f1c;">${heading}</h1>
          <div style="font-size:15px;line-height:1.65;color:#5c534e;">${body}</div>
          ${
            cta
              ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
                   <tr><td style="background:#ff6b5b;border-radius:12px;">
                     <a href="${cta.url}" style="display:inline-block;padding:13px 26px;color:#fff;text-decoration:none;font-weight:600;font-size:15px;">${cta.label}</a>
                   </td></tr>
                 </table>
                 <p style="font-size:12px;color:#9a8f89;line-height:1.6;margin:16px 0 0;">
                   If the button doesn't work, paste this into your browser:<br>
                   <span style="color:#ff6b5b;word-break:break-all;">${cta.url}</span>
                 </p>`
              : ''
          }
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #efeae6;font-size:12px;color:#9a8f89;">
          You received this because someone used this address on PawfectHome.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function sendVerificationEmail(to: string, name: string, token: string) {
  const url = `${frontend}/verify-email?token=${token}`;
  return sendMail({
    to,
    subject: 'Confirm your email address',
    html: layout(
      `Welcome, ${name}!`,
      `<p>You're one click away from meeting your new best friend. Confirm your email address to activate your PawfectHome account.</p>
       <p style="margin-bottom:0;">This link expires in 24 hours.</p>`,
      { label: 'Confirm email', url },
    ),
    text: `Welcome to PawfectHome, ${name}!\n\nConfirm your email address:\n${url}\n\nThis link expires in 24 hours.`,
  });
}

export function sendPasswordResetEmail(to: string, name: string, token: string) {
  const url = `${frontend}/reset-password?token=${token}`;
  return sendMail({
    to,
    subject: 'Reset your password',
    html: layout(
      'Reset your password',
      `<p>Hi ${name}, we received a request to reset your PawfectHome password.</p>
       <p>This link expires in 1 hour and can only be used once.</p>
       <p style="margin-bottom:0;"><strong>Didn't request this?</strong> You can safely ignore this email — your password will not change.</p>`,
      { label: 'Reset password', url },
    ),
    text: `Hi ${name},\n\nReset your PawfectHome password:\n${url}\n\nThis link expires in 1 hour and can only be used once.\nIf you didn't request this, ignore this email.`,
  });
}

/**
 * Sent when a password reset is requested for an address with a Google-only account. Without it,
 * the "we sent you a link" response would be a lie for those users — they have no password to
 * reset and would sit waiting for an email that never arrives.
 */
export function sendOAuthPasswordResetNotice(to: string, name: string) {
  return sendMail({
    to,
    subject: 'About your password reset request',
    html: layout(
      'You sign in with Google',
      `<p>Hi ${name}, someone asked to reset the password for this address.</p>
       <p style="margin-bottom:0;">Your PawfectHome account signs in with Google, so there's no password to reset. Just use the "Continue with Google" button on the sign-in page.</p>`,
      { label: 'Go to sign in', url: `${frontend}/login` },
    ),
    text: `Hi ${name},\n\nSomeone requested a password reset for this address. Your account signs in with Google, so there is no password to reset. Use "Continue with Google" at ${frontend}/login`,
  });
}

export function sendMagicLinkEmail(to: string, name: string, token: string) {
  const url = `${frontend}/login/magic?token=${token}`;
  return sendMail({
    to,
    subject: 'Your PawfectHome sign-in link',
    html: layout(
      'Sign in to PawfectHome',
      `<p>Hi ${name}, here is your one-time sign-in link. No password needed.</p>
       <p>This link expires in 15 minutes and can only be used once.</p>
       <p style="margin-bottom:0;"><strong>Didn't request this?</strong> You can safely ignore this email.</p>`,
      { label: 'Sign in', url },
    ),
    text: `Hi ${name},\n\nSign in to PawfectHome with this one-time link:\n${url}\n\nIt expires in 15 minutes and can only be used once.\nIf you didn't request it, ignore this email.`,
  });
}

export function sendPasswordChangedEmail(to: string, name: string) {
  return sendMail({
    to,
    subject: 'Your password was changed',
    html: layout(
      'Your password was changed',
      `<p>Hi ${name}, your PawfectHome password was just changed and you've been signed out everywhere.</p>
       <p style="margin-bottom:0;"><strong>Wasn't you?</strong> Reset your password immediately and contact us.</p>`,
      { label: 'Reset password', url: `${frontend}/forgot-password` },
    ),
    text: `Hi ${name},\n\nYour PawfectHome password was just changed and you've been signed out on all devices.\n\nIf this wasn't you, reset it now: ${frontend}/forgot-password`,
  });
}
