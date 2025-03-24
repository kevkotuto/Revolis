import { NextResponse } from 'next/server';
import {prisma} from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

interface RouteParams {
  params: {
    id: string;
  };
}

// GET - Récupérer un client par ID
export async function GET(request: Request, { params }: RouteParams) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { message: 'Non autorisé' },
        { status: 401 }
      );
    }

    const { id } = params;

    // Récupérer le client avec ses projets et paiements
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        projects: true,
        payments: true,
        _count: {
          select: {
            projects: true,
            payments: true,
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json(
        { message: 'Client non trouvé' },
        { status: 404 }
      );
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error('Erreur lors de la récupération du client:', error);
    return NextResponse.json(
      { message: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un client
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { message: 'Non autorisé' },
        { status: 401 }
      );
    }

    const { id } = params;
    const data = await request.json();

    // Validation de base
    if (data.name !== undefined && (!data.name || !data.name.trim())) {
      return NextResponse.json(
        { message: 'Le nom du client est requis' },
        { status: 400 }
      );
    }

    // Vérifier si le client existe
    const existingClient = await prisma.client.findUnique({
      where: { id },
    });

    if (!existingClient) {
      return NextResponse.json(
        { message: 'Client non trouvé' },
        { status: 404 }
      );
    }

    // Mettre à jour le client
    const updatedClient = await prisma.client.update({
      where: { id },
      data: {
        name: data.name?.trim() ?? existingClient.name,
        email: data.email?.trim() ?? existingClient.email,
        phone: data.phone?.trim() ?? existingClient.phone,
      },
      include: {
        _count: {
          select: {
            projects: true,
            payments: true,
          },
        },
      },
    });

    return NextResponse.json(updatedClient);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du client:', error);
    return NextResponse.json(
      { message: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un client
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { message: 'Non autorisé' },
        { status: 401 }
      );
    }

    const { id } = params;

    // Vérifier si le client existe
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            projects: true,
            payments: true,
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json(
        { message: 'Client non trouvé' },
        { status: 404 }
      );
    }

    // Vérifier si le client a des projets ou des paiements associés
    if (client._count.projects > 0 || client._count.payments > 0) {
      return NextResponse.json(
        { 
          message: 'Impossible de supprimer ce client car il possède des projets ou des paiements associés',
          hasProjects: client._count.projects > 0,
          hasPayments: client._count.payments > 0
        },
        { status: 400 }
      );
    }

    // Supprimer le client
    await prisma.client.delete({
      where: { id },
    });

    return NextResponse.json(
      { message: 'Client supprimé avec succès' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression du client:', error);
    return NextResponse.json(
      { message: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 