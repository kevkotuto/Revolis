import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer toutes les conversations de l'utilisateur
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

    // Si l'utilisateur n'est pas connecté, impossible de récupérer ses conversations
    if (!permissionCheck.user?.id) {
      return NextResponse.json(
        { error: "Utilisateur non authentifié" },
        { status: 401 }
      );
    }

    // Extraire les paramètres de requête
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const companyId = searchParams.get('companyId');
    const search = searchParams.get('search') || '';
    const onlyUnread = searchParams.get('onlyUnread') === 'true';
    const onlyDirect = searchParams.get('onlyDirect') === 'true';
    const withUserId = searchParams.get('withUserId');

    // Configurer la pagination
    const skip = (page - 1) * limit;
    
    // Récupérer les ID des conversations auxquelles l'utilisateur participe
    const userConversations = await prisma.conversationParticipant.findMany({
      where: {
        userId: permissionCheck.user.id
      },
      select: {
        conversationId: true,
        lastReadAt: true
      }
    });
    
    const conversationIds = userConversations.map(uc => uc.conversationId);
    
    if (conversationIds.length === 0) {
      return NextResponse.json({
        items: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0
        }
      });
    }
    
    // Construire la clause where pour les filtres
    const where: any = {
      id: { in: conversationIds }
    };
    
    // Filtre par entreprise
    if (companyId) {
      where.companyId = companyId;
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Pour les admins d'entreprise, filtrer par leur entreprise
      where.companyId = permissionCheck.user.companyId;
    }
    
    // Filtre pour les conversations directes uniquement
    if (onlyDirect) {
      where.isDirectMessage = true;
    }
    
    // Filtre pour les conversations avec un utilisateur spécifique
    if (withUserId) {
      where.participants = {
        some: {
          userId: withUserId
        }
      };
    }
    
    // Filtre de recherche
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { messages: { some: { content: { contains: search, mode: 'insensitive' } } } }
      ];
    }
    
    // Récupérer le nombre total de conversations pour pagination
    const total = await prisma.conversation.count({ where });
    
    // Récupérer les conversations
    const conversations = await prisma.conversation.findMany({
      where,
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
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                avatar: true
              }
            }
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      skip,
      take: limit,
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' }
      ]
    });
    
    // Calculer les messages non lus pour chaque conversation
    const conversationsWithUnreadCounts = await Promise.all(
      conversations.map(async (conversation) => {
        const userConversation = userConversations.find(uc => uc.conversationId === conversation.id);
        const lastReadAt = userConversation?.lastReadAt || new Date(0);
        
        // Compter les messages non lus
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            createdAt: { gt: lastReadAt },
            senderId: { not: permissionCheck.user?.id }
          }
        });
        
        return {
          ...conversation,
          unreadCount
        };
      })
    );
    
    // Filtrer les conversations avec uniquement des messages non lus si demandé
    const filteredConversations = onlyUnread
      ? conversationsWithUnreadCounts.filter(c => c.unreadCount > 0)
      : conversationsWithUnreadCounts;
    
    // Calculer les nouvelles totales pour la pagination
    const filteredTotal = onlyUnread
      ? filteredConversations.length
      : total;
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user.id,
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des conversations", filters: { companyId, search, onlyUnread, onlyDirect, withUserId } }
    );
    
    return NextResponse.json({
      items: filteredConversations,
      pagination: {
        total: filteredTotal,
        page,
        limit,
        totalPages: Math.ceil(filteredTotal / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des conversations:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des conversations' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle conversation
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
    
    // Si l'utilisateur n'est pas connecté, impossible de créer une conversation
    if (!permissionCheck.user?.id) {
      return NextResponse.json(
        { error: "Utilisateur non authentifié" },
        { status: 401 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation des données de la conversation
    const ConversationSchema = z.object({
      name: z.string().optional(),
      companyId: z.string().optional(),
      isDirectMessage: z.boolean().default(false),
      participants: z.array(z.string()).min(1, "Au moins un participant est requis"),
      initialMessage: z.string().optional()
    });
    
    // Valider les données
    const validationResult = ConversationSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Déterminer l'ID de l'entreprise
    let companyId = validatedData.companyId;
    
    // Si companyId n'est pas fourni, utiliser celui de l'utilisateur
    if (!companyId) {
      if (permissionCheck.user.companyId) {
        companyId = permissionCheck.user.companyId;
      } else if (permissionCheck.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { error: "ID d'entreprise requis" },
          { status: 400 }
        );
      }
    } 
    // Si companyId est fourni et différent de celui de l'utilisateur (pour COMPANY_ADMIN)
    else if (permissionCheck.role === 'COMPANY_ADMIN' && 
             companyId !== permissionCheck.user.companyId) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas créer une conversation pour une autre entreprise" },
        { status: 403 }
      );
    }
    
    // Vérifier que l'entreprise existe
    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      });
      
      if (!company) {
        return NextResponse.json(
          { error: "Entreprise non trouvée" },
          { status: 404 }
        );
      }
    }
    
    // S'assurer que l'utilisateur actuel est inclus dans les participants
    const participants = validatedData.participants.includes(permissionCheck.user.id)
      ? validatedData.participants
      : [...validatedData.participants, permissionCheck.user.id];
    
    // Vérifier que tous les participants existent
    const users = await prisma.user.findMany({
      where: {
        id: { in: participants }
      },
      select: {
        id: true,
        companyId: true
      }
    });
    
    if (users.length !== participants.length) {
      return NextResponse.json(
        { error: "Certains participants n'existent pas" },
        { status: 404 }
      );
    }
    
    // Pour une conversation directe, vérifier qu'il y a exactement 2 participants
    if (validatedData.isDirectMessage && participants.length !== 2) {
      return NextResponse.json(
        { error: "Une conversation directe doit avoir exactement 2 participants" },
        { status: 400 }
      );
    }
    
    // Pour une conversation directe, vérifier qu'elle n'existe pas déjà
    if (validatedData.isDirectMessage) {
      const otherUserId = participants.find(id => id !== permissionCheck.user.id);
      
      if (otherUserId) {
        // Vérifier si une conversation directe existe déjà entre ces deux utilisateurs
        const existingConversation = await prisma.conversation.findFirst({
          where: {
            isDirectMessage: true,
            participants: {
              every: {
                userId: { in: [permissionCheck.user.id, otherUserId] }
              }
            },
            AND: [
              { participants: { some: { userId: permissionCheck.user.id } } },
              { participants: { some: { userId: otherUserId } } }
            ]
          },
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
              take: 1,
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
        
        if (existingConversation) {
          // Si la conversation existe déjà, mettre à jour lastReadAt
          await prisma.conversationParticipant.updateMany({
            where: {
              conversationId: existingConversation.id,
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
            existingConversation.id,
            { action: "Accès à une conversation directe existante" }
          );
          
          return NextResponse.json({
            message: "La conversation directe existe déjà",
            conversation: existingConversation
          });
        }
      }
    }
    
    // Générer automatiquement un nom pour les conversations directes si non fourni
    let conversationName = validatedData.name;
    
    if (validatedData.isDirectMessage && !conversationName) {
      const otherUserId = participants.find(id => id !== permissionCheck.user.id);
      
      if (otherUserId) {
        const otherUser = await prisma.user.findUnique({
          where: { id: otherUserId },
          select: { name: true }
        });
        
        conversationName = otherUser?.name || 'Conversation directe';
      } else {
        conversationName = 'Conversation directe';
      }
    } else if (!conversationName) {
      conversationName = 'Nouvelle conversation';
    }
    
    // Créer la conversation et les participants dans une transaction
    const conversation = await prisma.$transaction(async (tx) => {
      // Créer la conversation
      const newConversation = await tx.conversation.create({
        data: {
          name: conversationName,
          companyId,
          isDirectMessage: validatedData.isDirectMessage,
          participants: {
            create: participants.map(userId => ({
              userId,
              lastReadAt: new Date()
            }))
          }
        }
      });
      
      // Si un message initial est fourni, le créer
      if (validatedData.initialMessage) {
        await tx.message.create({
          data: {
            conversationId: newConversation.id,
            senderId: permissionCheck.user.id,
            content: validatedData.initialMessage
          }
        });
      }
      
      // Retourner la conversation créée avec ses relations
      return tx.conversation.findUnique({
        where: { id: newConversation.id },
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
      'CREATE',
      'OTHER',
      conversation?.id,
      { 
        action: validatedData.isDirectMessage ? "Création d'une conversation directe" : "Création d'une conversation de groupe",
        participants: participants.length
      }
    );
    
    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la conversation:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de la conversation' },
      { status: 500 }
    );
  }
} 