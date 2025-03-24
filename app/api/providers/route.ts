import { NextRequest, NextResponse } from 'next/server';
import {prisma} from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

// GET - Récupérer tous les prestataires
export async function GET() {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }

    // Récupérer tous les prestataires avec count des paiements
    const providers = await prisma.prestataire.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
          select: {
            payments: true,
          },
        },
      },
    });

    return NextResponse.json(providers);
  } catch (error) {
    console.error('Erreur lors de la récupération des prestataires:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau prestataire
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }

    // Récupérer les données du corps de la requête
    const data = await request.json();
    
    // Validation de base
    if (!data.name || data.name.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom du prestataire est requis' },
        { status: 400 }
      );
    }

    // Créer le prestataire
    const provider = await prisma.prestataire.create({
      data: {
        name: data.name.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        role: data.description?.trim() || null,
      },
      include: {
        _count: {
          select: {
            payments: true,
          },
        },
      },
    });

    return NextResponse.json(provider, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du prestataire:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 