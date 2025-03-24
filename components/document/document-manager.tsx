'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileUpload } from '@/components/ui/file-upload';
import { FileText, Image, Trash2, Download, Eye } from 'lucide-react';
import { getFileType } from '@/lib/uploadService';

interface DocumentManagerProps {
  projectId: string;
  currentImages?: string[];
  currentDocuments?: string[];
  onImagesChange: (urls: string[]) => Promise<void>;
  onDocumentsChange: (urls: string[]) => Promise<void>;
}

export function DocumentManager({
  projectId,
  currentImages = [],
  currentDocuments = [],
  onImagesChange,
  onDocumentsChange,
}: DocumentManagerProps) {
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

  const handleDeleteImage = async (index: number) => {
    try {
      setIsUpdating(true);
      const newImages = [...images];
      newImages.splice(index, 1);
      await onImagesChange(newImages);
      setImages(newImages);
      toast.success('Image supprimée avec succès');
    } catch (error) {
      toast.error('Erreur lors de la suppression de l\'image');
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteDocument = async (index: number) => {
    try {
      setIsUpdating(true);
      const newDocuments = [...documents];
      newDocuments.splice(index, 1);
      await onDocumentsChange(newDocuments);
      setDocuments(newDocuments);
      toast.success('Document supprimé avec succès');
    } catch (error) {
      toast.error('Erreur lors de la suppression du document');
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  const getFileName = (url: string) => {
    const parts = url.split('/');
    return parts[parts.length - 1].replace(/^\d+-/, '');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestion des documents</CardTitle>
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {images.map((image, index) => (
                        <div key={index} className="relative group">
                          <div className="aspect-square rounded-md overflow-hidden border">
                            <img
                              src={image}
                              alt={`Image ${index + 1}`}
                              className="object-cover w-full h-full"
                            />
                          </div>
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center space-x-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-white hover:text-white hover:bg-white/20"
                              onClick={() => window.open(image, '_blank')}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-white hover:text-white hover:bg-white/20"
                              onClick={() => handleDeleteImage(index)}
                              disabled={isUpdating}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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
              
              {documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((documentUrl, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center space-x-3">
                        {getFileType(documentUrl) === 'pdf' ? (
                          <FileText className="h-5 w-5 text-red-500" />
                        ) : (
                          <Image className="h-5 w-5 text-blue-500" />
                        )}
                        <span className="text-sm truncate max-w-[300px]">
                          {getFileName(documentUrl)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(documentUrl, '_blank')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = documentUrl;
                            link.download = getFileName(documentUrl);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteDocument(index)}
                          disabled={isUpdating}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
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