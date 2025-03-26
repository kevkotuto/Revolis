import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer un projet par son ID
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
    
    const projectId = params.id;
    
    // Récupérer le projet
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: true,
        user: true,
        company: true,
        tasks: {
          where: { parentTaskId: null }, // Seulement les tâches principales
          include: {
            assignedTo: true,
            _count: {
              select: {
                subTasks: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        projectParts: {
          include: {
            _count: {
              select: {
                tasks: true,
              },
            },
          },
        },
        projectPrestataires: {
          include: {
            prestataire: true,
          },
        },
        payments: {
          orderBy: {
            date: 'desc',
          },
          include: {
            client: true,
            prestataire: true,
          },
        },
        devis: {
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            items: true,
          },
        },
        contrats: {
          orderBy: {
            createdAt: 'desc',
          },
        },
        tags: true,
      },
    });
    
    // Vérifier si le projet existe
    if (!project) {
      return NextResponse.json(
        { error: 'Projet non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit d'accéder à ce projet
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== project.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour accéder à ce projet' },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'PROJECT',
      project.id,
      { projectName: project.name }
    );
    
    return NextResponse.json(project);
  } catch (error) {
    console.error('Erreur lors de la récupération du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération du projet' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un projet
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
    
    const projectId = params.id;
    const data = await request.json();
    
    // Récupérer le projet actuel
    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        projectPrestataires: true,
        tags: true,
      }
    });
    
    // Vérifier si le projet existe
    if (!existingProject) {
      return NextResponse.json(
        { error: 'Projet non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de modifier ce projet
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== existingProject.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour modifier ce projet' },
        { status: 403 }
      );
    }
    
    // Définir le schéma de validation pour la mise à jour
    const ProjectUpdateSchema = z.object({
      name: z.string().min(2, "Le nom du projet doit contenir au moins 2 caractères").optional(),
      description: z.string().optional().nullable(),
      status: z.enum(['PENDING_VALIDATION', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED', 'FUTURE', 'PERSONAL']).optional(),
      startDate: z.string().datetime().optional().nullable(),
      endDate: z.string().datetime().optional().nullable(),
      totalPrice: z.number().optional().nullable(),
      currency: z.string().optional(),
      isFixedPrice: z.boolean().optional(),
      clientId: z.string().optional().nullable(),
      userId: z.string().optional().nullable(),
      prestataires: z.array(z.object({
        prestataireId: z.string(),
        role: z.string().optional(),
        hourlyRate: z.number().optional(),
        fixedAmount: z.number().optional()
      })).optional(),
      tagIds: z.array(z.string()).optional()
    });
    
    // Valider les données
    const validationResult = ProjectUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Démarrer une transaction pour les opérations de mise à jour
    const result = await prisma.$transaction(async (tx) => {
      // Préparer les données de base pour la mise à jour
      const updateData: any = {};
      
      if (validatedData.name !== undefined) updateData.name = validatedData.name;
      if (validatedData.description !== undefined) updateData.description = validatedData.description;
      if (validatedData.status !== undefined) updateData.status = validatedData.status;
      if (validatedData.startDate !== undefined) updateData.startDate = validatedData.startDate ? new Date(validatedData.startDate) : null;
      if (validatedData.endDate !== undefined) updateData.endDate = validatedData.endDate ? new Date(validatedData.endDate) : null;
      if (validatedData.totalPrice !== undefined) updateData.totalPrice = validatedData.totalPrice;
      if (validatedData.currency !== undefined) updateData.currency = validatedData.currency;
      if (validatedData.isFixedPrice !== undefined) updateData.isFixedPrice = validatedData.isFixedPrice;
      
      // Mettre à jour le projet
      let updatedProject = await tx.project.update({
        where: { id: projectId },
        data: updateData,
      });
      
      // Gérer les relations client et responsable
      if (validatedData.clientId !== undefined) {
        if (validatedData.clientId) {
          await tx.project.update({
            where: { id: projectId },
            data: {
              client: { connect: { id: validatedData.clientId } },
            },
          });
        } else {
          await tx.project.update({
            where: { id: projectId },
            data: {
              client: { disconnect: true },
            },
          });
        }
      }
      
      if (validatedData.userId !== undefined) {
        if (validatedData.userId) {
          await tx.project.update({
            where: { id: projectId },
            data: {
              user: { connect: { id: validatedData.userId } },
            },
          });
        } else {
          await tx.project.update({
            where: { id: projectId },
            data: {
              user: { disconnect: true },
            },
          });
        }
      }
      
      // Gérer les prestataires
      if (validatedData.prestataires) {
        // Supprimer les prestataires existants
        await tx.projectPrestataire.deleteMany({
          where: { projectId },
        });
        
        // Ajouter les nouveaux prestataires
        if (validatedData.prestataires.length > 0) {
          await Promise.all(validatedData.prestataires.map(prest => 
            tx.projectPrestataire.create({
              data: {
                projectId,
                prestataireId: prest.prestataireId,
                role: prest.role,
                hourlyRate: prest.hourlyRate,
                fixedAmount: prest.fixedAmount,
              },
            })
          ));
        }
      }
      
      // Gérer les tags
      if (validatedData.tagIds) {
        // Récupérer les tags actuels
        const currentTags = existingProject.tags.map(tag => tag.id);
        
        // Déconnecter tous les tags actuels
        await tx.project.update({
          where: { id: projectId },
          data: {
            tags: {
              disconnect: currentTags.map(id => ({ id })),
            },
          },
        });
        
        // Connecter les nouveaux tags
        if (validatedData.tagIds.length > 0) {
          await tx.project.update({
            where: { id: projectId },
            data: {
              tags: {
                connect: validatedData.tagIds.map(id => ({ id })),
              },
            },
          });
        }
      }
      
      // Récupérer le projet mis à jour avec toutes les relations
      return tx.project.findUnique({
        where: { id: projectId },
        include: {
          client: true,
          user: true,
          company: true,
          projectParts: true,
          projectPrestataires: {
            include: {
              prestataire: true,
            },
          },
          tags: true,
        },
      });
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'UPDATE',
      'PROJECT',
      projectId,
      { projectName: result?.name }
    );
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour du projet' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un projet
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
    
    const projectId = params.id;
    
    // Récupérer le projet avec ses dépendances
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            tasks: true,
            payments: true,
            projectParts: true,
            projectPrestataires: true,
            devis: true,
            contrats: true,
          },
        },
      },
    });
    
    // Vérifier si le projet existe
    if (!project) {
      return NextResponse.json(
        { error: 'Projet non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de supprimer ce projet
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== project.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour supprimer ce projet' },
        { status: 403 }
      );
    }
    
    // Vérifier si le projet a des dépendances
    const dependencies = {
      tasks: project._count.tasks > 0,
      payments: project._count.payments > 0,
      projectParts: project._count.projectParts > 0,
      projectPrestataires: project._count.projectPrestataires > 0,
      devis: project._count.devis > 0,
      contrats: project._count.contrats > 0,
    };
    
    const hasDependencies = Object.values(dependencies).some(value => value);
    
    // Si le projet a des dépendances, refuser la suppression
    if (hasDependencies) {
      return NextResponse.json(
        {
          error: 'Impossible de supprimer ce projet car il possède des éléments associés',
          dependencies
        },
        { status: 400 }
      );
    }
    
    // Supprimer le projet
    await prisma.project.delete({
      where: { id: projectId },
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'PROJECT',
      projectId,
      { projectName: project.name }
    );
    
    return NextResponse.json(
      { message: 'Projet supprimé avec succès' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression du projet' },
      { status: 500 }
    );
  }
} 