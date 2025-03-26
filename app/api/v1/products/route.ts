import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les produits avec filtres
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
    const categoryId = searchParams.get('categoryId');
    const companyId = searchParams.get('companyId');
    const search = searchParams.get('search') || '';
    const minPrice = searchParams.get('minPrice') ? parseFloat(searchParams.get('minPrice')!) : undefined;
    const maxPrice = searchParams.get('maxPrice') ? parseFloat(searchParams.get('maxPrice')!) : undefined;
    const inStock = searchParams.get('inStock') === 'true';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Configurer la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where pour les filtres
    const where: any = {};
    
    // Filtre par catégorie
    if (categoryId) {
      where.categoryId = categoryId;
    }
    
    // Filtre par entreprise
    if (companyId) {
      where.companyId = companyId;
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Pour les admins d'entreprise, filtrer par leur entreprise
      where.companyId = permissionCheck.user.companyId;
    }
    
    // Filtre de recherche
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Filtre par prix
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) {
        where.price.gte = minPrice;
      }
      if (maxPrice !== undefined) {
        where.price.lte = maxPrice;
      }
    }
    
    // Filtre par stock disponible (produits ayant au moins un mouvement de stock positif)
    if (inStock) {
      where.stockMovements = {
        some: {
          quantity: {
            gt: 0
          }
        }
      };
    }
    
    // Préparer l'ordre de tri
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;
    
    // Récupérer le nombre total de produits pour pagination
    const total = await prisma.product.count({ where });
    
    // Récupérer les produits
    const products = await prisma.product.findMany({
      where,
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
        _count: {
          select: {
            stockMovements: true
          }
        }
      },
      skip,
      take: limit,
      orderBy
    });
    
    // Calculer le stock disponible pour chaque produit
    const productsWithStock = await Promise.all(
      products.map(async (product) => {
        // Calculer la somme des mouvements de stock (entrées - sorties)
        const stockSum = await prisma.stockMovement.aggregate({
          where: {
            productId: product.id
          },
          _sum: {
            quantity: true
          }
        });
        
        const availableStock = stockSum._sum.quantity || 0;
        
        return {
          ...product,
          availableStock
        };
      })
    );
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des produits", filters: { categoryId, companyId, search, minPrice, maxPrice, inStock } }
    );
    
    return NextResponse.json({
      items: productsWithStock,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des produits:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des produits' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau produit
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
    
    // Schéma de validation des données du produit
    const ProductSchema = z.object({
      name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
      description: z.string().optional(),
      sku: z.string().optional(),
      barcode: z.string().optional(),
      price: z.number().nonnegative("Le prix doit être positif ou nul"),
      cost: z.number().nonnegative("Le coût doit être positif ou nul").optional(),
      categoryId: z.string().optional(),
      companyId: z.string().optional(),
      taxId: z.string().optional(),
      unit: z.string().optional(),
      weight: z.number().nonnegative().optional(),
      dimensions: z.string().optional(),
      imageUrl: z.string().url("URL d'image invalide").optional(),
      isActive: z.boolean().default(true),
      minStockLevel: z.number().int().nonnegative().optional(),
      maxStockLevel: z.number().int().nonnegative().optional(),
      tags: z.array(z.string()).optional()
    });
    
    // Valider les données
    const validationResult = ProductSchema.safeParse(data);
    
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
        { error: "Vous ne pouvez pas créer un produit pour une autre entreprise" },
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
      
      // Vérifier que la catégorie appartient à la même entreprise (si applicable)
      if (companyId && category.companyId && category.companyId !== companyId) {
        return NextResponse.json(
          { error: "Cette catégorie n'appartient pas à votre entreprise" },
          { status: 403 }
        );
      }
    }
    
    // Vérifier si un produit avec le même SKU existe déjà pour cette entreprise
    if (validatedData.sku && companyId) {
      const existingProduct = await prisma.product.findFirst({
        where: {
          sku: validatedData.sku,
          companyId
        }
      });
      
      if (existingProduct) {
        return NextResponse.json(
          { error: "Un produit avec ce SKU existe déjà dans votre entreprise" },
          { status: 409 }
        );
      }
    }
    
    // Préparer les données pour la création
    const productData = {
      ...validatedData,
      companyId
    };
    
    // Gérer les tags si spécifiés
    const tagsToConnect = validatedData.tags || [];
    delete productData.tags;
    
    // Créer le produit avec ses tags dans une transaction
    const product = await prisma.$transaction(async (tx) => {
      // Créer le produit
      const newProduct = await tx.product.create({
        data: productData
      });
      
      // Connecter les tags existants
      if (tagsToConnect.length > 0) {
        await tx.product.update({
          where: { id: newProduct.id },
          data: {
            tags: {
              connect: tagsToConnect.map(tagId => ({ id: tagId }))
            }
          }
        });
      }
      
      // Retourner le produit créé avec ses relations
      return tx.product.findUnique({
        where: { id: newProduct.id },
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
      'CREATE',
      'OTHER',
      product?.id,
      { 
        action: "Création d'un produit",
        name: validatedData.name,
        sku: validatedData.sku || 'Non spécifié'
      }
    );
    
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du produit:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création du produit' },
      { status: 500 }
    );
  }
} 