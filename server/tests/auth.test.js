const request = require('supertest');
const app = require('../src/app');
const { sequelize, User } = require('../src/models');

const email = `auth-${process.pid}@example.test`;

beforeAll(async () => {
  if (!process.env.DATABASE_URL && !process.env.DB_NAME) throw new Error('Set DATABASE_URL (or DB_NAME/DB_USERNAME) to an isolated PostgreSQL test database.');
  await sequelize.authenticate();
});

afterEach(async () => {
  await User.destroy({ where: { email: [email, email.toUpperCase()] }, force: true });
});

afterAll(async () => sequelize.close());

describe('user authentication', () => {
  test('registers with normalized email, hashes password, and never returns the hash', async () => {
    const response = await request(app).post('/users/register').send({ username: 'hammer-user', email: email.toUpperCase(), password: 'correct horse battery staple' });
    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({ username: 'hammer-user', email });
    expect(JSON.stringify(response.body)).not.toContain('password');
    const user = await User.scope('withPassword').findOne({ where: { email } });
    expect(user.password).not.toBe('correct horse battery staple');
    expect(await require('bcryptjs').compare('correct horse battery staple', user.password)).toBe(true);
  });

  test('rejects invalid registration input and duplicate email', async () => {
    const invalid = await request(app).post('/users/register').send({ username: 'x', email, password: 'short' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    await request(app).post('/users/register').send({ username: 'hammer-user', email, password: 'correct horse battery staple' }).expect(201);
    const duplicate = await request(app).post('/users/register').send({ username: 'another-user', email: email.toUpperCase(), password: 'correct horse battery staple' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_EXISTS');
  });

  test('logs in with JWT and rejects incorrect credentials', async () => {
    await request(app).post('/users/register').send({ username: 'hammer-user', email, password: 'correct horse battery staple' }).expect(201);
    const login = await request(app).post('/users/login').send({ email: email.toUpperCase(), password: 'correct horse battery staple' });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toEqual(expect.any(String));
    expect(login.body.data.user).not.toHaveProperty('password');
    const incorrect = await request(app).post('/users/login').send({ email, password: 'incorrect password' });
    expect(incorrect.status).toBe(401);
    expect(incorrect.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('protects GET /users/me and returns the JWT identity profile', async () => {
    await request(app).get('/users/me').expect(401);
    await request(app).get('/users/me').set('Authorization', 'Bearer invalid-token').expect(401);
    await request(app).post('/users/register').send({ username: 'hammer-user', email, password: 'correct horse battery staple' }).expect(201);
    const login = await request(app).post('/users/login').send({ email, password: 'correct horse battery staple' });
    const me = await request(app).get('/users/me').set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user).toMatchObject({ username: 'hammer-user', email });
    expect(me.body.data.user).not.toHaveProperty('password');
  });
});
