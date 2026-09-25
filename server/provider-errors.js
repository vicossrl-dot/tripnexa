import { HttpError } from './errors.js';

// Never log response bodies, request URLs, headers or prompts: they can contain secrets/private data.
const safeCode = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? value : 'unknown';
export function providerError(service, { status, code, requestId, cause } = {}) {
  const network = safeCode(cause?.cause?.code || cause?.code || cause?.name);
  console.error(`${service} provider failure`, { status: status || null, code: safeCode(code), requestId: safeCode(requestId), network });
  let message;
  if (status === 429) message = 'This service is temporarily busy. Please try again shortly.';
  else message = 'This service is temporarily unavailable. Please try again later or continue planning manually.';
  return new HttpError(502, message);
}
