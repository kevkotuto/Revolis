import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {prisma} from '@/lib/prisma';

// GET /api/project-parts
export async function GET(request: NextRequest) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'L\'ID du projet est requis' },
        { status: 400 }
      );
    }

    const projectParts = await prisma.projectPart.findMany({
      where: {
        projectId,
      },
      include: {
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    return NextResponse.json(projectParts);
  } catch (error) {
    console.error('Erreur lors de la récupération des parties du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// POST /api/project-parts
export async function POST(request: NextRequest) {
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
        { error: 'Le nom de la partie est requis' },
        { status: 400 }
      );
    }

    if (!data.projectId) {
      return NextResponse.json(
        { error: 'L\'ID du projet est requis' },
        { status: 400 }
      );
    }

    // Vérifier si le projet existe
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Projet non trouvé' },
        { status: 404 }
      );
    }

    // Création de la partie du projet
    const projectPart = await prisma.projectPart.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        price: data.price || 0,
        completed: data.completed || false,
        project: {
          connect: { id: data.projectId },
        },
      },
    });

    // Si le projet n'est pas à prix fixe, mettre à jour le prix total du projet
    if (!project.isFixedPrice) {
      // Récupérer toutes les parties du projet
      const allParts = await prisma.projectPart.findMany({
        where: { projectId: data.projectId },
        select: { price: true },
      });
      
      // Calculer le prix total
      const totalPrice = allParts.reduce((total, part) => 
        total + (part.price ? parseFloat(part.price.toString()) : 0), 
        parseFloat(projectPart.price.toString())
      );
      
      // Mettre à jour le prix total du projet
      await prisma.project.update({
        where: { id: data.projectId },
        data: { totalPrice },
      });
    }

    return NextResponse.json(projectPart, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la partie du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 