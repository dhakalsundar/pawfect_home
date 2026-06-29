import { env } from '../../config/env.js';
import { sendMail } from '../../config/mailer.js';
import type { ApplicationStatus } from '../../models/AdoptionApplication.js';

const frontend = env.allowedOrigins[0] ?? 'http://localhost:3000';

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
                 </table>`
              : ''
          }
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #efeae6;font-size:12px;color:#9a8f89;">
          You are receiving this because you have an adoption application on PawfectHome.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function sendApplicationSubmittedEmail(
  to: string,
  applicantName: string,
  petName: string,
  shelterName: string,
) {
  return sendMail({
    to,
    subject: `Your application for ${petName} has been sent`,
    html: layout(
      `Thanks, ${applicantName}!`,
      `<p>Your application to adopt <strong>${petName}</strong> has been sent to ${shelterName}.</p>
       <p>They typically respond within a few days. You will get an email the moment anything
       changes, and you can check the status at any time.</p>
       <p style="margin-bottom:0;">Applying is not binding — nothing is decided until you have met.</p>`,
      { label: 'Track your application', url: `${frontend}/dashboard/applications` },
    ),
    text: `Thanks, ${applicantName}!\n\nYour application to adopt ${petName} has been sent to ${shelterName}. They typically respond within a few days.\n\nTrack it: ${frontend}/dashboard/applications`,
  });
}

export function sendApplicationReceivedEmail(
  to: string,
  shelterName: string,
  petName: string,
  applicantName: string,
) {
  return sendMail({
    to,
    subject: `New adoption application for ${petName}`,
    html: layout(
      'You have a new application',
      `<p>${applicantName} has applied to adopt <strong>${petName}</strong>.</p>
       <p style="margin-bottom:0;">Their full answers, household details and references are on your dashboard.</p>`,
      { label: 'Review the application', url: `${frontend}/shelter/applications` },
    ),
    text: `${applicantName} has applied to adopt ${petName}.\n\nReview it: ${frontend}/shelter/applications`,
  });
}

/** Copy per status. A rejection in particular deserves a human tone, not a status code. */
const STATUS_COPY: Record<string, { subject: (pet: string) => string; heading: string; body: string }> = {
  under_review: {
    subject: (pet) => `Your application for ${pet} is being reviewed`,
    heading: 'Your application is being reviewed',
    body: 'The shelter has picked up your application and is going through it now. They may get in touch with a few questions.',
  },
  approved: {
    subject: (pet) => `Good news about ${pet}!`,
    heading: 'Your application was approved',
    body: 'The shelter would like to move forward. They will be in touch to arrange a meeting — nothing is final until you have met in person.',
  },
  rejected: {
    subject: (pet) => `An update on your application for ${pet}`,
    heading: 'Your application was not successful this time',
    body: 'This particular match did not work out, which happens for all sorts of reasons and is rarely about you. There are many other animals waiting.',
  },
  completed: {
    subject: (pet) => `Welcome home, ${pet}!`,
    heading: 'Your adoption is complete',
    body: 'Congratulations. Thank you for giving a rescue animal a home — and for freeing up space for the next one.',
  },
};

export function sendStatusChangedEmail(
  to: string,
  applicantName: string,
  petName: string,
  status: ApplicationStatus,
  note?: string,
) {
  const copy = STATUS_COPY[status];
  if (!copy) return Promise.resolve();

  const noteBlock = note
    ? `<div style="margin-top:16px;padding:14px;background:#faf7f5;border-radius:12px;">
         <p style="margin:0 0 4px;font-size:13px;color:#9a8f89;">From the shelter</p>
         <p style="margin:0;">${note}</p>
       </div>`
    : '';

  return sendMail({
    to,
    subject: copy.subject(petName),
    html: layout(
      copy.heading,
      `<p>Hi ${applicantName},</p>
       <p>Regarding your application to adopt <strong>${petName}</strong>: ${copy.body}</p>
       ${noteBlock}`,
      status === 'rejected'
        ? { label: 'Browse other pets', url: `${frontend}/pets` }
        : { label: 'View your application', url: `${frontend}/dashboard/applications` },
    ),
    text: `Hi ${applicantName},\n\nRegarding your application to adopt ${petName}: ${copy.body}${note ? `\n\nFrom the shelter: ${note}` : ''}\n\n${frontend}/dashboard/applications`,
  });
}
