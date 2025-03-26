"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';

type SocketContextType = {
  socket: Socket | null;
  isConnected: boolean;
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    // Initialiser Socket.IO uniquement côté client et si l'utilisateur est connecté
    if (typeof window === 'undefined' || !session?.user) {
      return;
    }

    // Initialiser la connexion Socket.IO
    const socketInstance = io({
      path: '/api/socket/socketio',
      addTrailingSlash: false,
      auth: {
        sessionId: session.user.id, // Utiliser l'ID de session pour l'authentification
        userId: session.user.id
      },
    });

    socketInstance.on('connect', () => {
      console.log('Socket.IO connecté');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket.IO déconnecté');
      setIsConnected(false);
    });

    socketInstance.on('error', (error) => {
      console.error('Erreur Socket.IO:', error);
    });

    setSocket(socketInstance);

    // Nettoyage de la connexion lors du démontage du composant
    return () => {
      socketInstance.disconnect();
    };
  }, [session]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

// Hook personnalisé pour rejoindre une conversation
export const useConversation = (conversationId?: string) => {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected || !conversationId) return;

    // Rejoindre la conversation
    socket.emit('joinConversation', conversationId);
    console.log(`Conversation rejointe: ${conversationId}`);

    // Nettoyer en quittant la conversation
    return () => {
      socket.emit('leaveConversation', conversationId);
      console.log(`Conversation quittée: ${conversationId}`);
    };
  }, [socket, isConnected, conversationId]);

  // Fonction pour envoyer un message
  const sendMessage = (message: any) => {
    if (!socket || !isConnected || !conversationId) return false;
    
    socket.emit('sendMessage', {
      conversationId,
      message
    });
    
    return true;
  };

  // Fonction pour indiquer que l'utilisateur est en train d'écrire
  const sendTyping = (isTyping: boolean, user: any) => {
    if (!socket || !isConnected || !conversationId) return;
    
    socket.emit('typing', {
      conversationId,
      user,
      isTyping
    });
  };

  // Fonction pour marquer les messages comme lus
  const markAsRead = (userId: string) => {
    if (!socket || !isConnected || !conversationId) return;
    
    socket.emit('markAsRead', {
      conversationId,
      userId
    });
  };

  return {
    sendMessage,
    sendTyping,
    markAsRead
  };
};

// Hook pour écouter les nouveaux messages
export const useMessages = (onNewMessage: (message: any) => void) => {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Écouter les nouveaux messages
    socket.on('newMessage', onNewMessage);

    return () => {
      socket.off('newMessage', onNewMessage);
    };
  }, [socket, isConnected, onNewMessage]);
};

// Hook pour écouter la frappe des utilisateurs
export const useTyping = (onTyping: (data: { user: any, isTyping: boolean }) => void) => {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Écouter les événements de frappe
    socket.on('userTyping', onTyping);

    return () => {
      socket.off('userTyping', onTyping);
    };
  }, [socket, isConnected, onTyping]);
};

// Hook pour écouter les marquages de lecture
export const useReadReceipts = (onMessageRead: (data: { userId: string, timestamp: Date }) => void) => {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Écouter les événements de lecture
    socket.on('messageRead', onMessageRead);

    return () => {
      socket.off('messageRead', onMessageRead);
    };
  }, [socket, isConnected, onMessageRead]);
}; 