'use client';

import React from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Navbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  // Fonction pour naviguer directement vers les pages d'authentification
  const handleAuthNavigation = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(path);
  };

  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold">
          Revolis
        </Link>

        <div className="hidden md:flex space-x-4">
          <Link href="/" className="hover:text-gray-300">
            Accueil
          </Link>
          {session ? (
            <>
              <Link href="/pro" className="hover:text-gray-300">
                Espace Pro
              </Link>
              <Link href="/perso" className="hover:text-gray-300">
                Espace Personnel
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="hover:text-gray-300"
              >
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleAuthNavigation('/auth/signin')}
                className="hover:text-gray-300"
              >
                Connexion
              </button>
              <button
                onClick={handleAuthNavigation('/auth/signup')}
                className="hover:text-gray-300"
              >
                Inscription
              </button>
            </>
          )}
        </div>

        <div className="md:hidden">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="focus:outline-none"
            aria-label="Menu de navigation"
            title="Menu de navigation"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {menuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      {menuOpen && (
        <div className="md:hidden pt-4 pb-2 px-2">
          <Link
            href="/"
            className="block py-2 px-4 text-sm hover:bg-gray-700 rounded"
            onClick={() => setMenuOpen(false)}
          >
            Accueil
          </Link>
          {session ? (
            <>
              <Link
                href="/pro"
                className="block py-2 px-4 text-sm hover:bg-gray-700 rounded"
                onClick={() => setMenuOpen(false)}
              >
                Espace Pro
              </Link>
              <Link
                href="/perso"
                className="block py-2 px-4 text-sm hover:bg-gray-700 rounded"
                onClick={() => setMenuOpen(false)}
              >
                Espace Personnel
              </Link>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  signOut({ callbackUrl: '/' });
                }}
                className="block w-full text-left py-2 px-4 text-sm hover:bg-gray-700 rounded"
              >
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => {
                  setMenuOpen(false);
                  handleAuthNavigation('/auth/signin')(e);
                }}
                className="block w-full text-left py-2 px-4 text-sm hover:bg-gray-700 rounded"
              >
                Connexion
              </button>
              <button
                onClick={(e) => {
                  setMenuOpen(false);
                  handleAuthNavigation('/auth/signup')(e);
                }}
                className="block w-full text-left py-2 px-4 text-sm hover:bg-gray-700 rounded"
              >
                Inscription
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  );
} 