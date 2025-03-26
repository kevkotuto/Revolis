import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer toutes les taxes (TVA)
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'TAX'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les paramètres de requête
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100'); // Par défaut, on retourne plus d'éléments car il y a généralement peu de taxes
    const search = searchParams.get('search') || '';
    const active = searchParams.get('active') === 'true' ? true : 
                 searchParams.get('active') === 'false' ? false : undefined;
    
    // Calculer l'offset pour la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where
    const where: any = {};
    
    // Filtrer par état actif/inactif si spécifié
    if (active !== undefined) {
      where.active = active;
    }
    
    // Recherche par nom ou valeur
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    // Ajouter le filtrage par companyId selon le rôle de l'utilisateur
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.user?.companyId) {
      where.OR = [
        ...(where.OR || []),
        { companyId: permissionCheck.user.companyId },
        { isGlobal: true } // Les taxes globales sont accessibles par tous
      ];
    }
    
    // Récupérer les taxes
    const [taxes, total] = await prisma.$transaction([
      prisma.tax.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { priority: 'desc' },
          { value: 'asc' }
        ],
        include: {
          company: {
            select: {
              id: true,
              name: true
            }
          }
        },
      }),
      prisma.tax.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'TAX',
      undefined,
      { action: 'Liste des taxes', filters: { active, search } }
    );
    
    return NextResponse.json({
      data: taxes,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des taxes:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des taxes' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle taxe (TVA)
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'TAX'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour la taxe
    const TaxSchema = z.object({
      name: z.string().min(1, "Le nom est requis"),
      description: z.string().optional(),
      value: z.number().min(0, "La valeur doit être supérieure ou égale à 0"),
      active: z.boolean().default(true),
      isGlobal: z.boolean().default(false),
      priority: z.number().int().default(0),
      companyId: z.string().optional()
    });
    
    // Valider les données
    const validationResult = TaxSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifications supplémentaires basées sur le rôle de l'utilisateur
    if (validatedData.isGlobal && permissionCheck.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "Seul un super administrateur peut créer une taxe globale" },
        { status: 403 }
      );
    }
    
    // Si ce n'est pas une taxe globale, s'assurer qu'un companyId est fourni ou utilisé depuis l'utilisateur
    if (!validatedData.isGlobal) {
      if (!validatedData.companyId) {
        if (permissionCheck.user?.companyId) {
          validatedData.companyId = permissionCheck.user.companyId;
        } else {
          return NextResponse.json(
            { error: "Un ID d'entreprise est requis pour une taxe non globale" },
            { status: 400 }
          );
        }
      } else if (
        permissionCheck.role !== 'SUPER_ADMIN' &&
        permissionCheck.user?.companyId !== validatedData.companyId
      ) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas créer une taxe pour une autre entreprise" },
          { status: 403 }
        );
      }
    }
    
    // Si c'est une taxe globale, s'assurer que companyId n'est pas défini
    if (validatedData.isGlobal) {
      validatedData.companyId = null;
    }
    
    // Créer la taxe
    const tax = await prisma.tax.create({
      data: validatedData,
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'TAX',
      tax.id,
      { action: 'Création d\'une taxe', name: validatedData.name, value: validatedData.value, isGlobal: validatedData.isGlobal }
    );
    
    return NextResponse.json(tax, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la taxe:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de la taxe' },
      { status: 500 }
    );
  }
} 