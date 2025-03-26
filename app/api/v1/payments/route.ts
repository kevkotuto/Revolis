import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les paiements
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'PAYMENT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les paramètres de requête
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') || undefined;
    const paymentType = searchParams.get('paymentType') || undefined;
    const clientId = searchParams.get('clientId') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const prestataireId = searchParams.get('prestataireId') || undefined;
    const search = searchParams.get('search') || '';
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const companyId = searchParams.get('companyId') || undefined;
    
    // Calculer l'offset pour la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where
    const where: any = {};
    
    // Filtrer par entreprise en utilisant les relations
    if (companyId) {
      where.OR = [
        { client: { companyId } },
        { project: { companyId } },
        { prestataire: { companyId } }
      ];
    } else if (permissionCheck.user?.companyId && permissionCheck.role !== 'SUPER_ADMIN') {
      // Si l'utilisateur n'est pas SUPER_ADMIN, limiter aux paiements de sa compagnie
      where.OR = [
        { client: { companyId: permissionCheck.user.companyId } },
        { project: { companyId: permissionCheck.user.companyId } },
        { prestataire: { companyId: permissionCheck.user.companyId } }
      ];
    }
    
    // Filtrer par statut si spécifié
    if (status) {
      where.status = status;
    }
    
    // Filtrer par type de paiement si spécifié
    if (paymentType) {
      where.paymentType = paymentType;
    }
    
    // Filtrer par client si spécifié
    if (clientId) {
      where.clientId = clientId;
    }
    
    // Filtrer par projet si spécifié
    if (projectId) {
      where.projectId = projectId;
    }
    
    // Filtrer par prestataire si spécifié
    if (prestataireId) {
      where.prestataireId = prestataireId;
    }
    
    // Filtrer par plage de dates
    if (startDate || endDate) {
      where.date = {};
      
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      
      if (endDate) {
        where.date.lte = new Date(endDate);
      }
    }
    
    // Recherche par référence
    if (search) {
      where.OR = [
        ...(where.OR || []),
        { reference: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Récupérer les paiements
    const [payments, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              companyId: true
            }
          },
          project: {
            select: {
              id: true,
              name: true,
              companyId: true
            }
          },
          prestataire: {
            select: {
              id: true,
              name: true,
              companyId: true
            }
          },
          subscription: true
        },
      }),
      prisma.payment.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'PAYMENT',
      undefined,
      { action: 'Liste des paiements', filters: { status, paymentType, clientId, projectId, prestataireId, startDate, endDate, search, companyId } }
    );
    
    return NextResponse.json({
      data: payments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des paiements:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des paiements' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau paiement
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'PAYMENT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour le paiement
    const PaymentSchema = z.object({
      paymentType: z.enum(['CLIENT', 'PRESTATAIRE', 'SUBSCRIPTION', 'OTHER']),
      amount: z.number().min(0.01, "Le montant doit être supérieur à 0"),
      date: z.string().datetime().default(() => new Date().toISOString()),
      description: z.string().optional(),
      paymentMethod: z.enum(['BANK_TRANSFER', 'CARD', 'CASH', 'CHECK', 'OTHER']).default('BANK_TRANSFER'),
      status: z.enum(['PENDING', 'PARTIAL', 'COMPLETE', 'REFUNDED', 'CANCELLED']).default('PENDING'),
      reference: z.string().optional(),
      isPartial: z.boolean().default(false),
      partNumber: z.number().optional(),
      totalParts: z.number().optional(),
      projectId: z.string().optional().nullable(),
      clientId: z.string().optional().nullable(),
      subscriptionId: z.string().optional().nullable(),
      prestataireId: z.string().optional().nullable()
    });
    
    // Valider les données
    const validationResult = PaymentSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier la cohérence des données en fonction du type de paiement
    if (validatedData.paymentType === 'CLIENT' && !validatedData.clientId) {
      return NextResponse.json(
        { error: "Un ID client est requis pour un paiement de type CLIENT" },
        { status: 400 }
      );
    }
    
    if (validatedData.paymentType === 'PRESTATAIRE' && !validatedData.prestataireId) {
      return NextResponse.json(
        { error: "Un ID prestataire est requis pour un paiement de type PRESTATAIRE" },
        { status: 400 }
      );
    }
    
    if (validatedData.paymentType === 'SUBSCRIPTION' && !validatedData.subscriptionId) {
      return NextResponse.json(
        { error: "Un ID abonnement est requis pour un paiement de type SUBSCRIPTION" },
        { status: 400 }
      );
    }
    
    // Vérifier les paiements partiels
    if (validatedData.isPartial) {
      if (!validatedData.partNumber || !validatedData.totalParts) {
        return NextResponse.json(
          { error: "Pour un paiement partiel, veuillez spécifier le numéro de la partie et le nombre total de parties" },
          { status: 400 }
        );
      }
      
      if (validatedData.partNumber > validatedData.totalParts) {
        return NextResponse.json(
          { error: "Le numéro de la partie ne peut pas être supérieur au nombre total de parties" },
          { status: 400 }
        );
      }
    }
    
    // Vérifier les relations
    let hasPermission = true;
    let companyIdRequired = null;
    
    if (validatedData.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: validatedData.clientId },
        select: { companyId: true }
      });
      
      if (!client) {
        return NextResponse.json(
          { error: "Client non trouvé" },
          { status: 404 }
        );
      }
      
      companyIdRequired = client.companyId;
    }
    
    if (validatedData.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: validatedData.projectId },
        select: { companyId: true }
      });
      
      if (!project) {
        return NextResponse.json(
          { error: "Projet non trouvé" },
          { status: 404 }
        );
      }
      
      if (companyIdRequired && companyIdRequired !== project.companyId) {
        return NextResponse.json(
          { error: "Le client et le projet doivent appartenir à la même entreprise" },
          { status: 400 }
        );
      }
      
      companyIdRequired = project.companyId;
    }
    
    if (validatedData.prestataireId) {
      const prestataire = await prisma.prestataire.findUnique({
        where: { id: validatedData.prestataireId },
        select: { companyId: true }
      });
      
      if (!prestataire) {
        return NextResponse.json(
          { error: "Prestataire non trouvé" },
          { status: 404 }
        );
      }
      
      if (companyIdRequired && companyIdRequired !== prestataire.companyId) {
        return NextResponse.json(
          { error: "Le prestataire doit appartenir à la même entreprise que le client ou le projet" },
          { status: 400 }
        );
      }
      
      companyIdRequired = prestataire.companyId;
    }
    
    // Vérifier que l'utilisateur a le droit d'accéder à cette entreprise
    if (companyIdRequired && 
        permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== companyIdRequired) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour créer un paiement pour cette entreprise" },
        { status: 403 }
      );
    }
    
    // Créer le paiement
    const payment = await prisma.payment.create({
      data: {
        paymentType: validatedData.paymentType,
        amount: validatedData.amount,
        date: new Date(validatedData.date),
        description: validatedData.description,
        paymentMethod: validatedData.paymentMethod,
        status: validatedData.status,
        reference: validatedData.reference,
        isPartial: validatedData.isPartial,
        partNumber: validatedData.partNumber,
        totalParts: validatedData.totalParts,
        projectId: validatedData.projectId,
        clientId: validatedData.clientId,
        subscriptionId: validatedData.subscriptionId,
        prestataireId: validatedData.prestataireId
      },
      include: {
        client: {
          select: {
            id: true,
            name: true
          }
        },
        project: {
          select: {
            id: true,
            name: true
          }
        },
        prestataire: {
          select: {
            id: true,
            name: true
          }
        },
        subscription: true
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'PAYMENT',
      payment.id,
      { action: 'Création d\'un paiement', paymentType: validatedData.paymentType, amount: validatedData.amount }
    );
    
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du paiement:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création du paiement' },
      { status: 500 }
    );
  }
} 