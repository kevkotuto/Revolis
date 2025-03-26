import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les mouvements de stock
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
    const warehouseId = searchParams.get('warehouseId');
    const productId = searchParams.get('productId');
    const type = searchParams.get('type'); // IN ou OUT
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const reference = searchParams.get('reference') || '';

    // Configurer la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where pour les filtres
    const where: any = {};
    
    // Filtre par entrepôt
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }
    
    // Filtre par produit
    if (productId) {
      where.productId = productId;
    }
    
    // Filtre par type de mouvement
    if (type) {
      // Si le type est "IN", on cherche les quantités positives
      // Si le type est "OUT", on cherche les quantités négatives
      where.quantity = type === 'IN' ? { gt: 0 } : { lt: 0 };
    }
    
    // Filtre par plage de dates
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }
    
    // Filtre par référence
    if (reference) {
      where.reference = { contains: reference, mode: 'insensitive' };
    }
    
    // Filtre par entreprise (à travers l'entrepôt)
    if (companyId) {
      where.warehouse = { companyId };
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Pour les admins d'entreprise, filtrer par leur entreprise
      where.warehouse = { companyId: permissionCheck.user.companyId };
    }
    
    // Récupérer le nombre total de mouvements pour pagination
    const total = await prisma.stockMovement.count({ where });
    
    // Récupérer les mouvements de stock
    const stockMovements = await prisma.stockMovement.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            price: true
          }
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true,
            company: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des mouvements de stock", filters: { warehouseId, productId, type, startDate, endDate, reference } }
    );
    
    return NextResponse.json({
      items: stockMovements,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des mouvements de stock:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des mouvements de stock' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau mouvement de stock
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
    
    // Schéma de validation des données du mouvement de stock
    const StockMovementSchema = z.object({
      productId: z.string({ message: "ID du produit requis" }),
      warehouseId: z.string({ message: "ID de l'entrepôt requis" }),
      quantity: z.number({ message: "Quantité requise" }),
      reason: z.string().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      purchaseOrderId: z.string().optional(),
      saleOrderId: z.string().optional(),
      unitPrice: z.number().nonnegative().optional()
    });
    
    // Valider les données
    const validationResult = StockMovementSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier que le produit existe
    const product = await prisma.product.findUnique({
      where: { id: validatedData.productId }
    });
    
    if (!product) {
      return NextResponse.json(
        { error: "Produit non trouvé" },
        { status: 404 }
      );
    }
    
    // Vérifier que l'entrepôt existe
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: validatedData.warehouseId },
      include: {
        company: {
          select: { id: true }
        }
      }
    });
    
    if (!warehouse) {
      return NextResponse.json(
        { error: "Entrepôt non trouvé" },
        { status: 404 }
      );
    }
    
    // Vérifier les permissions basées sur l'entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId && 
        warehouse.company.id !== permissionCheck.user.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour opérer dans cet entrepôt" },
        { status: 403 }
      );
    }
    
    // Vérifier que le produit et l'entrepôt appartiennent à la même entreprise
    if (product.companyId && warehouse.company.id && product.companyId !== warehouse.company.id) {
      return NextResponse.json(
        { error: "Le produit et l'entrepôt n'appartiennent pas à la même entreprise" },
        { status: 403 }
      );
    }
    
    // Vérifier si c'est une sortie de stock (quantité négative)
    if (validatedData.quantity < 0) {
      // Vérifier le stock disponible
      const currentStock = await prisma.stockMovement.aggregate({
        where: {
          productId: validatedData.productId,
          warehouseId: validatedData.warehouseId
        },
        _sum: {
          quantity: true
        }
      });
      
      const availableStock = currentStock._sum.quantity || 0;
      
      // Si le stock disponible est insuffisant, on refuse l'opération
      if (availableStock + validatedData.quantity < 0) {
        return NextResponse.json(
          { 
            error: "Stock insuffisant",
            availableStock,
            requestedQuantity: -validatedData.quantity
          },
          { status: 400 }
        );
      }
    }
    
    // Vérifier la cohérence des IDs de bon de commande et de vente
    if (validatedData.purchaseOrderId && validatedData.saleOrderId) {
      return NextResponse.json(
        { error: "Un mouvement de stock ne peut pas être lié à la fois à un bon de commande et à un bon de vente" },
        { status: 400 }
      );
    }
    
    // Vérifier que le bon de commande existe s'il est spécifié
    if (validatedData.purchaseOrderId) {
      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: validatedData.purchaseOrderId }
      });
      
      if (!purchaseOrder) {
        return NextResponse.json(
          { error: "Bon de commande non trouvé" },
          { status: 404 }
        );
      }
    }
    
    // Vérifier que le bon de vente existe s'il est spécifié
    if (validatedData.saleOrderId) {
      const saleOrder = await prisma.saleOrder.findUnique({
        where: { id: validatedData.saleOrderId }
      });
      
      if (!saleOrder) {
        return NextResponse.json(
          { error: "Bon de vente non trouvé" },
          { status: 404 }
        );
      }
    }
    
    // Préparer les données pour la création
    const stockMovementData = {
      ...validatedData,
      userId: permissionCheck.user?.id // Associer l'utilisateur qui effectue l'opération
    };
    
    // Créer le mouvement de stock
    const stockMovement = await prisma.stockMovement.create({
      data: stockMovementData,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true
          }
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'OTHER',
      stockMovement.id,
      { 
        action: `${validatedData.quantity > 0 ? "Entrée" : "Sortie"} de stock`,
        product: stockMovement.product.name,
        warehouse: stockMovement.warehouse.name,
        quantity: Math.abs(validatedData.quantity)
      }
    );
    
    return NextResponse.json(stockMovement, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du mouvement de stock:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création du mouvement de stock' },
      { status: 500 }
    );
  }
} 