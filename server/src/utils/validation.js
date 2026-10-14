const HttpError = require('./httpError');

function validateAuthBody(body, expected, mode) {
  const fields = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  for (const key of Object.keys(body)) {
    if (!expected.includes(key)) fields[key] = 'Unknown field.';
  }
  for (const key of expected) {
    if (typeof body[key] !== 'string' || body[key].trim() === '') fields[key] = 'This field is required.';
  }
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body.password;
  if (mode === 'register' && (username.length < 2 || username.length > 40)) fields.username = 'Must be 2–40 characters.';
  if (mode === 'register' && email.length > 254) fields.email = 'Must be at most 254 characters.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Must be a valid email address.';
  if (mode === 'register' && typeof password === 'string') {
    if (password.length < 8) fields.password = 'Must be at least 8 characters.';
    else if (Buffer.byteLength(password, 'utf8') > 72) fields.password = 'Must not exceed 72 UTF-8 bytes.';
  }
  if (Object.keys(fields).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.', fields);
  return { username, email, password };
}

module.exports = { validateAuthBody };
