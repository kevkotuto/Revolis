'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Trash, Edit, Mail, Phone, FolderOpen } from 'lucide-react';
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

// Type pour le client
interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    projects: number;
    payments: number;
  };
}

export default function ClientsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // États pour les formulaires
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [currentClient, setCurrentClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });

  // Effet pour charger les clients au chargement de la page
  useEffect(() => {
    const fetchClients = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/clients');
        if (!response.ok) {
          throw new Error('Erreur lors de la récupération des clients');
        }
        const data = await response.json();
        setClients(data);
        setFilteredClients(data);
      } catch (error) {
        console.error('Erreur:', error);
        toast.error("Impossible de charger les clients");
      } finally {
        setIsLoading(false);
      }
    };

    if (status === 'authenticated') {
      fetchClients();
    }
  }, [status]);

  // Filtrer les clients en fonction du terme de recherche
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredClients(clients);
    } else {
      const term = searchTerm.toLowerCase().trim();
      const filtered = clients.filter(client => 
        client.name.toLowerCase().includes(term) || 
        (client.email && client.email.toLowerCase().includes(term)) ||
        (client.phone && client.phone.toLowerCase().includes(term))
      );
      setFilteredClients(filtered);
    }
  }, [searchTerm, clients]);

  // Gérer le changement dans le formulaire
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
    });
  };

  // Ajouter un client
  const handleAddClient = async () => {
    if (!formData.name.trim()) {
      toast.error("Le nom du client est requis");
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erreur lors de la création du client');
      }

      const newClient = await response.json();
      setClients(prev => [newClient, ...prev]);
      toast.success("Client ajouté avec succès");
      setOpenAddDialog(false);
      resetForm();
    } catch (error: any) {
      console.error('Erreur:', error);
      toast.error(error.message || "Erreur lors de l'ajout du client");
    } finally {
      setIsLoading(false);
    }
  };

  // Éditer un client
  const handleEditClient = async () => {
    if (!currentClient || !formData.name.trim()) {
      toast.error("Le nom du client est requis");
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/clients/${currentClient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erreur lors de la mise à jour du client');
      }

      const updatedClient = await response.json();
      setClients(prev => 
        prev.map(client => client.id === updatedClient.id ? updatedClient : client)
      );
      toast.success("Client mis à jour avec succès");
      setOpenEditDialog(false);
      resetForm();
      setCurrentClient(null);
    } catch (error: any) {
      console.error('Erreur:', error);
      toast.error(error.message || "Erreur lors de la mise à jour du client");
    } finally {
      setIsLoading(false);
    }
  };

  // Supprimer un client
  const handleDeleteClient = async () => {
    if (!currentClient) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/clients/${currentClient.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        
        // Vérifier si le client a des projets ou des paiements
        if (error.hasProjects || error.hasPayments) {
          toast.error("Impossible de supprimer un client avec des projets ou des paiements associés");
          setOpenDeleteDialog(false);
          setCurrentClient(null);
          return;
        }
        
        throw new Error(error.message || 'Erreur lors de la suppression du client');
      }

      setClients(prev => prev.filter(client => client.id !== currentClient.id));
      toast.success("Client supprimé avec succès");
      setOpenDeleteDialog(false);
      setCurrentClient(null);
    } catch (error: any) {
      console.error('Erreur:', error);
      toast.error(error.message || "Erreur lors de la suppression du client");
    } finally {
      setIsLoading(false);
    }
  };

  // Ouvrir la boîte de dialogue d'édition
  const openEdit = (client: Client) => {
    setCurrentClient(client);
    setFormData({
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
    });
    setOpenEditDialog(true);
  };

  // Ouvrir la boîte de dialogue de suppression
  const openDelete = (client: Client) => {
    setCurrentClient(client);
    setOpenDeleteDialog(true);
  };

  // Navigation vers les projets du client
  const navigateToProjects = (clientId: string) => {
    router.push(`/pro/projets?clientId=${clientId}`);
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
        <h1 className="text-3xl font-bold">Clients</h1>
        <Dialog open={openAddDialog} onOpenChange={setOpenAddDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setOpenAddDialog(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajouter un nouveau client</DialogTitle>
              <DialogDescription>
                Entrez les informations du client ci-dessous.
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
                  placeholder="Nom du client"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleFormChange}
                  placeholder="Email du client"
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
                  placeholder="Téléphone du client"
                  type="tel"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenAddDialog(false)}>Annuler</Button>
              <Button onClick={handleAddClient} disabled={isLoading}>
                {isLoading ? 'Chargement...' : 'Ajouter'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Rechercher un client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin h-8 w-8 border-t-2 border-blue-500 rounded-full" />
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center p-6 space-y-4">
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full">
            <FolderOpen className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold">Aucun client trouvé</h3>
          <p className="text-gray-500 max-w-md">
            {searchTerm.trim() !== '' 
              ? "Aucun client ne correspond à votre recherche." 
              : "Commencez par ajouter un nouveau client en cliquant sur le bouton ci-dessus."}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filteredClients.map((client, index) => (
              <div 
                key={client.id} 
                className="animate-list-item-appear transition-card"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <Card className="h-full hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-xl truncate">{client.name}</CardTitle>
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
                          <DropdownMenuItem onClick={() => openEdit(client)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigateToProjects(client.id)}>
                            <FolderOpen className="mr-2 h-4 w-4" />
                            Voir les projets
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => openDelete(client)}
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
                    {client.email && (
                      <div className="flex items-center text-sm">
                        <Mail className="h-4 w-4 mr-2 text-gray-500" />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center text-sm">
                        <Phone className="h-4 w-4 mr-2 text-gray-500" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-2 flex justify-between">
                    <div className="text-sm text-gray-500">
                      {client._count.projects} projet{client._count.projects !== 1 && 's'}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => navigateToProjects(client.id)}
                    >
                      <FolderOpen className="mr-2 h-4 w-4" />
                      Projets
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le client</DialogTitle>
            <DialogDescription>
              Modifiez les informations du client ci-dessous.
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
                placeholder="Nom du client"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                name="email"
                value={formData.email}
                onChange={handleFormChange}
                placeholder="Email du client"
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
                placeholder="Téléphone du client"
                type="tel"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenEditDialog(false)}>Annuler</Button>
            <Button onClick={handleEditClient} disabled={isLoading}>
              {isLoading ? 'Chargement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Boîte de dialogue pour la suppression */}
      <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le client</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer ce client? Cette action ne peut pas être annulée.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              <strong>Nom:</strong> {currentClient?.name}
            </p>
            {currentClient?._count && currentClient._count.projects > 0 && (
              <p className="text-sm text-red-500 mt-2">
                Ce client possède {currentClient._count.projects} projet{currentClient._count.projects !== 1 && 's'}.
              </p>
            )}
            {currentClient?._count && currentClient._count.payments > 0 && (
              <p className="text-sm text-red-500 mt-1">
                Ce client possède {currentClient._count.payments} paiement{currentClient._count.payments !== 1 && 's'}.
              </p>
            )}
            {(currentClient?._count?.projects ?? 0) > 0 || (currentClient?._count?.payments ?? 0) > 0 ? (
              <p className="text-sm text-red-500 mt-1">
                Vous devez d'abord supprimer ces éléments avant de pouvoir supprimer ce client.
              </p>
            ) : (
              <p className="text-sm text-gray-500 mt-2">
                Cette action est irréversible. Toutes les données associées à ce client seront définitivement supprimées.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteClient}
              disabled={
                isLoading || 
                (currentClient?._count?.projects ?? 0) > 0 || 
                (currentClient?._count?.payments ?? 0) > 0
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