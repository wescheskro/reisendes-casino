# Avatar API Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Avatar API backend — REST endpoints, PostgreSQL database, S3 file storage, and JWT auth — so the Avatar Studio Frontend and Casino can load/save avatars and parts.

**Architecture:** Express.js API server in `avatar-api/` directory (separate from existing casino `backend/`). Prisma ORM for PostgreSQL. MinIO (S3-compatible) for GLB/texture files. Shared JWT secret with casino for cross-subdomain auth.

**Tech Stack:** Node.js 20+, Express, Prisma, MinIO SDK, jsonwebtoken, multer, Jest, Supertest, Docker Compose

**Spec:** `docs/superpowers/specs/2026-03-16-4k-avatar-studio-design.md`

---

## File Structure

```
avatar-api/
├── package.json
├── tsconfig.json
├── .env.example
├── docker-compose.yml          # PostgreSQL + MinIO for local dev
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Seed data (default parts)
├── src/
│   ├── index.ts                # Server entry point
│   ├── app.ts                  # Express app setup (CORS, middleware)
│   ├── config.ts               # Environment config
│   ├── middleware/
│   │   └── auth.ts             # JWT verification middleware
│   ├── routes/
│   │   ├── avatar.ts           # GET /:userId, POST /save, POST /thumbnail
│   │   └── parts.ts            # GET /, GET /:id/glb
│   ├── services/
│   │   ├── avatar.ts           # Avatar CRUD logic
│   │   ├── parts.ts            # Parts catalog logic
│   │   └── storage.ts          # S3/MinIO upload/download
│   └── types.ts                # Shared TypeScript types
└── tests/
    ├── setup.ts                # Test DB + MinIO setup/teardown
    ├── auth.test.ts            # JWT middleware tests
    ├── avatar.test.ts          # Avatar endpoint tests
    ├── parts.test.ts           # Parts endpoint tests
    └── storage.test.ts         # S3 storage tests
```

---

## Chunk 1: Project Setup + Database

### Task 1: Initialize project and Docker Compose

**Files:**
- Create: `avatar-api/package.json`
- Create: `avatar-api/tsconfig.json`
- Create: `avatar-api/.env.example`
- Create: `avatar-api/docker-compose.yml`

- [ ] **Step 1: Create project directory and package.json**

```bash
mkdir -p avatar-api && cd avatar-api
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
cd avatar-api
npm install express cors helmet jsonwebtoken multer cookie-parser @prisma/client @aws-sdk/client-s3 @aws-sdk/lib-storage uuid dotenv
npm install -D typescript @types/express @types/cors @types/jsonwebtoken @types/multer @types/cookie-parser @types/uuid ts-node nodemon prisma jest ts-jest @types/jest supertest @types/supertest
npx tsc --init
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Write .env.example**

```env
PORT=4000
DATABASE_URL=postgresql://avatar:avatar@localhost:5432/avatar_db
JWT_SECRET=shared-secret-with-casino
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=avatar-assets
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

- [ ] **Step 5: Write docker-compose.yml**

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: avatar
      POSTGRES_PASSWORD: avatar
      POSTGRES_DB: avatar_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 6: Update package.json with scripts and Jest config**

Open `avatar-api/package.json` and replace the `"scripts"` section. Also add a `"jest"` and `"prisma"` section at top level:

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest --forceExit --detectOpenHandles",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "ts-node prisma/seed.ts"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.ts"]
  },
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

- [ ] **Step 7: Start Docker services and verify**

```bash
cd avatar-api && docker-compose up -d
```

Expected: PostgreSQL on :5432, MinIO on :9000/:9001

- [ ] **Step 8: Commit**

```bash
git add avatar-api/
git commit -m "feat(avatar-api): project setup with Docker Compose (PostgreSQL + MinIO)"
```

---

### Task 2: Prisma Schema + Migration

**Files:**
- Create: `avatar-api/prisma/schema.prisma`

