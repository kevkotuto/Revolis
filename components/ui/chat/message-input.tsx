"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendIcon } from "lucide-react";
import { useConversation } from "@/components/ui/socket-provider";
import { useSession } from "next-auth/react";

interface MessageInputProps {
  conversationId: string;
}

export function MessageInput({ conversationId }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { data: session } = useSession();
  const { sendMessage, sendTyping, markAsRead } = useConversation(conversationId);

  // Ajuster la hauteur du textarea automatiquement
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 150);
      textarea.style.height = `${newHeight}px`;
    }
  }, [message]);

  // Gérer l'envoi d'un message
  const handleSendMessage = () => {
    if (!message.trim() || !session?.user) return;

    sendMessage({
      content: message.trim(),
      senderId: session.user.id as string,
      senderName: session.user.name as string,
      senderAvatar: session.user.image as string | undefined,
    });

    setMessage("");
    
    // Réinitialiser l'indicateur de frappe
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    setIsTyping(false);
    sendTyping(false, session.user);
  };

  // Gérer la frappe dans le textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Envoyer un indicateur de frappe
    if (!isTyping && e.target.value.trim() && session?.user) {
      setIsTyping(true);
      sendTyping(true, session.user);
    }
    
    // Réinitialiser l'indicateur après un délai
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping && session?.user) {
        setIsTyping(false);
        sendTyping(false, session.user);
      }
    }, 3000);
  };

  // Gérer la soumission avec Entrée (mais permettre Shift+Entrée pour les sauts de ligne)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="p-4 border-t">
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Écrivez votre message..."
          className="min-h-[40px] max-h-[150px] resize-none"
          rows={1}
        />
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="icon"
            onClick={handleSendMessage}
            disabled={!message.trim()}
            className="shrink-0"
            variant="default"
          >
            <SendIcon className="h-4 w-4" />
            <span className="sr-only">Envoyer</span>
          </Button>
        </div>
      </div>
    </div>
  );
}