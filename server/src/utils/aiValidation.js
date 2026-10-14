const HttpError = require('./httpError');
const { validateAuctionId } = require('./auctionValidation');

function validateAIQuestion(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.', { body: 'Must be an object.' });
  }
  const fields = {};
  for (const key of Object.keys(body)) if (key !== 'question') fields[key] = 'Unknown field.';
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (question.length < 3 || question.length > 500) fields.question = 'Must be 3–500 characters.';
  if (Object.keys(fields).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.', fields);
  return question;
}

function validateInteractionQuery(query) {
  const fields = {};
  for (const key of Object.keys(query)) if (!['page', 'limit'].includes(key)) fields[key] = 'Unknown query parameter.';
  const parse = (key, fallback, max = Number.MAX_SAFE_INTEGER) => {
    const raw = query[key];
    if (raw === undefined) return fallback;
    if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) {
      fields[key] = `Must be an integer from 1 to ${max}.`;
      return fallback;
    }
    return Number(raw);
  };
  const page = parse('page', 1);
  const limit = parse('limit', 10, 50);
  if (Object.keys(fields).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Query validation failed.', fields);
  return { page, limit };
}

module.exports = { validateAuctionId, validateAIQuestion, validateInteractionQuery };
