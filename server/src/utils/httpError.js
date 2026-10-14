class HttpError extends Error {
  constructor(status, code, message, fields = {}, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}

module.exports = HttpError;