- [ ] **Step 1: Write Prisma schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Avatar {
  id              String   @id @default(uuid())
  userId          String   @unique @map("user_id")
  gender          String   @default("male")
  skinColor       String   @default("#e8b98a") @map("skin_color")
  eyeColor        String   @default("#4a3728") @map("eye_color")
  hairColor       String   @default("#2c1810") @map("hair_color")
  parts           Json     @default("{}")
  customFaceMeshUrl String? @map("custom_face_mesh_url")
  thumbnailUrl    String?  @map("thumbnail_url")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("avatars")
}

model AvatarPart {
  id              String   @id @default(uuid())
  category        String
  name            String
  glbUrl          String   @map("glb_url")
  thumbnailUrl    String?  @map("thumbnail_url")
  attachmentPoint String   @map("attachment_point")
  isPremium       Boolean  @default(false) @map("is_premium")
  metadata        Json     @default("{}")
  createdAt       DateTime @default(now()) @map("created_at")

  @@map("avatar_parts")
  @@index([category])
  @@unique([category, name])
}
```

- [ ] **Step 2: Copy .env.example to .env**

```bash
cd avatar-api && cp .env.example .env
```

- [ ] **Step 3: Run migration**

```bash
cd avatar-api && npx prisma migrate dev --name init
```

Expected: Migration created, Prisma Client generated

- [ ] **Step 4: Verify with Prisma Studio**

```bash
cd avatar-api && npx prisma studio
```

Expected: Browser opens showing `avatars` and `avatar_parts` tables

- [ ] **Step 5: Commit**

```bash
git add avatar-api/prisma/
git commit -m "feat(avatar-api): Prisma schema with avatars + avatar_parts tables"
```

---

### Task 3: Config + Types + App Setup

**Files:**
- Create: `avatar-api/src/config.ts`
- Create: `avatar-api/src/types.ts`
- Create: `avatar-api/src/app.ts`
- Create: `avatar-api/src/index.ts`

- [ ] **Step 1: Write config.ts**

```typescript
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  s3: {
    endpoint: process.env.S3_ENDPOINT!,
    accessKey: process.env.S3_ACCESS_KEY!,
    secretKey: process.env.S3_SECRET_KEY!,
    bucket: process.env.S3_BUCKET || 'avatar-assets',
  },
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
};
```

- [ ] **Step 2: Write types.ts**

```typescript
export interface AvatarConfig {
  gender: string;
  skinColor: string;
  eyeColor: string;
  hairColor: string;
  parts: Record<string, string>; // { hair: 'part-uuid', top: 'part-uuid', ... }
}

export interface SaveAvatarRequest {
  gender?: string;
  skinColor?: string;
  eyeColor?: string;
  hairColor?: string;
  parts?: Record<string, string>;
  thumbnailDataUrl?: string;
}

export interface JwtPayload {
  userId: string;
  username: string;
}

export interface ApiError {
  error: string;
  hint?: string;
  min?: string;
  max?: string;
  retry_after?: number;
  position?: number;
  estimated_wait?: number;
}
```

- [ ] **Step 3: Write app.ts**

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { avatarRouter } from './routes/avatar';
import { partsRouter } from './routes/parts';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/avatar', avatarRouter);
  app.use('/api/avatar/parts', partsRouter);

  return app;
}
```

- [ ] **Step 4: Write index.ts**

```typescript
import { createApp } from './app';
import { config } from './config';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Avatar API running on port ${config.port}`);
});
```

- [ ] **Step 5: Create placeholder route files** (so app.ts compiles)

`avatar-api/src/routes/avatar.ts`:
```typescript
import { Router } from 'express';
export const avatarRouter = Router();
```

`avatar-api/src/routes/parts.ts`:
```typescript
import { Router } from 'express';
export const partsRouter = Router();
```

- [ ] **Step 6: Verify server starts**

```bash
cd avatar-api && npx ts-node src/index.ts
```

Expected: "Avatar API running on port 4000"

```bash
curl http://localhost:4000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 7: Commit**

