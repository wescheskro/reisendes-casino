import request from 'supertest';
import { createApp } from '../src/app';
import { makeToken, prisma, TEST_JWT_SECRET, connectDb, disconnectDb } from './setup';

process.env.JWT_SECRET = TEST_JWT_SECRET;
const app = createApp();
const token = makeToken('parts-test-user');

beforeAll(async () => {
  await connectDb();
  await prisma.avatarPart.deleteMany();
  await prisma.avatarPart.createMany({
    data: [
      { category: 'hair', name: 'Short', glbUrl: 'hair/short.glb', attachmentPoint: 'bone_head_top', metadata: {} },
      { category: 'hair', name: 'Long', glbUrl: 'hair/long.glb', attachmentPoint: 'bone_head_top', metadata: {} },
      { category: 'top', name: 'T-Shirt', glbUrl: 'top/tshirt.glb', attachmentPoint: 'bone_torso', metadata: {} },
    ],
  });
});

afterAll(() => disconnectDb());

describe('GET /api/avatar/parts', () => {
  it('returns all parts', async () => {
    const res = await request(app)
      .get('/api/avatar/parts')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });

  it('filters by category', async () => {
    const res = await request(app)
      .get('/api/avatar/parts?category=hair')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body.every((p: any) => p.category === 'hair')).toBe(true);
  });
});

describe('GET /api/avatar/parts/:id/glb', () => {
  it('returns 404 for unknown part', async () => {
    const res = await request(app)
      .get('/api/avatar/parts/00000000-0000-0000-0000-000000000000/glb')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('part_not_found');
  });
});
