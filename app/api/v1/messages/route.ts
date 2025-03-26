import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// POST - Créer un nouveau message
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
    
    // Si l'utilisateur n'est pas connecté, impossible d'envoyer un message
    if (!permissionCheck.user?.id) {
      return NextResponse.json(
        { error: "Utilisateur non authentifié" },
        { status: 401 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation des données du message
    const MessageSchema = z.object({
      conversationId: z.string({ message: "ID de conversation requis" }),
      content: z.string().min(1, { message: "Contenu du message requis" }),
      attachments: z.array(z.string()).optional(),
      isSystemMessage: z.boolean().default(false)
    });
    
    // Valider les données
    const validationResult = MessageSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier que la conversation existe
    const conversation = await prisma.conversation.findUnique({
      where: { id: validatedData.conversationId },
      include: {
        participants: true
      }
    });
    
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur participe à cette conversation
    const isParticipant = conversation.participants.some(p => p.userId === permissionCheck.user?.id);
    
    if (!isParticipant && permissionCheck.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'êtes pas membre de cette conversation" },
        { status: 403 }
      );
    }
    
    // Vérifier les permissions basées sur l'entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user.companyId && 
        conversation.companyId !== permissionCheck.user.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour envoyer un message dans cette conversation" },
        { status: 403 }
      );
    }
    
    // Les messages système ne peuvent être envoyés que par des admins
    if (validatedData.isSystemMessage && 
        permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour envoyer un message système" },
        { status: 403 }
      );
    }
    
    // Créer le message et mettre à jour la conversation dans une transaction
    const result = await prisma.$transaction(async (tx) => {
      // Créer le message
      const message = await tx.message.create({
        data: {
          conversationId: validatedData.conversationId,
          senderId: permissionCheck.user!.id,
          content: validatedData.content,
          isSystemMessage: validatedData.isSystemMessage,
          attachments: validatedData.attachments || []
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          }
        }
      });
      
      // Mettre à jour la dernière activité de la conversation
      await tx.conversation.update({
        where: { id: validatedData.conversationId },
        data: { updatedAt: new Date() }
      });
      
      // Mettre à jour le marqueur de lecture pour l'expéditeur
      await tx.conversationParticipant.updateMany({
        where: {
          conversationId: validatedData.conversationId,
          userId: permissionCheck.user!.id
        },
        data: {
          lastReadAt: new Date()
        }
      });
      
      return message;
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user.id,
      'CREATE',
      'OTHER',
      result.id,
      { 
        action: "Envoi d'un message",
        conversationId: validatedData.conversationId,
        isSystemMessage: validatedData.isSystemMessage
      }
    );
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de l\'envoi du message:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de l\'envoi du message' },
      { status: 500 }
    );
  }
} 