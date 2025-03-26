"use client";

import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useMessages, useConversation } from "@/components/ui/socket-provider";

type Message = {
  id: string;
  content: string;
  createdAt: string;
  isSystemMessage?: boolean;
  sender: {
    id: string;
    name: string;
    avatar?: string;
  };
};

interface MessageListProps {
  conversationId: string;
  initialMessages: Message[];
}

export function MessageList({ conversationId, initialMessages = [] }: MessageListProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { markAsRead } = useConversation(conversationId);

  // Charger plus de messages lorsqu'on scrolle vers le haut
  const loadMoreMessages = async () => {
    try {
      const response = await fetch(`/api/v1/conversations/${conversationId}?messagesPage=${Math.ceil(messages.length / 50) + 1}`);
      
      if (!response.ok) {
        throw new Error('Erreur lors du chargement des messages');
      }
      
      const data = await response.json();
      
      if (data.messages.items.length > 0) {
        setMessages((prev) => [...prev, ...data.messages.items]);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  // Marquer les messages comme lus lorsque la conversation est affichée
  useEffect(() => {
    if (session?.user?.id && conversationId) {
      markAsRead(session.user.id);
    }
  }, [conversationId, session?.user?.id, markAsRead]);

  // Utiliser le hook pour écouter les nouveaux messages
  useMessages((message) => {
    if (message.conversationId === conversationId) {
      setMessages((prev) => [message, ...prev]);
      
      // Si le message est d'un autre utilisateur, le marquer comme lu
      if (message.sender.id !== session?.user?.id) {
        markAsRead(session?.user?.id as string);
      }
      
      // Scroll vers le bas pour voir le nouveau message
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  });

  // Scroll vers le bas lors du premier chargement
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  // Regrouper les messages par date
  const messagesByDate = messages.reduce<Record<string, Message[]>>((groups, message) => {
    const date = format(new Date(message.createdAt), 'yyyy-MM-dd');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});

  return (
    <ScrollArea className="h-full p-4" ref={scrollAreaRef} onScroll={(e) => {
      const scrollArea = e.currentTarget as HTMLDivElement;
      if (scrollArea.scrollTop === 0) {
        loadMoreMessages();
      }
    }}>
      <div className="space-y-8">
        {Object.entries(messagesByDate).map(([date, dateMessages]) => (
          <div key={date} className="space-y-4">
            <div className="sticky top-0 z-10 flex justify-center">
              <div className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded-md">
                {format(new Date(date), 'd MMMM yyyy', { locale: fr })}
              </div>
            </div>
            
            <div className="space-y-4">
              {dateMessages.map((message, i) => {
                const isCurrentUser = message.sender.id === session?.user?.id;
                const showAvatar = i === 0 || dateMessages[i - 1]?.sender.id !== message.sender.id;
                
                // Récupérer les initiales pour l'avatar
                const initials = message.sender.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .substring(0, 2);
                
                // Si c'est un message système, on l'affiche différemment
                if (message.isSystemMessage) {
                  return (
                    <div key={message.id} className="flex justify-center">
                      <div className="bg-muted text-muted-foreground text-xs px-3 py-1.5 rounded-md">
                        {message.content}
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div
                    key={message.id}
                    className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex gap-2 max-w-[80%] ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                      {showAvatar ? (
                        <Avatar className={`h-8 w-8 ${isCurrentUser ? 'ml-2' : 'mr-2'}`}>
                          {message.sender.avatar && (
                            <AvatarImage src={message.sender.avatar} alt={message.sender.name} />
                          )}
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                      ) : (
                        <div className="w-8"></div>
                      )}
                      
                      <div className="space-y-1">
                        {showAvatar && (
                          <div className={`text-sm font-medium ${isCurrentUser ? 'text-right' : ''}`}>
                            {isCurrentUser ? 'Vous' : message.sender.name}
                          </div>
                        )}
                        
                        <div
                          className={`rounded-lg p-3 ${
                            isCurrentUser
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-accent'
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words">{message.content}</div>
                        </div>
                        
                        <div className={`text-xs text-muted-foreground ${isCurrentUser ? 'text-right' : ''}`}>
                          {format(new Date(message.createdAt), 'HH:mm')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </ScrollArea>
  );
} 