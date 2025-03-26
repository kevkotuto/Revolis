import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une demande d'approbation spécifique
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
    
    // Récupérer la demande d'approbation
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            companyId: true
          }
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            companyId: true
          }
        }
      }
    });
    
    if (!approvalRequest) {
      return NextResponse.json(
        { error: "Demande d'approbation non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier si l'utilisateur a le droit de voir cette demande
    const isRequester = approvalRequest.requesterId === permissionCheck.user?.id;
    const isApprover = approvalRequest.approverId === permissionCheck.user?.id;
    const isSameCompany = 
      (permissionCheck.user?.companyId && approvalRequest.requester.companyId === permissionCheck.user.companyId) ||
      (permissionCheck.user?.companyId && approvalRequest.approver.companyId === permissionCheck.user.companyId);
    
    if (!isRequester && !isApprover && !isSameCompany && permissionCheck.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour voir cette demande d'approbation" },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'OTHER',
      id,
      { action: "Consultation d'une demande d'approbation" }
    );
    
    return NextResponse.json(approvalRequest);
  } catch (error) {
    console.error('Erreur lors de la récupération de la demande d\'approbation:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de la demande d\'approbation' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une demande d'approbation (généralement pour l'approuver/rejeter)
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
    
    // Récupérer la demande d'approbation
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        requester: {
          select: {
            id: true,
            companyId: true
          }
        },
        approver: {
          select: {
            id: true,
            companyId: true
          }
        }
      }
    });
    
    if (!approvalRequest) {
      return NextResponse.json(
        { error: "Demande d'approbation non trouvée" },
        { status: 404 }
      );
    }
    
    // Seuls l'approbateur, un admin de la même entreprise ou un super admin peuvent mettre à jour la demande
    const isApprover = approvalRequest.approverId === permissionCheck.user?.id;
    const isSameCompanyAdmin = 
      permissionCheck.role === 'COMPANY_ADMIN' && 
      permissionCheck.user?.companyId && 
      (approvalRequest.approver.companyId === permissionCheck.user.companyId);
    
    if (!isApprover && !isSameCompanyAdmin && permissionCheck.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour mettre à jour cette demande d'approbation" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation
    const UpdateSchema = z.object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
      comments: z.string().optional()
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
    
    // Mettre à jour la demande
    const updatedRequest = await prisma.approvalRequest.update({
      where: { id },
      data: {
        status: validatedData.status
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'UPDATE',
      'OTHER',
      id,
      { 
        action: `Mise à jour d'une demande d'approbation: ${validatedData.status}`,
        previousStatus: approvalRequest.status,
        newStatus: validatedData.status
      }
    );
    
    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la demande d\'approbation:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de la demande d\'approbation' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une demande d'approbation
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
    
    // Récupérer la demande d'approbation
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        requester: {
          select: {
            id: true,
            companyId: true
          }
        }
      }
    });
    
    if (!approvalRequest) {
      return NextResponse.json(
        { error: "Demande d'approbation non trouvée" },
        { status: 404 }
      );
    }
    
    // Seuls le demandeur, un admin de la même entreprise ou un super admin peuvent supprimer la demande
    const isRequester = approvalRequest.requesterId === permissionCheck.user?.id;
    const isSameCompanyAdmin = 
      permissionCheck.role === 'COMPANY_ADMIN' && 
      permissionCheck.user?.companyId && 
      approvalRequest.requester.companyId === permissionCheck.user.companyId;
    
    if (!isRequester && !isSameCompanyAdmin && permissionCheck.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour supprimer cette demande d'approbation" },
        { status: 403 }
      );
    }
    
    // On ne peut supprimer une demande que si elle est en attente
    if (approvalRequest.status !== 'PENDING') {
      return NextResponse.json(
        { error: "Vous ne pouvez supprimer que des demandes en attente" },
        { status: 400 }
      );
    }
    
    // Supprimer la demande
    await prisma.approvalRequest.delete({
      where: { id }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'DELETE',
      'OTHER',
      id,
      { action: "Suppression d'une demande d'approbation" }
    );
    
    return NextResponse.json(
      { message: "Demande d'approbation supprimée avec succès" }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression de la demande d\'approbation:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de la demande d\'approbation' },
      { status: 500 }
    );
  }
} 