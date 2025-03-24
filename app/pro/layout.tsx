'use client';

import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, Bell, UserCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from 'next/link';

export default function ProLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(status === 'loading');

  // Mise à jour de l'état de chargement quand le statut change
  if (status !== 'loading' && isLoading) {
    setIsLoading(false);
  }

  // Afficher un indicateur de chargement pendant la vérification de la session
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          <p className="text-xl">Chargement...</p>
        </div>
      </div>
    );
  }

  // Le middleware gère déjà la redirection si non authentifié
  return (
    <SidebarProvider defaultOpen>
    <AppSidebar />
      <div className="w-full bg-background">
        <div className="flex-1 overflow-auto">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
                <SidebarInset>
                    <main className="w-full py-6 px-4 md:px-6">
                    {children}
                    </main>
                </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
