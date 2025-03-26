import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer toutes les activités
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
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const type = url.searchParams.get('type') || '';
    const status = url.searchParams.get('status') || '';
    const companyId = url.searchParams.get('companyId') || '';
    const relatedTo = url.searchParams.get('relatedTo') || '';
    const relatedId = url.searchParams.get('relatedId') || '';
    const userId = url.searchParams.get('userId') || '';
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    
    // Construire la requête
    const where: any = {};
    
    if (companyId) {
      where.companyId = companyId;
    }
    
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (type) {
      where.type = type;
    }
    
    if (status) {
      where.status = status;
    }
    
    if (relatedTo) {
      where.relatedTo = relatedTo;
    }
    
    if (relatedId) {
      where.relatedId = relatedId;
    }
    
    if (userId) {
      where.userId = userId;
    }
    
    if (startDate || endDate) {
      where.scheduledAt = {};
      
      if (startDate) {
        where.scheduledAt.gte = new Date(startDate);
      }
      
      if (endDate) {
        where.scheduledAt.lte = new Date(endDate);
      }
    }
    
    // Exécuter la requête
    const skip = (page - 1) * limit;
    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        select: {
          id: true,
          type: true,
          subject: true,
          description: true,
          status: true,
          scheduledAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          relatedTo: true,
          relatedId: true,
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            }
          }
        },
        skip,
        take: limit,
        orderBy: [
          { scheduledAt: 'desc' },
          { createdAt: 'desc' }
        ],
      }),
      prisma.activity.count({ where }),
    ]);
    
    // Ajouter les données liées (leads, opportunités, etc.) si necessaire
    const activitiesWithRelated = await Promise.all(
      activities.map(async (activity) => {
        let relatedData = null;
        
        if (activity.relatedTo === 'LEAD' && activity.relatedId) {
          relatedData = await prisma.lead.findUnique({
            where: { id: activity.relatedId },
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
            }
          });
        } else if (activity.relatedTo === 'OPPORTUNITY' && activity.relatedId) {
          relatedData = await prisma.opportunity.findUnique({
            where: { id: activity.relatedId },
            select: {
              id: true,
              name: true,
              status: true,
              amount: true,
            }
          });
        } else if (activity.relatedTo === 'CLIENT' && activity.relatedId) {
          relatedData = await prisma.client.findUnique({
            where: { id: activity.relatedId },
            select: {
              id: true,
              name: true,
              email: true,
            }
          });
        }
        
        return {
          ...activity,
          relatedData,
        };
      })
    );
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'OTHER',
      undefined,
      { page, limit, type, status, relatedTo }
    );
    
    // Retourner les résultats avec pagination
    return NextResponse.json({
      activities: activitiesWithRelated,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des activités:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des activités' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle activité
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
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'une activité
    const activitySchema = z.object({
      type: z.enum(['CALL', 'EMAIL', 'MEETING', 'TASK', 'NOTE', 'LEAD_CREATED', 'OPPORTUNITY_CREATED', 'CLIENT_CONVERTED']),
      subject: z.string().min(2, 'Le sujet doit comporter au moins 2 caractères'),
      description: z.string().optional(),
      status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PLANNED'),
      scheduledAt: z.string().datetime().optional(),
      completedAt: z.string().datetime().optional(),
      relatedTo: z.enum(['LEAD', 'OPPORTUNITY', 'CLIENT']),
      relatedId: z.string(),
      companyId: z.string(),
      userId: z.string().optional(),
    });
    
    // Valider les données
    const validatedData = activitySchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { 
      type, 
      subject, 
      description, 
      status, 
      scheduledAt, 
      completedAt, 
      relatedTo, 
      relatedId, 
      companyId,
      userId
    } = validatedData.data;
    
    // Vérifier si l'entreprise existe
    const companyExists = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true }
    });
    
    if (!companyExists) {
      return NextResponse.json(
        { error: 'Entreprise non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier si l'entité associée existe
    let entityExists = false;
    
    if (relatedTo === 'LEAD') {
      const lead = await prisma.lead.findUnique({
        where: { id: relatedId },
        select: { id: true, companyId: true }
      });
      
      if (!lead) {
        return NextResponse.json(
          { error: 'Lead non trouvé' },
          { status: 404 }
        );
      }
      
      if (lead.companyId !== companyId) {
        return NextResponse.json(
          { error: 'Le lead n\'appartient pas à l\'entreprise spécifiée' },
          { status: 400 }
        );
      }
      
      entityExists = true;
    } else if (relatedTo === 'OPPORTUNITY') {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: relatedId },
        select: { id: true, companyId: true }
      });
      
      if (!opportunity) {
        return NextResponse.json(
          { error: 'Opportunité non trouvée' },
          { status: 404 }
        );
      }
      
      if (opportunity.companyId !== companyId) {
        return NextResponse.json(
          { error: 'L\'opportunité n\'appartient pas à l\'entreprise spécifiée' },
          { status: 400 }
        );
      }
      
      entityExists = true;
    } else if (relatedTo === 'CLIENT') {
      const client = await prisma.client.findUnique({
        where: { id: relatedId },
        select: { id: true, companyId: true }
      });
      
      if (!client) {
        return NextResponse.json(
          { error: 'Client non trouvé' },
          { status: 404 }
        );
      }
      
      if (client.companyId !== companyId) {
        return NextResponse.json(
          { error: 'Le client n\'appartient pas à l\'entreprise spécifiée' },
          { status: 400 }
        );
      }
      
      entityExists = true;
    }
    
    if (!entityExists) {
      return NextResponse.json(
        { error: 'Entité associée non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier si l'utilisateur assigné existe
    if (userId) {
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });
      
      if (!userExists) {
        return NextResponse.json(
          { error: 'Utilisateur assigné non trouvé' },
          { status: 404 }
        );
      }
    }
    
    // Créer l'activité
    const newActivity = await prisma.activity.create({
      data: {
        type,
        subject,
        description,
        status,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        completedAt: completedAt ? new Date(completedAt) : undefined,
        relatedTo,
        relatedId,
        companyId,
        userId,
      },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'OTHER',
      newActivity.id,
      { type, subject, relatedTo, relatedId }
    );
    
    return NextResponse.json(newActivity, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de l\'activité:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'activité' },
      { status: 500 }
    );
  }
} 