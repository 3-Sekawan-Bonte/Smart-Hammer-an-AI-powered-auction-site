const HttpError = require('./httpError');

const UUID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
const MAX_BID = 2_000_000_000;

function validateAuctionId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Auction ID must be a positive integer.', { id: 'Must be a positive integer.' });
  }
  return Number(value);
}

function validateBidInput(body) {
  const fields = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.', { body: 'Must be a JSON object.' });
  }
  for (const key of Object.keys(body)) {
    if (key !== 'amount' && key !== 'clientRequestId') fields[key] = 'Unknown or server-controlled field.';
  }
  if (!Number.isInteger(body.amount) || body.amount < 1 || body.amount > MAX_BID) fields.amount = 'Must be an integer from 1 to 2000000000.';
  if (typeof body.clientRequestId !== 'string' || !UUID_PATTERN.test(body.clientRequestId)) fields.clientRequestId = 'Must be a valid UUID.';
  if (Object.keys(fields).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Bid validation failed.', fields);
  return { amount: body.amount, clientRequestId: body.clientRequestId.toLowerCase() };
}

module.exports = { validateBidInput, validateAuctionId };
