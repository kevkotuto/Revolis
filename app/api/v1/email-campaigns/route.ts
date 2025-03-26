import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer toutes les campagnes email
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
    const companyId = url.searchParams.get('companyId') || '';
    const status = url.searchParams.get('status') || '';
    
    // Construire la requête
    const where: any = {};
    
    if (companyId) {
      where.companyId = companyId;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (status) {
      where.status = status;
    }
    
    // Exécuter la requête
    const skip = (page - 1) * limit;
    const [campaigns, total] = await Promise.all([
      prisma.emailCampaign.findMany({
        where,
        select: {
          id: true,
          name: true,
          subject: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              recipients: true
            }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.emailCampaign.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'OTHER',
      undefined,
      { page, limit, search, companyId, status }
    );
    
    // Retourner les résultats avec pagination
    return NextResponse.json({
      campaigns,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des campagnes email:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des campagnes email' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle campagne email
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
    
    // Schéma de validation pour la création d'une campagne email
    const campaignSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
      subject: z.string().min(2, 'Le sujet doit comporter au moins 2 caractères'),
      body: z.string().min(10, 'Le corps du mail doit comporter au moins 10 caractères'),
      companyId: z.string(),
      scheduledAt: z.string().datetime().optional(),
      status: z.enum(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELED']).default('DRAFT'),
      mailingListIds: z.array(z.string()).optional(),
      contactIds: z.array(z.string()).optional(),
    });
    
    // Valider les données
    const validatedData = campaignSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { 
      name, 
      subject, 
      body: emailBody, 
      companyId, 
      scheduledAt, 
      status,
      mailingListIds,
      contactIds
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
    
    // Créer la campagne et ajouter les destinataires en une seule transaction
    const result = await prisma.$transaction(async (tx) => {
      // Créer la campagne
      const campaign = await tx.emailCampaign.create({
        data: {
          name,
          subject,
          body: emailBody,
          companyId,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          status,
        },
      });
      
      let recipientsCount = 0;
      
      // Ajouter les contacts à partir des mailing lists
      if (mailingListIds && mailingListIds.length > 0) {
        // Récupérer tous les contacts des mailing lists spécifiées
        const contacts = await tx.contact.findMany({
          where: {
            mailingListId: { in: mailingListIds },
            companyId,
          },
          select: { id: true }
        });
        
        // Créer les destinataires pour tous les contacts trouvés
        if (contacts.length > 0) {
          const recipients = await Promise.all(
            contacts.map(contact => 
              tx.campaignRecipient.create({
                data: {
                  emailCampaignId: campaign.id,
                  contactId: contact.id,
                  status: 'PENDING'
                }
              })
            )
          );
          
          recipientsCount += recipients.length;
        }
      }
      
      // Ajouter les contacts individuels
      if (contactIds && contactIds.length > 0) {
        // Vérifier que les contacts spécifiés existent et appartiennent à l'entreprise
        const contacts = await tx.contact.findMany({
          where: {
            id: { in: contactIds },
            companyId,
          },
          select: { id: true }
        });
        
        const validContactIds = contacts.map(c => c.id);
        
        if (validContactIds.length > 0) {
          const recipients = await Promise.all(
            validContactIds.map(contactId => 
              tx.campaignRecipient.create({
                data: {
                  emailCampaignId: campaign.id,
                  contactId,
                  status: 'PENDING'
                }
              })
            )
          );
          
          recipientsCount += recipients.length;
        }
      }
      
      return { campaign, recipientsCount };
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'OTHER',
      result.campaign.id,
      { name, subject, status, recipientsCount: result.recipientsCount }
    );
    
    return NextResponse.json({
      ...result.campaign,
      recipientsCount: result.recipientsCount
    }, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la campagne email:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de la campagne email' },
      { status: 500 }
    );
  }
} 