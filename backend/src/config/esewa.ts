import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * eSewa ePay v2 integration (the official NPR gateway).
 *
 * Kept independent of any live account exactly like the Stripe webhook verifier: the signature is
 * an HMAC-SHA256 over the request fields, so signing and verification are pure functions of the
 * shared secret and are fully testable by self-signing. The one thing that genuinely needs eSewa's
 * servers is the server-to-server status check, which is therefore production-only (see below) —
 * the same boundary as Stripe's live card flow.
 *
 * Flow:
 *   1. `buildCheckoutFields` returns the signed form fields the browser POSTs to `formUrl`.
 *   2. eSewa collects payment and redirects back with a base64 `data` blob.
 *   3. `verifySignature` + an amount check confirm the redirect really came from eSewa unchanged.
 */

const ENDPOINTS = {
  test: {
    form: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://rc.esewa.com.np/api/epay/transaction/status/',
  },
  production: {
    form: 'https://epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://esewa.com.np/api/epay/transaction/status/',
  },
} as const;

export function esewaConfig() {
  const mode = env.ESEWA_ENV === 'production' ? 'production' : 'test';
  return {
    mode,
    productCode: env.ESEWA_PRODUCT_CODE,
    secret: env.ESEWA_SECRET,
    formUrl: ENDPOINTS[mode].form,
    statusUrl: ENDPOINTS[mode].status,
  };
}

/**
 * HMAC-SHA256, base64-encoded, over the `signed_field_names` fields joined as `key=value,key=value`.
 *
 * The order is dictated by `signedFieldNames`, and the message must be byte-identical to what eSewa
 * signs — any reordering or whitespace change breaks it, the same trap as the Stripe raw body.
 */
export function signEsewa(fields: Record<string, string>, signedFieldNames: string): string {
  const message = signedFieldNames
    .split(',')
    .map((name) => name.trim())
    .map((name) => `${name}=${fields[name] ?? ''}`)
    .join(',');

  return createHmac('sha256', esewaConfig().secret).update(message).digest('base64');
}

/**
 * Verifies the signature on a decoded redirect payload.
 *
 * A valid signature proves eSewa produced the payload with the shared secret — a forged or tampered
 * redirect cannot reproduce it (in production, where the secret is private). Timing-safe compare so
 * the check leaks nothing about how much of the signature matched.
 */
export function verifyEsewaSignature(data: Record<string, string>): boolean {
  const signedFieldNames = data.signed_field_names;
  const provided = data.signature;
  if (!signedFieldNames || !provided) return false;

  const expected = signEsewa(data, signedFieldNames);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  // timingSafeEqual throws on a length mismatch, which would itself leak length information.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Decodes the base64 JSON `data` param eSewa appends to the success redirect. Throws on garbage. */
export function decodeEsewaData(base64: string): Record<string, string> {
  const json = Buffer.from(base64, 'base64').toString('utf8');
  const parsed = JSON.parse(json) as unknown;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('eSewa data payload is not an object');
  }
  return parsed as Record<string, string>;
}

/**
 * The form fields for a checkout, already signed.
 *
 * `totalAmount` is a string in rupees (never paisa) because that is what eSewa signs and echoes
 * back; the caller converts from minor units at this one boundary. There is no tax / service /
 * delivery charge for a donation, so those are zero.
 */
export function buildCheckoutFields(params: {
  totalAmount: string;
  transactionUuid: string;
  successUrl: string;
  failureUrl: string;
}): Record<string, string> {
  const { productCode } = esewaConfig();

  const signedFieldNames = 'total_amount,transaction_uuid,product_code';

  const fields: Record<string, string> = {
    amount: params.totalAmount,
    tax_amount: '0',
    total_amount: params.totalAmount,
    transaction_uuid: params.transactionUuid,
    product_code: productCode,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: params.successUrl,
    failure_url: params.failureUrl,
    signed_field_names: signedFieldNames,
  };

  fields.signature = signEsewa(fields, signedFieldNames);
  return fields;
}

/**
 * Server-to-server confirmation against eSewa's status API. **Production only.**
 *
 * In UAT/test the transaction lives only in our tests, not on eSewa's servers, so a status call
 * would return NOT_FOUND and there is nothing real to confirm — exactly why Stripe's live flow is
 * also unverifiable offline. In production this is the belt to the signature's braces: it can
 * *reject* a redirect whose transaction eSewa does not actually report COMPLETE, but a network
 * failure never blocks a payment we have already verified by signature.
 *
 * Returns the reported status, or null when the check could not be performed.
 */
export async function checkEsewaStatus(
  transactionUuid: string,
  totalAmount: string,
): Promise<{ status: string; refId?: string } | null> {
  const { statusUrl, productCode } = esewaConfig();

  const url =
    `${statusUrl}?product_code=${encodeURIComponent(productCode)}` +
    `&total_amount=${encodeURIComponent(totalAmount)}` +
    `&transaction_uuid=${encodeURIComponent(transactionUuid)}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { status?: string; ref_id?: string };
    return { status: String(body.status ?? 'UNKNOWN'), ...(body.ref_id ? { refId: body.ref_id } : {}) };
  } catch (error) {
    logger.warn({ err: error, transactionUuid }, 'eSewa status check unreachable');
    return null;
  }
}

export function isEsewaProduction(): boolean {
  return esewaConfig().mode === 'production';
}
