'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentForm } from '@/components/payment/payment-form';

export default function NewPaymentPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  const handleSubmit = async (data: any) => {
    try {
      const response = await fetch(`/api/projects/${params.id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la création du paiement');
      }

      router.push(`/pro/projets/${params.id}`);
    } catch (error) {
      console.error('Erreur:', error);
      throw error;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nouveau paiement</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentForm
            projectId={params.id}
            onSubmit={handleSubmit}
          />
        </CardContent>
      </Card>
    </div>
  );
} 