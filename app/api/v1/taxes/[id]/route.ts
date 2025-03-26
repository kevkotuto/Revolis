import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une taxe spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'TAX'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Récupérer la taxe
    const tax = await prisma.tax.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    // Vérifier si la taxe existe
    if (!tax) {
      return NextResponse.json({ error: "Taxe non trouvée" }, { status: 404 });
    }
    
    // Vérifier les permissions d'accès
    if (
      !tax.isGlobal && 
      tax.companyId && 
      permissionCheck.role !== 'SUPER_ADMIN' && 
      permissionCheck.user?.companyId !== tax.companyId
    ) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour accéder à cette taxe" },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'TAX',
      id,
      { action: 'Consultation d\'une taxe' }
    );
    
    return NextResponse.json(tax);
  } catch (error) {
    console.error('Erreur lors de la récupération de la taxe:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de la taxe' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une taxe
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'TAX'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Récupérer la taxe existante
    const existingTax = await prisma.tax.findUnique({
      where: { id }
    });
    
    // Vérifier si la taxe existe
    if (!existingTax) {
      return NextResponse.json({ error: "Taxe non trouvée" }, { status: 404 });
    }
    
    // Vérifier les permissions de modification
    if (existingTax.isGlobal && permissionCheck.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "Seul un super administrateur peut modifier une taxe globale" },
        { status: 403 }
      );
    }
    
    if (
      !existingTax.isGlobal && 
      existingTax.companyId && 
      permissionCheck.role !== 'SUPER_ADMIN' && 
      permissionCheck.user?.companyId !== existingTax.companyId
    ) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour modifier cette taxe" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour la mise à jour de la taxe
    const TaxUpdateSchema = z.object({
      name: z.string().min(1, "Le nom est requis").optional(),
      description: z.string().optional(),
      value: z.number().min(0, "La valeur doit être supérieure ou égale à 0").optional(),
      active: z.boolean().optional(),
      priority: z.number().int().optional(),
      // Ne pas permettre la modification de isGlobal ou companyId après la création
    });
    
    // Valider les données
    const validationResult = TaxUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Mettre à jour la taxe
    const updatedTax = await prisma.tax.update({
      where: { id },
      data: validatedData,
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'UPDATE',
      'TAX',
      id,
      { action: 'Mise à jour d\'une taxe', updates: validatedData }
    );
    
    return NextResponse.json(updatedTax);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la taxe:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de la taxe' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une taxe
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'TAX'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Récupérer la taxe existante
    const existingTax = await prisma.tax.findUnique({
      where: { id }
    });
    
    // Vérifier si la taxe existe
    if (!existingTax) {
      return NextResponse.json({ error: "Taxe non trouvée" }, { status: 404 });
    }
    
    // Vérifier les permissions de suppression
    if (existingTax.isGlobal && permissionCheck.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "Seul un super administrateur peut supprimer une taxe globale" },
        { status: 403 }
      );
    }
    
    if (
      !existingTax.isGlobal && 
      existingTax.companyId && 
      permissionCheck.role !== 'SUPER_ADMIN' && 
      permissionCheck.user?.companyId !== existingTax.companyId
    ) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour supprimer cette taxe" },
        { status: 403 }
      );
    }
    
    // Vérifier si la taxe est utilisée par des devis ou factures
    const taxUsage = await prisma.$transaction([
      prisma.devisItem.findFirst({ where: { taxId: id } }),
      prisma.invoiceItem.findFirst({ where: { taxId: id } })
    ]);
    
    if (taxUsage[0] || taxUsage[1]) {
      return NextResponse.json(
        { error: "Cette taxe est utilisée par des devis ou factures et ne peut pas être supprimée" },
        { status: 400 }
      );
    }
    
    // Supprimer la taxe
    await prisma.tax.delete({
      where: { id }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'TAX',
      id,
      { action: 'Suppression d\'une taxe' }
    );
    
    return NextResponse.json({ message: "Taxe supprimée avec succès" });
  } catch (error) {
    console.error('Erreur lors de la suppression de la taxe:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de la taxe' },
      { status: 500 }
    );
  }
} 