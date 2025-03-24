import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {prisma} from '@/lib/prisma';

// Les taux de conversion par défaut (1 unité = X FCFA)
const DEFAULT_RATES: Record<string, number> = {
  FCFA: 1,
  EUR: 655.957,
  USD: 603.50,
  GBP: 767.55,
};

// Récupérer les taux de change par défaut (pas besoin de base de données)
export async function GET(request: NextRequest) {
  try {
    // Vérification de l'authentification (optionnelle pour cette ressource)
    const session = await getServerSession(authOptions);
    
    // Formater les taux pour un usage simplifié dans l'interface
    const formattedRates: Record<string, number> = {};
    Object.keys(DEFAULT_RATES).forEach(currency => {
      formattedRates[currency] = DEFAULT_RATES[currency];
    });

    return NextResponse.json({
      rates: formattedRates,
      date: new Date(),
      message: "Taux de change par défaut"
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des taux de change par défaut:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 