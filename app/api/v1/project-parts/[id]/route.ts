import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une partie de projet par son ID
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const partId = params.id;
    
    // Récupérer la partie du projet avec son projet parent et ses tâches
    const projectPart = await prisma.projectPart.findUnique({
      where: { id: partId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            companyId: true
          }
        },
        tasks: {
          include: {
            assignedTo: true,
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });
    
    // Vérifier si la partie existe
    if (!projectPart) {
      return NextResponse.json(
        { error: 'Partie du projet non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit d'accéder à ce projet
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== projectPart.project.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour accéder à cette partie du projet' },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'PROJECT',
      projectPart.projectId,
      { action: 'Détail d\'une partie de projet', partId: partId }
    );
    
    return NextResponse.json(projectPart);
  } catch (error) {
    console.error('Erreur lors de la récupération de la partie du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de la partie du projet' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une partie de projet
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const partId = params.id;
    const data = await request.json();
    
    // Définir le schéma de validation pour la mise à jour
    const ProjectPartUpdateSchema = z.object({
      name: z.string().min(2, "Le nom de la partie doit contenir au moins 2 caractères").optional(),
      description: z.string().optional().nullable(),
      price: z.number().min(0).optional(),
      completed: z.boolean().optional()
    });
    
    // Valider les données
    const validationResult = ProjectPartUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Récupérer la partie du projet actuelle avec le projet parent
    const existingPart = await prisma.projectPart.findUnique({
      where: { id: partId },
      include: {
        project: {
          select: {
            id: true,
            companyId: true,
            isFixedPrice: true,
            totalPrice: true
          }
        }
      }
    });
    
    // Vérifier si la partie existe
    if (!existingPart) {
      return NextResponse.json(
        { error: 'Partie du projet non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de modifier ce projet
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== existingPart.project.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour modifier cette partie du projet' },
        { status: 403 }
      );
    }
    
    // Utiliser une transaction pour la mise à jour et le recalcul du prix total
    const result = await prisma.$transaction(async (tx) => {
      // Mettre à jour la partie du projet
      const updatedPart = await tx.projectPart.update({
        where: { id: partId },
        data: {
          name: validatedData.name,
          description: validatedData.description,
          price: validatedData.price,
          completed: validatedData.completed
        }
      });
      
      // Si le projet n'est pas à prix fixe et que le prix a été modifié, mettre à jour le prix total
      if (!existingPart.project.isFixedPrice && validatedData.price !== undefined) {
        const oldPrice = parseFloat(existingPart.price.toString());
        const newPrice = parseFloat(updatedPart.price.toString());
        const priceDifference = newPrice - oldPrice;
        
        const currentTotalPrice = existingPart.project.totalPrice 
          ? parseFloat(existingPart.project.totalPrice.toString()) 
          : 0;
        
        const newTotalPrice = Math.max(0, currentTotalPrice + priceDifference);
        
        await tx.project.update({
          where: { id: existingPart.projectId },
          data: { totalPrice: newTotalPrice }
        });
      }
      
      return updatedPart;
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'UPDATE',
      'PROJECT',
      existingPart.projectId,
      { action: 'Mise à jour d\'une partie de projet', partId: partId }
    );
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la partie du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de la partie du projet' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une partie de projet
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const partId = params.id;
    
    // Récupérer la partie du projet avec ses dépendances
    const part = await prisma.projectPart.findUnique({
      where: { id: partId },
      include: {
        project: {
          select: {
            id: true,
            companyId: true,
            isFixedPrice: true,
            totalPrice: true
          }
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });
    
    // Vérifier si la partie existe
    if (!part) {
      return NextResponse.json(
        { error: 'Partie du projet non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de supprimer cette partie
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== part.project.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour supprimer cette partie du projet' },
        { status: 403 }
      );
    }
    
    // Vérifier s'il y a des tâches associées
    if (part._count.tasks > 0) {
      return NextResponse.json(
        { 
          error: 'Impossible de supprimer cette partie car elle contient des tâches',
          taskCount: part._count.tasks 
        },
        { status: 400 }
      );
    }
    
    // Utiliser une transaction pour la suppression et la mise à jour du prix total
    await prisma.$transaction(async (tx) => {
      // Supprimer la partie
      await tx.projectPart.delete({
        where: { id: partId },
      });
      
      // Si le projet n'est pas à prix fixe, mettre à jour le prix total
      if (!part.project.isFixedPrice) {
        const partPrice = parseFloat(part.price.toString());
        const currentTotalPrice = part.project.totalPrice 
          ? parseFloat(part.project.totalPrice.toString()) 
          : 0;
        
        const newTotalPrice = Math.max(0, currentTotalPrice - partPrice);
        
        await tx.project.update({
          where: { id: part.projectId },
          data: { totalPrice: newTotalPrice }
        });
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'PROJECT',
      part.projectId,
      { action: 'Suppression d\'une partie de projet', partName: part.name }
    );
    
    return NextResponse.json(
      { message: 'Partie du projet supprimée avec succès' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression de la partie du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de la partie du projet' },
      { status: 500 }
    );
  }
} 