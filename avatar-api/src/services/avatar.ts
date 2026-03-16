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
