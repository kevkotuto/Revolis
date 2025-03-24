import { useState, useRef } from 'react';
import {
  Plus, Search, Filter, FileText, Edit2, Trash2, Download, Upload,
  Archive as FileArchive, FileImage, Code as FileCode, File
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

// Import des composants UI
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card, CardContent, CardFooter, CardHeader, CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Types pour les documents
interface Document {
  id: string;
  title: string;
  type: 'CONTRACT' | 'INVOICE' | 'REPORT' | 'DESIGN' | 'OTHER';
  description: string | null;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
}

interface DocumentManagementProps {
  projectId: string;
  initialDocuments: Document[];
}

const documentTypeLabels: Record<string, string> = {
  'CONTRACT': 'Contrat',
  'INVOICE': 'Facture',
  'REPORT': 'Rapport',
  'DESIGN': 'Design',
  'OTHER': 'Autre'
};

const documentTypeIcons: Record<string, any> = {
  'CONTRACT': <FileText className="h-8 w-8 text-blue-500" />,
  'INVOICE': <FileText className="h-8 w-8 text-green-500" />,
  'REPORT': <FileText className="h-8 w-8 text-amber-500" />,
  'DESIGN': <FileImage className="h-8 w-8 text-purple-500" />,
  'OTHER': <File className="h-8 w-8 text-gray-500" />
};

export function DocumentManagement({ projectId, initialDocuments }: DocumentManagementProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments || []);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    type: 'OTHER' as 'CONTRACT' | 'INVOICE' | 'REPORT' | 'DESIGN' | 'OTHER',
    description: '',
  });
  const [activeView, setActiveView] = useState<'grid' | 'table'>('grid');

  // Fonction pour filtrer les documents
  const filteredDocuments = documents.filter((document) => {
    const matchesSearch = 
      document.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (document.description && document.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      document.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'ALL' || document.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Fonction pour upload un document
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Veuillez sélectionner un fichier');
      return;
    }
    
    setIsLoading(true);
    setUploadProgress(0);

    try {
      // Créer un formData pour envoyer le fichier
      const formDataObj = new FormData();
      formDataObj.append('file', selectedFile);
      formDataObj.append('title', formData.title);
      formDataObj.append('type', formData.type);
      formDataObj.append('description', formData.description || '');
      formDataObj.append('projectId', projectId);

      // Simuler une progression d'upload (à remplacer par une vraie implémentation)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return 95;
          }
          return prev + 5;
        });
      }, 200);

      const response = await fetch(`/api/projects/${projectId}/documents`, {
        method: 'POST',
        body: formDataObj,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        throw new Error('Erreur lors de l\'upload du document');
      }

      const newDocument = await response.json();
      setDocuments(prev => [...prev, newDocument]);
      toast.success('Document uploadé avec succès');
      resetForm();
      setIsUploadDialogOpen(false);

      // Réinitialiser la progression après un court délai
      setTimeout(() => {
        setUploadProgress(0);
      }, 500);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de l\'upload du document');
      setUploadProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour télécharger un document
  const handleDownloadDocument = async (document: Document) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/documents/${document.id}/download`);
      if (!response.ok) {
        throw new Error('Erreur lors du téléchargement du document');
      }

      // Créer un lien temporaire pour télécharger le fichier
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = document.fileName;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Téléchargement démarré');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors du téléchargement du document');
    }
  };

  // Fonction pour supprimer un document
  const handleDeleteDocument = async () => {
    if (!currentDocument) return;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/documents/${currentDocument.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression du document');
      }

      setDocuments(prev => prev.filter(doc => doc.id !== currentDocument.id));
      toast.success('Document supprimé avec succès');
      setIsDeleteDialogOpen(false);
      setCurrentDocument(null);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la suppression du document');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      title: '',
      type: 'OTHER',
      description: '',
    });
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setCurrentDocument(null);
  };

  // Fonction pour gérer la sélection de fichier
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // Si aucun titre n'est encore défini, utiliser le nom du fichier comme titre par défaut
      if (!formData.title) {
        setFormData(prev => ({
          ...prev,
          title: file.name.split('.')[0]
        }));
      }
    }
  };

  // Fonction pour ouvrir le dialogue d'upload de document
  const openUploadDialog = () => {
    resetForm();
    setIsUploadDialogOpen(true);
  };

  // Fonction pour ouvrir le dialogue de suppression de document
  const openDeleteDocumentDialog = (document: Document) => {
    setCurrentDocument(document);
    setIsDeleteDialogOpen(true);
  };

  // Formatage des dates
  const formatDate = (date: string) => {
    return format(new Date(date), 'dd MMM yyyy', { locale: fr });
  };

  // Formatage de la taille de fichier
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Fonction pour déterminer l'icône du fichier en fonction de son type MIME
  const getFileIcon = (document: Document) => {
    const { mimeType } = document;
    
    if (mimeType.includes('pdf')) {
      return <FileText className="h-8 w-8 text-red-500" />;
    } else if (mimeType.includes('image')) {
      return <FileImage className="h-8 w-8 text-purple-500" />;
    } else if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) {
      return <FileArchive className="h-8 w-8 text-amber-500" />;
    } else if (mimeType.includes('code') || mimeType.includes('javascript') || mimeType.includes('html') || mimeType.includes('css')) {
      return <FileCode className="h-8 w-8 text-blue-500" />;
    } else {
      return documentTypeIcons[document.type] || <File className="h-8 w-8 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher un document..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
        
        <div className="flex gap-2 flex-wrap md:flex-nowrap w-full md:w-auto">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les types</SelectItem>
              <SelectItem value="CONTRACT">Contrats</SelectItem>
              <SelectItem value="INVOICE">Factures</SelectItem>
              <SelectItem value="REPORT">Rapports</SelectItem>
              <SelectItem value="DESIGN">Designs</SelectItem>
              <SelectItem value="OTHER">Autres</SelectItem>
            </SelectContent>
          </Select>
          
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setActiveView('grid')}>
              <div className={cn(
                "size-4 grid grid-cols-2 gap-0.5",
                activeView === 'grid' ? "opacity-100" : "opacity-50"
              )}>
                <div className="bg-current rounded-sm"></div>
                <div className="bg-current rounded-sm"></div>
                <div className="bg-current rounded-sm"></div>
                <div className="bg-current rounded-sm"></div>
              </div>
            </Button>
            <Button variant="outline" size="icon" onClick={() => setActiveView('table')}>
              <div className={cn(
                "size-4 flex flex-col justify-between",
                activeView === 'table' ? "opacity-100" : "opacity-50"
              )}>
                <div className="h-0.5 w-full bg-current rounded-full"></div>
                <div className="h-0.5 w-full bg-current rounded-full"></div>
                <div className="h-0.5 w-full bg-current rounded-full"></div>
              </div>
            </Button>
          </div>
          
          <Button onClick={openUploadDialog}>
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="text-center py-12 space-y-4">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="text-xl font-semibold">Aucun document trouvé</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            {documents.length === 0
              ? "Aucun document n'a encore été uploadé pour ce projet."
              : "Aucun document ne correspond à vos critères de recherche."}
          </p>
          <Button onClick={openUploadDialog}>
            Uploader un document
          </Button>
        </div>
      ) : activeView === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredDocuments.map((document, index) => (
            <Card 
              key={document.id}
              className="transition-all duration-200 hover:shadow animate-list-item-appear"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base truncate pr-6">{document.title}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 absolute right-4 top-4">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDownloadDocument(document)}>
                        <Download className="mr-2 h-4 w-4" /> Télécharger
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => openDeleteDocumentDialog(document)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Badge className="w-fit">
                  {documentTypeLabels[document.type]}
                </Badge>
              </CardHeader>
              <CardContent className="p-4 flex items-center justify-center">
                <div className="text-center">
                  {getFileIcon(document)}
                  <p className="text-sm text-gray-500 mt-2 truncate max-w-full">
                    {document.fileName}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(document.fileSize)}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="pt-0 flex justify-between items-center">
                <span className="text-xs text-gray-500">
                  {formatDate(document.createdAt)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownloadDocument(document)}
                  className="h-8 w-8 p-0"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Taille</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((document, index) => (
                  <TableRow 
                    key={document.id}
                    className="animate-list-item-appear"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <TableCell>
                      <div className="flex items-center">
                        <div className="mr-2">
                          {getFileIcon(document)}
                        </div>
                        <div>
                          <div className="font-medium">{document.title}</div>
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {document.fileName}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {documentTypeLabels[document.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatFileSize(document.fileSize)}</TableCell>
                    <TableCell>{formatDate(document.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadDocument(document)}
                          className="h-8 w-8 p-0"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDocumentDialog(document)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialogue pour l'upload de document */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uploader un document</DialogTitle>
            <DialogDescription>
              Sélectionnez un fichier à uploader et remplissez les informations ci-dessous.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleUploadDocument} className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="file-upload">Fichier</Label>
                <div className="mt-1 flex justify-center rounded-md border-2 border-dashed border-gray-300 px-6 py-4">
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer rounded-md bg-white font-medium text-primary hover:text-primary/80 focus-within:outline-none"
                      >
                        <span>Sélectionner un fichier</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          onChange={handleFileChange}
                          ref={fileInputRef}
                        />
                      </label>
                      <p className="pl-1">ou glisser-déposer</p>
                    </div>
                    <p className="text-xs text-gray-500">
                      PDF, Word, Excel, Images, ZIP jusqu'à 10MB
                    </p>
                  </div>
                </div>
                {selectedFile && (
                  <div className="mt-2 flex items-center">
                    <FileText className="h-5 w-5 text-primary mr-2" />
                    <span className="text-sm font-medium truncate max-w-xs">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      {formatFileSize(selectedFile.size)}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="document-title">Titre</Label>
                <Input
                  id="document-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Titre du document"
                  required
                />
              </div>

              <div>
                <Label htmlFor="document-type">Type de document</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({
                    ...formData,
                    type: value as 'CONTRACT' | 'INVOICE' | 'REPORT' | 'DESIGN' | 'OTHER'
                  })}
                >
                  <SelectTrigger id="document-type">
                    <SelectValue placeholder="Sélectionner un type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONTRACT">Contrat</SelectItem>
                    <SelectItem value="INVOICE">Facture</SelectItem>
                    <SelectItem value="REPORT">Rapport</SelectItem>
                    <SelectItem value="DESIGN">Design</SelectItem>
                    <SelectItem value="OTHER">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="document-description">Description</Label>
                <Textarea
                  id="document-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description du document"
                  rows={3}
                />
              </div>

              {uploadProgress > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progression</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsUploadDialogOpen(false)}
                disabled={isLoading}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading || !selectedFile}>
                {isLoading ? 'Upload en cours...' : 'Uploader'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialogue de confirmation de suppression */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le document</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer ce document ? Cette action ne peut pas être annulée.
            </DialogDescription>
          </DialogHeader>
          {currentDocument && (
            <div className="flex items-center p-4 bg-gray-50 rounded-md">
              <div className="mr-4">
                {getFileIcon(currentDocument)}
              </div>
              <div>
                <p className="font-medium">{currentDocument.title}</p>
                <p className="text-sm text-gray-500">{currentDocument.fileName}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDeleteDocument} disabled={isLoading}>
              {isLoading ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 