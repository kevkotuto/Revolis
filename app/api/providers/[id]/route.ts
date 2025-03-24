import { NextRequest, NextResponse } from 'next/server';
import {prisma} from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

interface RouteParams {
  params: {
    id: string;
  };
}

// Fonction de vérification des paramètres d'un prestataire
async function getProviderById(id: string) {
  return await prisma.prestataire.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          payments: true,
        },
      },
    },
  });
}

// GET - Récupérer un prestataire par ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const provider = await getProviderById(params.id);
    if (!provider) {
      return NextResponse.json(
        { error: 'Prestataire non trouvé' },
        { status: 404 }
      );
    }

    return NextResponse.json(provider);
  } catch (error) {
    console.error('Erreur lors de la récupération du prestataire:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un prestataire
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const data = await request.json();

    // Validation des données
    if (!data.name || data.name.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom du prestataire est requis' },
        { status: 400 }
      );
    }

    // Vérifier si le prestataire existe
    const provider = await getProviderById(params.id);
    if (!provider) {
      return NextResponse.json(
        { error: 'Prestataire non trouvé' },
        { status: 404 }
      );
    }

    // Mise à jour du prestataire
    const updatedProvider = await prisma.prestataire.update({
      where: { id: params.id },
      data: {
        name: data.name.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        role: data.description?.trim() || null, // Utiliser description pour rôle
      },
      include: {
        _count: {
          select: {
            payments: true,
          },
        },
      },
    });

    return NextResponse.json(updatedProvider);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du prestataire:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un prestataire
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Vérifier si le prestataire existe
    const provider = await getProviderById(params.id);
    if (!provider) {
      return NextResponse.json(
        { error: 'Prestataire non trouvé' },
        { status: 404 }
      );
    }

    // Vérifier si le prestataire a des paiements associés
    if (provider._count.payments > 0) {
      return NextResponse.json(
        { 
          error: 'Impossible de supprimer le prestataire', 
          hasPayments: true 
        },
        { status: 400 }
      );
    }

    // Supprimer le prestataire
    await prisma.prestataire.delete({
      where: { id: params.id },
    });

    return NextResponse.json(
      { message: 'Prestataire supprimé avec succès' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression du prestataire:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 