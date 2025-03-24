'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function ProHome() {
  const { data: session } = useSession();

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h1 className="text-3xl font-bold text-gray-800">
          Tableau de bord professionnel
        </h1>
        <p className="mt-2 text-gray-600">
          Bienvenue, {session?.user?.name || 'Utilisateur'} ! Gérez vos projets et clients professionnels.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link 
          href="/pro/clients"
          className="rounded-lg bg-white p-6 shadow-md transition-all hover:shadow-lg"
        >
          <h2 className="text-xl font-semibold text-gray-800">Clients</h2>
          <p className="mt-2 text-gray-600">Gérez vos clients et leurs informations.</p>
        </Link>

        <Link
          href="/pro/projets"
          className="rounded-lg bg-white p-6 shadow-md transition-all hover:shadow-lg"
        >
          <h2 className="text-xl font-semibold text-gray-800">Projets</h2>
          <p className="mt-2 text-gray-600">Suivez l'avancement de vos projets professionnels.</p>
        </Link>

        <Link
          href="/pro/finance"
          className="rounded-lg bg-white p-6 shadow-md transition-all hover:shadow-lg"
        >
          <h2 className="text-xl font-semibold text-gray-800">Finance</h2>
          <p className="mt-2 text-gray-600">Suivez vos revenus et dépenses.</p>
        </Link>

        <Link
          href="/pro/prestataires"
          className="rounded-lg bg-white p-6 shadow-md transition-all hover:shadow-lg"
        >
          <h2 className="text-xl font-semibold text-gray-800">Prestataires</h2>
          <p className="mt-2 text-gray-600">Gérez vos prestataires et collaborateurs externes.</p>
        </Link>

        <Link
          href="/pro/agents"
          className="rounded-lg bg-white p-6 shadow-md transition-all hover:shadow-lg"
        >
          <h2 className="text-xl font-semibold text-gray-800">Agents IA</h2>
          <p className="mt-2 text-gray-600">Configurez vos assistants IA pour vos projets.</p>
        </Link>

        <Link
          href="/pro/abonnements"
          className="rounded-lg bg-white p-6 shadow-md transition-all hover:shadow-lg"
        >
          <h2 className="text-xl font-semibold text-gray-800">Abonnements</h2>
          <p className="mt-2 text-gray-600">Gérez vos abonnements et services.</p>
        </Link>
      </div>
    </div>
  );
}
