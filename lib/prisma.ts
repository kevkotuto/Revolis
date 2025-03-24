import { PrismaClient } from '@prisma/client';

// PrismaClient est attaché à l'objet global en développement pour éviter
// de créer trop de connexions en mode hot-reload
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
} 