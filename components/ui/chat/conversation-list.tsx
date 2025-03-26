"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, Plus } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMessages } from '@/components/ui/socket-provider';

type Conversation = {
  id: string;
  name: string;
  isDirectMessage: boolean;
  updatedAt: string;
  unreadCount: number;
  participants: Array<{
    user: {
      id: string;
      name: string;
      email: string;
      avatar?: string;
    }
  }>;
  messages: Array<{
    id: string;
    content: string;
    createdAt: string;
    sender: {
      id: string;
      name: string;
      avatar?: string;
    }
  }>;
};

interface ConversationListProps {
  onNewChat: () => void;
  selectedConversationId?: string;
}

export function ConversationList({ onNewChat, selectedConversationId }: ConversationListProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Récupérer la liste des conversations
  useEffect(() => {
    const fetchConversations = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/v1/conversations');
        if (!response.ok) {
          throw new Error('Erreur lors de la récupération des conversations');
        }

        const data = await response.json();
        setConversations(data.items);
      } catch (error) {
        console.error('Erreur:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversations();
  }, []);

  // Utiliser le hook pour écouter les nouveaux messages
  useMessages((message) => {
    // Mettre à jour la conversation correspondante
    setConversations((prevConversations) => {
      return prevConversations.map((conversation) => {
        if (conversation.id === message.conversationId) {
          // Incrémenter le nombre de messages non lus si ce n'est pas l'expéditeur
          const unreadCount = 
            message.sender.id !== session?.user?.id 
              ? conversation.unreadCount + 1 
              : conversation.unreadCount;
          
          // Ajouter le message en haut des messages
          const updatedMessages = [
            message,
            ...(conversation.messages || [])
          ].slice(0, 1); // Garder seulement le dernier message
          
          return {
            ...conversation,
            messages: updatedMessages,
            updatedAt: new Date().toISOString(),
            unreadCount
          };
        }
        return conversation;
      }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });
  });

  // Filtrer les conversations en fonction de la recherche
  const filteredConversations = conversations
    .filter((conversation) => 
      conversation.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conversation.participants.some(p => 
        p.user.name.toLowerCase().includes(searchTerm.toLowerCase())
      ) ||
      conversation.messages.some(m => 
        m.content.toLowerCase().includes(searchTerm.toLowerCase())
      )
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Gérer la sélection d'une conversation
  const handleSelectConversation = (id: string) => {
    router.push(`/messaging/${id}`);
    
    // Mettre à jour le compteur de messages non lus
    setConversations((prevConversations) => {
      return prevConversations.map((conversation) => {
        if (conversation.id === id) {
          return {
            ...conversation,
            unreadCount: 0
          };
        }
        return conversation;
      });
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-4">
          <Input
            placeholder="Rechercher une conversation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-grow"
            prefix={<Search className="h-4 w-4 text-muted-foreground" />}
          />
          <Button onClick={onNewChat} size="icon" variant="outline">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-grow">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <p className="text-muted-foreground">Chargement des conversations...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 p-4 text-center">
            <p className="text-muted-foreground mb-2">Aucune conversation trouvée</p>
            <Button onClick={onNewChat} variant="outline" size="sm">
              Démarrer une nouvelle conversation
            </Button>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredConversations.map((conversation) => {
              // Pour les messages directs, afficher le nom du destinataire
              const displayName = conversation.isDirectMessage
                ? conversation.participants.find(
                    (p) => p.user.id !== session?.user?.id
                  )?.user.name || conversation.name
                : conversation.name;
              
              // Récupérer l'avatar pour les messages directs
              const avatarUrl = conversation.isDirectMessage
                ? conversation.participants.find(
                    (p) => p.user.id !== session?.user?.id
                  )?.user.avatar
                : null;
              
              // Récupérer les initiales pour l'avatar
              const initials = displayName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .substring(0, 2);
              
              // Récupérer le dernier message
              const lastMessage = conversation.messages[0];
              
              return (
                <Card
                  key={conversation.id}
                  className={`p-3 cursor-pointer hover:bg-accent/50 transition ${
                    selectedConversationId === conversation.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => handleSelectConversation(conversation.id)}
                >
                  <div className="flex items-start gap-3">
                    <Avatar>
                      {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="font-medium truncate">{displayName}</h4>
                        {lastMessage && (
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(lastMessage.createdAt), {
                              addSuffix: true,
                              locale: fr
                            })}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground truncate">
                          {lastMessage?.content || 'Pas encore de message'}
                        </p>
                        
                        {conversation.unreadCount > 0 && (
                          <Badge variant="default" className="ml-2">
                            {conversation.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
} 