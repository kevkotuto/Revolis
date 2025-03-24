import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { NextRequestWithAuth, withAuth } from 'next-auth/middleware';

// Fonction qui vérifie si l'URL est une API
const isApiRoute = (pathname: string) => {
  return pathname.startsWith('/api');
};

// Middleware d'authentification amélioré
export default withAuth(
  async function middleware(req: NextRequestWithAuth) {
    const token = await getToken({ req });
    const isAuth = !!token;
    const { pathname } = req.nextUrl;

    // Ne pas interférer avec les routes API
    if (isApiRoute(pathname)) {
      return NextResponse.next();
    }

    const isProtectedRoute = (
      pathname.startsWith('/pro') || 
      pathname.startsWith('/perso')
    );
    
    const isAuthRoute = pathname.startsWith('/auth');

    // Rediriger vers la page de connexion si l'utilisateur n'est pas connecté et tente d'accéder à une route protégée
    if (!isAuth && isProtectedRoute) {
      // Créer une URL pour la redirection avec un paramètre callbackUrl
      const signInUrl = new URL('/auth/signin', req.url);
      // Le callbackUrl est plus fiable que sessionStorage pour les navigations directes
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }

    // Si l'utilisateur est déjà connecté et tente d'accéder à la page de connexion ou d'inscription
    if (isAuth && isAuthRoute) {
      // Si une URL de retour est spécifiée, rediriger vers cette URL
      const callbackUrl = req.nextUrl.searchParams.get('callbackUrl');
      if (callbackUrl && callbackUrl !== '/auth/signin' && callbackUrl !== '/auth/signup') {
        return NextResponse.redirect(new URL(callbackUrl, req.url));
      }
      // Sinon, rediriger vers la page d'accueil
      return NextResponse.redirect(new URL('/', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => true, // Ne pas bloquer l'accès ici, laisser la logique du middleware s'en charger
    },
  }
);

// Configuration pour appliquer le middleware seulement aux routes spécifiées
export const config = {
  matcher: [
    '/pro/:path*', 
    '/perso/:path*', 
    '/auth/:path*'
  ],
}; 