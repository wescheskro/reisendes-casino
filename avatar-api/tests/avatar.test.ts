import request from 'supertest';
import { createApp } from '../src/app';
import { makeToken, prisma, TEST_JWT_SECRET, connectDb, disconnectDb } from './setup';

process.env.JWT_SECRET = TEST_JWT_SECRET;
const app = createApp();
const userId = 'test-avatar-user';
const token = makeToken(userId);

beforeAll(() => connectDb());
afterAll(() => disconnectDb());

beforeEach(async () => {
  await prisma.avatar.deleteMany();
});

describe('GET /api/avatar/:userId', () => {
  it('returns 404 when no avatar exists', async () => {
    const res = await request(app)
      .get(`/api/avatar/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('avatar_not_found');
  });

  it('returns avatar when it exists', async () => {
    await prisma.avatar.create({
      data: { userId, gender: 'male', skinColor: '#e8b98a', eyeColor: '#4a3728', hairColor: '#2c1810', parts: {} },
    });
    const res = await request(app)
      .get(`/api/avatar/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.gender).toBe('male');
  });
});

describe('POST /api/avatar/save', () => {
  it('creates a new avatar', async () => {
    const res = await request(app)
      .post('/api/avatar/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ gender: 'female', skinColor: '#f2d3b1', parts: { hair: 'some-id' } });
    expect(res.status).toBe(200);
    expect(res.body.gender).toBe('female');
  });

  it('updates existing avatar', async () => {
    await prisma.avatar.create({
      data: { userId, gender: 'male', skinColor: '#e8b98a', eyeColor: '#4a3728', hairColor: '#2c1810', parts: {} },
    });
    const res = await request(app)
      .post('/api/avatar/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ skinColor: '#d4a67a' });
    expect(res.status).toBe(200);
    expect(res.body.skinColor).toBe('#d4a67a');
  });
});

describe('POST /api/avatar/thumbnail', () => {
  it('saves thumbnail data URL', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const res = await request(app)
      .post('/api/avatar/thumbnail')
      .set('Authorization', `Bearer ${token}`)
      .send({ thumbnailDataUrl: dataUrl });
    expect(res.status).toBe(200);
    expect(res.body.thumbnailUrl).toBe(dataUrl);
  });

  it('rejects without data', async () => {
    const res = await request(app)
      .post('/api/avatar/thumbnail')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
  });
});

describe('POST /api/avatar/generate', () => {
  it('returns 422 when no photo provided', async () => {
    const res = await request(app)
      .post('/api/avatar/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('no_photo');
  });

  it('returns 503 when photo provided (KI not yet implemented)', async () => {
    const res = await request(app)
      .post('/api/avatar/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ photo: 'base64data' });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ai_service_unavailable');
    expect(res.body.retry_after).toBe(30);
  });
});

describe('POST /api/avatar/interpret', () => {
  it('returns 422 when no text provided', async () => {
    const res = await request(app)
      .post('/api/avatar/interpret')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('missing_text');
  });

  it('returns 503 when text provided (KI not yet implemented)', async () => {
    const res = await request(app)
      .post('/api/avatar/interpret')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'großer Mann mit Bart' });
    expect(res.status).toBe(503);
  });
});
