import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {prisma} from '@/lib/prisma';

interface ExchangeRateRecord {
  id: string;
  sourceCurrency: string;
  targetCurrency: string;
  rate: string;
  date: Date;
}

// GET /api/exchange-rates
export async function GET(request: NextRequest) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Récupérer les taux de change les plus récents pour chaque paire de devises
    const latestRates = await prisma.$queryRaw`
      SELECT DISTINCT ON ("sourceCurrency", "targetCurrency") 
        "id", "sourceCurrency", "targetCurrency", "rate", "date"
      FROM "ExchangeRate"
      ORDER BY "sourceCurrency", "targetCurrency", "date" DESC
    `;

    // Formater les données pour l'interface
    const formattedRates: Record<string, Record<string, { rate: number; date: Date }>> = {};
    for (const rate of latestRates as ExchangeRateRecord[]) {
      if (!formattedRates[rate.sourceCurrency]) {
        formattedRates[rate.sourceCurrency] = {};
      }
      formattedRates[rate.sourceCurrency][rate.targetCurrency] = {
        rate: parseFloat(rate.rate),
        date: rate.date,
      };
    }

    return NextResponse.json(formattedRates);
  } catch (error) {
    console.error('Erreur lors de la récupération des taux de change:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// PUT /api/exchange-rates - Pour mettre à jour les taux de change
export async function PUT(request: NextRequest) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Vérification que l'utilisateur est administrateur
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Seuls les administrateurs peuvent modifier les taux de change' },
        { status: 403 }
      );
    }

    const data = await request.json();
    
    // Validation des données
    if (!data.rates || !Array.isArray(data.rates) || data.rates.length === 0) {
      return NextResponse.json(
        { error: 'Données de taux de change invalides' },
        { status: 400 }
      );
    }

    // Date d'application des taux
    const applicationDate = data.date ? new Date(data.date) : new Date();

    // Créer les nouveaux taux de change
    const operations = [];
    
    for (const rate of data.rates) {
      if (!rate.sourceCurrency || !rate.targetCurrency || !rate.rate) {
        continue; // Ignorer les entrées invalides
      }
      
      operations.push(
        prisma.exchangeRate.create({
          data: {
            sourceCurrency: rate.sourceCurrency,
            targetCurrency: rate.targetCurrency,
            rate: rate.rate,
            date: applicationDate,
          },
        })
      );
    }

    // Exécuter toutes les opérations
    await prisma.$transaction(operations);

    return NextResponse.json({
      message: 'Taux de change mis à jour avec succès',
      date: applicationDate,
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour des taux de change:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 