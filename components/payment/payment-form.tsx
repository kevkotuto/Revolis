'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PaymentMethod, PaymentStatus, PaymentType } from '@prisma/client';

const paymentFormSchema = z.object({
  amount: z.string().min(1, 'Le montant est requis'),
  paymentType: z.enum(['CLIENT', 'PRESTATAIRE', 'SUBSCRIPTION', 'OTHER']),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CARD', 'CASH', 'CHECK', 'OTHER']),
  status: z.enum(['PENDING', 'PARTIAL', 'COMPLETE', 'REFUNDED', 'CANCELLED']),
  date: z.date(),
  description: z.string().optional(),
  reference: z.string().optional(),
  isPartial: z.boolean().default(false),
  partNumber: z.string().optional(),
  totalParts: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

interface PaymentFormProps {
  projectId: string;
  initialData?: PaymentFormValues;
  onSubmit: (data: PaymentFormValues) => Promise<void>;
}

export function PaymentForm({
  projectId,
  initialData,
  onSubmit,
}: PaymentFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isPartial, setIsPartial] = useState(false);
  const [formData, setFormData] = useState({
    amount: initialData?.amount || '',
    paymentType: initialData?.paymentType || 'CLIENT',
    paymentMethod: initialData?.paymentMethod || 'BANK_TRANSFER',
    status: initialData?.status || 'PENDING',
    description: initialData?.description || '',
    date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    isPartial: initialData?.isPartial || false,
    partNumber: initialData?.partNumber || 1,
    totalParts: initialData?.totalParts || 1,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await onSubmit({
        ...formData,
        amount: parseFloat(formData.amount),
        projectId,
      });
      toast.success('Paiement enregistré avec succès');
      router.refresh();
    } catch (error) {
      toast.error('Erreur lors de l\'enregistrement du paiement');
      console.error('Erreur:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="amount">Montant</Label>
            <Input
              id="amount"
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
              step="0.01"
              required
            />
          </div>

          <div>
            <Label htmlFor="paymentType">Type de paiement</Label>
            <Select
              value={formData.paymentType}
              onValueChange={(value) => setFormData({ ...formData, paymentType: value as PaymentType })}
            >
              <SelectTrigger>
                <SelectValue />
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
            <Label htmlFor="paymentMethod">Méthode de paiement</Label>
            <Select
              value={formData.paymentMethod}
              onValueChange={(value) => setFormData({ ...formData, paymentMethod: value as PaymentMethod })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK_TRANSFER">Virement bancaire</SelectItem>
                <SelectItem value="CARD">Carte</SelectItem>
                <SelectItem value="CASH">Espèces</SelectItem>
                <SelectItem value="CHECK">Chèque</SelectItem>
                <SelectItem value="OTHER">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="status">Statut</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value as PaymentStatus })}
            >
              <SelectTrigger>
                <SelectValue />
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
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Description du paiement"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="isPartial"
              checked={formData.isPartial}
              onCheckedChange={(checked) => {
                setIsPartial(checked);
                setFormData({ ...formData, isPartial: checked });
              }}
            />
            <Label htmlFor="isPartial">Paiement partiel</Label>
          </div>

          {formData.isPartial && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="partNumber">Numéro de partie</Label>
                <Input
                  id="partNumber"
                  type="number"
                  value={formData.partNumber}
                  onChange={(e) => setFormData({ ...formData, partNumber: parseInt(e.target.value) })}
                  min="1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="totalParts">Nombre total de parties</Label>
                <Input
                  id="totalParts"
                  type="number"
                  value={formData.totalParts}
                  onChange={(e) => setFormData({ ...formData, totalParts: parseInt(e.target.value) })}
                  min="1"
                  required
                />
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </motion.form>
  );
} 