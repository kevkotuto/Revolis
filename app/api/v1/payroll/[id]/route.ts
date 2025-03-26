import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une fiche de paie spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Récupérer la fiche de paie
    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            companyId: true,
            role: true
          }
        }
      }
    });
    
    // Vérifier si la fiche de paie existe
    if (!payroll) {
      return NextResponse.json({ error: "Fiche de paie non trouvée" }, { status: 404 });
    }
    
    // Vérifier les permissions d'accès
    const isOwner = payroll.userId === permissionCheck.user?.id;
    const isCompanyAdmin = permissionCheck.role === 'COMPANY_ADMIN' && 
                           payroll.user.companyId === permissionCheck.user?.companyId;
    const isSuperAdmin = permissionCheck.role === 'SUPER_ADMIN';
    
    if (!isOwner && !isCompanyAdmin && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour accéder à cette fiche de paie" },
        { status: 403 }
      );
    }
    
    // Si l'utilisateur n'est pas autorisé à voir les détails financiers, les masquer
    let payrollData = payroll;
    if (!isOwner && !isCompanyAdmin && !isSuperAdmin) {
      payrollData = {
        ...payroll,
        grossPay: null,
        netPay: null,
        taxes: null,
        deductions: null,
        additions: null,
        details: null
      };
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      id,
      { action: 'Consultation d\'une fiche de paie' }
    );
    
    return NextResponse.json(payrollData);
  } catch (error) {
    console.error('Erreur lors de la récupération de la fiche de paie:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de la fiche de paie' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une fiche de paie
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Seuls les admins peuvent modifier les fiches de paie
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour modifier des fiches de paie" },
        { status: 403 }
      );
    }
    
    // Récupérer la fiche de paie existante
    const existingPayroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            companyId: true
          }
        }
      }
    });
    
    // Vérifier si la fiche de paie existe
    if (!existingPayroll) {
      return NextResponse.json({ error: "Fiche de paie non trouvée" }, { status: 404 });
    }
    
    // Si l'utilisateur est un COMPANY_ADMIN, vérifier qu'il modifie une fiche d'un utilisateur de sa propre entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        existingPayroll.user.companyId !== permissionCheck.user?.companyId) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas modifier une fiche de paie d'un utilisateur d'une autre entreprise" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour la mise à jour de la fiche de paie
    const PayrollUpdateSchema = z.object({
      period: z.string().optional(),
      year: z.number().int().min(2000).max(2100).optional(),
      month: z.number().int().min(1).max(12).optional(),
      grossPay: z.number().nonnegative().optional(),
      netPay: z.number().nonnegative().optional(),
      taxes: z.number().nonnegative().optional(),
      deductions: z.number().nonnegative().optional(),
      additions: z.number().nonnegative().optional(),
      issueDate: z.string().datetime().optional(),
      paymentDate: z.string().datetime().optional().nullable(),
      reference: z.string().optional(),
      details: z.string().optional(),
      notes: z.string().optional()
    });
    
    // Valider les données
    const validationResult = PayrollUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier la cohérence des dates si elles sont modifiées
    // Si l'année et le mois sont modifiés, vérifier qu'il n'existe pas déjà une fiche pour cette période
    if ((validatedData.year !== undefined || validatedData.month !== undefined) && 
        (validatedData.year !== existingPayroll.year || validatedData.month !== existingPayroll.month)) {
      
      const year = validatedData.year !== undefined ? validatedData.year : existingPayroll.year;
      const month = validatedData.month !== undefined ? validatedData.month : existingPayroll.month;
      
      const duplicatePayroll = await prisma.payroll.findFirst({
        where: {
          userId: existingPayroll.userId,
          year,
          month,
          id: { not: id } // Exclure la fiche actuelle
        }
      });
      
      if (duplicatePayroll) {
        return NextResponse.json(
          { error: "Une fiche de paie existe déjà pour cet utilisateur pour cette période" },
          { status: 409 }
        );
      }
    }
    
    // Préparer les données pour la mise à jour
    const updateData: any = { ...validatedData };
    
    // Convertir les dates si elles sont fournies
    if (updateData.issueDate) {
      updateData.issueDate = new Date(updateData.issueDate);
    }
    if (updateData.paymentDate !== undefined) {
      updateData.paymentDate = updateData.paymentDate ? new Date(updateData.paymentDate) : null;
    }
    
    // Mettre à jour la fiche de paie
    const updatedPayroll = await prisma.payroll.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'UPDATE',
      'OTHER',
      id,
      { action: 'Mise à jour d\'une fiche de paie', updates: validatedData }
    );
    
    return NextResponse.json(updatedPayroll);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la fiche de paie:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de la fiche de paie' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une fiche de paie
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const id = params.id;
    
    // Seuls les admins peuvent supprimer des fiches de paie
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour supprimer des fiches de paie" },
        { status: 403 }
      );
    }
    
    // Récupérer la fiche de paie existante
    const existingPayroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            companyId: true
          }
        }
      }
    });
    
    // Vérifier si la fiche de paie existe
    if (!existingPayroll) {
      return NextResponse.json({ error: "Fiche de paie non trouvée" }, { status: 404 });
    }
    
    // Si l'utilisateur est un COMPANY_ADMIN, vérifier qu'il supprime une fiche d'un utilisateur de sa propre entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        existingPayroll.user.companyId !== permissionCheck.user?.companyId) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas supprimer une fiche de paie d'un utilisateur d'une autre entreprise" },
        { status: 403 }
      );
    }
    
    // Supprimer la fiche de paie
    await prisma.payroll.delete({
      where: { id }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'OTHER',
      id,
      { action: 'Suppression d\'une fiche de paie' }
    );
    
    return NextResponse.json({ message: "Fiche de paie supprimée avec succès" });
  } catch (error) {
    console.error('Erreur lors de la suppression de la fiche de paie:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de la fiche de paie' },
      { status: 500 }
    );
  }
} 