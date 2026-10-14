const HttpError = require('./httpError');
const Auction = require('../models/auction');

const CREATE_FIELDS = ['title', 'description', 'condition', 'category', 'productFacts', 'imageUrl', 'startingPrice', 'minIncrement', 'durationSeconds'];
const FACT_FIELDS = ['specifications', 'defects', 'accessories', 'warranty'];
const PROTECTED_FIELDS = ['sellerId', 'userId', 'currentPrice', 'status', 'startsAt', 'endsAt', 'highestBidderId', 'winnerId', 'version'];
const MAX_PRICE = 2_000_000_000;
const FACT_LIMITS = { specifications: 2000, defects: 1000, warranty: 500 };

function invalid(fields, message = 'Request validation failed.') {
  throw new HttpError(400, 'VALIDATION_ERROR', message, fields);
}

function validateProductFacts(value, fields) {
  const facts = { specifications: null, defects: null, accessories: [], warranty: null };
  if (value === undefined) return facts;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fields.productFacts = 'Must be an object.';
    return facts;
  }
  for (const key of Object.keys(value)) {
    if (!FACT_FIELDS.includes(key)) fields[`productFacts.${key}`] = 'Unknown field.';
  }
  for (const key of ['specifications', 'defects', 'warranty']) {
    const item = value[key];
    if (item === undefined || item === null) facts[key] = null;
    else if (typeof item !== 'string') fields[`productFacts.${key}`] = 'Must be a string or null.';
    else if (item.length > FACT_LIMITS[key]) fields[`productFacts.${key}`] = `Must be at most ${FACT_LIMITS[key]} characters.`;
    else facts[key] = item;
  }
  const accessories = value.accessories;
  if (accessories === undefined) facts.accessories = [];
  else if (!Array.isArray(accessories) || accessories.length > 10) fields['productFacts.accessories'] = 'Must be an array of at most 10 strings.';
  else {
    facts.accessories = accessories.map((item, index) => {
      if (typeof item !== 'string' || item.length > 100) fields[`productFacts.accessories.${index}`] = 'Each item must be a string of at most 100 characters.';
      return item;
    });
  }
  return facts;
}

function validateAuctionInput(body, { partial = false } = {}) {
  const fields = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid({ body: 'Must be a JSON object.' });
  const allowed = new Set(CREATE_FIELDS);
  for (const key of Object.keys(body)) {
    if (PROTECTED_FIELDS.includes(key)) fields[key] = 'This field is controlled by the server.';
    else if (!allowed.has(key)) fields[key] = 'Unknown field.';
  }
  if (partial && Object.keys(body).length === 0) fields.body = 'Provide at least one field to update.';

  const result = {};
  if (!partial || Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string') fields.title = 'Must be a string.';
    else {
      result.title = body.title.trim();
      if (result.title.length < 3 || result.title.length > 120) fields.title = 'Must be 3–120 characters.';
    }
  }
  if (!partial || Object.hasOwn(body, 'description')) {
    if (typeof body.description !== 'string') fields.description = 'Must be a string.';
    else {
      result.description = body.description.trim();
      if (result.description.length < 10 || result.description.length > 3000) fields.description = 'Must be 10–3000 characters.';
    }
  }
  if (!partial || Object.hasOwn(body, 'condition')) {
    if (!Auction.conditions.includes(body.condition)) fields.condition = 'Must be new, used_good, or used_fair.';
    else result.condition = body.condition;
  }
  if (!partial || Object.hasOwn(body, 'category')) {
    if (!Auction.categories.includes(body.category)) fields.category = 'Must be one of the supported product categories.';
    else result.category = body.category;
  }
  if (!partial || Object.hasOwn(body, 'productFacts')) result.productFacts = validateProductFacts(body.productFacts, fields);

  if (!partial || Object.hasOwn(body, 'imageUrl')) {
    if (body.imageUrl === undefined || body.imageUrl === null) result.imageUrl = null;
    else if (typeof body.imageUrl !== 'string' || body.imageUrl.length > 2048) fields.imageUrl = 'Must be an HTTPS URL of at most 2048 characters.';
    else {
      try {
        const url = new URL(body.imageUrl);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('invalid');
        result.imageUrl = url.toString();
      } catch (_error) {
        fields.imageUrl = 'Must be a valid HTTPS URL.';
      }
    }
  }

  for (const key of ['startingPrice', 'minIncrement']) {
    if (!partial || Object.hasOwn(body, key)) {
      const value = body[key];
      if (!Number.isInteger(value) || value < 1 || value > MAX_PRICE) fields[key] = 'Must be an integer from 1 to 2000000000.';
      else result[key] = value;
    }
  }
  if (!partial || Object.hasOwn(body, 'durationSeconds')) {
    const value = body.durationSeconds;
    if (!Number.isInteger(value) || value < 60 || value > 86400) fields.durationSeconds = 'Must be an integer from 60 to 86400.';
    else result.durationSeconds = value;
  }
  if (Object.keys(fields).length) invalid(fields);
  return result;
}

function validateAuctionId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Auction ID must be a positive integer.', { id: 'Must be a positive integer.' });
  }
  return Number(value);
}

function validateEmptyBody(body) {
  if (body === undefined) return;
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid({ body: 'Must be an empty JSON object.' });
  if (Object.keys(body).length) {
    const fields = {};
    for (const key of Object.keys(body)) fields[key] = PROTECTED_FIELDS.includes(key)
      ? 'Lifecycle fields are controlled by the server.'
      : 'This endpoint does not accept a request body.';
    invalid(fields);
  }
}

module.exports = { validateAuctionInput, validateAuctionId, validateEmptyBody, MAX_PRICE };
