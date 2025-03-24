'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { UploadCloud, X, File, Image, FileText, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { Button } from './button';
import { uploadFile, uploadMultipleFiles, isImageUrl, getFileType } from '@/lib/uploadService';
import { FileUploadProps } from '@/types';

export function FileUpload({
  onUpload,
  onError,
  currentFiles = [],
  multiple = false,
  accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt',
  maxSize = 10, // 10 Mo par défaut
  className = '',
  buttonText = 'Sélectionner un fichier',
  dropzoneText = 'Déposez les fichiers ici ou cliquez pour sélectionner',
  prefix,
  showPreviews = true,
  previewHeight = 100,
}: FileUploadProps) {
  const [files, setFiles] = useState<string[]>(currentFiles);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    try {
      setIsUploading(true);
      
      // Vérification de la taille des fichiers
      const filesArray = Array.from(selectedFiles);
      const oversizedFiles = filesArray.filter(file => file.size > maxSize * 1024 * 1024);
      
      if (oversizedFiles.length > 0) {
        toast.error(`Certains fichiers dépassent la taille maximale de ${maxSize} Mo`);
        if (onError) onError(new Error(`Fichier trop volumineux (max: ${maxSize} Mo)`));
        return;
      }
      
      // Upload des fichiers
      let uploadedUrls: string[];
      
      if (multiple) {
        uploadedUrls = await uploadMultipleFiles(filesArray, prefix);
      } else {
        const url = await uploadFile(filesArray[0], prefix);
        uploadedUrls = [url];
      }
      
      // Mise à jour de l'état local
      const newFiles = multiple ? [...files, ...uploadedUrls] : uploadedUrls;
      setFiles(newFiles);
      
      // Appel du callback parent
      onUpload(newFiles);
      
      toast.success('Fichier(s) téléchargé(s) avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'upload:', error);
      toast.error('Erreur lors du téléchargement');
      if (onError && error instanceof Error) onError(error);
    } finally {
      setIsUploading(false);
      // Réinitialisation de l'input pour permettre la sélection du même fichier
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    // Si multiple n'est pas activé, on ne prend que le premier fichier
    if (!multiple && droppedFiles.length > 1) {
      toast.warning('Vous ne pouvez télécharger qu\'un seul fichier à la fois');
      return;
    }

    try {
      setIsUploading(true);

      // Vérification de la taille et du type des fichiers
      const filesArray = Array.from(droppedFiles);
      const oversizedFiles = filesArray.filter(file => file.size > maxSize * 1024 * 1024);
      
      if (oversizedFiles.length > 0) {
        toast.error(`Certains fichiers dépassent la taille maximale de ${maxSize} Mo`);
        return;
      }

      // Vérification des types de fichiers si accept est spécifié
      if (accept !== '*') {
        const acceptedTypes = accept.split(',').map(type => type.trim());
        const invalidFiles = filesArray.filter(file => {
          const fileType = file.type;
          // Vérifier si le type du fichier correspond à l'un des types acceptés
          return !acceptedTypes.some(type => {
            if (type.endsWith('/*')) {
              // Pour les types comme "image/*"
              const category = type.split('/')[0];
              return fileType.startsWith(category);
            }
            if (type.startsWith('.')) {
              // Pour les extensions comme ".pdf"
              const extension = '.' + file.name.split('.').pop();
              return extension.toLowerCase() === type.toLowerCase();
            }
            // Pour les types MIME complets
            return fileType === type;
          });
        });

        if (invalidFiles.length > 0) {
          toast.error('Certains fichiers ont un format non supporté');
          return;
        }
      }

      // Upload des fichiers
      let uploadedUrls: string[];
      
      if (multiple) {
        uploadedUrls = await uploadMultipleFiles(filesArray, prefix);
      } else {
        const url = await uploadFile(filesArray[0], prefix);
        uploadedUrls = [url];
      }
      
      // Mise à jour de l'état local
      const newFiles = multiple ? [...files, ...uploadedUrls] : uploadedUrls;
      setFiles(newFiles);
      
      // Appel du callback parent
      onUpload(newFiles);
      
      toast.success('Fichier(s) téléchargé(s) avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'upload:', error);
      toast.error('Erreur lors du téléchargement');
      if (onError && error instanceof Error) onError(error);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);
    onUpload(newFiles);
  };

  // Fonction pour obtenir l'icône appropriée en fonction du type de fichier
  const getFileIcon = (url: string) => {
    const fileType = getFileType(url);
    
    switch (fileType) {
      case 'image':
        return <Image className="h-5 w-5" />;
      case 'pdf':
        return <FileText className="h-5 w-5" />;
      case 'document':
        return <File className="h-5 w-5" />;
      default:
        return <Paperclip className="h-5 w-5" />;
    }
  };

  // Obtenir le nom du fichier à partir de l'URL
  const getFileName = (url: string) => {
    const parts = url.split('/');
    const fileName = parts[parts.length - 1];
    // Enlever le timestamp du nom du fichier s'il existe
    return fileName.replace(/^\d+-/, '');
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          multiple={multiple}
          accept={accept}
          aria-label="Sélection de fichier"
        />
        <UploadCloud className="h-10 w-10 mx-auto mb-2 text-gray-400" />
        <p className="text-sm text-gray-600 mb-1">{dropzoneText}</p>
        <p className="text-xs text-gray-500">
          Max: {maxSize} Mo {multiple ? '(plusieurs fichiers autorisés)' : ''}
        </p>
      </div>

      {isUploading && (
        <div className="text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="text-sm mt-2">Téléchargement en cours...</p>
        </div>
      )}

      {showPreviews && files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Fichiers ({files.length})</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="relative group border rounded-md overflow-hidden flex items-center"
              >
                {isImageUrl(file) ? (
                  <img
                    src={file}
                    alt={`Aperçu ${index}`}
                    className={cn(
                      "object-cover w-[100px]",
                      `!h-[${previewHeight}px]`
                    )}
                  />
                ) : (
                  <div
                    className={cn(
                      "flex items-center justify-center bg-gray-100 w-[100px]",
                      `!h-[${previewHeight / 2}px]`
                    )}
                  >
                    {getFileIcon(file)}
                  </div>
                )}
                <div className="flex-1 p-2 overflow-hidden">
                  <p className="text-sm truncate">{getFileName(file)}</p>
                  <a
                    href={file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Voir
                  </a>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 bg-white bg-opacity-70 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 