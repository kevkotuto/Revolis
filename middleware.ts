import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';

// Tableau de routes protégées par rôle
const protectedRoutes = {
  dashboard: ['USER', 'ADMIN', 'SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'EMPLOYEE'],
  admin: ['ADMIN', 'SUPER_ADMIN'],
  superadmin: ['SUPER_ADMIN'],
  companyAdmin: ['SUPER_ADMIN', 'COMPANY_ADMIN'],
};

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  
  // Routes publiques - pas besoin d'authentification
  if (
    path === '/' || 
    path === '/auth/signin' || 
    path === '/auth/signup' || 
    path.startsWith('/api/auth/')
  ) {
    return NextResponse.next();
  }

  // Vérifier le token d'authentification
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isAuthenticated = !!token;

  // Rediriger vers la connexion si non authentifié
  if (!isAuthenticated) {
    const url = new URL('/auth/signin', req.url);
    url.searchParams.set('callbackUrl', encodeURI(req.url));
    return NextResponse.redirect(url);
  }

  // Vérifier les permissions basées sur les rôles
  const userRole = token.role as Role;

  // Vérifier les permissions pour les routes protégées
  if (path.startsWith('/dashboard') && !protectedRoutes.dashboard.includes(userRole)) {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  if (path.startsWith('/admin') && !protectedRoutes.admin.includes(userRole)) {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  if (path.startsWith('/superadmin') && !protectedRoutes.superadmin.includes(userRole)) {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  if (path.startsWith('/company-admin') && !protectedRoutes.companyAdmin.includes(userRole)) {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  // Ajouter l'ID utilisateur et le rôle aux en-têtes pour les API
  if (path.startsWith('/api/') && path !== '/api/auth') {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-id', token.id as string);
    requestHeaders.set('x-user-role', userRole);
    
    if (token.companyId) {
      requestHeaders.set('x-company-id', token.companyId as string);
    }
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Matcher pour routes qui nécessitent une authentification
    '/dashboard/:path*',
    '/admin/:path*',
    '/superadmin/:path*',
    '/company-admin/:path*',
    '/api/:path*',
    // Routes publiques (pour skipper)
    '/',
    '/auth/signin',
    '/auth/signup',
  ],
}; 