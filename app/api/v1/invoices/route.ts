import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer toutes les factures
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
    const clientId = searchParams.get('clientId') || undefined;
    const search = searchParams.get('search') || '';
    const companyId = searchParams.get('companyId') || undefined;
    
    // Calculer l'offset pour la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where
    const where: any = {};
    
    // Filtrer par compagnie si spécifié
    if (companyId) {
      where.companyId = companyId;
    } else if (permissionCheck.user?.companyId && permissionCheck.role !== 'SUPER_ADMIN') {
      // Si l'utilisateur n'est pas SUPER_ADMIN, limiter aux factures de sa compagnie
      where.companyId = permissionCheck.user.companyId;
    }
    
    // Filtrer par statut si spécifié
    if (status) {
      where.status = status;
    }
    
    // Filtrer par client si spécifié
    if (clientId) {
      where.clientId = clientId;
    }
    
    // Recherche par numéro de facture
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Récupérer les factures
    const [invoices, total] = await prisma.$transaction([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
          items: true,
          _count: {
            select: {
              items: true
            }
          }
        },
      }),
      prisma.invoice.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'INVOICE',
      undefined,
      { action: 'Liste des factures', filters: { status, clientId, search, companyId } }
    );
    
    return NextResponse.json({
      data: invoices,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des factures' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle facture
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
    
    // Définir le schéma de validation pour les items de facture
    const InvoiceItemSchema = z.object({
      description: z.string().min(2, "La description doit contenir au moins 2 caractères"),
      quantity: z.number().min(1, "La quantité doit être supérieure à 0").default(1),
      unitPrice: z.number().min(0, "Le prix unitaire ne peut pas être négatif").default(0),
      total: z.number().optional()
    });
    
    // Définir le schéma de validation pour la facture
    const InvoiceSchema = z.object({
      invoiceNumber: z.string().min(3, "Le numéro de facture doit contenir au moins 3 caractères"),
      status: z.string().default("DRAFT"),
      total: z.number().optional(),
      issueDate: z.string().datetime().default(() => new Date().toISOString()),
      dueDate: z.string().datetime().optional(),
      companyId: z.string(),
      clientId: z.string().optional().nullable(),
      fromDevisId: z.string().optional(), // ID du devis source si conversion
      items: z.array(InvoiceItemSchema).min(1, "Au moins un item est requis")
    });
    
    // Valider les données
    const validationResult = InvoiceSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier les permissions sur la compagnie
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== validatedData.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour créer une facture pour cette entreprise" },
        { status: 403 }
      );
    }
    
    // Vérifier le client si spécifié
    if (validatedData.clientId) {
      const client = await prisma.client.findFirst({
        where: { 
          id: validatedData.clientId,
          companyId: validatedData.companyId 
        }
      });
      
      if (!client) {
        return NextResponse.json(
          { error: "Client non trouvé ou n'appartient pas à cette entreprise" },
          { status: 404 }
        );
      }
    }
    
    // Vérifier le devis source si spécifié
    let devisItems = null;
    if (validatedData.fromDevisId) {
      const devis = await prisma.devis.findUnique({
        where: { id: validatedData.fromDevisId },
        include: { 
          project: { select: { companyId: true, clientId: true } },
          items: true 
        }
      });
      
      if (!devis) {
        return NextResponse.json(
          { error: "Devis source non trouvé" },
          { status: 404 }
        );
      }
      
      // Vérifier que le devis appartient à la bonne entreprise
      if (devis.project && devis.project.companyId !== validatedData.companyId) {
        return NextResponse.json(
          { error: "Vous n'avez pas les permissions pour utiliser ce devis" },
          { status: 403 }
        );
      }
      
      // Si le client n'est pas spécifié, utiliser celui du projet associé au devis
      if (!validatedData.clientId && devis.project?.clientId) {
        validatedData.clientId = devis.project.clientId;
      }
      
      devisItems = devis.items;
    }
    
    // Calculer le total de la facture si non fourni
    if (!validatedData.total) {
      validatedData.total = validatedData.items.reduce((sum, item) => {
        // Calculer le total de l'item si non fourni
        const itemTotal = item.total !== undefined ? item.total : item.quantity * item.unitPrice;
        return sum + itemTotal;
      }, 0);
    }
    
    // Utiliser une transaction pour créer la facture et ses items
    const invoice = await prisma.$transaction(async (tx) => {
      // Créer la facture
      const newInvoice = await tx.invoice.create({
        data: {
          invoiceNumber: validatedData.invoiceNumber,
          issueDate: new Date(validatedData.issueDate),
          dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
          status: validatedData.status,
          total: validatedData.total,
          companyId: validatedData.companyId,
          clientId: validatedData.clientId
        }
      });
      
      // Créer les items de la facture
      await Promise.all(validatedData.items.map(item => {
        // Calcul du total de l'item si non spécifié
        const itemTotal = item.total !== undefined ? item.total : item.quantity * item.unitPrice;
        
        return tx.invoiceItem.create({
          data: {
            invoiceId: newInvoice.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: itemTotal
          }
        });
      }));
      
      // Si la facture provient d'un devis, mettre à jour le statut du devis
      if (validatedData.fromDevisId) {
        await tx.devis.update({
          where: { id: validatedData.fromDevisId },
          data: { status: 'INVOICED' }
        });
      }
      
      // Retourner la facture avec ses items
      return tx.invoice.findUnique({
        where: { id: newInvoice.id },
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
          items: true
        }
      });
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'INVOICE',
      invoice?.id,
      { action: 'Création d\'une facture', invoiceNumber: validatedData.invoiceNumber }
    );
    
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la facture:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de la facture' },
      { status: 500 }
    );
  }
} 