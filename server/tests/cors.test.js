const express = require('express');
const request = require('supertest');
const { createCorsMiddleware } = require('../src/middleware/cors');

describe('frontend origin configuration', () => {
  test('allows only configured browser origins and handles preflight', async () => {
    const app = express();
    app.use(createCorsMiddleware({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://shop.example.test,https://preview.example.test' }));
    app.get('/users/me', (_req, res) => res.json({ ok: true }));
    const allowed = await request(app).options('/users/me').set('Origin', 'https://shop.example.test')
      .set('Access-Control-Request-Method', 'GET').expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://shop.example.test');

    const rejected = await request(app).get('/users/me').set('Origin', 'https://attacker.example.test').expect(403);
    expect(rejected.body.error.code).toBe('CORS_ORIGIN_FORBIDDEN');
  });
});
