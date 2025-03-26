import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer toutes les absences
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
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') || undefined;
    const userId = searchParams.get('userId') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const type = searchParams.get('type') || undefined;
    const search = searchParams.get('search') || '';
    const companyId = searchParams.get('companyId') || undefined;
    
    // Calculer l'offset pour la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where
    const where: any = {};
    
    // Filtrer par statut si spécifié
    if (status) {
      where.status = status;
    }
    
    // Filtrer par utilisateur si spécifié
    if (userId) {
      where.userId = userId;
    } else if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      // Si l'utilisateur n'est pas administrateur, limiter aux absences de l'utilisateur
      where.userId = permissionCheck.user?.id;
    }
    
    // Filtrer par type d'absence si spécifié
    if (type) {
      where.type = type;
    }
    
    // Filtrer par plage de dates
    if (startDate || endDate) {
      where.OR = [
        // Période demandée commence pendant la période filtrée
        {
          AND: [
            startDate ? { startDate: { gte: new Date(startDate) } } : {},
            endDate ? { startDate: { lte: new Date(endDate) } } : {}
          ]
        },
        // Période demandée termine pendant la période filtrée
        {
          AND: [
            startDate ? { endDate: { gte: new Date(startDate) } } : {},
            endDate ? { endDate: { lte: new Date(endDate) } } : {}
          ]
        },
        // Période demandée inclut la période filtrée
        {
          AND: [
            startDate ? { startDate: { lte: new Date(startDate) } } : {},
            endDate ? { endDate: { gte: new Date(endDate) } } : {}
          ]
        }
      ];
    }
    
    // Recherche par raison
    if (search) {
      where.OR = [
        ...(where.OR || []),
        { reason: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Filtrer par compagnie si spécifié ou si l'utilisateur est un admin d'entreprise
    if (companyId) {
      where.user = { companyId };
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      where.user = { companyId: permissionCheck.user.companyId };
    }
    
    // Récupérer les absences
    const [absences, total] = await prisma.$transaction([
      prisma.absence.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              companyId: true,
              role: true
            }
          },
          approvalRequest: {
            include: {
              approver: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      }),
      prisma.absence.count({ where })
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      undefined,
      { action: 'Liste des absences', filters: { status, userId, startDate, endDate, type } }
    );
    
    return NextResponse.json({
      data: absences,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des absences:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des absences' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle absence
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
    
    // Définir le schéma de validation pour l'absence
    const AbsenceSchema = z.object({
      startDate: z.string().datetime({ message: "La date de début doit être une date valide" }),
      endDate: z.string().datetime({ message: "La date de fin doit être une date valide" }),
      type: z.string({ message: "Le type d'absence est requis" }),
      reason: z.string().min(3, { message: "La raison doit contenir au moins 3 caractères" }).optional(),
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
      userId: z.string().optional(),
      needsApproval: z.boolean().default(true),
      approverId: z.string().optional()
    });
    
    // Valider les données
    const validationResult = AbsenceSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier les dates
    const startDate = new Date(validatedData.startDate);
    const endDate = new Date(validatedData.endDate);
    
    if (startDate > endDate) {
      return NextResponse.json(
        { error: "La date de début doit être antérieure à la date de fin" },
        { status: 400 }
      );
    }
    
    // Définir l'utilisateur pour lequel l'absence est créée
    let userId = validatedData.userId;
    
    // Si aucun userId n'est fourni, utiliser l'ID de l'utilisateur actuel
    if (!userId) {
      userId = permissionCheck.user?.id;
    } 
    // Si un userId est fourni et qu'il est différent de l'utilisateur actuel, vérifier les permissions
    else if (userId !== permissionCheck.user?.id) {
      // Seuls les admins peuvent créer des absences pour d'autres utilisateurs
      if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
        return NextResponse.json(
          { error: "Vous n'avez pas les permissions pour créer une absence pour un autre utilisateur" },
          { status: 403 }
        );
      }
      
      // Vérifier que l'utilisateur existe et appartient à la même entreprise (pour COMPANY_ADMIN)
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, companyId: true }
      });
      
      if (!targetUser) {
        return NextResponse.json(
          { error: "Utilisateur non trouvé" },
          { status: 404 }
        );
      }
      
      if (permissionCheck.role === 'COMPANY_ADMIN' && 
          targetUser.companyId !== permissionCheck.user?.companyId) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas créer une absence pour un utilisateur d'une autre entreprise" },
          { status: 403 }
        );
      }
    }
    
    // Créer l'absence en utilisant une transaction pour gérer également la demande d'approbation si nécessaire
    const absence = await prisma.$transaction(async (tx) => {
      // Créer l'absence
      const newAbsence = await tx.absence.create({
        data: {
          startDate,
          endDate,
          type: validatedData.type,
          reason: validatedData.reason,
          status: validatedData.status,
          userId: userId!
        }
      });
      
      // Si une approbation est nécessaire et qu'un approbateur est spécifié
      if (validatedData.needsApproval && validatedData.approverId) {
        // Créer une demande d'approbation
        await tx.approvalRequest.create({
          data: {
            type: 'ABSENCE',
            status: 'PENDING',
            requesterId: userId!,
            approverId: validatedData.approverId,
            resourceId: newAbsence.id,
            details: JSON.stringify({
              type: validatedData.type,
              startDate: validatedData.startDate,
              endDate: validatedData.endDate,
              reason: validatedData.reason
            })
          }
        });
      }
      
      // Retourner l'absence créée avec les relations
      return tx.absence.findUnique({
        where: { id: newAbsence.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          approvalRequest: true
        }
      });
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'OTHER',
      absence?.id,
      { action: 'Création d\'une absence', type: validatedData.type, dates: `${startDate.toISOString()} - ${endDate.toISOString()}` }
    );
    
    return NextResponse.json(absence, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de l\'absence:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de l\'absence' },
      { status: 500 }
    );
  }
} 