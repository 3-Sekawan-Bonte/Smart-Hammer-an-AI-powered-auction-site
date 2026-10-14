function createCorsMiddleware(env = process.env) {
  const allowedOrigins = String(env.CLIENT_ORIGIN || (env.NODE_ENV === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173'))
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    } else if (origin) {
      return res.status(403).json({ message: 'Origin is not allowed.', error: { code: 'CORS_ORIGIN_FORBIDDEN', fields: {}, details: {} } });
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}

module.exports = { createCorsMiddleware };
