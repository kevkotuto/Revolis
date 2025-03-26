// types/next-auth.d.ts
import NextAuth, { DefaultSession } from 'next-auth';
import { Role } from '@prisma/client';

declare module 'next-auth' {
  /**
   * Extension du type User par défaut
   */
  interface User {
    role: Role;
    companyId?: string | null;
  }

  /**
   * Extension du type Session par défaut
   */
  interface Session {
    user: {
      id: string;
      role: Role;
      companyId?: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  /** Extension du type JWT par défaut */
  interface JWT {
    id: string;
    role: Role;
    companyId?: string | null;
  }
}