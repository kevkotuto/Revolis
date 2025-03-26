import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les contrats
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    // Extraire les paramètres de la requête
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const projectId = searchParams.get('projectId');
    const search = searchParams.get('search') || '';
    const companyId = searchParams.get('companyId');

    // Configurer la pagination
    const skip = (page - 1) * limit;

    // Construire la clause where pour le filtrage
    const where: any = {};

    // Filtrer par statut
    if (status) {
      where.status = status;
    }

    // Filtrer par projet
    if (projectId) {
      where.projectId = projectId;
    }

    // Filtrer par recherche
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Filtrer par entreprise (via le projet)
    if (companyId) {
      where.project = {
        companyId
      };
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Pour les admins d'entreprise, filtrer par leur entreprise
      where.project = {
        companyId: permissionCheck.user.companyId
      };
    }

    // Récupérer le nombre total pour la pagination
    const total = await prisma.contrat.count({ where });

    // Récupérer les contrats
    const contrats = await prisma.contrat.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            companyId: true,
            company: {
              select: {
                id: true,
                name: true
              }
            },
            client: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'PROJECT',
      'multiple',
      { action: "Consultation des contrats", filters: { status, projectId, search } }
    );

    return NextResponse.json({
      items: contrats,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des contrats:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des contrats' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau contrat
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation
    const ContratSchema = z.object({
      title: z.string().min(1, "Titre requis"),
      content: z.string().optional(),
      projectId: z.string().min(1, "ID de projet requis"),
      status: z.string().default("DRAFT"),
      document: z.string().optional()
    });
    
    // Valider les données
    const validationResult = ContratSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier que le projet existe
    const project = await prisma.project.findUnique({
      where: { id: validatedData.projectId },
      select: { id: true, companyId: true }
    });
    
    if (!project) {
      return NextResponse.json(
        { error: "Projet non trouvé" },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de créer un contrat pour ce projet
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== project.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour créer un contrat pour ce projet" },
        { status: 403 }
      );
    }
    
    // Créer le contrat
    const contrat = await prisma.contrat.create({
      data: validatedData,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            companyId: true,
            company: {
              select: {
                id: true,
                name: true
              }
            },
            client: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'CREATE',
      'PROJECT',
      contrat.id,
      { action: "Création d'un contrat", projectId: validatedData.projectId }
    );
    
    return NextResponse.json(contrat, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du contrat:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création du contrat' },
      { status: 500 }
    );
  }
} 