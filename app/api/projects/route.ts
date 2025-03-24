import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {prisma} from '@/lib/prisma';

// GET /api/projects
export async function GET(request: NextRequest) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');
    const userId = searchParams.get('userId');

    // Construction de la requête avec filtres optionnels
    const whereClause: any = {};
    
    if (clientId) {
      whereClause.clientId = clientId;
    }
    
    if (status) {
      whereClause.status = status;
    }
    
    if (userId) {
      whereClause.userId = userId;
    }

    // Récupération des projets avec relations et statistiques
    const projects = await prisma.project.findMany({
      where: whereClause,
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        projectPrestataires: {
          include: {
            prestataire: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            tasks: true,
            payments: true,
            devis: true,
            contrats: true,
            projectParts: true,
          },
        },
      },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error('Erreur lors de la récupération des projets:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// POST /api/projects
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
        { error: 'Le nom du projet est requis' },
        { status: 400 }
      );
    }

    // Création du projet de base
    const projectData: any = {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      status: data.status || 'PENDING_VALIDATION',
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      totalPrice: data.totalPrice || null,
      currency: data.currency || 'EUR',
      isFixedPrice: data.isFixedPrice !== undefined ? data.isFixedPrice : true,
    };

    // Ajout des relations si présentes
    if (data.clientId) {
      projectData.client = { connect: { id: data.clientId } };
    }

    if (data.userId) {
      projectData.user = { connect: { id: data.userId } };
    } else if (session.user.id) {
      // Si userId non spécifié, utiliser l'utilisateur connecté
      projectData.user = { connect: { id: session.user.id } };
    }

    // Créer le projet avec ses parties si spécifiées
    const project = await prisma.project.create({
      data: {
        ...projectData,
        // Création des parties du projet en une seule transaction
        ...(data.projectParts && data.projectParts.length > 0 && {
          projectParts: {
            create: data.projectParts.map((part: any) => ({
              name: part.name,
              description: part.description || null,
              price: part.price || 0,
              completed: part.completed || false,
            })),
          },
        }),
        // Création des relations avec prestataires
        ...(data.prestataires && data.prestataires.length > 0 && {
          projectPrestataires: {
            create: data.prestataires.map((prest: any) => ({
              role: prest.role || null,
              hourlyRate: prest.hourlyRate || null,
              fixedAmount: prest.fixedAmount || null,
              prestataire: {
                connect: { id: prest.prestataireId },
              },
            })),
          },
        }),
      },
      include: {
        client: true,
        user: true,
        projectParts: true,
        projectPrestataires: {
          include: {
            prestataire: true,
          },
        },
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 