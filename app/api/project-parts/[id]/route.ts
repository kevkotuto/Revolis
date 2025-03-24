import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {prisma} from '@/lib/prisma';

// GET /api/project-parts/[id]
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

    const projectPart = await prisma.projectPart.findUnique({
      where: { id: params.id },
      include: {
        tasks: {
          include: {
            assignedTo: true,
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    if (!projectPart) {
      return NextResponse.json(
        { error: 'Partie du projet non trouvée' },
        { status: 404 }
      );
    }

    return NextResponse.json(projectPart);
  } catch (error) {
    console.error('Erreur lors de la récupération de la partie du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// PATCH /api/project-parts/[id]
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
    const partId = params.id;

    // Vérifier si la partie existe
    const existingPart = await prisma.projectPart.findUnique({
      where: { id: partId },
      include: {
        project: true,
      },
    });

    if (!existingPart) {
      return NextResponse.json(
        { error: 'Partie du projet non trouvée' },
        { status: 404 }
      );
    }

    // Récupérer le prix actuel pour recalculer le total du projet après modification
    const oldPrice = parseFloat(existingPart.price.toString());

    // Mise à jour de la partie
    const updatedPart = await prisma.projectPart.update({
      where: { id: partId },
      data: {
        name: data.name?.trim() || existingPart.name,
        description: data.description?.trim() || existingPart.description,
        price: data.price || existingPart.price,
        completed: data.completed !== undefined ? data.completed : existingPart.completed,
      },
    });

    // Si le projet n'est pas à prix fixe, mettre à jour le prix total du projet
    if (!existingPart.project.isFixedPrice && data.price !== undefined) {
      // Calculer la différence de prix
      const newPrice = parseFloat(updatedPart.price.toString());
      const priceDifference = newPrice - oldPrice;
      
      // Mettre à jour le prix total du projet
      const currentTotalPrice = existingPart.project.totalPrice 
        ? parseFloat(existingPart.project.totalPrice.toString()) 
        : 0;
      
      const newTotalPrice = currentTotalPrice + priceDifference;
      
      await prisma.project.update({
        where: { id: existingPart.project.id },
        data: { 
          totalPrice: newTotalPrice >= 0 ? newTotalPrice : 0 
        },
      });
    }

    return NextResponse.json(updatedPart);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la partie du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// DELETE /api/project-parts/[id]
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

    const partId = params.id;

    // Vérifier si la partie existe
    const part = await prisma.projectPart.findUnique({
      where: { id: partId },
      include: {
        project: true,
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    if (!part) {
      return NextResponse.json(
        { error: 'Partie du projet non trouvée' },
        { status: 404 }
      );
    }

    // Vérifier s'il y a des tâches associées
    if (part._count.tasks > 0) {
      return NextResponse.json(
        { 
          error: 'Impossible de supprimer cette partie car elle contient des tâches',
          taskCount: part._count.tasks 
        },
        { status: 400 }
      );
    }

    // Récupérer le prix pour mettre à jour le total du projet
    const partPrice = parseFloat(part.price.toString());
    const projectId = part.project.id;
    const isFixedPrice = part.project.isFixedPrice;

    // Supprimer la partie
    await prisma.projectPart.delete({
      where: { id: partId },
    });

    // Si le projet n'est pas à prix fixe, mettre à jour le prix total du projet
    if (!isFixedPrice) {
      const currentTotalPrice = part.project.totalPrice 
        ? parseFloat(part.project.totalPrice.toString()) 
        : 0;
      
      const newTotalPrice = Math.max(0, currentTotalPrice - partPrice);
      
      await prisma.project.update({
        where: { id: projectId },
        data: { totalPrice: newTotalPrice },
      });
    }

    return NextResponse.json(
      { message: 'Partie du projet supprimée avec succès' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression de la partie du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 