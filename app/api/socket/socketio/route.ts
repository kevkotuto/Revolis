import { NextRequest } from 'next/server';
import { Server as NetServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { NextApiResponseServerIO } from '../../../../types/next';

export async function GET(req: NextRequest, res: NextApiResponseServerIO) {
  if (res.socket.server.io) {
    console.log('Socket.IO already running');
    return new Response('Socket.IO is already running', { status: 200 });
  }

  console.log('Initializing Socket.IO server...');
  
  const httpServer: NetServer = res.socket.server as any;
  const io = new SocketIOServer(httpServer, {
    path: '/api/socket/socketio',
    addTrailingSlash: false,
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });
  
  // Middleware d'authentification Socket.IO
  io.use(async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const sessionId = socket.handshake.auth.sessionId;
      if (!sessionId) {
        return next(new Error('Session non authentifiée'));
      }
      
      // TODO: Vérifier la session utilisateur via la méthode appropriée
      // Exemple: utiliser getSession ou un middleware d'authentification
      
      // Pour le moment, on fait passer l'authentification sans vérification
      socket.data.userId = socket.handshake.auth.userId;
      socket.data.authenticated = true;
      next();
    } catch (error) {
      console.error('Erreur d\'authentification Socket.IO:', error);
      next(new Error('Erreur d\'authentification'));
    }
  });

  // Configuration des espaces et événements Socket.IO
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connecté: ${socket.id}`);
    
    // Événement pour joindre une conversation
    socket.on('joinConversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
      console.log(`Socket ${socket.id} a rejoint la conversation ${conversationId}`);
    });
    
    // Événement pour quitter une conversation
    socket.on('leaveConversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`Socket ${socket.id} a quitté la conversation ${conversationId}`);
    });
    
    // Événement pour marquer les messages comme lus
    socket.on('markAsRead', async (data: { conversationId: string; userId: string }) => {
      try {
        const { conversationId, userId } = data;
        
        if (!conversationId || !userId) {
          socket.emit('error', { message: 'Données manquantes pour marquer comme lu' });
          return;
        }
        
        // Envoyer une notification aux autres participants
        socket.to(`conversation:${conversationId}`).emit('messageRead', {
          conversationId,
          userId,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Erreur lors du marquage de lecture:', error);
        socket.emit('error', { message: 'Erreur lors du marquage de lecture' });
      }
    });
    
    // Événement de déconnexion
    socket.on('disconnect', () => {
      console.log(`Socket déconnecté: ${socket.id}`);
    });
  });
  
  // Créer un espace "messaging" spécifique
  const messagingNamespace = io.of('/messaging');
  
  messagingNamespace.on('connection', (socket: Socket) => {
    console.log(`Messagerie: Socket connecté: ${socket.id}`);
    
    // Événement pour envoyer un message
    socket.on('sendMessage', async (data: { conversationId: string; message: any }) => {
      try {
        const { conversationId, message } = data;
        
        if (!conversationId || !message) {
          socket.emit('error', { message: 'Données de message incomplètes' });
          return;
        }
        
        // Diffuser le message aux autres participants de la conversation
        socket.to(`conversation:${conversationId}`).emit('newMessage', message);
      } catch (error) {
        console.error('Erreur lors de l\'envoi du message:', error);
        socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
      }
    });
    
    // Événement pour indiquer qu'un utilisateur est en train d'écrire
    socket.on('typing', (data: { conversationId: string; user: any; isTyping: boolean }) => {
      const { conversationId, user, isTyping } = data;
      
      if (!conversationId || !user) {
        return;
      }
      
      socket.to(`conversation:${conversationId}`).emit('userTyping', {
        conversationId,
        user,
        isTyping
      });
    });
  });
  
  // Stocker l'instance Socket.IO dans le serveur pour la réutilisation
  res.socket.server.io = io;
  
  return new Response('Socket.IO initialized', { status: 200 });
}

// Handler pour gérer les déconnexions et maintenir la connexion WebSocket active
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; 