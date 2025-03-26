import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../../lib/middleware/permissions';

// POST - Convertir une opportunité en client
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'OPPORTUNITY'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const opportunityId = params.id;
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la conversion
    const convertSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères').optional(),
      notes: z.string().optional(),
    });
    
    // Valider les données
    const validatedData = convertSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { name, notes } = validatedData.data;
    
    // Récupérer l'opportunité avec les informations associées
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        lead: true,
        company: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });
    
    if (!opportunity) {
      return NextResponse.json(
        { error: 'Opportunité non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'opportunité n'est pas déjà fermée
    if (opportunity.status === 'WON' || opportunity.status === 'LOST') {
      return NextResponse.json(
        { error: 'Cette opportunité est déjà fermée' },
        { status: 400 }
      );
    }
    
    // Effectuer la conversion en une seule transaction
    const result = await prisma.$transaction(async (prisma) => {
      // Créer le client
      const client = await prisma.client.create({
        data: {
          name: name || opportunity.lead?.name || '',
          email: opportunity.lead?.email || '',
          phone: opportunity.lead?.phone || '',
          companyId: opportunity.companyId,
          notes: notes || '',
        },
      });
      
      // Mettre à jour le lead pour indiquer qu'il a été converti en client
      await prisma.lead.update({
        where: { id: opportunity.leadId },
        data: {
          status: 'CONVERTED',
          convertedToClientId: client.id,
        },
      });
      
      // Mettre à jour l'opportunité pour indiquer qu'elle a été gagnée
      await prisma.opportunity.update({
        where: { id: opportunityId },
        data: {
          status: 'WON',
          clientId: client.id,
        },
      });
      
      // Créer une activité pour la conversion
      await prisma.activity.create({
        data: {
          companyId: opportunity.companyId,
          type: 'CLIENT_CONVERTED',
          subject: `Nouveau client : ${client.name}`,
          description: `Client créé à partir de l'opportunité ${opportunity.name}`,
          relatedTo: 'CLIENT',
          relatedId: client.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        }
      });
      
      return {
        client,
        opportunity: {
          ...opportunity,
          status: 'WON',
          clientId: client.id
        },
        lead: {
          ...opportunity.lead,
          status: 'CONVERTED',
          convertedToClientId: client.id
        }
      };
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CONVERT',
      'OPPORTUNITY',
      opportunityId,
      { clientId: result.client.id, leadId: opportunity.leadId }
    );
    
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Erreur lors de la conversion de l\'opportunité en client:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la conversion de l\'opportunité en client' },
      { status: 500 }
    );
  }
} 