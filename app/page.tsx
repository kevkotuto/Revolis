'use client';

import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronRight, CheckCircle, Briefcase, User, LogIn, UserPlus } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  const { data: session, status } = useSession();
  const loading = status === 'loading';
  const router = useRouter();

  // Fonction pour naviguer directement sans passer par le middleware
  const handleAuthNavigation = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(path);
  };

  return (
    <div className="flex flex-col">
      {/* Hero section */}
      <section className="py-20 md:py-28 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col items-center text-center space-y-8 animate-fade-in">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
              Gérez vos projets avec facilité et efficacité
            </h1>
          </div>
        </div>
      </section>
      <div className="flex flex-col items-center justify-center p-6">
        <div className="max-w-4xl w-full mx-auto text-center space-y-8">
          <div className="animate-fade-in">
            <h1 className="text-6xl font-bold tracking-tight">
              Bienvenue sur <span className="text-primary">Rêvolis</span>
            </h1>
            <p className="mt-3 text-2xl text-muted-foreground">
              Votre plateforme de gestion de projets
            </p>
          </div>

          <Separator className="my-8" />

          {loading ? (
            <div className="flex justify-center animate-fade-in">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            </div>
          ) : session ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
              <div className="animate-fade-in">
                <Card className="h-full hover:shadow-lg transition-all">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      Espace Pro
                    </CardTitle>
                    <CardDescription>
                      Accédez à votre environnement professionnel
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-6">
                      Gérez vos projets professionnels et clients.
                    </p>
                    <Button asChild className="w-full">
                      <Link href="/pro">Accéder &rarr;</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="animate-fade-in">
                <Card className="h-full hover:shadow-lg transition-all">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Espace Personnel
                    </CardTitle>
                    <CardDescription>
                      Accédez à votre environnement personnel
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-6">
                      Accédez à vos projets personnels.
                    </p>
                    <Button asChild className="w-full">
                      <Link href="/perso">Accéder &rarr;</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              <div className="text-xl text-muted-foreground">
                Connectez-vous pour accéder à vos espaces.
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-4 animate-fade-in">
                <Button 
                  onClick={handleAuthNavigation('/auth/signin')}
                  className="flex items-center gap-2"
                >
                  <LogIn className="h-4 w-4" />
                  Se connecter
                </Button>
                <Button 
                  onClick={handleAuthNavigation('/auth/signup')}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  S'inscrire
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
