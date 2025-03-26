import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une conversation spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Si l'utilisateur n'est pas connecté, impossible d'accéder à la conversation
    if (!permissionCheck.user?.id) {
      return NextResponse.json(
        { error: "Utilisateur non authentifié" },
        { status: 401 }
      );
    }
    
    const id = params.id;
    
    // Vérifier que l'utilisateur participe à cette conversation
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: id,
        userId: permissionCheck.user.id
      }
    });
    
    if (!participant) {
      return NextResponse.json(
        { error: "Vous n'êtes pas membre de cette conversation" },
        { status: 403 }
      );
    }
    
    // Récupérer la conversation avec ses messages
    const { searchParams } = new URL(request.url);
    const messagesLimit = parseInt(searchParams.get('messagesLimit') || '50');
    const messagesPage = parseInt(searchParams.get('messagesPage') || '1');
    const messagesSkip = (messagesPage - 1) * messagesLimit;
    
    // Récupérer la conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            }
          }
        }
      }
    });
    
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier les permissions basées sur l'entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user.companyId && 
        conversation.companyId !== permissionCheck.user.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour accéder à cette conversation" },
        { status: 403 }
      );
    }
    
    // Récupérer les messages pour cette conversation
    const totalMessages = await prisma.message.count({
      where: { conversationId: id }
    });
    
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      skip: messagesSkip,
      take: messagesLimit,
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
    
    // Mettre à jour le marqueur de lecture pour l'utilisateur
    await prisma.conversationParticipant.updateMany({
      where: {
        conversationId: id,
        userId: permissionCheck.user.id
      },
      data: {
        lastReadAt: new Date()
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user.id,
      'READ',
      'OTHER',
      id,
      { action: "Consultation d'une conversation", conversationName: conversation.name }
    );
    
    return NextResponse.json({
      conversation,
      messages: {
        items: messages,
        pagination: {
          total: totalMessages,
          page: messagesPage,
          limit: messagesLimit,
          totalPages: Math.ceil(totalMessages / messagesLimit)
        }
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la conversation:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de la conversation' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une conversation
export async function PATCH(
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
    
    // Si l'utilisateur n'est pas connecté, impossible de modifier la conversation
    if (!permissionCheck.user?.id) {
      return NextResponse.json(
        { error: "Utilisateur non authentifié" },
        { status: 401 }
      );
    }
    
    const id = params.id;
    
    // Récupérer la conversation existante
    const conversation = await prisma.conversation.findUnique({
      where: { id },
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
        { error: "Vous n'avez pas les permissions pour modifier cette conversation" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation pour la mise à jour de la conversation
    const ConversationUpdateSchema = z.object({
      name: z.string().optional(),
      addParticipants: z.array(z.string()).optional(),
      removeParticipants: z.array(z.string()).optional()
    });
    
    // Valider les données
    const validationResult = ConversationUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Mise à jour de la conversation dans une transaction
    const updatedConversation = await prisma.$transaction(async (tx) => {
      // Mettre à jour le nom si fourni
      if (validatedData.name) {
        await tx.conversation.update({
          where: { id },
          data: { name: validatedData.name }
        });
      }
      
      // Ajouter des participants si spécifiés
      if (validatedData.addParticipants && validatedData.addParticipants.length > 0) {
        // Vérifier que les utilisateurs existent
        const users = await tx.user.findMany({
          where: { id: { in: validatedData.addParticipants } },
          select: { id: true }
        });
        
        if (users.length !== validatedData.addParticipants.length) {
          throw new Error("Certains utilisateurs à ajouter n'existent pas");
        }
        
        // Vérifier que les utilisateurs ne sont pas déjà participants
        const existingParticipants = conversation.participants.map(p => p.userId);
        const newParticipants = validatedData.addParticipants.filter(
          userId => !existingParticipants.includes(userId)
        );
        
        if (newParticipants.length > 0) {
          // Ajouter les nouveaux participants
          await tx.conversationParticipant.createMany({
            data: newParticipants.map(userId => ({
              conversationId: id,
              userId,
              lastReadAt: new Date()
            })),
            skipDuplicates: true
          });
          
          // Ajouter un message système pour informer de l'ajout
          await tx.message.create({
            data: {
              conversationId: id,
              senderId: permissionCheck.user.id,
              content: `${permissionCheck.user.name} a ajouté ${newParticipants.length} participant(s) à la conversation`,
              isSystemMessage: true
            }
          });
        }
      }
      
      // Supprimer des participants si spécifiés
      if (validatedData.removeParticipants && validatedData.removeParticipants.length > 0) {
        // Ne pas permettre de supprimer l'utilisateur actuel
        const participantsToRemove = validatedData.removeParticipants.filter(
          userId => userId !== permissionCheck.user?.id
        );
        
        // Pour les conversations directes, ne pas permettre de supprimer des participants
        if (conversation.isDirectMessage && participantsToRemove.length > 0) {
          throw new Error("Impossible de supprimer des participants d'une conversation directe");
        }
        
        // Vérifier qu'il reste au moins un participant après suppression
        const existingParticipants = conversation.participants.map(p => p.userId);
        const remainingParticipants = existingParticipants.filter(
          userId => !participantsToRemove.includes(userId)
        );
        
        if (remainingParticipants.length < 1) {
          throw new Error("La conversation doit avoir au moins un participant");
        }
        
        if (participantsToRemove.length > 0) {
          // Supprimer les participants
          await tx.conversationParticipant.deleteMany({
            where: {
              conversationId: id,
              userId: { in: participantsToRemove }
            }
          });
          
          // Ajouter un message système pour informer de la suppression
          await tx.message.create({
            data: {
              conversationId: id,
              senderId: permissionCheck.user.id,
              content: `${permissionCheck.user.name} a retiré ${participantsToRemove.length} participant(s) de la conversation`,
              isSystemMessage: true
            }
          });
        }
      }
      
      // Retourner la conversation mise à jour avec ses relations
      return tx.conversation.findUnique({
        where: { id },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true
                }
              }
            }
          },
          messages: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 5,
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  avatar: true
                }
              }
            }
          }
        }
      });
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user.id,
      'UPDATE',
      'OTHER',
      id,
      { 
        action: "Mise à jour d'une conversation",
        updates: Object.keys(validatedData)
      }
    );
    
    return NextResponse.json(updatedConversation);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la conversation:', error);
    
    // Gérer les erreurs spécifiques
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de la conversation' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer/Quitter une conversation
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Si l'utilisateur n'est pas connecté, impossible de supprimer/quitter la conversation
    if (!permissionCheck.user?.id) {
      return NextResponse.json(
        { error: "Utilisateur non authentifié" },
        { status: 401 }
      );
    }
    
    const id = params.id;
    
    // Récupérer la conversation existante
    const conversation = await prisma.conversation.findUnique({
      where: { id },
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
        { error: "Vous n'avez pas les permissions pour supprimer cette conversation" },
        { status: 403 }
      );
    }
    
    // Pour une conversation directe, on ne peut pas la supprimer, seulement quitter
    if (conversation.isDirectMessage) {
      // Retirer l'utilisateur de la conversation
      await prisma.conversationParticipant.deleteMany({
        where: {
          conversationId: id,
          userId: permissionCheck.user.id
        }
      });
      
      // Journaliser l'action
      await logAction(
        permissionCheck.user.id,
        'DELETE',
        'OTHER',
        id,
        { action: "Quitter une conversation directe" }
      );
      
      return NextResponse.json({ message: "Vous avez quitté la conversation" });
    }
    
    // Pour une conversation de groupe, on peut la supprimer si on est SUPER_ADMIN ou COMPANY_ADMIN
    // Sinon, on quitte simplement la conversation
    if (permissionCheck.role === 'SUPER_ADMIN' || 
        (permissionCheck.role === 'COMPANY_ADMIN' && 
         permissionCheck.user.companyId === conversation.companyId)) {
      // Supprimer la conversation et toutes ses relations dans une transaction
      await prisma.$transaction(async (tx) => {
        // Supprimer tous les messages
        await tx.message.deleteMany({
          where: { conversationId: id }
        });
        
        // Supprimer tous les participants
        await tx.conversationParticipant.deleteMany({
          where: { conversationId: id }
        });
        
        // Supprimer la conversation
        await tx.conversation.delete({
          where: { id }
        });
      });
      
      // Journaliser l'action
      await logAction(
        permissionCheck.user.id,
        'DELETE',
        'OTHER',
        id,
        { action: "Suppression d'une conversation", name: conversation.name }
      );
      
      return NextResponse.json({ message: "Conversation supprimée avec succès" });
    } else {
      // Retirer l'utilisateur de la conversation
      await prisma.conversationParticipant.deleteMany({
        where: {
          conversationId: id,
          userId: permissionCheck.user.id
        }
      });
      
      // Ajouter un message système pour informer du départ
      await prisma.message.create({
        data: {
          conversationId: id,
          senderId: permissionCheck.user.id,
          content: `${permissionCheck.user.name} a quitté la conversation`,
          isSystemMessage: true
        }
      });
      
      // Journaliser l'action
      await logAction(
        permissionCheck.user.id,
        'DELETE',
        'OTHER',
        id,
        { action: "Quitter une conversation", name: conversation.name }
      );
      
      return NextResponse.json({ message: "Vous avez quitté la conversation" });
    }
  } catch (error) {
    console.error('Erreur lors de la suppression/sortie de la conversation:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression/sortie de la conversation' },
      { status: 500 }
    );
  }
} 