import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer toutes les demandes d'approbation
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

    // Extraire les paramètres de la requête
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const requestType = searchParams.get('requestType');
    const requesterId = searchParams.get('requesterId');
    const approverId = searchParams.get('approverId');
    const companyId = searchParams.get('companyId');
    const search = searchParams.get('search') || '';

    // Configurer la pagination
    const skip = (page - 1) * limit;

    // Construire la clause where pour le filtrage
    const where: any = {};

    // Filtrer par statut
    if (status) {
      where.status = status;
    }

    // Filtrer par type de demande
    if (requestType) {
      where.requestType = requestType;
    }

    // Filtrer par demandeur
    if (requesterId) {
      where.requesterId = requesterId;
    }

    // Filtrer par approbateur
    if (approverId) {
      where.approverId = approverId;
    }

    // Filtrer par entreprise (via les utilisateurs)
    if (companyId) {
      where.OR = [
        { requester: { companyId } },
        { approver: { companyId } }
      ];
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Pour les admins d'entreprise, filtrer par leur entreprise
      where.OR = [
        { requester: { companyId: permissionCheck.user.companyId } },
        { approver: { companyId: permissionCheck.user.companyId } }
      ];
    }

    // Filtrer par recherche (sur le type de demande)
    if (search) {
      where.requestType = {
        contains: search,
        mode: 'insensitive'
      };
    }

    // Filtrer selon le rôle de l'utilisateur
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      // Les utilisateurs standards ne peuvent voir que leurs propres demandes ou celles qu'ils doivent approuver
      where.OR = [
        { requesterId: permissionCheck.user?.id },
        { approverId: permissionCheck.user?.id }
      ];
    }

    // Récupérer le nombre total pour la pagination
    const total = await prisma.approvalRequest.count({ where });

    // Récupérer les demandes d'approbation
    const approvalRequests = await prisma.approvalRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    });

    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des demandes d'approbation", filters: { status, requestType, requesterId, approverId } }
    );

    return NextResponse.json({
      items: approvalRequests,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes d\'approbation:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des demandes d\'approbation' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle demande d'approbation
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
    
    // Schéma de validation
    const ApprovalRequestSchema = z.object({
      requestType: z.string().min(1, "Type de demande requis"),
      approverId: z.string().min(1, "ID de l'approbateur requis"),
      requestData: z.record(z.any()).optional()
    });
    
    // Valider les données
    const validationResult = ApprovalRequestSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier que l'approbateur existe
    const approver = await prisma.user.findUnique({
      where: { id: validatedData.approverId },
      select: { id: true }
    });
    
    if (!approver) {
      return NextResponse.json(
        { error: "Approbateur non trouvé" },
        { status: 404 }
      );
    }
    
    // Créer la demande d'approbation
    const approvalRequest = await prisma.approvalRequest.create({
      data: {
        requestType: validatedData.requestType,
        requesterId: permissionCheck.user!.id,
        approverId: validatedData.approverId,
        status: "PENDING"
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'CREATE',
      'OTHER',
      approvalRequest.id,
      { 
        action: "Création d'une demande d'approbation",
        requestType: validatedData.requestType,
        approverId: validatedData.approverId
      }
    );
    
    return NextResponse.json(approvalRequest, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la demande d\'approbation:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de la demande d\'approbation' },
      { status: 500 }
    );
  }
} 