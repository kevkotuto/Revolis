import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une absence spécifique
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
    
    // Récupérer l'absence
    const absence = await prisma.absence.findUnique({
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
        },
        approvalRequest: {
          include: {
            approver: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
    
    // Vérifier si l'absence existe
    if (!absence) {
      return NextResponse.json({ error: "Absence non trouvée" }, { status: 404 });
    }
    
    // Vérifier les permissions d'accès selon le rôle
    // Les admins peuvent voir toutes les absences
    // Les utilisateurs normaux ne peuvent voir que leurs propres absences
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.role !== 'COMPANY_ADMIN') {
      if (absence.userId !== permissionCheck.user?.id) {
        return NextResponse.json(
          { error: "Vous n'avez pas les permissions pour accéder à cette absence" },
          { status: 403 }
        );
      }
    }
    
    // Pour COMPANY_ADMIN, vérifier que l'absence concerne un employé de sa compagnie
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        absence.user.companyId !== permissionCheck.user?.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour accéder à cette absence" },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      id,
      { action: 'Consultation d\'une absence' }
    );
    
    return NextResponse.json(absence);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'absence:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de l\'absence' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une absence
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
    
    // Récupérer l'absence existante
    const existingAbsence = await prisma.absence.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            companyId: true
          }
        },
        approvalRequest: true
      }
    });
    
    // Vérifier si l'absence existe
    if (!existingAbsence) {
      return NextResponse.json({ error: "Absence non trouvée" }, { status: 404 });
    }
    
    // Vérifier les droits de modification
    const canModify = 
      permissionCheck.role === 'SUPER_ADMIN' || 
      (permissionCheck.role === 'COMPANY_ADMIN' && 
       existingAbsence.user.companyId === permissionCheck.user?.companyId) ||
      existingAbsence.userId === permissionCheck.user?.id;
    
    if (!canModify) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour modifier cette absence" },
        { status: 403 }
      );
    }
    
    // Restrictions supplémentaires:
    // Un utilisateur normal ne peut modifier que ses propres absences en attente
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.role !== 'COMPANY_ADMIN' && 
        existingAbsence.status !== 'PENDING') {
      return NextResponse.json(
        { error: "Vous ne pouvez modifier que les absences en attente de validation" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour la mise à jour de l'absence
    const AbsenceUpdateSchema = z.object({
      startDate: z.string().datetime({ message: "La date de début doit être une date valide" }).optional(),
      endDate: z.string().datetime({ message: "La date de fin doit être une date valide" }).optional(),
      type: z.string().optional(),
      reason: z.string().min(3, { message: "La raison doit contenir au moins 3 caractères" }).optional(),
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional()
    });
    
    // Valider les données
    const validationResult = AbsenceUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier la cohérence des dates si les deux sont fournies
    if (validatedData.startDate && validatedData.endDate) {
      const startDate = new Date(validatedData.startDate);
      const endDate = new Date(validatedData.endDate);
      
      if (startDate > endDate) {
        return NextResponse.json(
          { error: "La date de début doit être antérieure à la date de fin" },
          { status: 400 }
        );
      }
    }
    
    // Gérer le changement de statut spécifiquement pour les approbations
    let statusUpdate = {};
    if (validatedData.status && validatedData.status !== existingAbsence.status) {
      // Seuls les admins ou les approbateurs peuvent approuver ou rejeter une absence
      if (validatedData.status !== 'PENDING' && 
          permissionCheck.role !== 'SUPER_ADMIN' && 
          permissionCheck.role !== 'COMPANY_ADMIN') {
        
        // Vérifier si l'utilisateur est l'approbateur désigné
        const isApprover = existingAbsence.approvalRequest?.some(request => 
          request.approverId === permissionCheck.user?.id && 
          request.status === 'PENDING'
        );
        
        if (!isApprover) {
          return NextResponse.json(
            { error: "Vous n'avez pas les permissions pour approuver ou rejeter cette absence" },
            { status: 403 }
          );
        }
      }
      
      statusUpdate = { status: validatedData.status };
      
      // Mettre à jour le statut de la demande d'approbation associée si elle existe
      if (existingAbsence.approvalRequest?.length > 0) {
        await prisma.approvalRequest.updateMany({
          where: { 
            resourceId: id,
            type: 'ABSENCE',
            status: 'PENDING'
          },
          data: { 
            status: validatedData.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
            resolvedAt: new Date()
          }
        });
      }
    }
    
    // Préparer les données pour la mise à jour
    const updateData: any = {
      ...validatedData,
      ...statusUpdate
    };
    
    // Convertir les dates si elles sont fournies
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }
    
    // Mettre à jour l'absence
    const updatedAbsence = await prisma.absence.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        approvalRequest: {
          include: {
            approver: {
              select: {
                id: true,
                name: true
              }
            }
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
      { action: 'Mise à jour d\'une absence', updates: validatedData }
    );
    
    return NextResponse.json(updatedAbsence);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'absence:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de l\'absence' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une absence
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
    
    // Récupérer l'absence existante
    const existingAbsence = await prisma.absence.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            companyId: true
          }
        },
        approvalRequest: true
      }
    });
    
    // Vérifier si l'absence existe
    if (!existingAbsence) {
      return NextResponse.json({ error: "Absence non trouvée" }, { status: 404 });
    }
    
    // Vérifier les droits de suppression
    const canDelete = 
      permissionCheck.role === 'SUPER_ADMIN' || 
      (permissionCheck.role === 'COMPANY_ADMIN' && 
       existingAbsence.user.companyId === permissionCheck.user?.companyId) ||
      existingAbsence.userId === permissionCheck.user?.id;
    
    if (!canDelete) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour supprimer cette absence" },
        { status: 403 }
      );
    }
    
    // Restrictions supplémentaires:
    // Un utilisateur normal ne peut supprimer que ses propres absences en attente
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.role !== 'COMPANY_ADMIN' && 
        existingAbsence.status !== 'PENDING') {
      return NextResponse.json(
        { error: "Vous ne pouvez supprimer que les absences en attente de validation" },
        { status: 403 }
      );
    }
    
    // Supprimer les demandes d'approbation associées puis l'absence dans une transaction
    await prisma.$transaction([
      // Supprimer les demandes d'approbation associées
      prisma.approvalRequest.deleteMany({
        where: { 
          resourceId: id,
          type: 'ABSENCE'
        }
      }),
      // Supprimer l'absence
      prisma.absence.delete({
        where: { id }
      })
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'OTHER',
      id,
      { action: 'Suppression d\'une absence' }
    );
    
    return NextResponse.json({ message: "Absence supprimée avec succès" });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'absence:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de l\'absence' },
      { status: 500 }
    );
  }
} 