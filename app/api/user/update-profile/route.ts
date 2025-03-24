import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PUT(req: Request) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession();
    
    if (!session || !session.user) {
      return NextResponse.json(
        { message: 'Vous devez être connecté pour effectuer cette action' },
        { status: 401 }
      );
    }
    
    const { name } = await req.json();
    
    // Validation basique
    if (!name) {
      return NextResponse.json(
        { message: 'Le nom est obligatoire' },
        { status: 400 }
      );
    }
    
    // Mettre à jour le profil de l'utilisateur
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { name },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
    
    return NextResponse.json(
      { message: 'Profil mis à jour avec succès', user: updatedUser },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    
    return NextResponse.json(
      { message: error.message || 'Une erreur est survenue lors de la mise à jour du profil' },
      { status: 500 }
    );
  }
} 