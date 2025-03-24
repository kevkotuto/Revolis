'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function PersoHome() {
  const { data: session } = useSession();

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h1 className="text-3xl font-bold text-gray-800">
          Espace personnel
        </h1>
        <p className="mt-2 text-gray-600">
          Bienvenue, {session?.user?.name || 'Utilisateur'} ! Gérez vos projets et tâches personnels.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link 
          href="/perso/projets"
          className="rounded-lg bg-white p-6 shadow-md transition-all hover:shadow-lg"
        >
          <h2 className="text-xl font-semibold text-gray-800">Mes projets</h2>
          <p className="mt-2 text-gray-600">Accédez à vos projets personnels.</p>
        </Link>

        <Link
          href="/perso/taches"
          className="rounded-lg bg-white p-6 shadow-md transition-all hover:shadow-lg"
        >
          <h2 className="text-xl font-semibold text-gray-800">Mes tâches</h2>
          <p className="mt-2 text-gray-600">Gérez vos tâches personnelles.</p>
        </Link>
      </div>
    </div>
  );
} 