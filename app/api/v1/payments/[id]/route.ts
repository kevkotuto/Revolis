import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer un paiement spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'PAYMENT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Récupérer le paiement
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            companyId: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            companyId: true
          }
        },
        prestataire: {
          select: {
            id: true,
            name: true,
            companyId: true
          }
        },
        subscription: true
      }
    });
    
    // Vérifier si le paiement existe
    if (!payment) {
      return NextResponse.json({ error: "Paiement non trouvé" }, { status: 404 });
    }
    
    // Vérifier l'accès à la compagnie
    let companyId = null;
    
    if (payment.client) {
      companyId = payment.client.companyId;
    } else if (payment.project) {
      companyId = payment.project.companyId;
    } else if (payment.prestataire) {
      companyId = payment.prestataire.companyId;
    }
    
    // Si l'utilisateur n'est pas SUPER_ADMIN, vérifier s'il a accès à cette compagnie
    if (companyId && 
        permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour accéder à ce paiement" },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'PAYMENT',
      id,
      { action: 'Consultation d\'un paiement' }
    );
    
    return NextResponse.json(payment);
  } catch (error) {
    console.error('Erreur lors de la récupération du paiement:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération du paiement' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un paiement
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'PAYMENT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Récupérer le paiement existant
    const existingPayment = await prisma.payment.findUnique({
      where: { id },
      include: {
        client: { select: { companyId: true } },
        project: { select: { companyId: true } },
        prestataire: { select: { companyId: true } }
      }
    });
    
    // Vérifier si le paiement existe
    if (!existingPayment) {
      return NextResponse.json({ error: "Paiement non trouvé" }, { status: 404 });
    }
    
    // Vérifier l'accès à la compagnie
    let companyId = null;
    
    if (existingPayment.client) {
      companyId = existingPayment.client.companyId;
    } else if (existingPayment.project) {
      companyId = existingPayment.project.companyId;
    } else if (existingPayment.prestataire) {
      companyId = existingPayment.prestataire.companyId;
    }
    
    // Si l'utilisateur n'est pas SUPER_ADMIN, vérifier s'il a accès à cette compagnie
    if (companyId && 
        permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour modifier ce paiement" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour la mise à jour du paiement
    const PaymentUpdateSchema = z.object({
      amount: z.number().min(0.01, "Le montant doit être supérieur à 0").optional(),
      date: z.string().datetime().optional(),
      description: z.string().optional(),
      paymentMethod: z.enum(['BANK_TRANSFER', 'CARD', 'CASH', 'CHECK', 'OTHER']).optional(),
      status: z.enum(['PENDING', 'PARTIAL', 'COMPLETE', 'REFUNDED', 'CANCELLED']).optional(),
      reference: z.string().optional(),
      isPartial: z.boolean().optional(),
      partNumber: z.number().optional(),
      totalParts: z.number().optional()
    });
    
    // Valider les données
    const validationResult = PaymentUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier la cohérence des paiements partiels
    if (validatedData.isPartial !== undefined) {
      if (validatedData.isPartial) {
        // Si on change pour un paiement partiel, vérifier les champs requis
        const partNumber = validatedData.partNumber || existingPayment.partNumber;
        const totalParts = validatedData.totalParts || existingPayment.totalParts;
        
        if (!partNumber || !totalParts) {
          return NextResponse.json(
            { error: "Pour un paiement partiel, veuillez spécifier le numéro de la partie et le nombre total de parties" },
            { status: 400 }
          );
        }
        
        if (partNumber > totalParts) {
          return NextResponse.json(
            { error: "Le numéro de la partie ne peut pas être supérieur au nombre total de parties" },
            { status: 400 }
          );
        }
      }
    }
    
    // Préparer les données pour la mise à jour
    const updateData: any = { ...validatedData };
    
    // Convertir la date si elle est fournie
    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }
    
    // Mettre à jour le paiement
    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: updateData,
      include: {
        client: {
          select: {
            id: true,
            name: true
          }
        },
        project: {
          select: {
            id: true,
            name: true
          }
        },
        prestataire: {
          select: {
            id: true,
            name: true
          }
        },
        subscription: true
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'UPDATE',
      'PAYMENT',
      id,
      { action: 'Mise à jour d\'un paiement', updates: validatedData }
    );
    
    return NextResponse.json(updatedPayment);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du paiement:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour du paiement' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un paiement
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'PAYMENT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Récupérer le paiement existant
    const existingPayment = await prisma.payment.findUnique({
      where: { id },
      include: {
        client: { select: { companyId: true } },
        project: { select: { companyId: true } },
        prestataire: { select: { companyId: true } }
      }
    });
    
    // Vérifier si le paiement existe
    if (!existingPayment) {
      return NextResponse.json({ error: "Paiement non trouvé" }, { status: 404 });
    }
    
    // Vérifier l'accès à la compagnie
    let companyId = null;
    
    if (existingPayment.client) {
      companyId = existingPayment.client.companyId;
    } else if (existingPayment.project) {
      companyId = existingPayment.project.companyId;
    } else if (existingPayment.prestataire) {
      companyId = existingPayment.prestataire.companyId;
    }
    
    // Si l'utilisateur n'est pas SUPER_ADMIN, vérifier s'il a accès à cette compagnie
    if (companyId && 
        permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour supprimer ce paiement" },
        { status: 403 }
      );
    }
    
    // Supprimer le paiement
    await prisma.payment.delete({
      where: { id }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'PAYMENT',
      id,
      { action: 'Suppression d\'un paiement' }
    );
    
    return NextResponse.json({ message: "Paiement supprimé avec succès" });
  } catch (error) {
    console.error('Erreur lors de la suppression du paiement:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression du paiement' },
      { status: 500 }
    );
  }
} 