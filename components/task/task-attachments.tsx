'use client';

import { useState } from 'react';
import { FileUpload } from '@/components/ui/file-upload';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getFileType } from '@/lib/uploadService';

interface TaskAttachmentsProps {
  taskId: string;
  currentAttachments?: string[];
  onAttachmentsChange: (urls: string[]) => Promise<void>;
  isDisabled?: boolean;
}

export function TaskAttachments({
  taskId,
  currentAttachments = [],
  onAttachmentsChange,
  isDisabled = false,
}: TaskAttachmentsProps) {
  const [attachments, setAttachments] = useState<string[]>(currentAttachments);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleAttachmentsUpload = async (urls: string[]) => {
    try {
      setIsUpdating(true);
      await onAttachmentsChange(urls);
      setAttachments(urls);
      if (urls.length > currentAttachments.length) {
        toast.success('Pièces jointes ajoutées avec succès');
      } else if (urls.length < currentAttachments.length) {
        toast.success('Pièce jointe supprimée');
      } else {
        toast.success('Pièces jointes mises à jour');
      }
    } catch (error) {
      toast.error('Erreur lors de la mise à jour des pièces jointes');
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Compte les types de fichiers
  const fileCounts = attachments.reduce((acc, url) => {
    const type = getFileType(url);
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center">
          <Paperclip className="h-4 w-4 mr-2" />
          <CardTitle className="text-base">Pièces jointes</CardTitle>
          <Badge variant="secondary" className="ml-2">
            {attachments.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!isDisabled && (
          <div className="mb-4">
            <FileUpload
              onUpload={handleAttachmentsUpload}
              multiple={true}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
              maxSize={5}
              prefix={`task-${taskId}`}
              currentFiles={attachments}
              showPreviews={true}
              dropzoneText="Déposez vos fichiers ici ou cliquez pour sélectionner"
            />
          </div>
        )}

        {attachments.length > 0 && (
          <div className="pt-2">
            <div className="flex flex-wrap gap-2">
              {fileCounts.image > 0 && (
                <Badge variant="outline" className="bg-blue-50">
                  {fileCounts.image} image{fileCounts.image > 1 ? 's' : ''}
                </Badge>
              )}
              {fileCounts.pdf > 0 && (
                <Badge variant="outline" className="bg-red-50">
                  {fileCounts.pdf} PDF{fileCounts.pdf > 1 ? 's' : ''}
                </Badge>
              )}
              {fileCounts.document > 0 && (
                <Badge variant="outline" className="bg-green-50">
                  {fileCounts.document} document{fileCounts.document > 1 ? 's' : ''}
                </Badge>
              )}
              {fileCounts.other > 0 && (
                <Badge variant="outline" className="bg-gray-50">
                  {fileCounts.other} autre{fileCounts.other > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        )}

        {attachments.length === 0 && (
          <div className="text-center py-4 text-gray-500 text-sm">
            {isDisabled 
              ? "Aucune pièce jointe" 
              : "Ajoutez des fichiers pour cette tâche"}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 