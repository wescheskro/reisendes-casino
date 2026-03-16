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
