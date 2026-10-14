const HttpError = require('../utils/httpError');

function notFound(_req, _res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.'));
}

function errorHandler(error, _req, res, _next) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = status >= 500 ? 'An unexpected error occurred.' : error.message;
  return res.status(status).json({ message, error: { code, fields: error.fields || {}, details: error.details || {} } });
}

module.exports = { notFound, errorHandler };
