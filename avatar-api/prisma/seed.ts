import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PARTS = [
  { category: 'head', name: 'Standard Male', glbUrl: 'heads/male_01.glb', attachmentPoint: 'bone_neck' },
  { category: 'head', name: 'Standard Female', glbUrl: 'heads/female_01.glb', attachmentPoint: 'bone_neck' },
  { category: 'hair', name: 'Short', glbUrl: 'hair/short.glb', attachmentPoint: 'bone_head_top' },
  { category: 'hair', name: 'Long', glbUrl: 'hair/long.glb', attachmentPoint: 'bone_head_top' },
  { category: 'hair', name: 'Curly', glbUrl: 'hair/curly.glb', attachmentPoint: 'bone_head_top' },
  { category: 'hair', name: 'Slick', glbUrl: 'hair/slick.glb', attachmentPoint: 'bone_head_top' },
  { category: 'top', name: 'T-Shirt', glbUrl: 'tops/tshirt.glb', attachmentPoint: 'bone_torso' },
  { category: 'top', name: 'Hemd', glbUrl: 'tops/hemd.glb', attachmentPoint: 'bone_torso' },
  { category: 'top', name: 'Jacke', glbUrl: 'tops/jacke.glb', attachmentPoint: 'bone_torso' },
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
