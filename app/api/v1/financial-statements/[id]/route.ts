import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer un état financier spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions (seuls les administrateurs peuvent voir les états financiers)
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'COMPANY'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Vérifier que l'utilisateur est un administrateur
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour consulter les états financiers" },
        { status: 403 }
      );
    }

    const id = params.id;
    
    // Récupérer l'état financier
    const financialStatement = await prisma.financialStatement.findUnique({
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
    
    if (!financialStatement) {
      return NextResponse.json(
        { error: "État financier non trouvé" },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de voir cet état financier
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== financialStatement.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour voir cet état financier" },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'COMPANY',
      id,
      { action: "Consultation d'un état financier" }
    );
    
    return NextResponse.json(financialStatement);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'état financier:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de l\'état financier' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un état financier
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions (seuls les administrateurs peuvent modifier les états financiers)
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'COMPANY'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Vérifier que l'utilisateur est un administrateur
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour modifier les états financiers" },
        { status: 403 }
      );
    }

    const id = params.id;
    
    // Récupérer l'état financier existant
    const existingStatement = await prisma.financialStatement.findUnique({
      where: { id }
    });
    
    if (!existingStatement) {
      return NextResponse.json(
        { error: "État financier non trouvé" },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de modifier cet état financier
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== existingStatement.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour modifier cet état financier" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation
    const UpdateSchema = z.object({
      revenue: z.number().optional(),
      expenses: z.number().optional(),
      profit: z.number().optional(),
      periodStart: z.string().refine(val => !isNaN(Date.parse(val)), {
        message: "Date de début de période invalide"
      }).optional(),
      periodEnd: z.string().refine(val => !isNaN(Date.parse(val)), {
        message: "Date de fin de période invalide"
      }).optional()
    });
    
    // Valider les données
    const validationResult = UpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Préparer les données de mise à jour
    const updateData: any = {};
    
    if (validatedData.revenue !== undefined) {
      updateData.revenue = validatedData.revenue;
    }
    
    if (validatedData.expenses !== undefined) {
      updateData.expenses = validatedData.expenses;
    }
    
    if (validatedData.periodStart !== undefined) {
      updateData.periodStart = new Date(validatedData.periodStart);
    }
    
    if (validatedData.periodEnd !== undefined) {
      updateData.periodEnd = new Date(validatedData.periodEnd);
    }
    
    // Si profit est fourni explicitement, l'utiliser, sinon le recalculer
    if (validatedData.profit !== undefined) {
      updateData.profit = validatedData.profit;
    } else if (validatedData.revenue !== undefined || validatedData.expenses !== undefined) {
      // Recalculer le profit si revenue ou expenses a changé
      const newRevenue = validatedData.revenue !== undefined ? validatedData.revenue : existingStatement.revenue.toNumber();
      const newExpenses = validatedData.expenses !== undefined ? validatedData.expenses : existingStatement.expenses.toNumber();
      updateData.profit = newRevenue - newExpenses;
    }
    
    // Vérifier la cohérence des dates si elles sont modifiées
    if (updateData.periodStart && updateData.periodEnd) {
      if (updateData.periodEnd <= updateData.periodStart) {
        return NextResponse.json(
          { error: "La date de fin doit être postérieure à la date de début" },
          { status: 400 }
        );
      }
    } else if (updateData.periodStart && !updateData.periodEnd) {
      if (new Date(updateData.periodStart) >= existingStatement.periodEnd) {
        return NextResponse.json(
          { error: "La date de début doit être antérieure à la date de fin" },
          { status: 400 }
        );
      }
    } else if (!updateData.periodStart && updateData.periodEnd) {
      if (existingStatement.periodStart >= new Date(updateData.periodEnd)) {
        return NextResponse.json(
          { error: "La date de fin doit être postérieure à la date de début" },
          { status: 400 }
        );
      }
    }
    
    // Vérifier qu'il n'y a pas de conflit avec d'autres états financiers
    if (updateData.periodStart || updateData.periodEnd) {
      const newPeriodStart = updateData.periodStart || existingStatement.periodStart;
      const newPeriodEnd = updateData.periodEnd || existingStatement.periodEnd;
      
      const conflictingStatement = await prisma.financialStatement.findFirst({
        where: {
          id: { not: id },
          companyId: existingStatement.companyId,
          OR: [
            {
              periodStart: {
                lte: newPeriodEnd
              },
              periodEnd: {
                gte: newPeriodStart
              }
            }
          ]
        }
      });
      
      if (conflictingStatement) {
        return NextResponse.json(
          { error: "La période spécifiée entre en conflit avec un autre état financier existant" },
          { status: 409 }
        );
      }
    }
    
    // Mettre à jour l'état financier
    const updatedStatement = await prisma.financialStatement.update({
      where: { id },
      data: updateData,
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
      permissionCheck.user!.id,
      'UPDATE',
      'COMPANY',
      id,
      { 
        action: "Mise à jour d'un état financier",
        companyId: existingStatement.companyId,
        updatedFields: Object.keys(updateData)
      }
    );
    
    return NextResponse.json(updatedStatement);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'état financier:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de l\'état financier' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un état financier
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions (seul le SUPER_ADMIN peut supprimer des états financiers)
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'COMPANY'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Vérifier que l'utilisateur est un SUPER_ADMIN
    if (permissionCheck.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "Seul un super administrateur peut supprimer des états financiers" },
        { status: 403 }
      );
    }

    const id = params.id;
    
    // Récupérer l'état financier
    const financialStatement = await prisma.financialStatement.findUnique({
      where: { id }
    });
    
    if (!financialStatement) {
      return NextResponse.json(
        { error: "État financier non trouvé" },
        { status: 404 }
      );
    }
    
    // Supprimer l'état financier
    await prisma.financialStatement.delete({
      where: { id }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'DELETE',
      'COMPANY',
      id,
      { 
        action: "Suppression d'un état financier",
        companyId: financialStatement.companyId,
        period: `${financialStatement.periodStart.toISOString()} - ${financialStatement.periodEnd.toISOString()}`
      }
    );
    
    return NextResponse.json(
      { message: "État financier supprimé avec succès" }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'état financier:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de l\'état financier' },
      { status: 500 }
    );
  }
} 