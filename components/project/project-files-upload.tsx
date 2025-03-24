'use client';

import { useState } from 'react';
import { FileUpload } from '@/components/ui/file-upload';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isImageUrl } from '@/lib/uploadService';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProjectFilesUploadProps {
  projectId: string;
  currentImages?: string[];
  currentDocuments?: string[];
  onImagesChange: (urls: string[]) => Promise<void>;
  onDocumentsChange: (urls: string[]) => Promise<void>;
}

export function ProjectFilesUpload({
  projectId,
  currentImages = [],
  currentDocuments = [],
  onImagesChange,
  onDocumentsChange,
}: ProjectFilesUploadProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [images, setImages] = useState<string[]>(currentImages);
  const [documents, setDocuments] = useState<string[]>(currentDocuments);

  const handleImagesUpload = async (urls: string[]) => {
    try {
      setIsUpdating(true);
      await onImagesChange(urls);
      setImages(urls);
      toast.success('Images mises à jour avec succès');
    } catch (error) {
      toast.error('Erreur lors de la mise à jour des images');
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDocumentsUpload = async (urls: string[]) => {
    try {
      setIsUpdating(true);
      await onDocumentsChange(urls);
      setDocuments(urls);
      toast.success('Documents mis à jour avec succès');
    } catch (error) {
      toast.error('Erreur lors de la mise à jour des documents');
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fichiers du projet</CardTitle>
        <CardDescription>
          Gérez les images et documents associés à ce projet
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="images">
          <TabsList className="mb-4">
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
          
          <TabsContent value="images">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Ajoutez des captures d'écran, photos ou illustrations pour ce projet
              </p>
              
              {images.length > 0 && (
                <div className="mb-6">
                  <p className="text-sm font-medium mb-2">Galerie d'images</p>
                  <ScrollArea className="w-full" style={{ height: images.length > 3 ? '240px' : 'auto' }}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {images.map((image, index) => (
                        <div key={index} className="relative aspect-square rounded-md overflow-hidden border">
                          <img
                            src={image}
                            alt={`Image ${index + 1}`}
                            className="object-cover w-full h-full"
                          />
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
              
              <FileUpload
                onUpload={handleImagesUpload}
                multiple={true}
                accept="image/*"
                maxSize={5}
                prefix={`project-image-${projectId}`}
                currentFiles={images}
                showPreviews={true}
                dropzoneText="Déposez vos images ici ou cliquez pour sélectionner"
              />
            </div>
          </TabsContent>
          
          <TabsContent value="documents">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Ajoutez les documents liés à ce projet (cahier des charges, contrats, etc.)
              </p>
              
              <FileUpload
                onUpload={handleDocumentsUpload}
                multiple={true}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                maxSize={10}
                prefix={`project-doc-${projectId}`}
                currentFiles={documents}
                showPreviews={true}
                dropzoneText="Déposez vos documents ici ou cliquez pour sélectionner"
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
} 