```bash
git add avatar-api/src/
git commit -m "feat(avatar-api): Express app with config, types, health endpoint"
```

---

## Chunk 2: Auth Middleware + Storage Service

### Task 4: JWT Auth Middleware

**Files:**
- Create: `avatar-api/src/middleware/auth.ts`
- Create: `avatar-api/tests/setup.ts`
- Create: `avatar-api/tests/auth.test.ts`

- [ ] **Step 1: Write test setup**

`avatar-api/tests/setup.ts`:
```typescript
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

export const prisma = new PrismaClient();
export const TEST_JWT_SECRET = 'test-secret';

export function makeToken(userId: string, username: string = 'testuser'): string {
  return jwt.sign({ userId, username }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

// Each test file should call these in its own beforeAll/afterAll:
export async function connectDb() { await prisma.$connect(); }
export async function disconnectDb() { await prisma.$disconnect(); }
```

> **Note:** Each test file imports `connectDb`/`disconnectDb` and calls them in its own `beforeAll`/`afterAll`. This avoids Jest config issues with setup file timing.
```

- [ ] **Step 2: Write auth tests**

`avatar-api/tests/auth.test.ts`:
```typescript
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
    // Should not be 401 (might be 404 since avatar doesn't exist yet)
    expect(res.status).not.toBe(401);
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd avatar-api && npm test -- tests/auth.test.ts
```

Expected: FAIL — `rejects requests without token` should fail because routes don't have auth middleware yet (all requests return 404, not 401)

- [ ] **Step 4: Write auth middleware**

`avatar-api/src/middleware/auth.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
```

- [ ] **Step 5: Apply middleware to avatar routes**

Update `avatar-api/src/routes/avatar.ts`:
```typescript
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

export const avatarRouter = Router();
avatarRouter.use(authMiddleware);

avatarRouter.get('/:userId', (req, res) => {
  res.status(404).json({ error: 'avatar_not_found' });
});
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd avatar-api && npm test
```

Expected: 3 tests PASS

- [ ] **Step 7: Commit**

```bash
git add avatar-api/src/middleware/ avatar-api/tests/
git commit -m "feat(avatar-api): JWT auth middleware with tests"
```

---

### Task 5: S3 Storage Service

**Files:**
- Create: `avatar-api/src/services/storage.ts`
- Create: `avatar-api/tests/storage.test.ts`

- [ ] **Step 1: Write storage tests**

```typescript
import { storageService } from '../src/services/storage';

