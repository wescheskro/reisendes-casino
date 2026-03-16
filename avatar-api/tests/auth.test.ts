import request from 'supertest';
import { createApp } from '../src/app';
import { makeToken, TEST_JWT_SECRET, connectDb, disconnectDb } from './setup';

process.env.JWT_SECRET = TEST_JWT_SECRET;

const app = createApp();

beforeAll(() => connectDb());
afterAll(() => disconnectDb());

describe('Auth Middleware', () => {
  it('rejects requests without token', async () => {
    const res = await request(app).get('/api/avatar/test-user-id');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .get('/api/avatar/test-user-id')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('accepts valid token', async () => {
    const token = makeToken('test-user-id');
    const res = await request(app)
      .get('/api/avatar/test-user-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});
