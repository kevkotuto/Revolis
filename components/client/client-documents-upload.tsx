'use client';

import { useState } from 'react';
import { FileUpload } from '@/components/ui/file-upload';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isImageUrl } from '@/lib/uploadService';

interface ClientDocumentsUploadProps {
  clientId: string;
  currentDocuments?: string[];
  currentLogo?: string | null;
  onDocumentsChange: (urls: string[]) => Promise<void>;
  onLogoChange: (url: string | null) => Promise<void>;
}

export function ClientDocumentsUpload({
  clientId,
  currentDocuments = [],
  currentLogo,
  onDocumentsChange,
  onLogoChange,
}: ClientDocumentsUploadProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [documents, setDocuments] = useState<string[]>(currentDocuments);
  const [logo, setLogo] = useState<string | null>(currentLogo || null);

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

  const handleLogoUpload = async (urls: string[]) => {
    try {
      setIsUpdating(true);
      if (urls.length > 0) {
        await onLogoChange(urls[0]);
        setLogo(urls[0]);
        toast.success('Logo mis à jour avec succès');
      } else {
        await onLogoChange(null);
        setLogo(null);
        toast.success('Logo supprimé');
      }
    } catch (error) {
      toast.error('Erreur lors de la mise à jour du logo');
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents client</CardTitle>
        <CardDescription>
          Ajoutez des documents et un logo pour votre client
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="documents">
          <TabsList className="mb-4">
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="logo">Logo</TabsTrigger>
          </TabsList>
          
          <TabsContent value="documents">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Ajoutez les documents importants pour ce client (contrats, factures, etc.)
              </p>
              
              <FileUpload
                onUpload={handleDocumentsUpload}
                multiple={true}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/*"
                maxSize={10}
                prefix={`client-${clientId}`}
                currentFiles={documents}
                showPreviews={true}
                dropzoneText="Déposez vos documents ici ou cliquez pour sélectionner"
              />
            </div>
          </TabsContent>
          
          <TabsContent value="logo">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Ajoutez le logo de l'entreprise cliente (format recommandé: JPG ou PNG)
              </p>
              
              {logo && (
                <div className="flex justify-center mb-4">
                  <div className="border rounded-md p-2 bg-gray-50 max-w-[200px]">
                    <img 
                      src={logo} 
                      alt="Logo du client" 
                      className="max-h-32 object-contain"
                    />
                  </div>
                </div>
              )}
              
              <FileUpload
                onUpload={handleLogoUpload}
                multiple={false}
                accept="image/*"
                maxSize={2}
                prefix={`client-logo-${clientId}`}
                currentFiles={logo ? [logo] : []}
                showPreviews={false}
                dropzoneText="Déposez le logo ici ou cliquez pour sélectionner"
              />
              
              {logo && (
                <div className="flex justify-center mt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleLogoUpload([])}
                    disabled={isUpdating}
                  >
                    Supprimer le logo
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
} 