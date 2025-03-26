import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer toutes les opportunités
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OPPORTUNITY'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les paramètres de la requête
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const pipelineId = url.searchParams.get('pipelineId') || '';
    const stageId = url.searchParams.get('stageId') || '';
    const companyId = url.searchParams.get('companyId') || '';
    const status = url.searchParams.get('status') || '';
    const leadId = url.searchParams.get('leadId') || '';
    
    // Construire la requête
    const where: any = {};
    
    if (companyId) {
      where.companyId = companyId;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (pipelineId) {
      where.pipelineId = pipelineId;
    }
    
    if (stageId) {
      where.stageId = stageId;
    }
    
    if (status) {
      where.status = status;
    }
    
    if (leadId) {
      where.leadId = leadId;
    }
    
    // Exécuter la requête
    const skip = (page - 1) * limit;
    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          amount: true,
          status: true,
          closingDate: true,
          createdAt: true,
          updatedAt: true,
          pipelineId: true,
          stageId: true,
          leadId: true,
          lead: {
            select: {
              id: true,
              name: true,
              email: true,
            }
          },
          pipeline: {
            select: {
              id: true,
              name: true,
            }
          },
          stage: {
            select: {
              id: true,
              name: true,
              probability: true,
            }
          },
          _count: {
            select: {
              activities: true
            }
          }
        },
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.opportunity.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'OPPORTUNITY',
      undefined,
      { page, limit, search, pipelineId, stageId, status }
    );
    
    // Retourner les résultats avec pagination
    return NextResponse.json({
      opportunities,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des opportunités:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des opportunités' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle opportunité à partir d'un lead
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'OPPORTUNITY'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'une opportunité
    const opportunitySchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
      description: z.string().optional(),
      amount: z.number().nonnegative('Le montant doit être positif').optional(),
      closingDate: z.string().datetime().optional(),
      pipelineId: z.string(),
      stageId: z.string(),
      leadId: z.string(),
      companyId: z.string(),
    });
    
    // Valider les données
    const validatedData = opportunitySchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { 
      name, 
      description, 
      amount, 
      closingDate, 
      pipelineId, 
      stageId, 
      leadId, 
      companyId 
    } = validatedData.data;
    
    // Vérifier si le lead existe
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, name: true, status: true }
    });
    
    if (!lead) {
      return NextResponse.json(
        { error: 'Lead non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier si le pipeline existe
    const pipeline = await prisma.salesPipeline.findUnique({
      where: { id: pipelineId },
      select: { id: true, name: true, companyId: true }
    });
    
    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline de vente non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier si le pipeline appartient à l'entreprise
    if (pipeline.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Le pipeline ne correspond pas à l\'entreprise spécifiée' },
        { status: 400 }
      );
    }
    
    // Vérifier si l'étape existe et appartient au pipeline
    const stage = await prisma.pipelineStage.findFirst({
      where: { 
        id: stageId,
        pipelineId
      },
      select: { id: true, name: true }
    });
    
    if (!stage) {
      return NextResponse.json(
        { error: 'Étape de pipeline non trouvée ou n\'appartient pas au pipeline spécifié' },
        { status: 404 }
      );
    }
    
    // Créer l'opportunité et mettre à jour le statut du lead en une seule transaction
    const result = await prisma.$transaction(async (prisma) => {
      // Créer l'opportunité
      const newOpportunity = await prisma.opportunity.create({
        data: {
          name,
          description,
          amount,
          status: 'OPEN',
          closingDate: closingDate ? new Date(closingDate) : undefined,
          companyId,
          pipelineId,
          stageId,
          leadId,
        },
      });
      
      // Mettre à jour le statut du lead en "QUALIFIED"
      if (lead.status !== 'QUALIFIED') {
        await prisma.lead.update({
          where: { id: leadId },
          data: { status: 'QUALIFIED' },
        });
      }
      
      // Créer une activité pour la création de l'opportunité
      await prisma.activity.create({
        data: {
          companyId,
          type: 'OPPORTUNITY_CREATED',
          subject: `Nouvelle opportunité : ${name}`,
          description: `Opportunité créée à partir du lead ${lead.name}`,
          relatedTo: 'OPPORTUNITY',
          relatedId: newOpportunity.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        }
      });
      
      return newOpportunity;
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'OPPORTUNITY',
      result.id,
      { name, leadId, pipelineId, stageId, amount }
    );
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de l\'opportunité:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'opportunité' },
      { status: 500 }
    );
  }
} 