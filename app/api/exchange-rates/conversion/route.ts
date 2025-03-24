import { NextRequest, NextResponse } from 'next/server';
import {prisma} from '@/lib/prisma';

// Les taux de conversion par défaut (1 unité = X FCFA)
const DEFAULT_RATES = {
  FCFA: 1,
  EUR: 655.957,
  USD: 603.50,
  GBP: 767.55,
};

// GET /api/exchange-rates/conversion?amount=100&from=EUR&to=FCFA
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const amount = searchParams.get('amount');
    const fromCurrency = searchParams.get('from');
    const toCurrency = searchParams.get('to');

    if (!amount || !fromCurrency || !toCurrency) {
      return NextResponse.json(
        { error: 'Les paramètres amount, from et to sont requis' },
        { status: 400 }
      );
    }

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue < 0) {
      return NextResponse.json(
        { error: 'Le montant doit être un nombre positif' },
        { status: 400 }
      );
    }

    // Essayer de récupérer les taux de change les plus récents
    try {
      // Taux pour la devise source
      const sourceRate = await prisma.exchangeRate.findFirst({
        where: {
          sourceCurrency: fromCurrency,
          targetCurrency: 'FCFA',
        },
        orderBy: {
          date: 'desc',
        },
      });

      // Taux pour la devise cible
      const targetRate = await prisma.exchangeRate.findFirst({
        where: {
          sourceCurrency: toCurrency,
          targetCurrency: 'FCFA',
        },
        orderBy: {
          date: 'desc',
        },
      });

      // Si on a les deux taux
      if (sourceRate && targetRate) {
        // Convertir via FCFA comme pivot
        const fcfaValue = amountValue * parseFloat(sourceRate.rate.toString());
        const targetValue = toCurrency === 'FCFA' 
          ? fcfaValue 
          : fcfaValue / parseFloat(targetRate.rate.toString());

        return NextResponse.json({
          from: fromCurrency,
          to: toCurrency,
          amount: amountValue,
          result: targetValue,
          rateUsed: {
            fromRate: parseFloat(sourceRate.rate.toString()),
            toRate: parseFloat(targetRate.rate.toString()),
            date: sourceRate.date,
          },
        });
      }
    } catch (dbError) {
      console.error('Erreur DB lors de la conversion:', dbError);
      // On continue avec les taux par défaut
    }

    // Utiliser les taux par défaut si DB non disponible
    const fromRate = DEFAULT_RATES[fromCurrency as keyof typeof DEFAULT_RATES] || 1;
    const toRate = DEFAULT_RATES[toCurrency as keyof typeof DEFAULT_RATES] || 1;

    // Si l'une des devises n'est pas supportée
    if (fromRate === 1 && fromCurrency !== 'FCFA') {
      return NextResponse.json(
        { error: `Devise source non supportée: ${fromCurrency}` },
        { status: 400 }
      );
    }

    if (toRate === 1 && toCurrency !== 'FCFA') {
      return NextResponse.json(
        { error: `Devise cible non supportée: ${toCurrency}` },
        { status: 400 }
      );
    }

    // Convertir via FCFA comme devise pivot
    const fcfaValue = amountValue * fromRate;
    const targetValue = toCurrency === 'FCFA' ? fcfaValue : fcfaValue / toRate;

    return NextResponse.json({
      from: fromCurrency,
      to: toCurrency,
      amount: amountValue,
      result: targetValue,
      rateUsed: {
        fromRate,
        toRate,
        date: new Date(),
        isDefault: true,
      },
    });
  } catch (error) {
    console.error('Erreur lors de la conversion:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 