import { PrismaClient } from '@prisma/client';

// PrismaClient est attaché au scope global en développement pour éviter 
// des connexions exhaustives à la base de données pendant les hot reloads
declare global {
  var cachedPrisma: PrismaClient;
}

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.cachedPrisma) {
    global.cachedPrisma = new PrismaClient();
  }
  prisma = global.cachedPrisma;
}

export const db = prisma; 