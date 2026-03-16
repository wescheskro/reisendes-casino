import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

export const prisma = new PrismaClient();
export const TEST_JWT_SECRET = 'test-secret';

export function makeToken(userId: string, username: string = 'testuser'): string {
  return jwt.sign({ userId, username }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

export async function connectDb() { await prisma.$connect(); }
export async function disconnectDb() { await prisma.$disconnect(); }
