import { useState } from 'react';
import { 
  Plus, Search, Filter, Receipt, Edit2, Trash2, CreditCard, CalendarIcon, 
  BadgeDollarSign, FileText, Download 
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Types pour les paiements
interface Payment {
  id: string;
  amount: number;
  paymentType: 'CLIENT' | 'PRESTATAIRE' | 'SUBSCRIPTION' | 'OTHER';
  paymentMethod: 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'MOBILE_MONEY' | 'OTHER';
  paymentStatus: 'PENDING' | 'PARTIAL' | 'COMPLETE' | 'REFUNDED' | 'CANCELLED';
  date: string;
  description?: string | null;
  reference?: string | null;
  isPartial?: boolean;
  totalAmount?: number | null;
  projectId: string;
  clientId?: string | null;
  prestataireId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaymentManagementProps {
  projectId: string;
  initialPayments: Payment[];
  currency: string;
}

const paymentTypeLabels: Record<string, string> = {
  'CLIENT': 'Client',
  'PRESTATAIRE': 'Prestataire',
  'SUBSCRIPTION': 'Abonnement',
  'OTHER': 'Autre'
};

const paymentMethodLabels: Record<string, string> = {
  'BANK_TRANSFER': 'Virement bancaire',
  'CASH': 'Espèces',
  'CHECK': 'Chèque',
  'CREDIT_CARD': 'Carte bancaire',
  'MOBILE_MONEY': 'Mobile Money',
  'OTHER': 'Autre'
};

const paymentStatusColors: Record<string, string> = {
  'PENDING': 'bg-yellow-100 text-yellow-800',
  'PARTIAL': 'bg-blue-100 text-blue-800',
  'COMPLETE': 'bg-green-100 text-green-800',
  'REFUNDED': 'bg-purple-100 text-purple-800',
  'CANCELLED': 'bg-red-100 text-red-800'
};

const paymentStatusLabels: Record<string, string> = {
  'PENDING': 'En attente',
  'PARTIAL': 'Partiel',
  'COMPLETE': 'Complet',
  'REFUNDED': 'Remboursé',
  'CANCELLED': 'Annulé'
};

export function PaymentManagement({ projectId, initialPayments, currency }: PaymentManagementProps) {
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    paymentType: 'CLIENT' as 'CLIENT' | 'PRESTATAIRE' | 'SUBSCRIPTION' | 'OTHER',
    paymentMethod: 'BANK_TRANSFER' as 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'MOBILE_MONEY' | 'OTHER',
    paymentStatus: 'COMPLETE' as 'PENDING' | 'PARTIAL' | 'COMPLETE' | 'REFUNDED' | 'CANCELLED',
    date: new Date(),
    description: '',
    reference: '',
    isPartial: false,
    totalAmount: '',
  });
  const [activeTab, setActiveTab] = useState('entrees');

  // Fonction pour filtrer les paiements
  const filteredPayments = payments.filter((payment) => {
    const matchesSearch = 
      (payment.description && payment.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (payment.reference && payment.reference.toLowerCase().includes(searchTerm.toLowerCase())) || 
      payment.amount.toString().includes(searchTerm);
    const matchesStatus = statusFilter === 'ALL' || payment.paymentStatus === statusFilter;
    const matchesType = typeFilter === 'ALL' || payment.paymentType === typeFilter;
    const matchesDirection = 
      (activeTab === 'entrees' && payment.paymentType === 'CLIENT') ||
      (activeTab === 'sorties' && payment.paymentType === 'PRESTATAIRE') ||
      activeTab === 'tous';
    return matchesSearch && matchesStatus && matchesType && matchesDirection;
  });

  // Fonction pour créer un nouveau paiement
  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = {
        amount: parseFloat(formData.amount),
        paymentType: formData.paymentType,
        paymentMethod: formData.paymentMethod,
        paymentStatus: formData.paymentStatus,
        date: formData.date.toISOString(),
        description: formData.description || null,
        reference: formData.reference || null,
        isPartial: formData.isPartial,
        totalAmount: formData.isPartial ? parseFloat(formData.totalAmount) : null,
        projectId: projectId
      };

      const response = await fetch(`/api/projects/${projectId}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la création du paiement');
      }

      const newPayment = await response.json();
      setPayments(prev => [...prev, newPayment]);
      toast.success('Paiement créé avec succès');
      resetForm();
      setIsPaymentDialogOpen(false);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la création du paiement');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour mettre à jour un paiement
  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPayment) return;
    setIsLoading(true);

    try {
      const payload = {
        amount: parseFloat(formData.amount),
        paymentType: formData.paymentType,
        paymentMethod: formData.paymentMethod,
        paymentStatus: formData.paymentStatus,
        date: formData.date.toISOString(),
        description: formData.description || null,
        reference: formData.reference || null,
        isPartial: formData.isPartial,
        totalAmount: formData.isPartial ? parseFloat(formData.totalAmount) : null,
      };

      const response = await fetch(`/api/projects/${projectId}/payments/${currentPayment.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour du paiement');
      }

      const updatedPayment = await response.json();
      setPayments(prev => prev.map(payment => payment.id === currentPayment.id ? updatedPayment : payment));
      toast.success('Paiement mis à jour avec succès');
      resetForm();
      setIsPaymentDialogOpen(false);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la mise à jour du paiement');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour supprimer un paiement
  const handleDeletePayment = async () => {
    if (!currentPayment) return;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/payments/${currentPayment.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression du paiement');
      }

      setPayments(prev => prev.filter(payment => payment.id !== currentPayment.id));
      toast.success('Paiement supprimé avec succès');
      setIsDeleteDialogOpen(false);
      setCurrentPayment(null);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la suppression du paiement');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      amount: '',
      paymentType: 'CLIENT',
      paymentMethod: 'BANK_TRANSFER',
      paymentStatus: 'COMPLETE',
      date: new Date(),
      description: '',
      reference: '',
      isPartial: false,
      totalAmount: '',
    });
    setCurrentPayment(null);
  };

  // Fonction pour ouvrir le dialogue de création de paiement
  const openCreatePaymentDialog = () => {
    resetForm();
    setIsPaymentDialogOpen(true);
  };

  // Fonction pour ouvrir le dialogue d'édition de paiement
  const openEditPaymentDialog = (payment: Payment) => {
    setCurrentPayment(payment);
    setFormData({
      amount: payment.amount.toString(),
      paymentType: payment.paymentType,
      paymentMethod: payment.paymentMethod,
      paymentStatus: payment.paymentStatus,
      date: new Date(payment.date),
      description: payment.description || '',
      reference: payment.reference || '',
      isPartial: payment.isPartial || false,
      totalAmount: payment.totalAmount ? payment.totalAmount.toString() : '',
    });
    setIsPaymentDialogOpen(true);
  };

  // Fonction pour ouvrir le dialogue de suppression de paiement
  const openDeletePaymentDialog = (payment: Payment) => {
    setCurrentPayment(payment);
    setIsDeleteDialogOpen(true);
  };

  // Formatage des dates
  const formatDate = (date: Date | string) => {
    return format(new Date(date), 'dd MMM yyyy', { locale: fr });
  };

  // Calcul des statistiques
  const calculateStats = () => {
    const clientPayments = payments.filter(p => 
      p.paymentType === 'CLIENT' && 
      p.paymentStatus !== 'CANCELLED' && 
      p.paymentStatus !== 'REFUNDED'
    );
    const prestatairePayments = payments.filter(p => 
      p.paymentType === 'PRESTATAIRE' && 
      p.paymentStatus !== 'CANCELLED' && 
      p.paymentStatus !== 'REFUNDED'
    );
    
    const totalReceived = clientPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalPaid = prestatairePayments.reduce((sum, p) => sum + p.amount, 0);
    const balance = totalReceived - totalPaid;
    
    return { totalReceived, totalPaid, balance };
  };

  const stats = calculateStats();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <BadgeDollarSign className="mr-2 h-5 w-5 text-green-600" />
              Total reçu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              {stats.totalReceived.toLocaleString()} {currency}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <BadgeDollarSign className="mr-2 h-5 w-5 text-red-600" />
              Total payé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">
              {stats.totalPaid.toLocaleString()} {currency}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <BadgeDollarSign className="mr-2 h-5 w-5 text-blue-600" />
              Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              {stats.balance.toLocaleString()} {currency}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tous" value={activeTab} onValueChange={setActiveTab}>
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="tous">Tous</TabsTrigger>
            <TabsTrigger value="entrees">Entrées</TabsTrigger>
            <TabsTrigger value="sorties">Sorties</TabsTrigger>
          </TabsList>
          
          <Button onClick={openCreatePaymentDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau paiement
          </Button>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher un paiement..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2 flex-wrap md:flex-nowrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                <SelectItem value="PENDING">En attente</SelectItem>
                <SelectItem value="PARTIAL">Partiel</SelectItem>
                <SelectItem value="COMPLETE">Complet</SelectItem>
                <SelectItem value="REFUNDED">Remboursé</SelectItem>
                <SelectItem value="CANCELLED">Annulé</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les types</SelectItem>
                <SelectItem value="CLIENT">Client</SelectItem>
                <SelectItem value="PRESTATAIRE">Prestataire</SelectItem>
                <SelectItem value="SUBSCRIPTION">Abonnement</SelectItem>
                <SelectItem value="OTHER">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {filteredPayments.length === 0 ? (
              <div className="text-center py-12 space-y-4">
                <Receipt className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="text-xl font-semibold">Aucun paiement trouvé</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  {payments.length === 0
                    ? "Aucun paiement n'a encore été enregistré pour ce projet."
                    : "Aucun paiement ne correspond à vos critères de recherche."}
                </p>
                <Button onClick={openCreatePaymentDialog}>
                  Ajouter un paiement
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-center">Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((payment, index) => (
                      <TableRow 
                        key={payment.id}
                        className="animate-list-item-appear"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <TableCell className="font-medium whitespace-nowrap">
                          {formatDate(payment.date)}
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate">
                          {payment.description || '-'}
                        </TableCell>
                        <TableCell>{payment.reference || '-'}</TableCell>
                        <TableCell>{paymentTypeLabels[payment.paymentType]}</TableCell>
                        <TableCell>{paymentMethodLabels[payment.paymentMethod]}</TableCell>
                        <TableCell className={`text-right font-semibold
                          ${payment.paymentType === 'CLIENT' ? 'text-green-600' : 'text-red-600'}`}>
                          {payment.paymentType === 'CLIENT' ? '+' : '-'}{payment.amount.toLocaleString()} {currency}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={paymentStatusColors[payment.paymentStatus]}>
                            {paymentStatusLabels[payment.paymentStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditPaymentDialog(payment)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeletePaymentDialog(payment)}
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
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>

      {/* Dialogue pour la création/modification de paiement */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentPayment ? 'Modifier le paiement' : 'Nouveau paiement'}</DialogTitle>
            <DialogDescription>
              {currentPayment 
                ? 'Modifiez les détails du paiement et cliquez sur Enregistrer pour sauvegarder vos modifications.' 
                : 'Remplissez les détails du paiement et cliquez sur Créer pour l\'ajouter au projet.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={currentPayment ? handleUpdatePayment : handleCreatePayment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="payment-amount">Montant</Label>
                <div className="relative">
                  <Input
                    id="payment-amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="Montant"
                    required
                    className="pl-6"
                  />
                  <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500">
                    {currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency}
                  </span>
                </div>
              </div>

              <div>
                <Label htmlFor="payment-date">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="payment-date"
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !formData.date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.date ? (
                        format(formData.date, 'PPP', { locale: fr })
                      ) : (
                        <span>Choisir une date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.date}
                      onSelect={(date: Date | undefined) => date && setFormData({ ...formData, date })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="payment-type">Type de paiement</Label>
                <Select
                  value={formData.paymentType}
                  onValueChange={(value) => setFormData({ 
                    ...formData, 
                    paymentType: value as 'CLIENT' | 'PRESTATAIRE' | 'SUBSCRIPTION' | 'OTHER' 
                  })}
                >
                  <SelectTrigger id="payment-type">
                    <SelectValue placeholder="Sélectionner un type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLIENT">Client</SelectItem>
                    <SelectItem value="PRESTATAIRE">Prestataire</SelectItem>
                    <SelectItem value="SUBSCRIPTION">Abonnement</SelectItem>
                    <SelectItem value="OTHER">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="payment-method">Méthode de paiement</Label>
                <Select
                  value={formData.paymentMethod}
                  onValueChange={(value) => setFormData({ 
                    ...formData, 
                    paymentMethod: value as 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'MOBILE_MONEY' | 'OTHER' 
                  })}
                >
                  <SelectTrigger id="payment-method">
                    <SelectValue placeholder="Sélectionner une méthode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK_TRANSFER">Virement bancaire</SelectItem>
                    <SelectItem value="CASH">Espèces</SelectItem>
                    <SelectItem value="CHECK">Chèque</SelectItem>
                    <SelectItem value="CREDIT_CARD">Carte bancaire</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                    <SelectItem value="OTHER">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="payment-status">Statut du paiement</Label>
              <Select
                value={formData.paymentStatus}
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  paymentStatus: value as 'PENDING' | 'PARTIAL' | 'COMPLETE' | 'REFUNDED' | 'CANCELLED' 
                })}
              >
                <SelectTrigger id="payment-status">
                  <SelectValue placeholder="Sélectionner un statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">En attente</SelectItem>
                  <SelectItem value="PARTIAL">Partiel</SelectItem>
                  <SelectItem value="COMPLETE">Complet</SelectItem>
                  <SelectItem value="REFUNDED">Remboursé</SelectItem>
                  <SelectItem value="CANCELLED">Annulé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="is-partial" 
                checked={formData.isPartial}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, isPartial: checked as boolean })
                }
              />
              <Label htmlFor="is-partial">Paiement partiel</Label>
            </div>

            {formData.isPartial && (
              <div>
                <Label htmlFor="total-amount">Montant total</Label>
                <div className="relative">
                  <Input
                    id="total-amount"
                    type="number"
                    step="0.01"
                    value={formData.totalAmount}
                    onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                    placeholder="Montant total"
                    required
                    className="pl-6"
                  />
                  <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500">
                    {currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency}
                  </span>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="payment-reference">Référence</Label>
              <Input
                id="payment-reference"
                value={formData.reference}
                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                placeholder="Numéro de référence ou de facture"
              />
            </div>

            <div>
              <Label htmlFor="payment-description">Description</Label>
              <Textarea
                id="payment-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description du paiement"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsPaymentDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 
                  (currentPayment ? 'Mise à jour...' : 'Création...') : 
                  (currentPayment ? 'Enregistrer' : 'Créer le paiement')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialogue de confirmation de suppression */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le paiement</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer ce paiement ? Cette action ne peut pas être annulée.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDeletePayment} disabled={isLoading}>
              {isLoading ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 