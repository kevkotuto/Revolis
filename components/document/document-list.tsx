'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileIcon, Download, Trash2, Search } from 'lucide-react';

// Définir DocumentType localement au lieu de l'importer
export type DocumentType = 'CONTRACT' | 'INVOICE' | 'QUOTE' | 'REPORT' | 'DESIGN' | 'OTHER';

interface Document {
  id: string;
  title: string;
  type: DocumentType;
  description: string | null;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
}

interface DocumentListProps {
  documents: Document[];
  onDeleteDocument: (id: string) => Promise<void>;
  onDownloadDocument: (id: string) => Promise<void>;
}

export function DocumentList({ documents, onDeleteDocument, onDownloadDocument }: DocumentListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<DocumentType | 'ALL'>('ALL');

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'ALL' || doc.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <Label htmlFor="search">Rechercher</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un document..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="w-full md:w-48">
          <Label htmlFor="type">Type de document</Label>
          <Select
            value={filterType}
            onValueChange={(value) => setFilterType(value as DocumentType | 'ALL')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les types</SelectItem>
              <SelectItem value="CONTRACT">Contrat</SelectItem>
              <SelectItem value="INVOICE">Facture</SelectItem>
              <SelectItem value="QUOTE">Devis</SelectItem>
              <SelectItem value="REPORT">Rapport</SelectItem>
              <SelectItem value="OTHER">Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="text-center py-8 text-gray-500 animate-fade-in">
          Aucun document trouvé
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="border rounded-lg p-4 space-y-4 transition-all duration-200 opacity-0 animate-fade-in"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <FileIcon className="h-6 w-6 text-gray-400" />
                  <div>
                    <h3 className="font-medium">{doc.title}</h3>
                    <p className="text-sm text-gray-500">{doc.type}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDownloadDocument(doc.id)}
                    className="h-8 w-8 p-0"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteDocument(doc.id)}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {doc.description && (
                <p className="text-sm text-gray-600">{doc.description}</p>
              )}

              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>{new Date(doc.createdAt).toLocaleDateString('fr-FR')}</span>
                <span>{doc.fileSize}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 