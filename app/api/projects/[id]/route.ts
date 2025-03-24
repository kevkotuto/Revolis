import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {prisma} from '@/lib/prisma';

// GET /api/projects/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const project = await prisma.project.findUnique({
      where: { id: resolvedParams.id },
      include: {
        client: true,
        user: true,
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
            subscription: true,
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
        projectTools: {
          include: {
            tool: true,
          },
        },
        projectAgents: {
          include: {
            agent: true,
          },
        },
        projectSubscriptions: {
          include: {
            subscription: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Projet non trouvé' },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Erreur lors de la récupération du projet:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du projet' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const data = await request.json();
    const projectId = params.id;

    // Vérifier si le projet existe
    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        projectPrestataires: true,
      },
    });

    if (!existingProject) {
      return NextResponse.json(
        { error: 'Projet non trouvé' },
        { status: 404 }
      );
    }

    // Préparation des données de mise à jour
    const updateData: any = {};

    // Mise à jour des propriétés de base
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description.trim();
    if (data.status !== undefined) updateData.status = data.status;
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
    if (data.totalPrice !== undefined) updateData.totalPrice = data.totalPrice;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.isFixedPrice !== undefined) updateData.isFixedPrice = data.isFixedPrice;

    // Mises à jour des relations
    const updateOperations = [];

    // Mise à jour du projet
    const projectUpdateOperation = prisma.project.update({
      where: { id: projectId },
      data: updateData,
    });
    updateOperations.push(projectUpdateOperation);

    // Mise à jour du client
    if (data.clientId !== undefined) {
      if (data.clientId) {
        // Connecter à un client existant
        const clientUpdateOperation = prisma.project.update({
          where: { id: projectId },
          data: {
            client: { connect: { id: data.clientId } },
          },
        });
        updateOperations.push(clientUpdateOperation);
      } else {
        // Déconnecter du client
        const clientDisconnectOperation = prisma.project.update({
          where: { id: projectId },
          data: {
            client: { disconnect: true },
          },
        });
        updateOperations.push(clientDisconnectOperation);
      }
    }

    // Mise à jour de l'utilisateur
    if (data.userId !== undefined) {
      if (data.userId) {
        // Connecter à un utilisateur existant
        const userUpdateOperation = prisma.project.update({
          where: { id: projectId },
          data: {
            user: { connect: { id: data.userId } },
          },
        });
        updateOperations.push(userUpdateOperation);
      } else {
        // Déconnecter de l'utilisateur
        const userDisconnectOperation = prisma.project.update({
          where: { id: projectId },
          data: {
            user: { disconnect: true },
          },
        });
        updateOperations.push(userDisconnectOperation);
      }
    }

    // Mise à jour des prestataires si nécessaire
    if (data.prestataires) {
      // Suppression des anciennes relations
      const deletePrestatairesOperation = prisma.projectPrestataire.deleteMany({
        where: { projectId },
      });
      updateOperations.push(deletePrestatairesOperation);

      // Création des nouvelles relations
      if (data.prestataires.length > 0) {
        const prestatairesCreateOperation = prisma.projectPrestataire.createMany({
          data: data.prestataires.map((prest: any) => ({
            projectId,
            prestataireId: prest.prestataireId,
            role: prest.role || null,
            hourlyRate: prest.hourlyRate || null,
            fixedAmount: prest.fixedAmount || null,
          })),
        });
        updateOperations.push(prestatairesCreateOperation);
      }
    }

    // Exécution de toutes les opérations de mise à jour
    await prisma.$transaction(updateOperations);

    // Récupération du projet mis à jour avec les relations
    const updatedProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: true,
        user: true,
        projectPrestataires: {
          include: {
            prestataire: true,
          },
        },
        projectParts: true,
      },
    });

    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const projectId = params.id;

    // Vérifier si le projet existe
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            tasks: true,
            payments: true,
            devis: true,
            contrats: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Projet non trouvé' },
        { status: 404 }
      );
    }

    // Vérification des dépendances (facultatif, car on pourrait tout supprimer en cascade)
    // Si vous voulez empêcher la suppression d'un projet avec des éléments associés:
    const hasDependencies = 
      project._count.tasks > 0 ||
      project._count.payments > 0 ||
      project._count.devis > 0 ||
      project._count.contrats > 0;

    if (hasDependencies) {
      return NextResponse.json(
        {
          error: 'Ce projet ne peut pas être supprimé car il possède des éléments associés',
          dependencies: {
            tasks: project._count.tasks,
            payments: project._count.payments,
            devis: project._count.devis,
            contrats: project._count.contrats,
          },
        },
        { status: 400 }
      );
    }

    // Suppression du projet et de ses relations
    // La cascade devrait supprimer les parties du projet, mais par sécurité
    // on supprime d'abord les relations many-to-many
    await prisma.$transaction([
      prisma.projectPrestataire.deleteMany({
        where: { projectId },
      }),
      prisma.projectTool.deleteMany({
        where: { projectId },
      }),
      prisma.projectAgent.deleteMany({
        where: { projectId },
      }),
      prisma.projectSubscription.deleteMany({
        where: { projectId },
      }),
      prisma.projectPart.deleteMany({
        where: { projectId },
      }),
      prisma.project.delete({
        where: { id: projectId },
      }),
    ]);

    return NextResponse.json(
      { message: 'Projet supprimé avec succès' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const data = await request.json();
    const projectId = params.id;

    // Vérifier si le projet existe
    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        projectPrestataires: true,
        projectParts: true,
      },
    });

    if (!existingProject) {
      return NextResponse.json(
        { error: 'Projet non trouvé' },
        { status: 404 }
      );
    }

    // Préparation des données de mise à jour
    const updateData: any = {
      name: data.name || existingProject.name,
      description: data.description,
      status: data.status,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      totalPrice: data.totalPrice !== undefined ? data.totalPrice : existingProject.totalPrice,
      currency: data.currency || existingProject.currency,
      fcfaEquivalent: data.fcfaEquivalent !== undefined ? data.fcfaEquivalent : existingProject.fcfaEquivalent,
      exchangeRateDate: data.exchangeRateDate ? new Date(data.exchangeRateDate) : new Date(),
      isFixedPrice: data.isFixedPrice !== undefined ? data.isFixedPrice : existingProject.isFixedPrice,
    };

    // Relations à mettre à jour
    const updateOperations = [];

    // Mise à jour du projet de base
    updateOperations.push(
      prisma.project.update({
        where: { id: projectId },
        data: updateData,
      })
    );

    // Mise à jour des parties du projet si présentes
    if (data.projectParts) {
      // Supprimer les parties à supprimer
      if (data.removedProjectParts && data.removedProjectParts.length > 0) {
        updateOperations.push(
          prisma.projectPart.deleteMany({
            where: {
              id: {
                in: data.removedProjectParts,
              },
            },
          })
        );
      }

      // Mettre à jour ou créer les parties
      data.projectParts.forEach((part: any) => {
        if (part.id && part.id.startsWith('temp-')) {
          // Nouvelle partie
          updateOperations.push(
            prisma.projectPart.create({
              data: {
                name: part.name,
                description: part.description,
                price: part.price,
                projectId: projectId,
              },
            })
          );
        } else {
          // Partie existante à mettre à jour
          updateOperations.push(
            prisma.projectPart.update({
              where: { id: part.id },
              data: {
                name: part.name,
                description: part.description,
                price: part.price,
              },
            })
          );
        }
      });
    }

    // Mise à jour des prestataires
    if (data.projectPrestataires) {
      // Supprimer les prestataires existants
      updateOperations.push(
        prisma.projectPrestataire.deleteMany({
          where: { projectId },
        })
      );

      // Ajouter les nouveaux prestataires
      data.projectPrestataires.forEach((prest: any) => {
        updateOperations.push(
          prisma.projectPrestataire.create({
            data: {
              projectId,
              prestataireId: prest.id,
              role: prest.role,
            },
          })
        );
      });
    }

    // Exécuter toutes les opérations dans une transaction
    await prisma.$transaction(updateOperations);

    // Récupérer le projet mis à jour avec toutes ses relations
    const updatedProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: true,
        user: true,
        projectParts: true,
        projectPrestataires: {
          include: {
            prestataire: true,
          },
        },
      },
    });

    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 