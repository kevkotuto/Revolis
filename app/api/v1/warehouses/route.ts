import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les entrepôts
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    // Extraire les paramètres de requête
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const companyId = searchParams.get('companyId');
    const search = searchParams.get('search') || '';
    const location = searchParams.get('location');
    const isActive = searchParams.get('isActive') === 'true';

    // Configurer la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where pour les filtres
    const where: any = {};
    
    // Filtre par entreprise
    if (companyId) {
      where.companyId = companyId;
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Pour les admins d'entreprise, filtrer par leur entreprise
      where.companyId = permissionCheck.user.companyId;
    }
    
    // Filtre par statut actif
    if (isActive) {
      where.isActive = true;
    }
    
    // Filtre par emplacement
    if (location) {
      where.location = { contains: location, mode: 'insensitive' };
    }
    
    // Filtre de recherche (nom, description)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Récupérer le nombre total d'entrepôts pour pagination
    const total = await prisma.warehouse.count({ where });
    
    // Récupérer les entrepôts
    const warehouses = await prisma.warehouse.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        },
        _count: {
          select: {
            stockMovements: true
          }
        }
      },
      skip,
      take: limit,
      orderBy: { name: 'asc' }
    });
    
    // Calculer le stock total pour chaque entrepôt
    const warehousesWithStock = await Promise.all(
      warehouses.map(async (warehouse) => {
        // Récupérer le nombre total de produits uniques dans l'entrepôt
        const uniqueProducts = await prisma.stockMovement.groupBy({
          by: ['productId'],
          where: { warehouseId: warehouse.id },
          having: {
            quantity: {
              _sum: {
                gt: 0
              }
            }
          }
        });
        
        // Calculer la valeur totale du stock dans l'entrepôt
        const stockValue = await prisma.$queryRaw`
          SELECT SUM(sm.quantity * p.price) as total_value
          FROM "StockMovement" sm
          JOIN "Product" p ON sm."productId" = p.id
          WHERE sm."warehouseId" = ${warehouse.id}
          GROUP BY sm."warehouseId"
        `;
        
        return {
          ...warehouse,
          uniqueProductCount: uniqueProducts.length,
          totalStockValue: stockValue[0]?.total_value || 0
        };
      })
    );
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des entrepôts", filters: { companyId, search, location, isActive } }
    );
    
    return NextResponse.json({
      items: warehousesWithStock,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des entrepôts:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des entrepôts' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouvel entrepôt
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation des données de l'entrepôt
    const WarehouseSchema = z.object({
      name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
      code: z.string().optional(),
      description: z.string().optional(),
      location: z.string().min(2, "L'emplacement doit contenir au moins 2 caractères"),
      address: z.string().optional(),
      contactName: z.string().optional(),
      contactEmail: z.string().email("Email invalide").optional(),
      contactPhone: z.string().optional(),
      companyId: z.string().optional(),
      isActive: z.boolean().default(true),
      capacity: z.number().int().positive().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional()
    });
    
    // Valider les données
    const validationResult = WarehouseSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Déterminer l'ID de l'entreprise
    let companyId = validatedData.companyId;
    
    // Si companyId n'est pas fourni, utiliser celui de l'utilisateur
    if (!companyId) {
      if (permissionCheck.user?.companyId) {
        companyId = permissionCheck.user.companyId;
      } else if (permissionCheck.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { error: "ID d'entreprise requis" },
          { status: 400 }
        );
      }
    } 
    // Si companyId est fourni et différent de celui de l'utilisateur (pour COMPANY_ADMIN)
    else if (permissionCheck.role === 'COMPANY_ADMIN' && 
             companyId !== permissionCheck.user?.companyId) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas créer un entrepôt pour une autre entreprise" },
        { status: 403 }
      );
    }
    
    // Vérifier que l'entreprise existe
    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      });
      
      if (!company) {
        return NextResponse.json(
          { error: "Entreprise non trouvée" },
          { status: 404 }
        );
      }
    }
    
    // Vérifier si un entrepôt avec le même code existe déjà pour cette entreprise
    if (validatedData.code && companyId) {
      const existingWarehouse = await prisma.warehouse.findFirst({
        where: {
          code: validatedData.code,
          companyId
        }
      });
      
      if (existingWarehouse) {
        return NextResponse.json(
          { error: "Un entrepôt avec ce code existe déjà dans votre entreprise" },
          { status: 409 }
        );
      }
    }
    
    // Préparer les données pour la création
    const warehouseData = {
      ...validatedData,
      companyId
    };
    
    // Créer l'entrepôt
    const warehouse = await prisma.warehouse.create({
      data: warehouseData,
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
      'OTHER',
      warehouse.id,
      { 
        action: "Création d'un entrepôt",
        name: warehouse.name,
        location: warehouse.location
      }
    );
    
    return NextResponse.json(warehouse, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de l\'entrepôt:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de l\'entrepôt' },
      { status: 500 }
    );
  }
} 