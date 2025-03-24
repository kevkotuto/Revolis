import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {prisma} from '@/lib/prisma';

export async function DELETE() {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { message: 'Authentification requise' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Supprimer l'utilisateur et les données associées
    // Nous devons d'abord nettoyer les relations
    
    // 1. Mettre à jour les tâches pour supprimer l'assignation
    await prisma.task.updateMany({
      where: { assignedToId: userId },
      data: { assignedToId: null }
    });

    // 2. Mettre à jour les projets pour supprimer la relation avec l'utilisateur
    await prisma.project.updateMany({
      where: { userId: userId },
      data: { userId: null }
    });

    // 3. Supprimer l'utilisateur
    await prisma.user.delete({
      where: { id: userId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur lors de la suppression du compte:', error);
    return NextResponse.json(
      { message: 'Une erreur est survenue lors de la suppression du compte' },
      { status: 500 }
    );
  }
} 