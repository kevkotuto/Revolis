import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les devis
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'INVOICE'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les paramètres de requête
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const search = searchParams.get('search') || '';
    const companyId = searchParams.get('companyId') || undefined;
    
    // Calculer l'offset pour la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where
    const where: any = {};
    
    // Filtrer par compagnie si spécifié
    if (companyId) {
      where.project = { companyId };
    } else if (permissionCheck.user?.companyId && permissionCheck.role !== 'SUPER_ADMIN') {
      // Si l'utilisateur n'est pas SUPER_ADMIN, limiter aux projets de sa compagnie
      where.project = { companyId: permissionCheck.user.companyId };
    }
    
    // Filtrer par statut si spécifié
    if (status) {
      where.status = status;
    }
    
    // Filtrer par projet si spécifié
    if (projectId) {
      where.projectId = projectId;
    }
    
    // Recherche par référence
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Récupérer les devis
    const [devis, total] = await prisma.$transaction([
      prisma.devis.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              companyId: true,
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          },
          items: true,
          _count: {
            select: {
              items: true
            }
          }
        },
      }),
      prisma.devis.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'INVOICE',
      undefined,
      { action: 'Liste des devis', filters: { status, projectId, search, companyId } }
    );
    
    return NextResponse.json({
      data: devis,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des devis:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des devis' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau devis
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'INVOICE'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour le devis
    const DevisItemSchema = z.object({
      description: z.string().min(2, "La description doit contenir au moins 2 caractères"),
      quantity: z.number().min(1, "La quantité doit être supérieure à 0").default(1),
      unitPrice: z.number().min(0, "Le prix unitaire ne peut pas être négatif").default(0),
      total: z.number().optional()
    });
    
    const DevisSchema = z.object({
      reference: z.string().min(3, "La référence doit contenir au moins 3 caractères"),
      status: z.string().default("DRAFT"),
      total: z.number().optional(),
      validUntil: z.string().datetime().optional(),
      projectId: z.string().optional(),
      document: z.string().optional(),
      items: z.array(DevisItemSchema).min(1, "Au moins un item est requis")
    });
    
    // Valider les données
    const validationResult = DevisSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier si le projet existe si un projectId est fourni
    if (validatedData.projectId) {
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
      
      // Vérifier que l'utilisateur a le droit d'accéder à ce projet
      if (permissionCheck.role !== 'SUPER_ADMIN' && 
          permissionCheck.user?.companyId !== project.companyId) {
        return NextResponse.json(
          { error: "Vous n'avez pas les permissions pour créer un devis pour ce projet" },
          { status: 403 }
        );
      }
    }
    
    // Calculer le total du devis si non fourni
    if (!validatedData.total) {
      validatedData.total = validatedData.items.reduce((sum, item) => {
        // Calculer le total de l'item si non fourni
        const itemTotal = item.total !== undefined ? item.total : item.quantity * item.unitPrice;
        return sum + itemTotal;
      }, 0);
    }
    
    // Utiliser une transaction pour créer le devis et ses items
    const devis = await prisma.$transaction(async (tx) => {
      // Créer le devis
      const newDevis = await tx.devis.create({
        data: {
          reference: validatedData.reference,
          status: validatedData.status,
          total: validatedData.total,
          validUntil: validatedData.validUntil ? new Date(validatedData.validUntil) : null,
          document: validatedData.document,
          projectId: validatedData.projectId,
        }
      });
      
      // Créer les items du devis
      await Promise.all(validatedData.items.map(item => {
        // Calcul du total de l'item si non spécifié
        const itemTotal = item.total !== undefined ? item.total : item.quantity * item.unitPrice;
        
        return tx.devisItem.create({
          data: {
            devisId: newDevis.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: itemTotal
          }
        });
      }));
      
      // Retourner le devis avec ses items
      return tx.devis.findUnique({
        where: { id: newDevis.id },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          },
          items: true
        }
      });
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'INVOICE',
      devis?.id,
      { action: 'Création d\'un devis', reference: validatedData.reference }
    );
    
    return NextResponse.json(devis, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du devis:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création du devis' },
      { status: 500 }
    );
  }
} 