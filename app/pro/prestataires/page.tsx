'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Trash, Edit, Mail, Phone, Briefcase, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';

// Import des composants UI
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

// Type pour le prestataire
interface Provider {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    payments: number;
  };
}

export default function ProvidersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [filteredProviders, setFilteredProviders] = useState<Provider[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // États pour les formulaires
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    description: '', // Utilisé pour remplir le champ role
  });

  // Effet pour charger les prestataires au chargement de la page
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/providers');
        if (!response.ok) {
          throw new Error('Erreur lors de la récupération des prestataires');
        }
        const data = await response.json();
        setProviders(data);
        setFilteredProviders(data);
      } catch (error) {
        console.error('Erreur:', error);
        toast.error("Impossible de charger les prestataires");
      } finally {
        setIsLoading(false);
      }
    };

    if (status === 'authenticated') {
      fetchProviders();
    }
  }, [status]);

  // Filtrer les prestataires en fonction du terme de recherche
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredProviders(providers);
    } else {
      const term = searchTerm.toLowerCase().trim();
      const filtered = providers.filter(provider => 
        provider.name.toLowerCase().includes(term) || 
        (provider.email && provider.email.toLowerCase().includes(term)) ||
        (provider.phone && provider.phone.toLowerCase().includes(term)) ||
        (provider.role && provider.role.toLowerCase().includes(term))
      );
      setFilteredProviders(filtered);
    }
  }, [searchTerm, providers]);

  // Gérer le changement dans le formulaire
  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      description: '',
    });
  };

  // Ajouter un prestataire
  const handleAddProvider = async () => {
    if (!formData.name.trim()) {
      toast.error("Le nom du prestataire est requis");
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erreur lors de la création du prestataire');
      }

      const newProvider = await response.json();
      setProviders(prev => [newProvider, ...prev]);
      toast.success("Prestataire ajouté avec succès");
      setOpenAddDialog(false);
      resetForm();
    } catch (error: any) {
      console.error('Erreur:', error);
      toast.error(error.message || "Erreur lors de l'ajout du prestataire");
    } finally {
      setIsLoading(false);
    }
  };

  // Éditer un prestataire
  const handleEditProvider = async () => {
    if (!currentProvider || !formData.name.trim()) {
      toast.error("Le nom du prestataire est requis");
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/providers/${currentProvider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erreur lors de la mise à jour du prestataire');
      }

      const updatedProvider = await response.json();
      setProviders(prev => 
        prev.map(provider => provider.id === updatedProvider.id ? updatedProvider : provider)
      );
      toast.success("Prestataire mis à jour avec succès");
      setOpenEditDialog(false);
      resetForm();
      setCurrentProvider(null);
    } catch (error: any) {
      console.error('Erreur:', error);
      toast.error(error.message || "Erreur lors de la mise à jour du prestataire");
    } finally {
      setIsLoading(false);
    }
  };

  // Supprimer un prestataire
  const handleDeleteProvider = async () => {
    if (!currentProvider) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/providers/${currentProvider.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        
        // Vérifier si le prestataire a des paiements
        if (error.hasPayments) {
          toast.error("Impossible de supprimer un prestataire avec des paiements associés");
          setOpenDeleteDialog(false);
          setCurrentProvider(null);
          return;
        }
        
        throw new Error(error.message || 'Erreur lors de la suppression du prestataire');
      }

      setProviders(prev => prev.filter(provider => provider.id !== currentProvider.id));
      toast.success("Prestataire supprimé avec succès");
      setOpenDeleteDialog(false);
      setCurrentProvider(null);
    } catch (error: any) {
      console.error('Erreur:', error);
      toast.error(error.message || "Erreur lors de la suppression du prestataire");
    } finally {
      setIsLoading(false);
    }
  };

  // Ouvrir la boîte de dialogue d'édition
  const openEdit = (provider: Provider) => {
    setCurrentProvider(provider);
    setFormData({
      name: provider.name,
      email: provider.email || '',
      phone: provider.phone || '',
      description: provider.role || '',
    });
    setOpenEditDialog(true);
  };

  // Ouvrir la boîte de dialogue de suppression
  const openDelete = (provider: Provider) => {
    setCurrentProvider(provider);
    setOpenDeleteDialog(true);
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-t-2 border-blue-500 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Prestataires</h1>
        <Dialog open={openAddDialog} onOpenChange={setOpenAddDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setOpenAddDialog(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un prestataire
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>Ajouter un nouveau prestataire</DialogTitle>
              <DialogDescription>
                Entrez les informations du prestataire ci-dessous.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="Nom du prestataire"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleFormChange}
                  placeholder="Email du prestataire"
                  type="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleFormChange}
                  placeholder="Téléphone du prestataire"
                  type="tel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Rôle / Fonction</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleFormChange}
                  placeholder="Rôle ou fonction du prestataire"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenAddDialog(false)}>Annuler</Button>
              <Button onClick={handleAddProvider} disabled={isLoading}>
                {isLoading ? 'Chargement...' : 'Ajouter'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Rechercher un prestataire..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin h-8 w-8 border-t-2 border-blue-500 rounded-full" />
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center p-6 space-y-4">
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full">
            <Briefcase className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold">Aucun prestataire trouvé</h3>
          <p className="text-gray-500 max-w-md">
            {searchTerm.trim() !== '' 
              ? "Aucun prestataire ne correspond à votre recherche." 
              : "Commencez par ajouter un nouveau prestataire en cliquant sur le bouton ci-dessus."}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filteredProviders.map((provider, index) => (
              <div 
                key={provider.id} 
                className="animate-list-item-appear transition-card"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <Card className="h-full hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-xl truncate">{provider.name}</CardTitle>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <span className="sr-only">Ouvrir le menu</span>
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                              <path d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                            </svg>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEdit(provider)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => openDelete(provider)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2 space-y-2">
                    {provider.email && (
                      <div className="flex items-center text-sm">
                        <Mail className="h-4 w-4 mr-2 text-gray-500" />
                        <span className="truncate">{provider.email}</span>
                      </div>
                    )}
                    {provider.phone && (
                      <div className="flex items-center text-sm">
                        <Phone className="h-4 w-4 mr-2 text-gray-500" />
                        <span>{provider.phone}</span>
                      </div>
                    )}
                    {provider.role && (
                      <div className="flex items-start text-sm mt-2">
                        <FileText className="h-4 w-4 mr-2 text-gray-500 mt-1 flex-shrink-0" />
                        <p className="line-clamp-2 text-gray-600">
                          {provider.role}
                        </p>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-2 flex justify-between">
                    <div className="text-sm text-gray-500">
                      {provider._count.payments} paiement{provider._count.payments !== 1 && 's'}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => openEdit(provider)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Éditer
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Boîte de dialogue pour l'édition */}
      <Dialog open={openEditDialog} onOpenChange={setOpenEditDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Modifier le prestataire</DialogTitle>
            <DialogDescription>
              Modifiez les informations du prestataire ci-dessous.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom *</Label>
              <Input
                id="edit-name"
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                placeholder="Nom du prestataire"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                name="email"
                value={formData.email}
                onChange={handleFormChange}
                placeholder="Email du prestataire"
                type="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Téléphone</Label>
              <Input
                id="edit-phone"
                name="phone"
                value={formData.phone}
                onChange={handleFormChange}
                placeholder="Téléphone du prestataire"
                type="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Rôle / Fonction</Label>
              <Textarea
                id="edit-description"
                name="description"
                value={formData.description}
                onChange={handleFormChange}
                placeholder="Rôle ou fonction du prestataire"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenEditDialog(false)}>Annuler</Button>
            <Button onClick={handleEditProvider} disabled={isLoading}>
              {isLoading ? 'Chargement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Boîte de dialogue pour la suppression */}
      <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le prestataire</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer ce prestataire? Cette action ne peut pas être annulée.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              <strong>Nom:</strong> {currentProvider?.name}
            </p>
            {currentProvider && currentProvider._count.payments > 0 && (
              <p className="text-sm text-red-500 mt-2">
                Ce prestataire possède {currentProvider._count.payments} paiement{currentProvider._count.payments !== 1 && 's'}.
              </p>
            )}
            {(currentProvider?._count?.payments ?? 0) > 0 ? (
              <p className="text-sm text-red-500 mt-1">
                Vous devez d'abord supprimer ces éléments avant de pouvoir supprimer ce prestataire.
              </p>
            ) : (
              <p className="text-sm text-gray-500 mt-2">
                Cette action est irréversible. Toutes les données associées à ce prestataire seront définitivement supprimées.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteProvider}
              disabled={
                isLoading || 
                (currentProvider?._count?.payments ?? 0) > 0
              }
            >
              {isLoading ? 'Chargement...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 