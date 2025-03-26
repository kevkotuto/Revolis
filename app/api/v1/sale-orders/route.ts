import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les bons de vente
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
    const status = searchParams.get('status');
    const search = searchParams.get('search') || '';
    const clientId = searchParams.get('clientId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const minTotal = searchParams.get('minTotal') ? parseFloat(searchParams.get('minTotal')!) : undefined;
    const maxTotal = searchParams.get('maxTotal') ? parseFloat(searchParams.get('maxTotal')!) : undefined;
    const paymentStatus = searchParams.get('paymentStatus');

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
    
    // Filtre par statut
    if (status) {
      where.status = status;
    }
    
    // Filtre par statut de paiement
    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }
    
    // Filtre par client
    if (clientId) {
      where.clientId = clientId;
    }
    
    // Filtre par plage de dates
    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) {
        where.orderDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.orderDate.lte = new Date(endDate);
      }
    }
    
    // Filtre par plage de montant total
    if (minTotal !== undefined || maxTotal !== undefined) {
      where.total = {};
      if (minTotal !== undefined) {
        where.total.gte = minTotal;
      }
      if (maxTotal !== undefined) {
        where.total.lte = maxTotal;
      }
    }
    
    // Filtre de recherche (référence, description)
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Récupérer le nombre total de bons de vente pour pagination
    const total = await prisma.saleOrder.count({ where });
    
    // Récupérer les bons de vente
    const saleOrders = await prisma.saleOrder.findMany({
      where,
      include: {
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
        },
        lines: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true
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
        },
        payments: {
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            method: true,
            reference: true
          }
        }
      },
      skip,
      take: limit,
      orderBy: { orderDate: 'desc' }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des bons de vente", filters: { companyId, status, clientId, startDate, endDate, search, paymentStatus } }
    );
    
    return NextResponse.json({
      items: saleOrders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des bons de vente:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des bons de vente' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau bon de vente
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
    
    // Schéma de validation pour la ligne de vente
    const SaleOrderLineSchema = z.object({
      productId: z.string({ message: "ID du produit requis" }),
      quantity: z.number().positive({ message: "La quantité doit être positive" }),
      unitPrice: z.number().nonnegative({ message: "Le prix unitaire doit être positif ou nul" }),
      taxRate: z.number().nonnegative({ message: "Le taux de taxe doit être positif ou nul" }).optional(),
      description: z.string().optional(),
      discount: z.number().nonnegative({ message: "La remise doit être positive ou nulle" }).optional()
    });
    
    // Schéma de validation pour le paiement initial (optionnel)
    const InitialPaymentSchema = z.object({
      amount: z.number().positive({ message: "Le montant doit être positif" }),
      method: z.string({ message: "La méthode de paiement est requise" }),
      reference: z.string().optional(),
      notes: z.string().optional()
    }).optional();
    
    // Schéma de validation pour le bon de vente
    const SaleOrderSchema = z.object({
      clientId: z.string({ message: "ID du client requis" }),
      reference: z.string().optional(),
      description: z.string().optional(),
      orderDate: z.string().datetime().default(() => new Date().toISOString()),
      expectedDeliveryDate: z.string().datetime().optional(),
      status: z.string().default('DRAFT'),
      paymentStatus: z.string().default('PENDING'),
      paymentMethod: z.string().optional(),
      paymentTerms: z.string().optional(),
      notes: z.string().optional(),
      companyId: z.string().optional(),
      shippingAddress: z.string().optional(),
      billingAddress: z.string().optional(),
      total: z.number().nonnegative().optional(),
      subtotal: z.number().nonnegative().optional(),
      taxTotal: z.number().nonnegative().optional(),
      discountTotal: z.number().nonnegative().optional(),
      dueDate: z.string().datetime().optional(),
      lines: z.array(SaleOrderLineSchema).min(1, { message: "Au moins une ligne de vente est requise" }),
      initialPayment: InitialPaymentSchema
    });
    
    // Valider les données
    const validationResult = SaleOrderSchema.safeParse(data);
    
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
        { error: "Vous ne pouvez pas créer un bon de vente pour une autre entreprise" },
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
    
    // Vérifier que le client existe et appartient à la bonne entreprise
    const client = await prisma.client.findUnique({
      where: { id: validatedData.clientId }
    });
    
    if (!client) {
      return NextResponse.json(
        { error: "Client non trouvé" },
        { status: 404 }
      );
    }
    
    // Vérifier que le client appartient à la bonne entreprise
    if (companyId && client.companyId !== companyId) {
      return NextResponse.json(
        { error: "Le client n'appartient pas à votre entreprise" },
        { status: 403 }
      );
    }
    
    // Vérifier que tous les produits existent et appartiennent à la bonne entreprise
    const productIds = validatedData.lines.map(line => line.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds }
      },
      select: {
        id: true,
        companyId: true,
        name: true
      }
    });
    
    // Vérifier que tous les produits existent
    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "Certains produits n'existent pas" },
        { status: 404 }
      );
    }
    
    // Vérifier que tous les produits appartiennent à la bonne entreprise
    if (companyId) {
      const invalidProducts = products.filter(product => product.companyId && product.companyId !== companyId);
      
      if (invalidProducts.length > 0) {
        return NextResponse.json(
          { error: "Certains produits n'appartiennent pas à votre entreprise" },
          { status: 403 }
        );
      }
    }
    
    // Calculer les totaux si non fournis
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    
    validatedData.lines.forEach(line => {
      const lineSubtotal = line.quantity * line.unitPrice;
      const lineDiscount = line.discount || 0;
      const lineTax = (lineSubtotal - lineDiscount) * (line.taxRate || 0) / 100;
      
      subtotal += lineSubtotal;
      discountTotal += lineDiscount;
      taxTotal += lineTax;
    });
    
    const total = subtotal - discountTotal + taxTotal;
    
    // Vérifier si le paiement initial est supérieur au total
    if (validatedData.initialPayment && validatedData.initialPayment.amount > total) {
      return NextResponse.json(
        { error: "Le montant du paiement initial ne peut pas être supérieur au montant total de la commande" },
        { status: 400 }
      );
    }
    
    // Calculer le statut de paiement en fonction du paiement initial
    let paymentStatus = validatedData.paymentStatus;
    
    if (validatedData.initialPayment) {
      if (validatedData.initialPayment.amount === total) {
        paymentStatus = 'PAID';
      } else if (validatedData.initialPayment.amount > 0) {
        paymentStatus = 'PARTIAL';
      }
    }
    
    // Préparer les données pour la création
    const saleOrderData = {
      ...validatedData,
      companyId,
      userId: permissionCheck.user?.id,
      orderDate: new Date(validatedData.orderDate),
      expectedDeliveryDate: validatedData.expectedDeliveryDate ? new Date(validatedData.expectedDeliveryDate) : null,
      dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
      subtotal: validatedData.subtotal || subtotal,
      taxTotal: validatedData.taxTotal || taxTotal,
      discountTotal: validatedData.discountTotal || discountTotal,
      total: validatedData.total || total,
      paymentStatus,
      lines: {
        create: validatedData.lines.map(line => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate || 0,
          description: line.description,
          discount: line.discount || 0,
          subtotal: line.quantity * line.unitPrice,
          total: (line.quantity * line.unitPrice) - (line.discount || 0) + ((line.quantity * line.unitPrice - (line.discount || 0)) * (line.taxRate || 0) / 100)
        }))
      }
    };
    
    // Supprimer les champs qui ne sont pas directement utilisés dans la création
    delete saleOrderData.lines;
    delete saleOrderData.initialPayment;
    
    // Créer le bon de vente et ses lignes dans une transaction
    const saleOrder = await prisma.$transaction(async (tx) => {
      // Créer d'abord le bon de vente
      const newSaleOrder = await tx.saleOrder.create({
        data: {
          ...saleOrderData,
          lines: {
            create: validatedData.lines.map(line => ({
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate || 0,
              description: line.description,
              discount: line.discount || 0,
              subtotal: line.quantity * line.unitPrice,
              total: (line.quantity * line.unitPrice) - (line.discount || 0) + ((line.quantity * line.unitPrice - (line.discount || 0)) * (line.taxRate || 0) / 100)
            }))
          }
        }
      });
      
      // Si un paiement initial est spécifié, le créer
      if (validatedData.initialPayment) {
        await tx.payment.create({
          data: {
            saleOrderId: newSaleOrder.id,
            clientId: validatedData.clientId,
            amount: validatedData.initialPayment.amount,
            method: validatedData.initialPayment.method,
            reference: validatedData.initialPayment.reference,
            notes: validatedData.initialPayment.notes,
            paymentDate: new Date(),
            companyId,
            status: 'COMPLETED',
            userId: permissionCheck.user?.id
          }
        });
      }
      
      // Si le statut est DELIVERED, créer automatiquement les mouvements de stock
      if (validatedData.status === 'DELIVERED') {
        for (const line of validatedData.lines) {
          const product = products.find(p => p.id === line.productId);
          
          await tx.stockMovement.create({
            data: {
              productId: line.productId,
              warehouseId: '1', // TODO: Configurer l'ID de l'entrepôt par défaut
              quantity: -line.quantity, // Négatif pour une sortie de stock
              reason: `Livraison de commande client ${client.name}`,
              reference: newSaleOrder.reference || `BV-${newSaleOrder.id}`,
              unitPrice: line.unitPrice,
              saleOrderId: newSaleOrder.id,
              notes: `Produit: ${product?.name}, Qté: ${line.quantity}`,
              userId: permissionCheck.user?.id
            }
          });
        }
      }
      
      // Retourner le bon de vente créé avec ses relations
      return tx.saleOrder.findUnique({
        where: { id: newSaleOrder.id },
        include: {
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
          },
          lines: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true
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
          },
          payments: {
            select: {
              id: true,
              amount: true,
              paymentDate: true,
              method: true,
              reference: true
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
      saleOrder?.id,
      { 
        action: "Création d'un bon de vente",
        client: client.name,
        reference: validatedData.reference || 'N/A',
        montant: total,
        statut: validatedData.status,
        statutPaiement: paymentStatus
      }
    );
    
    return NextResponse.json(saleOrder, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du bon de vente:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création du bon de vente' },
      { status: 500 }
    );
  }
} 