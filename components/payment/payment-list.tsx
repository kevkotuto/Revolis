'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Trash2, Search } from 'lucide-react';
import { PaymentMethod, PaymentStatus, PaymentType } from '@prisma/client';

interface PaymentListProps {
  payments: any[];
  onDeletePayment: (id: string) => Promise<void>;
  onDownloadInvoice: (id: string) => Promise<void>;
}

export function PaymentList({ payments, onDeletePayment, onDownloadInvoice }: PaymentListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<PaymentType | 'ALL'>('ALL');

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch = payment.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || payment.status === filterStatus;
    const matchesType = filterType === 'ALL' || payment.paymentType === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

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
              placeholder="Rechercher un paiement..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="w-full md:w-48">
          <Label htmlFor="status">Statut</Label>
          <Select
            value={filterStatus}
            onValueChange={(value) => setFilterStatus(value as PaymentStatus | 'ALL')}
          >
            <SelectTrigger>
              <SelectValue />
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
        </div>

        <div className="w-full md:w-48">
          <Label htmlFor="type">Type</Label>
          <Select
            value={filterType}
            onValueChange={(value) => setFilterType(value as PaymentType | 'ALL')}
          >
            <SelectTrigger>
              <SelectValue />
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

      <AnimatePresence>
        {filteredPayments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-8 text-gray-500"
          >
            Aucun paiement trouvé
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredPayments.map((payment) => (
              <motion.div
                key={payment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="border rounded-lg p-4 space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-6 w-6 text-gray-400" />
                    <div>
                      <h3 className="font-medium">{formatAmount(payment.amount)}</h3>
                      <p className="text-sm text-gray-500">{payment.paymentType}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {payment.invoiceUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownloadInvoice(payment.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeletePayment(payment.id)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {payment.description && (
                  <p className="text-sm text-gray-600">{payment.description}</p>
                )}

                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center space-x-4">
                    <span>{new Date(payment.date).toLocaleDateString('fr-FR')}</span>
                    <span className="px-2 py-1 rounded-full bg-gray-100">
                      {payment.status}
                    </span>
                  </div>
                  <span>{payment.paymentMethod}</span>
                </div>

                {payment.isPartial && (
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Partie {payment.partNumber} sur {payment.totalParts}</span>
                    <span>{formatAmount(payment.amount / payment.totalParts)} par partie</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
} 