'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Upload, Trash2, UserCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { uploadFile } from '@/lib/uploadService';

interface ProfileAvatarUploadProps {
  currentAvatarUrl: string | null | undefined;
  userName: string | null | undefined;
  onAvatarChange: (url: string | null) => Promise<void>;
}

export function ProfileAvatarUpload({
  currentAvatarUrl,
  userName,
  onAvatarChange,
}: ProfileAvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Vérifier le type de fichier
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image');
      return;
    }

    // Vérifier la taille du fichier (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('L\'image ne doit pas dépasser 2MB');
      return;
    }

    setIsUploading(true);
    console.log('🔄 Début de l\'upload de l\'avatar...');
    console.log(`📄 Fichier: ${file.name} (${file.size} octets, ${file.type})`);

    try {
      // Utiliser le service d'upload centralisé
      console.log('🔄 Utilisation du service d\'upload avec le préfixe "avatar"...');
      const fileUrl = await uploadFile(file, 'avatar');
      console.log(`✅ URL reçue: ${fileUrl}`);
      
      // Mettre à jour l'avatar dans le profil
      console.log(`🔄 Mise à jour de l'avatar avec URL: ${fileUrl}`);
      await onAvatarChange(fileUrl);
      console.log('✅ Avatar mis à jour avec succès');
      toast.success('Avatar mis à jour avec succès');
    } catch (error) {
      console.error('❌ Erreur lors de l\'upload de l\'avatar:', error);
      toast.error('Erreur lors de l\'upload de l\'avatar');
    } finally {
      setIsUploading(false);
      // Réinitialiser l'input file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async () => {
    if (!currentAvatarUrl) return;
    
    setIsRemoving(true);
    
    try {
      await onAvatarChange(null);
      toast.success('Avatar supprimé avec succès');
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'avatar:', error);
      toast.error('Erreur lors de la suppression de l\'avatar');
    } finally {
      setIsRemoving(false);
    }
  };

  // Générer les initiales à partir du nom d'utilisateur
  const getInitials = () => {
    if (!userName) return '?';
    
    return userName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative">
        {currentAvatarUrl ? (
          <div className="relative w-24 h-24 rounded-full overflow-hidden">
            <Image
              src={currentAvatarUrl}
              alt={userName || 'Avatar'}
              fill
              className="object-cover"
              sizes="96px"
            />
          </div>
        ) : (
          <div className="w-24 h-24 rounded-full flex items-center justify-center bg-primary-100 text-primary">
            {userName ? (
              <span className="text-2xl font-semibold">{getInitials()}</span>
            ) : (
              <UserCircle className="w-20 h-20" />
            )}
          </div>
        )}

        {(isUploading || isRemoving) && (
          <div className="absolute inset-0 w-24 h-24 rounded-full bg-black/50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>

      <div className="flex space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleUploadClick}
          disabled={isUploading || isRemoving}
          className={cn(
            "flex items-center",
            isUploading && "opacity-50 cursor-not-allowed"
          )}
        >
          <Upload className="w-4 h-4 mr-2" />
          Changer
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Sélectionner une image de profil"
          />
        </Button>

        {currentAvatarUrl && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemoveAvatar}
            disabled={isUploading || isRemoving}
            className={cn(
              "flex items-center text-destructive hover:text-destructive",
              isRemoving && "opacity-50 cursor-not-allowed"
            )}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Supprimer
          </Button>
        )}
      </div>
    </div>
  );
} 