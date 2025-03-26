import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les projets
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
    
    // Extraire les paramètres de requête
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const clientId = searchParams.get('clientId') || undefined;
    const status = searchParams.get('status') || undefined;
    const userId = searchParams.get('userId') || undefined;
    const companyId = searchParams.get('companyId') || undefined;
    
    // Calculer l'offset pour la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where
    const where: any = {};
    
    // Filtrer par compagnie si spécifié
    if (companyId) {
      where.companyId = companyId;
    } else if (permissionCheck.user?.companyId && permissionCheck.role !== 'SUPER_ADMIN') {
      // Si l'utilisateur n'est pas SUPER_ADMIN, limiter aux projets de sa compagnie
      where.companyId = permissionCheck.user.companyId;
    }
    
    // Filtrer par client si spécifié
    if (clientId) {
      where.clientId = clientId;
    }
    
    // Filtrer par statut si spécifié
    if (status) {
      where.status = status;
    }
    
    // Filtrer par responsable si spécifié
    if (userId) {
      where.userId = userId;
    }
    
    // Recherche par nom
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Récupérer les projets
    const [projects, total] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
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
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          tags: true,
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
      }),
      prisma.project.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'PROJECT',
      undefined,
      { filters: { search, clientId, status, userId, companyId } }
    );
    
    return NextResponse.json({
      data: projects,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des projets:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des projets' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau projet
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
    
    // Définir le schéma de validation
    const ProjectSchema = z.object({
      name: z.string().min(2, "Le nom du projet doit contenir au moins 2 caractères"),
      description: z.string().optional(),
      status: z.enum(['PENDING_VALIDATION', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED', 'FUTURE', 'PERSONAL']).default('PENDING_VALIDATION'),
      startDate: z.string().datetime().optional().nullable(),
      endDate: z.string().datetime().optional().nullable(),
      totalPrice: z.number().optional().nullable(),
      currency: z.string().default('XOF'),
      isFixedPrice: z.boolean().default(true),
      clientId: z.string().optional().nullable(),
      userId: z.string().optional().nullable(),
      companyId: z.string().optional(),
      projectParts: z.array(z.object({
        name: z.string().min(2),
        description: z.string().optional(),
        price: z.number().default(0),
        completed: z.boolean().default(false)
      })).optional(),
      prestataires: z.array(z.object({
        prestataireId: z.string(),
        role: z.string().optional(),
        hourlyRate: z.number().optional(),
        fixedAmount: z.number().optional()
      })).optional(),
      tagIds: z.array(z.string()).optional()
    });
    
    // Valider les données
    const validationResult = ProjectSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Préparer les données pour la création
    const projectData: any = {
      name: validatedData.name,
      description: validatedData.description,
      status: validatedData.status,
      startDate: validatedData.startDate ? new Date(validatedData.startDate) : null,
      endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
      totalPrice: validatedData.totalPrice,
      currency: validatedData.currency,
      isFixedPrice: validatedData.isFixedPrice,
      companyId: validatedData.companyId || permissionCheck.user?.companyId,
    };
    
    // Ajouter les relations client et responsable
    if (validatedData.clientId) {
      projectData.client = { connect: { id: validatedData.clientId } };
    }
    
    if (validatedData.userId) {
      projectData.user = { connect: { id: validatedData.userId } };
    } else if (permissionCheck.user?.id) {
      projectData.user = { connect: { id: permissionCheck.user.id } };
    }
    
    // Ajouter les parties du projet
    if (validatedData.projectParts && validatedData.projectParts.length > 0) {
      projectData.projectParts = {
        create: validatedData.projectParts,
      };
    }
    
    // Ajouter les prestataires
    if (validatedData.prestataires && validatedData.prestataires.length > 0) {
      projectData.projectPrestataires = {
        create: validatedData.prestataires.map(prest => ({
          role: prest.role,
          hourlyRate: prest.hourlyRate,
          fixedAmount: prest.fixedAmount,
          prestataire: { connect: { id: prest.prestataireId } }
        })),
      };
    }
    
    // Ajouter les tags
    if (validatedData.tagIds && validatedData.tagIds.length > 0) {
      projectData.tags = {
        connect: validatedData.tagIds.map(id => ({ id }))
      };
    }
    
    // Créer le projet
    const project = await prisma.project.create({
      data: projectData,
      include: {
        client: true,
        user: true,
        company: true,
        projectParts: true,
        projectPrestataires: {
          include: {
            prestataire: true,
          },
        },
        tags: true,
      },
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'PROJECT',
      project.id,
      { projectName: project.name }
    );
    
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création du projet' },
      { status: 500 }
    );
  }
} 