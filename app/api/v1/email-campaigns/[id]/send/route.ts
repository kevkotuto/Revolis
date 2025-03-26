import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../../lib/middleware/permissions';
import { sendEmail } from '@/lib/services/email-service';

// POST - Déclencher l'envoi d'une campagne email
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const campaignId = params.id;
    
    // Récupérer la campagne avec ses destinataires
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: {
        recipients: {
          include: {
            contact: true
          }
        }
      }
    });
    
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campagne email non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier si la campagne est dans un état permettant l'envoi
    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      return NextResponse.json(
        { error: `Impossible d'envoyer une campagne avec le statut ${campaign.status}` },
        { status: 400 }
      );
    }
    
    // Vérifier s'il y a des destinataires
    if (campaign.recipients.length === 0) {
      return NextResponse.json(
        { error: 'Cette campagne n\'a pas de destinataires' },
        { status: 400 }
      );
    }
    
    // Mettre à jour le statut de la campagne
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING' }
    });
    
    // Déclencher l'envoi des emails (de manière asynchrone)
    const emailPromises = campaign.recipients.map(async (recipient) => {
      if (!recipient.contact || !recipient.contact.email) {
        return prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'FAILED' }
        });
      }
      
      try {
        // Envoi de l'email
        await sendEmail({
          to: recipient.contact.email,
          subject: campaign.subject,
          html: campaign.body
        });
        
        // Mise à jour du statut du destinataire
        return prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'SENT' }
        });
      } catch (error) {
        console.error(`Erreur lors de l'envoi à ${recipient.contact.email}:`, error);
        
        // Mise à jour du statut en échec
        return prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { 
            status: 'FAILED',
            error: error instanceof Error ? error.message : 'Erreur inconnue'
          }
        });
      }
    });
    
    // Attendre tous les envois pour fournir un résultat
    const results = await Promise.allSettled(emailPromises);
    
    // Compter les résultats
    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    // Mettre à jour le statut final de la campagne
    const finalStatus = failed === campaign.recipients.length ? 'FAILED' : 
                       sent === campaign.recipients.length ? 'SENT' : 'PARTIALLY_SENT';
    
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: finalStatus }
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'SEND',
      'OTHER',
      campaignId,
      { sent, failed, totalRecipients: campaign.recipients.length }
    );
    
    return NextResponse.json({
      message: `Campagne email envoyée avec statut ${finalStatus}`,
      stats: {
        total: campaign.recipients.length,
        sent,
        failed
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la campagne email:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'envoi de la campagne email' },
      { status: 500 }
    );
  }
} 