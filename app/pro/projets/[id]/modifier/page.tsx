'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { ArrowLeft, BuildingIcon, Calendar, Users, BadgeDollarSign, X, Plus, RefreshCw, Loader2 } from 'lucide-react';

// Import des composants UI
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

// Interface pour les clients
interface Client {
  id: string;
  name: string;
  email: string | null;
}

// Interface pour les prestataires
interface Prestataire {
  id: string;
  name: string;
  role?: string | null;
}

// Interface pour les parties du projet
interface ProjectPart {
  id: string;
  name: string;
  description?: string;
  price: number;
}

// Interface pour les taux de change
interface ExchangeRate {
  sourceCurrency: string;
  targetCurrency: string;
  rate: number;
}

// Interface pour le projet
interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  totalPrice: number | null;
  fcfaEquivalent: number | null;
  currency: string;
  isFixedPrice: boolean;
  clientId: string | null;

  projectParts: {
    id: string;
    name: string;
    description: string | null;
    price: number;
  }[];

  projectPrestataires: {
    id: string;
    role: string | null;
    prestataireId: string;
    prestataire: {
      id: string;
      name: string;
    };
  }[];
}

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [selectedPrestataires, setSelectedPrestataires] = useState<{id: string, role: string}[]>([]);
  const [projectParts, setProjectParts] = useState<ProjectPart[]>([]);
  const [originalProjectParts, setOriginalProjectParts] = useState<string[]>([]); // IDs des parties existantes
  const [removedProjectParts, setRemovedProjectParts] = useState<string[]>([]); // IDs des parties à supprimer
  const [prestataireId, setPrestataireId] = useState<string>('');
  const [prestataireRole, setPrestataireRole] = useState<string>('');
  const [newPart, setNewPart] = useState<{ name: string, description: string, price: string }>({
    name: '',
    description: '',
    price: ''
  });
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({
    EUR: 655.957, // Taux par défaut: 1 EUR = 655.957 FCFA
    USD: 603.50,  // Taux par défaut: 1 USD = 603.50 FCFA
    GBP: 767.55,  // Taux par défaut: 1 GBP = 767.55 FCFA
    FCFA: 1       // 1 FCFA = 1 FCFA
  });
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const { id: projectId } = use(params);

  // État du formulaire
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'PENDING_VALIDATION',
    startDate: null as Date | null,
    endDate: null as Date | null,
    clientId: 'no-client',
    totalPrice: '',
    currency: 'FCFA',
    fcfaEquivalent: '',
    isFixedPrice: true,
  });

  // Chargement des clients et prestataires
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsFetching(true);
        
        // Récupération des clients
        const clientsResponse = await fetch('/api/clients');
        if (!clientsResponse.ok) throw new Error('Erreur lors de la récupération des clients');
        const clientsData = await clientsResponse.json();
        setClients(clientsData);
        
        // Récupération des prestataires
        const prestatairesResponse = await fetch('/api/providers');
        if (!prestatairesResponse.ok) throw new Error('Erreur lors de la récupération des prestataires');
        const prestatairesData = await prestatairesResponse.json();
        setPrestataires(prestatairesData);
        
        // Récupération des taux de change
        await fetchExchangeRates();
        
        // Récupération des données du projet
        const projectResponse = await fetch(`/api/projects/${projectId}`);
        if (!projectResponse.ok) throw new Error('Erreur lors de la récupération des détails du projet');
        const projectData: Project = await projectResponse.json();
        
        // Initialisation du formulaire avec les données du projet
        setFormData({
          name: projectData.name,
          description: projectData.description || '',
          status: projectData.status,
          startDate: projectData.startDate ? new Date(projectData.startDate) : null,
          endDate: projectData.endDate ? new Date(projectData.endDate) : null,
          clientId: projectData.clientId || 'no-client',
          totalPrice: projectData.totalPrice ? projectData.totalPrice.toString() : '',
          currency: projectData.currency || 'FCFA',
          fcfaEquivalent: projectData.fcfaEquivalent ? projectData.fcfaEquivalent.toString() : '',
          isFixedPrice: projectData.isFixedPrice,
        });
        
        // Initialisation des parties du projet
        if (projectData.projectParts && projectData.projectParts.length > 0) {
          setProjectParts(projectData.projectParts.map(part => ({
            id: part.id,
            name: part.name,
            description: part.description || '',
            price: part.price
          })));
          
          // Stocker les IDs des parties existantes
          setOriginalProjectParts(projectData.projectParts.map(part => part.id));
        }
        
        // Initialisation des prestataires du projet
        if (projectData.projectPrestataires && projectData.projectPrestataires.length > 0) {
          setSelectedPrestataires(projectData.projectPrestataires.map(pp => ({
            id: pp.prestataireId,
            role: pp.role || ''
          })));
        }
        
      } catch (error) {
        console.error('Erreur:', error);
        toast.error("Impossible de charger les données du projet");
      } finally {
        setIsFetching(false);
      }
    };

    if (status === 'authenticated' && projectId) {
      fetchData();
    }
  }, [status, projectId]);

  // Fonction pour récupérer les taux de change
  const fetchExchangeRates = async () => {
    try {
      setIsLoadingRates(true);
      const response = await fetch('/api/exchange-rates/default');
      if (!response.ok) throw new Error('Erreur lors de la récupération des taux de change');
      
      const data = await response.json();
      
      if (data && data.rates) {
        const newRates: Record<string, number> = { FCFA: 1 }; // Toujours garder FCFA comme référence
        
        // Ajouter les taux disponibles
        if (data.rates.EUR) newRates['EUR'] = data.rates.EUR;
        if (data.rates.USD) newRates['USD'] = data.rates.USD;
        if (data.rates.GBP) newRates['GBP'] = data.rates.GBP;
        
        // Ajouter d'autres devises si présentes dans les données
        Object.keys(data.rates).forEach(currency => {
          if (!newRates[currency]) {
            newRates[currency] = data.rates[currency];
          }
        });
        
        setExchangeRates(newRates);
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des taux de change:', error);
      toast.error('Impossible de charger les taux de change, utilisation des taux par défaut');
    } finally {
      setIsLoadingRates(false);
    }
  };

  // Convertir le montant vers FCFA
  const convertToFCFA = (amount: number, fromCurrency: string): number => {
    if (!amount || isNaN(amount)) return 0;
    if (fromCurrency === 'FCFA') return amount;
    return amount * (exchangeRates[fromCurrency] || 1);
  };

  // Convertir FCFA vers une autre devise
  const convertFromFCFA = (amountFCFA: number, toCurrency: string): number => {
    if (!amountFCFA || isNaN(amountFCFA)) return 0;
    if (toCurrency === 'FCFA') return amountFCFA;
    const rate = exchangeRates[toCurrency] || 1;
    return rate > 0 ? amountFCFA / rate : 0;
  };

  // Fonction pour mettre à jour les taux de change
  const updateExchangeRates = async () => {
    try {
      await fetchExchangeRates();
      
      // Mise à jour de l'équivalent en FCFA
      if (formData.isFixedPrice && formData.totalPrice) {
        const totalPrice = parseFloat(formData.totalPrice);
        const fcfaAmount = convertToFCFA(totalPrice, formData.currency);
        setFormData(prev => ({ ...prev, fcfaEquivalent: fcfaAmount.toString() }));
      } else {
        const totalParts = calculatePartsTotal();
        const fcfaAmount = convertToFCFA(totalParts, formData.currency);
        setFormData(prev => ({ ...prev, fcfaEquivalent: fcfaAmount.toString() }));
      }
      
      toast.success('Taux de change mis à jour');
    } catch (error) {
      console.error('Erreur lors de la mise à jour des taux de change:', error);
      toast.error('Impossible de mettre à jour les taux de change');
    } finally {
      setIsLoadingRates(false);
    }
  };

  // Effet pour mettre à jour l'équivalent en FCFA lorsque le prix ou la devise change
  useEffect(() => {
    if (formData.isFixedPrice && formData.totalPrice) {
      const totalPrice = parseFloat(formData.totalPrice);
      const fcfaAmount = convertToFCFA(totalPrice, formData.currency);
      setFormData(prev => ({ ...prev, fcfaEquivalent: fcfaAmount.toString() }));
    } else if (!formData.isFixedPrice) {
      const totalParts = calculatePartsTotal();
      const fcfaAmount = convertToFCFA(totalParts, formData.currency);
      setFormData(prev => ({ ...prev, fcfaEquivalent: fcfaAmount.toString() }));
    }
  }, [formData.totalPrice, formData.currency, formData.isFixedPrice, projectParts]);

  // Gestion des changements de formulaire
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Gestion des changements de select
  const handleSelectChange = (name: string, value: string) => {
    if (name === 'currency') {
      // Si on change la devise, on met à jour l'équivalent en FCFA
      const currentAmount = formData.isFixedPrice ? parseFloat(formData.totalPrice) || 0 : calculatePartsTotal();
      const fcfaAmount = convertToFCFA(currentAmount, value);
      setFormData(prev => ({ 
        ...prev, 
        [name]: value,
        fcfaEquivalent: fcfaAmount.toString()
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Gestion des changements de date
  const handleDateChange = (name: string, value: Date | React.SyntheticEvent<HTMLButtonElement, Event> | null) => {
    // Ne mettre à jour l'état que si value est une Date ou null
    if (value === null || value instanceof Date) {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Gestion du switch prix fixe/par partie
  const handleSwitchChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, isFixedPrice: checked }));
  };

  // Ajouter un prestataire
  const addPrestataire = () => {
    if (!prestataireId || prestataireId === '' || selectedPrestataires.some(p => p.id === prestataireId)) {
      toast.error("Veuillez sélectionner un prestataire valide");
      return;
    }
    
    setSelectedPrestataires(prev => [...prev, { id: prestataireId, role: prestataireRole }]);
    setPrestataireId('');
    setPrestataireRole('');
  };

  // Supprimer un prestataire
  const removePrestataire = (prestataireId: string) => {
    setSelectedPrestataires(prev => prev.filter(p => p.id !== prestataireId));
  };

  // Ajouter une partie de projet
  const addProjectPart = () => {
    if (!newPart.name || !newPart.price) {
      toast.error("Le nom et le prix sont requis pour une partie de projet");
      return;
    }

    const price = parseFloat(newPart.price);
    if (isNaN(price) || price < 0) {
      toast.error("Veuillez entrer un prix valide");
      return;
    }

    const newId = `temp-${Date.now()}`;
    setProjectParts(prev => [...prev, {
      id: newId,
      name: newPart.name,
      description: newPart.description,
      price
    }]);

    setNewPart({ name: '', description: '', price: '' });
  };

  // Supprimer une partie de projet
  const removeProjectPart = (id: string) => {
    // Si c'est une partie existante, l'ajouter à la liste des parties à supprimer
    if (originalProjectParts.includes(id)) {
      setRemovedProjectParts(prev => [...prev, id]);
    }
    
    setProjectParts(prev => prev.filter(part => part.id !== id));
  };

  // Calcul du total des parties
  const calculatePartsTotal = () => {
    return projectParts.reduce((total, part) => total + part.price, 0);
  };

  // Gestion des changements du formulaire de partie
  const handlePartInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewPart(prev => ({ ...prev, [name]: value }));
  };

  // Soumission du formulaire
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation du formulaire
    if (!formData.name.trim()) {
      toast.error("Le nom du projet est requis");
      return;
    }

    try {
      setIsLoading(true);
      
      const projectData = {
        ...formData,
        // Si clientId est "no-client", envoyez null ou omettez-le
        clientId: formData.clientId === 'no-client' ? null : formData.clientId,
        totalPrice: formData.isFixedPrice ? parseFloat(formData.totalPrice) || null : calculatePartsTotal(),
        fcfaEquivalent: parseFloat(formData.fcfaEquivalent) || null,
        exchangeRateDate: new Date(),
        projectParts: !formData.isFixedPrice ? 
          projectParts.map(part => ({
            ...part,
            fcfaEquivalent: convertToFCFA(part.price, formData.currency)
          })) : [],
        projectPrestataires: selectedPrestataires,
        removedProjectParts: removedProjectParts,
      };

      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
      });

      if (!response.ok) {
        let errorMessage = 'Erreur lors de la modification du projet';
        try {
          const errorData = await response.json();
          if (errorData && errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData && errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (jsonError) {
          console.error('Erreur de parsing JSON:', jsonError);
          errorMessage = `Erreur serveur (${response.status}): ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // On ne traite pas la réponse JSON ici en cas d'erreur
      toast.success('Projet modifié avec succès');
      router.push(`/pro/projets/${projectId}`);
    } catch (error: any) {
      console.error('Erreur:', error);
      toast.error(error.message || "Erreur lors de la modification du projet");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (status === 'loading' || isFetching) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-gray-500">Chargement des données du projet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold">Modifier le Projet</h1>
        </div>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                onClick={updateExchangeRates}
                disabled={isLoadingRates}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingRates ? 'animate-spin' : ''}`} />
                Actualiser taux
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Mettre à jour les taux de change</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Informations générales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Informations générales</CardTitle>
            <CardDescription>Informations de base du projet</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du projet *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Nom du projet"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="status">Statut</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value) => handleSelectChange('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING_VALIDATION">En attente de validation</SelectItem>
                    <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                    <SelectItem value="COMPLETED">Terminé</SelectItem>
                    <SelectItem value="PUBLISHED">Publié</SelectItem>
                    <SelectItem value="FUTURE">À venir</SelectItem>
                    <SelectItem value="PERSONAL">Personnel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="startDate">Date de début</Label>
                <DatePicker
                  selected={formData.startDate}
                  onSelect={(date) => handleDateChange('startDate', date)}
                  locale={fr}
                  placeholderText="Sélectionner une date de début"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="endDate">Date de fin prévue</Label>
                <DatePicker
                  selected={formData.endDate}
                  onSelect={(date) => handleDateChange('endDate', date)}
                  locale={fr}
                  placeholderText="Sélectionner une date de fin"
                />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Description du projet"
                  rows={4}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Client */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-xl">
              <BuildingIcon className="mr-2 h-5 w-5 text-gray-500" />
              Client
            </CardTitle>
            <CardDescription>Associer un client au projet</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <Label htmlFor="clientId">Sélectionner un client</Label>
              <Select 
                value={formData.clientId} 
                onValueChange={(value) => handleSelectChange('clientId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un client (optionnel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-client">Aucun client</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        
        {/* Prestataires */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-xl">
              <Users className="mr-2 h-5 w-5 text-gray-500" />
              Prestataires
            </CardTitle>
            <CardDescription>Associer des prestataires au projet</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {/* Liste des prestataires sélectionnés */}
              {selectedPrestataires.length > 0 && (
                <div className="space-y-2 mb-4">
                  <Label>Prestataires sélectionnés</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedPrestataires.map(selectedP => {
                      const prest = prestataires.find(p => p.id === selectedP.id);
                      return (
                        <Badge key={selectedP.id} variant="outline" className="p-2 flex items-center gap-1">
                          {prest?.name} 
                          {selectedP.role && <span className="text-gray-500">({selectedP.role})</span>}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5 ml-1 rounded-full p-0"
                            onClick={() => removePrestataire(selectedP.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Formulaire pour ajouter un prestataire */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end border p-4 rounded-md">
                <div className="space-y-2">
                  <Label htmlFor="prestataireId">Prestataire</Label>
                  <Select 
                    value={prestataireId} 
                    onValueChange={setPrestataireId}
                  >
                    <SelectTrigger id="prestataireId">
                      <SelectValue placeholder="Sélectionner un prestataire" />
                    </SelectTrigger>
                    <SelectContent>
                      {prestataires
                        .filter(p => !selectedPrestataires.some(sp => sp.id === p.id) && p.id && p.id.trim() !== '')
                        .map(prestataire => (
                          <SelectItem key={prestataire.id} value={prestataire.id}>
                            {prestataire.name}
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="prestataireRole">Rôle</Label>
                  <Input
                    id="prestataireRole"
                    value={prestataireRole}
                    onChange={(e) => setPrestataireRole(e.target.value)}
                    placeholder="Rôle dans le projet"
                  />
                </div>
                
                <div>
                  <Button 
                    type="button" 
                    variant="outline"
                    className="w-full"
                    onClick={addPrestataire}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Ajouter
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Tarification */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-xl">
              <BadgeDollarSign className="mr-2 h-5 w-5 text-gray-500" />
              Tarification
            </CardTitle>
            <CardDescription>Définir le prix du projet et la devise</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center space-x-4 mb-6">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="isFixedPrice" 
                  checked={formData.isFixedPrice} 
                  onCheckedChange={handleSwitchChange}
                />
                <Label htmlFor="isFixedPrice">Prix fixe</Label>
              </div>
              
              <div className="text-sm text-gray-500">
                {formData.isFixedPrice 
                  ? "Le projet a un prix total fixe" 
                  : "Le prix total est calculé à partir des parties du projet"
                }
              </div>
            </div>
            
            {formData.isFixedPrice ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="totalPrice">Prix total</Label>
                    <Input
                      id="totalPrice"
                      name="totalPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.totalPrice}
                      onChange={handleInputChange}
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="currency">Devise</Label>
                    <Select 
                      value={formData.currency} 
                      onValueChange={(value) => handleSelectChange('currency', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une devise" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FCFA">FCFA</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {formData.currency !== 'FCFA' && formData.totalPrice && (
                  <div className="bg-gray-50 p-3 rounded-md border flex justify-between items-center">
                    <div className="text-sm text-gray-600">Équivalent en FCFA:</div>
                    <HoverCard>
                      <HoverCardTrigger>
                        <div className="font-medium">
                          {parseFloat(formData.fcfaEquivalent).toLocaleString()} FCFA
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80">
                        <div className="space-y-2">
                          <h4 className="font-semibold">Taux de conversion appliqué</h4>
                          <div className="text-sm">
                            1 {formData.currency} = {exchangeRates[formData.currency]} FCFA
                          </div>
                          <div className="text-xs text-gray-500">
                            Taux indicatif. Le taux réel peut varier.
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label htmlFor="currency">Devise</Label>
                    <Select 
                      value={formData.currency} 
                      onValueChange={(value) => handleSelectChange('currency', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une devise" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FCFA">FCFA</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {formData.currency !== 'FCFA' && calculatePartsTotal() > 0 && (
                    <div className="bg-gray-50 p-3 rounded-md border flex justify-between items-center">
                      <div className="text-sm text-gray-600">Total en FCFA:</div>
                      <HoverCard>
                        <HoverCardTrigger>
                          <div className="font-medium">
                            {convertToFCFA(calculatePartsTotal(), formData.currency).toLocaleString()} FCFA
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80">
                          <div className="space-y-2">
                            <h4 className="font-semibold">Taux de conversion appliqué</h4>
                            <div className="text-sm">
                              1 {formData.currency} = {exchangeRates[formData.currency]} FCFA
                            </div>
                            <div className="text-xs text-gray-500">
                              Taux indicatif. Le taux réel peut varier.
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label>Parties du projet</Label>
                  {projectParts.length > 0 ? (
                    <div className="space-y-2">
                      {projectParts.map((part, index) => (
                        <div key={part.id} className="flex items-center justify-between p-3 border rounded-md">
                          <div>
                            <div className="font-medium">{part.name}</div>
                            {part.description && (
                              <div className="text-sm text-gray-500">{part.description}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-sm font-semibold">{part.price} {formData.currency}</div>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon"
                              onClick={() => removeProjectPart(part.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between p-3 border-t">
                        <div className="font-medium">Total</div>
                        <div className="font-bold">{calculatePartsTotal()} {formData.currency}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      Aucune partie ajoutée
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md">
                  <div className="space-y-2">
                    <Label htmlFor="partName">Nom</Label>
                    <Input
                      id="partName"
                      name="name"
                      value={newPart.name}
                      onChange={handlePartInputChange}
                      placeholder="Nom de la partie"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="partPrice">Prix</Label>
                    <div className="flex items-center">
                      <Input
                        id="partPrice"
                        name="price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={newPart.price}
                        onChange={handlePartInputChange}
                        placeholder="0.00"
                      />
                      <span className="ml-2">{formData.currency}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor="partDescription">Description (optionnelle)</Label>
                    <Textarea
                      id="partDescription"
                      name="description"
                      value={newPart.description}
                      onChange={handlePartInputChange}
                      placeholder="Description de la partie"
                      rows={2}
                    />
                  </div>
                  
                  <div className="md:col-span-3">
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={addProjectPart}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Ajouter une partie
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-end gap-4">
              <Button variant="outline" type="button" onClick={handleCancel}>
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
} 