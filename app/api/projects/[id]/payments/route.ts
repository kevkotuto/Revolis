import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json();
    const {
      amount,
      paymentType,
      paymentMethod,
      status,
      date,
      description,
      reference,
      isPartial,
      partNumber,
      totalParts,
    } = data;

    const payment = await prisma.payment.create({
      data: {
        amount: parseFloat(amount),
        paymentType,
        paymentMethod,
        status,
        date: new Date(date),
        description,
        reference,
        isPartial,
        partNumber: partNumber ? parseInt(partNumber) : null,
        totalParts: totalParts ? parseInt(totalParts) : null,
        projectId: params.id,
      },
    });

    return NextResponse.json(payment);
  } catch (error) {
    console.error('Erreur lors de la création du paiement:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création du paiement' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        projectId: params.id,
      },
      orderBy: {
        date: 'desc',
      },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error('Erreur lors de la récupération des paiements:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des paiements' },
      { status: 500 }
    );
  }
} 