describe('Storage Service', () => {
  const testKey = `test/${Date.now()}.txt`;
  const testContent = Buffer.from('hello world');

  it('uploads a file', async () => {
    const url = await storageService.upload(testKey, testContent, 'text/plain');
    expect(url).toContain(testKey);
  });

  it('downloads the file', async () => {
    const data = await storageService.download(testKey);
    expect(data.toString()).toBe('hello world');
  });

  it('deletes the file', async () => {
    await storageService.delete(testKey);
    await expect(storageService.download(testKey)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd avatar-api && npm test -- tests/storage.test.ts
```

Expected: FAIL — `Cannot find module '../src/services/storage'`

- [ ] **Step 3: Write storage service**

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';

const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: 'us-east-1',
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: true,
});

export const storageService = {
  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await s3.send(new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
    return `${config.s3.endpoint}/${config.s3.bucket}/${key}`;
  },

  async download(key: string): Promise<Buffer> {
    const res = await s3.send(new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
    }));
    const stream = res.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  },

  async delete(key: string): Promise<void> {
    await s3.send(new DeleteObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
    }));
  },
};
```

- [ ] **Step 4: Create MinIO bucket before tests**

```bash
# Install MinIO client
npm install -g mc 2>/dev/null || true
# Or via Docker:
docker exec -it $(docker ps -q -f ancestor=minio/minio) mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec -it $(docker ps -q -f ancestor=minio/minio) mc mb local/avatar-assets 2>/dev/null || true
```

Alternatively, add bucket creation to `tests/setup.ts`:
```typescript
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
  forcePathStyle: true,
});

beforeAll(async () => {
  try { await s3.send(new CreateBucketCommand({ Bucket: 'avatar-assets' })); } catch {}
  await prisma.$connect();
});
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd avatar-api && npm test -- tests/storage.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add avatar-api/src/services/storage.ts avatar-api/tests/storage.test.ts
git commit -m "feat(avatar-api): S3 storage service with upload/download/delete"
```

---

## Chunk 3: Avatar CRUD Endpoints

### Task 6: Avatar Service + Routes

**Files:**
- Create: `avatar-api/src/services/avatar.ts`
- Modify: `avatar-api/src/routes/avatar.ts`
- Create: `avatar-api/tests/avatar.test.ts`

- [ ] **Step 1: Write avatar endpoint tests**

```typescript
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd avatar-api && npm test -- tests/avatar.test.ts
```

Expected: FAIL — `creates a new avatar` and `updates existing avatar` fail because POST /save returns 404 (no handler)

- [ ] **Step 3: Write avatar service**

```typescript
import { PrismaClient } from '@prisma/client';
import { SaveAvatarRequest } from '../types';

const prisma = new PrismaClient();

export const avatarService = {
  async getByUserId(userId: string) {
    return prisma.avatar.findUnique({ where: { userId } });
  },

  async save(userId: string, data: SaveAvatarRequest) {
    return prisma.avatar.upsert({
      where: { userId },
      create: {
        userId,
        gender: data.gender || 'male',
        skinColor: data.skinColor || '#e8b98a',
        eyeColor: data.eyeColor || '#4a3728',
        hairColor: data.hairColor || '#2c1810',
        parts: data.parts || {},
        thumbnailUrl: data.thumbnailDataUrl || null,
      },
      update: {
        ...(data.gender && { gender: data.gender }),
        ...(data.skinColor && { skinColor: data.skinColor }),
        ...(data.eyeColor && { eyeColor: data.eyeColor }),
        ...(data.hairColor && { hairColor: data.hairColor }),
        ...(data.parts && { parts: data.parts }),
        ...(data.thumbnailDataUrl && { thumbnailUrl: data.thumbnailDataUrl }),
      },
    });
  },
};
```

- [ ] **Step 4: Write avatar routes**

```typescript
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { avatarService } from '../services/avatar';

export const avatarRouter = Router();
avatarRouter.use(authMiddleware);

avatarRouter.get('/:userId', async (req, res) => {
  try {
    const avatar = await avatarService.getByUserId(req.params.userId);
    if (!avatar) {
      return res.status(404).json({ error: 'avatar_not_found' });
    }
    res.json(avatar);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

avatarRouter.post('/save', async (req, res) => {
  try {
    const avatar = await avatarService.save(req.user!.userId, req.body);
    res.json(avatar);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd avatar-api && npm test -- tests/avatar.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add avatar-api/src/services/avatar.ts avatar-api/src/routes/avatar.ts avatar-api/tests/avatar.test.ts
git commit -m "feat(avatar-api): avatar CRUD endpoints (GET, POST /save)"
```

---

### Task 7: Parts Catalog Endpoints

**Files:**
- Create: `avatar-api/src/services/parts.ts`
- Modify: `avatar-api/src/routes/parts.ts`
- Create: `avatar-api/tests/parts.test.ts`
- Create: `avatar-api/prisma/seed.ts`

- [ ] **Step 1: Write parts tests**

```typescript
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd avatar-api && npm test -- tests/parts.test.ts
```

Expected: FAIL — routes return 404 (no handlers defined yet)

- [ ] **Step 3: Write parts service**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const partsService = {
  async list(category?: string) {
    const where = category ? { category } : {};
    return prisma.avatarPart.findMany({
      where,
      select: { id: true, category: true, name: true, thumbnailUrl: true, attachmentPoint: true, isPremium: true, metadata: true },
      orderBy: { category: 'asc' },
    });
  },

  async getById(id: string) {
    return prisma.avatarPart.findUnique({ where: { id } });
  },
};
```

- [ ] **Step 4: Write parts routes**

```typescript
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { partsService } from '../services/parts';
import { storageService } from '../services/storage';

export const partsRouter = Router();
partsRouter.use(authMiddleware);

partsRouter.get('/', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const parts = await partsService.list(category);
    res.json(parts);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

partsRouter.get('/:id/glb', async (req, res) => {
  try {
    const part = await partsService.getById(req.params.id);
    if (!part) {
      return res.status(404).json({ error: 'part_not_found' });
    }
    const data = await storageService.download(part.glbUrl);
    res.set('Content-Type', 'model/gltf-binary');
    res.send(data);
  } catch (err: any) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'part_not_found' });
    }
    res.status(502).json({ error: 'storage_error' });
  }
});
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd avatar-api && npm test -- tests/parts.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 6: Write seed script**

`avatar-api/prisma/seed.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PARTS = [
  // Heads
  { category: 'head', name: 'Standard Male', glbUrl: 'heads/male_01.glb', attachmentPoint: 'bone_neck' },
  { category: 'head', name: 'Standard Female', glbUrl: 'heads/female_01.glb', attachmentPoint: 'bone_neck' },
  // Hair
  { category: 'hair', name: 'Short', glbUrl: 'hair/short.glb', attachmentPoint: 'bone_head_top' },
  { category: 'hair', name: 'Long', glbUrl: 'hair/long.glb', attachmentPoint: 'bone_head_top' },
  { category: 'hair', name: 'Curly', glbUrl: 'hair/curly.glb', attachmentPoint: 'bone_head_top' },
  { category: 'hair', name: 'Slick', glbUrl: 'hair/slick.glb', attachmentPoint: 'bone_head_top' },
  // Tops
  { category: 'top', name: 'T-Shirt', glbUrl: 'tops/tshirt.glb', attachmentPoint: 'bone_torso' },
  { category: 'top', name: 'Hemd', glbUrl: 'tops/hemd.glb', attachmentPoint: 'bone_torso' },
  { category: 'top', name: 'Jacke', glbUrl: 'tops/jacke.glb', attachmentPoint: 'bone_torso' },
  // Hats
  { category: 'hat', name: 'Tophat', glbUrl: 'hats/tophat.glb', attachmentPoint: 'bone_head_top' },
  { category: 'hat', name: 'Fedora', glbUrl: 'hats/fedora.glb', attachmentPoint: 'bone_head_top' },
  { category: 'hat', name: 'Crown', glbUrl: 'hats/crown.glb', attachmentPoint: 'bone_head_top' },
];

async function main() {
  console.log('Seeding avatar parts...');
  for (const part of PARTS) {
    await prisma.avatarPart.upsert({
      where: { category_name: { category: part.category, name: part.name } },
      create: { ...part, metadata: {} },
      update: { glbUrl: part.glbUrl, attachmentPoint: part.attachmentPoint },
    });
  }
  console.log(`Seeded ${PARTS.length} parts`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

- [ ] **Step 7: Run seed**

```bash
cd avatar-api && npm run db:seed
```

- [ ] **Step 8: Commit**

```bash
git add avatar-api/
git commit -m "feat(avatar-api): parts catalog endpoints + seed data"
```

---

## Chunk 4: Thumbnail + Integration Test

### Task 8: Thumbnail Endpoint

**Files:**
- Modify: `avatar-api/src/routes/avatar.ts`

- [ ] **Step 1: Add thumbnail test to avatar.test.ts**

```typescript
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
```

- [ ] **Step 2: Run test — verify fails**

- [ ] **Step 3: Add thumbnail route**

Add to `avatar-api/src/routes/avatar.ts`:
```typescript
avatarRouter.post('/thumbnail', async (req, res) => {
  if (!req.body.thumbnailDataUrl) {
    return res.status(422).json({ error: 'missing_thumbnail' });
  }
  try {
    const avatar = await avatarService.save(req.user!.userId, {
      thumbnailDataUrl: req.body.thumbnailDataUrl,
    });
    res.json({ thumbnailUrl: avatar.thumbnailUrl });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 4: Run all tests**

```bash
cd avatar-api && npm test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add avatar-api/
git commit -m "feat(avatar-api): thumbnail save endpoint"
```

---

### Task 9: Generate + Interpret Proxy Endpoints (KI-Service Stubs)

**Files:**
- Modify: `avatar-api/src/routes/avatar.ts`

These proxy to the KI-Service. For now: stubs that return mock data. Real KI integration comes in Plan 3.

- [ ] **Step 1: Add generate/interpret stubs to avatar routes**

Add multer import and config at the top of `avatar-api/src/routes/avatar.ts`:
```typescript
import multer from 'multer';

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per spec
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files allowed'));
      return;
    }
    cb(null, true);
  },
});
```

Add error handler for multer file size errors (add after all routes):
```typescript
avatarRouter.use((err: any, _req: any, res: any, next: any) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file_too_large', max: '10MB' });
  }
  if (err.message === 'Only image files allowed') {
    return res.status(422).json({ error: 'invalid_file_type', hint: 'Nur Bilddateien erlaubt' });
  }
  next(err);
});
```

Add the route handlers:
```typescript
avatarRouter.post('/generate', upload.single('photo'), async (req, res) => {
  if (!req.file && !req.body.photo) {
    return res.status(422).json({ error: 'no_photo', hint: 'Bitte lade ein Foto mit einem klar sichtbaren Gesicht hoch' });
  }
  // TODO: Proxy to KI-Service in Plan 3
  // When KI-Service is implemented, it may return:
  // - 422 { error: 'no_face_detected' } — no face in photo
  // - 422 { error: 'multiple_faces' } — more than one face
  // - 422 { error: 'image_too_small', min: '512x512' } — photo too small
  // - 429 { error: 'ai_queue_full', position: N, estimated_wait: N } — queue full
  // For now, return 503 (service unavailable)
  res.status(503).json({ error: 'ai_service_unavailable', retry_after: 30 });
});

avatarRouter.post('/interpret', async (req, res) => {
  if (!req.body.text) {
    return res.status(422).json({ error: 'missing_text' });
  }
  // TODO: Proxy to KI-Service in Plan 3
  res.status(503).json({ error: 'ai_service_unavailable', retry_after: 30 });
});
```

- [ ] **Step 2: Add tests for stubs**

```typescript
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

  it('returns 413 when file exceeds 10MB', async () => {
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
    const res = await request(app)
      .post('/api/avatar/generate')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', largeBuffer, 'large.jpg');
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('file_too_large');
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
```

- [ ] **Step 3: Run all tests — verify pass**

```bash
cd avatar-api && npm test
```

Expected: All tests PASS

- [ ] **Step 4: Final commit for Plan 1**

```bash
git add avatar-api/
git commit -m "feat(avatar-api): KI proxy stubs (generate + interpret) — ready for Plan 3"
```

---

## Summary

After completing this plan, the Avatar API is fully functional with:
- ✅ PostgreSQL database with avatars + parts tables
- ✅ S3/MinIO file storage for GLB files and textures
- ✅ JWT auth middleware (cross-subdomain compatible)
- ✅ Avatar CRUD (get, save, thumbnail)
- ✅ Parts catalog (list, filter, GLB download)
- ✅ KI endpoint stubs (ready for Plan 3)
- ✅ Full test coverage
- ✅ Docker Compose for local development

**Next:** Plan 2 (Avatar Studio Frontend) can now build against this API.
