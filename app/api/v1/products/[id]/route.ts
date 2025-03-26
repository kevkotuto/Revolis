import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer un produit spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Récupérer le produit avec ses relations
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true
          }
        },
        company: {
          select: {
            id: true,
            name: true
          }
        },
        tags: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    // Vérifier si le produit existe
    if (!product) {
      return NextResponse.json({ error: "Produit non trouvé" }, { status: 404 });
    }
    
    // Vérifier les permissions d'accès basées sur l'entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId && 
        product.companyId !== permissionCheck.user.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour accéder à ce produit" },
        { status: 403 }
      );
    }
    
    // Calculer le stock disponible
    const stockSum = await prisma.stockMovement.aggregate({
      where: {
        productId: id
      },
      _sum: {
        quantity: true
      }
    });
    
    const availableStock = stockSum._sum.quantity || 0;
    
    // Récupérer les mouvements de stock récents
    const recentMovements = await prisma.stockMovement.findMany({
      where: {
        productId: id
      },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });
    
    // Récupérer les dernières commandes contenant ce produit
    const recentOrders = await prisma.purchaseOrderLine.findMany({
      where: {
        productId: id
      },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            reference: true,
            status: true,
            supplierName: true,
            orderDate: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });
    
    // Récupérer les dernières ventes contenant ce produit
    const recentSales = await prisma.saleOrderLine.findMany({
      where: {
        productId: id
      },
      include: {
        saleOrder: {
          select: {
            id: true,
            reference: true,
            status: true,
            client: {
              select: {
                id: true,
                name: true
              }
            },
            orderDate: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });
    
    // Construire la réponse complète
    const detailedProduct = {
      ...product,
      availableStock,
      stockMovements: recentMovements,
      purchaseOrders: recentOrders,
      saleOrders: recentSales
    };
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      id,
      { action: "Consultation d'un produit", productName: product.name }
    );
    
    return NextResponse.json(detailedProduct);
  } catch (error) {
    console.error('Erreur lors de la récupération du produit:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération du produit' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un produit
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Récupérer le produit existant
    const existingProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        tags: {
          select: {
            id: true
          }
        }
      }
    });
    
    // Vérifier si le produit existe
    if (!existingProduct) {
      return NextResponse.json({ error: "Produit non trouvé" }, { status: 404 });
    }
    
    // Vérifier les permissions de modification basées sur l'entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId && 
        existingProduct.companyId !== permissionCheck.user.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour modifier ce produit" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation pour la mise à jour du produit
    const ProductUpdateSchema = z.object({
      name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").optional(),
      description: z.string().optional(),
      sku: z.string().optional(),
      barcode: z.string().optional(),
      price: z.number().nonnegative("Le prix doit être positif ou nul").optional(),
      cost: z.number().nonnegative("Le coût doit être positif ou nul").optional(),
      categoryId: z.string().optional(),
      taxId: z.string().optional(),
      unit: z.string().optional(),
      weight: z.number().nonnegative().optional(),
      dimensions: z.string().optional(),
      imageUrl: z.string().url("URL d'image invalide").optional(),
      isActive: z.boolean().optional(),
      minStockLevel: z.number().int().nonnegative().optional(),
      maxStockLevel: z.number().int().nonnegative().optional(),
      tags: z.array(z.string()).optional()
    });
    
    // Valider les données
    const validationResult = ProductUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier si le SKU est modifié et s'il est déjà utilisé par un autre produit
    if (validatedData.sku && validatedData.sku !== existingProduct.sku) {
      const productWithSku = await prisma.product.findFirst({
        where: {
          sku: validatedData.sku,
          companyId: existingProduct.companyId,
          id: { not: id }
        }
      });
      
      if (productWithSku) {
        return NextResponse.json(
          { error: "Un autre produit avec ce SKU existe déjà dans votre entreprise" },
          { status: 409 }
        );
      }
    }
    
    // Vérifier la catégorie si spécifiée
    if (validatedData.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: validatedData.categoryId }
      });
      
      if (!category) {
        return NextResponse.json(
          { error: "Catégorie non trouvée" },
          { status: 404 }
        );
      }
      
      // Vérifier que la catégorie appartient à la même entreprise
      if (category.companyId && category.companyId !== existingProduct.companyId) {
        return NextResponse.json(
          { error: "Cette catégorie n'appartient pas à la même entreprise que le produit" },
          { status: 403 }
        );
      }
    }
    
    // Préparer les données pour la mise à jour
    const updateData: any = { ...validatedData };
    delete updateData.tags;
    
    // Gérer la mise à jour des tags
    let tagsOperation;
    if (validatedData.tags) {
      // Obtenir les IDs de tags actuels
      const currentTagIds = existingProduct.tags.map(tag => tag.id);
      
      // Déterminer les tags à ajouter et à supprimer
      const tagsToAdd = validatedData.tags.filter(tagId => !currentTagIds.includes(tagId));
      const tagsToRemove = currentTagIds.filter(tagId => !validatedData.tags!.includes(tagId));
      
      tagsOperation = {
        disconnect: tagsToRemove.map(id => ({ id })),
        connect: tagsToAdd.map(id => ({ id }))
      };
    }
    
    // Mise à jour du produit dans une transaction
    const updatedProduct = await prisma.$transaction(async (tx) => {
      // Mettre à jour le produit avec les données de base
      const updated = await tx.product.update({
        where: { id },
        data: updateData
      });
      
      // Mettre à jour les relations de tags si nécessaire
      if (tagsOperation) {
        await tx.product.update({
          where: { id },
          data: {
            tags: tagsOperation
          }
        });
      }
      
      // Retourner le produit mis à jour avec ses relations
      return tx.product.findUnique({
        where: { id },
        include: {
          category: {
            select: {
              id: true,
              name: true
            }
          },
          company: {
            select: {
              id: true,
              name: true
            }
          },
          tags: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'UPDATE',
      'OTHER',
      id,
      { 
        action: "Mise à jour d'un produit",
        productName: existingProduct.name,
        updates: Object.keys(validatedData)
      }
    );
    
    return NextResponse.json(updatedProduct);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du produit:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour du produit' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un produit
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Récupérer le produit existant
    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });
    
    // Vérifier si le produit existe
    if (!existingProduct) {
      return NextResponse.json({ error: "Produit non trouvé" }, { status: 404 });
    }
    
    // Vérifier les permissions de suppression basées sur l'entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId && 
        existingProduct.companyId !== permissionCheck.user.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour supprimer ce produit" },
        { status: 403 }
      );
    }
    
    // Vérifier les dépendances avant la suppression
    const [stockMovements, purchaseOrderLines, saleOrderLines] = await Promise.all([
      prisma.stockMovement.count({
        where: { productId: id }
      }),
      prisma.purchaseOrderLine.count({
        where: { productId: id }
      }),
      prisma.saleOrderLine.count({
        where: { productId: id }
      })
    ]);
    
    // Si le produit a des dépendances, ne pas le supprimer mais le marquer comme inactif
    if (stockMovements > 0 || purchaseOrderLines > 0 || saleOrderLines > 0) {
      const updatedProduct = await prisma.product.update({
        where: { id },
        data: {
          isActive: false
        }
      });
      
      // Journaliser l'action
      await logAction(
        permissionCheck.user?.id || 'unknown',
        'UPDATE',
        'OTHER',
        id,
        { 
          action: "Désactivation d'un produit (suppression impossible due aux dépendances)",
          productName: existingProduct.name,
          dependencies: {
            stockMovements,
            purchaseOrderLines,
            saleOrderLines
          }
        }
      );
      
      return NextResponse.json({ 
        message: "Le produit ne peut pas être supprimé car il est utilisé dans des mouvements de stock, commandes ou ventes. Il a été désactivé à la place.",
        product: updatedProduct
      });
    }
    
    // Supprimer le produit dans une transaction
    await prisma.$transaction(async (tx) => {
      // Supprimer les relations tags-produit
      await tx.product.update({
        where: { id },
        data: {
          tags: {
            set: []
          }
        }
      });
      
      // Supprimer le produit
      await tx.product.delete({
        where: { id }
      });
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'OTHER',
      id,
      { 
        action: "Suppression d'un produit",
        productName: existingProduct.name
      }
    );
    
    return NextResponse.json({ message: "Produit supprimé avec succès" });
  } catch (error) {
    console.error('Erreur lors de la suppression du produit:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression du produit' },
      { status: 500 }
    );
  }
} 