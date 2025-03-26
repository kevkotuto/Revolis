import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer un contrat spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    const id = params.id;
    
    // Récupérer le contrat
    const contrat = await prisma.contrat.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            companyId: true,
            company: {
              select: {
                id: true,
                name: true
              }
            },
            client: {
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
    
    if (!contrat) {
      return NextResponse.json(
        { error: "Contrat non trouvé" },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de voir ce contrat
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== contrat.project?.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour voir ce contrat" },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'PROJECT',
      id,
      { action: "Consultation d'un contrat" }
    );
    
    return NextResponse.json(contrat);
  } catch (error) {
    console.error('Erreur lors de la récupération du contrat:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération du contrat' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un contrat
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    const id = params.id;
    
    // Récupérer le contrat existant
    const existingContrat = await prisma.contrat.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            companyId: true
          }
        }
      }
    });
    
    if (!existingContrat) {
      return NextResponse.json(
        { error: "Contrat non trouvé" },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de modifier ce contrat
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== existingContrat.project?.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour modifier ce contrat" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation
    const UpdateSchema = z.object({
      title: z.string().min(1, "Titre requis").optional(),
      content: z.string().optional(),
      status: z.string().optional(),
      document: z.string().optional(),
      signedAt: z.string().optional().transform(val => val ? new Date(val) : undefined)
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
    
    // Si le statut passe à "SIGNED", définir la date de signature si elle n'est pas déjà définie
    if (validatedData.status === "SIGNED" && !validatedData.signedAt && !existingContrat.signedAt) {
      validatedData.signedAt = new Date();
    }
    
    // Mettre à jour le contrat
    const updatedContrat = await prisma.contrat.update({
      where: { id },
      data: validatedData,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            companyId: true,
            company: {
              select: {
                id: true,
                name: true
              }
            },
            client: {
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
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'UPDATE',
      'PROJECT',
      id,
      { 
        action: "Mise à jour d'un contrat",
        previousStatus: existingContrat.status,
        newStatus: updatedContrat.status
      }
    );
    
    return NextResponse.json(updatedContrat);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du contrat:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour du contrat' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un contrat
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    const id = params.id;
    
    // Récupérer le contrat
    const contrat = await prisma.contrat.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            companyId: true
          }
        }
      }
    });
    
    if (!contrat) {
      return NextResponse.json(
        { error: "Contrat non trouvé" },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de supprimer ce contrat
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== contrat.project?.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour supprimer ce contrat" },
        { status: 403 }
      );
    }
    
    // Vérifier si le contrat peut être supprimé (ne pas supprimer un contrat signé par exemple)
    if (contrat.status === "SIGNED") {
      return NextResponse.json(
        { error: "Impossible de supprimer un contrat signé" },
        { status: 400 }
      );
    }
    
    // Supprimer le contrat
    await prisma.contrat.delete({
      where: { id }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'DELETE',
      'PROJECT',
      id,
      { action: "Suppression d'un contrat" }
    );
    
    return NextResponse.json(
      { message: "Contrat supprimé avec succès" }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression du contrat:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression du contrat' },
      { status: 500 }
    );
  }
} 