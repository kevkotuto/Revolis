import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer un candidat spécifique
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
    
    // Récupérer le candidat
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        skills: true,
        education: {
          orderBy: {
            startDate: 'desc'
          }
        },
        experience: {
          orderBy: {
            startDate: 'desc'
          }
        },
        applications: {
          include: {
            jobPosting: {
              select: {
                id: true,
                title: true,
                department: true,
                location: true,
                companyId: true,
                company: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            },
            interviews: {
              include: {
                interviewer: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              },
              orderBy: {
                scheduledAt: 'asc'
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });
    
    // Vérifier si le candidat existe
    if (!candidate) {
      return NextResponse.json({ error: "Candidat non trouvé" }, { status: 404 });
    }
    
    // Vérifier les permissions d'accès
    // Si l'utilisateur est un admin d'entreprise, il ne peut voir que les candidats qui ont postulé à son entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      const hasAppliedToCompany = candidate.applications.some(
        app => app.jobPosting.companyId === permissionCheck.user?.companyId
      );
      
      if (!hasAppliedToCompany) {
        return NextResponse.json(
          { error: "Vous n'avez pas les permissions pour accéder à ce candidat" },
          { status: 403 }
        );
      }
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      id,
      { action: "Consultation d'un candidat", candidateName: `${candidate.firstName} ${candidate.lastName}` }
    );
    
    return NextResponse.json(candidate);
  } catch (error) {
    console.error('Erreur lors de la récupération du candidat:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération du candidat' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un candidat
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
    
    // Récupérer le candidat existant
    const existingCandidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        applications: {
          select: {
            jobPosting: {
              select: {
                companyId: true
              }
            }
          }
        }
      }
    });
    
    // Vérifier si le candidat existe
    if (!existingCandidate) {
      return NextResponse.json({ error: "Candidat non trouvé" }, { status: 404 });
    }
    
    // Vérifier les permissions de modification
    // Si l'utilisateur est un admin d'entreprise, il ne peut modifier que les candidats qui ont postulé à son entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      const hasAppliedToCompany = existingCandidate.applications.some(
        app => app.jobPosting.companyId === permissionCheck.user?.companyId
      );
      
      if (!hasAppliedToCompany) {
        return NextResponse.json(
          { error: "Vous n'avez pas les permissions pour modifier ce candidat" },
          { status: 403 }
        );
      }
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation des données du candidat pour la mise à jour
    const CandidateUpdateSchema = z.object({
      email: z.string().email("Email invalide").optional(),
      firstName: z.string().min(1, "Le prénom est requis").optional(),
      lastName: z.string().min(1, "Le nom est requis").optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      resumeUrl: z.string().url("URL de CV invalide").optional(),
      linkedin: z.string().url("URL LinkedIn invalide").optional(),
      portfolio: z.string().url("URL de portfolio invalide").optional(),
      skills: z.array(z.string()).optional(),
      notes: z.string().optional(),
      status: z.string().optional(),
      active: z.boolean().optional()
    });
    
    // Valider les données
    const validationResult = CandidateUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Préparer les données pour la mise à jour
    const updateData: any = {};
    
    // Mettre à jour les champs fournis
    if (validatedData.email !== undefined) updateData.email = validatedData.email;
    if (validatedData.firstName !== undefined) updateData.firstName = validatedData.firstName;
    if (validatedData.lastName !== undefined) updateData.lastName = validatedData.lastName;
    if (validatedData.phone !== undefined) updateData.phone = validatedData.phone;
    if (validatedData.address !== undefined) updateData.address = validatedData.address;
    if (validatedData.resumeUrl !== undefined) updateData.resumeUrl = validatedData.resumeUrl;
    if (validatedData.linkedin !== undefined) updateData.linkedin = validatedData.linkedin;
    if (validatedData.portfolio !== undefined) updateData.portfolio = validatedData.portfolio;
    if (validatedData.notes !== undefined) updateData.notes = validatedData.notes;
    if (validatedData.status !== undefined) updateData.status = validatedData.status;
    if (validatedData.active !== undefined) updateData.active = validatedData.active;
    
    // Mettre à jour les compétences si fournies
    if (validatedData.skills) {
      // D'abord, déconnecter toutes les compétences existantes
      await prisma.candidate.update({
        where: { id },
        data: {
          skills: {
            set: []
          }
        }
      });
      
      // Ensuite, reconnecter les nouvelles compétences
      if (validatedData.skills.length > 0) {
        updateData.skills = {
          connect: validatedData.skills.map(skillId => ({ id: skillId }))
        };
      }
    }
    
    // Mettre à jour le candidat
    const updatedCandidate = await prisma.candidate.update({
      where: { id },
      data: updateData,
      include: {
        skills: true,
        education: true,
        experience: true
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'UPDATE',
      'OTHER',
      id,
      { 
        action: "Mise à jour d'un candidat",
        candidateName: `${updatedCandidate.firstName} ${updatedCandidate.lastName}`,
        updates: Object.keys(validatedData)
      }
    );
    
    return NextResponse.json(updatedCandidate);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du candidat:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour du candidat' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un candidat
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
    
    // Récupérer le candidat existant
    const existingCandidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        applications: {
          include: {
            interviews: true
          }
        }
      }
    });
    
    // Vérifier si le candidat existe
    if (!existingCandidate) {
      return NextResponse.json({ error: "Candidat non trouvé" }, { status: 404 });
    }
    
    // Seuls les super admins peuvent supprimer des candidats
    if (permissionCheck.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour supprimer ce candidat" },
        { status: 403 }
      );
    }
    
    // Vérifier si le candidat a des candidatures actives
    const hasActiveApplications = existingCandidate.applications.some(
      app => ['APPLIED', 'SCREENING', 'INTERVIEWING', 'TESTING', 'OFFERING'].includes(app.status || '')
    );
    
    if (hasActiveApplications) {
      return NextResponse.json(
        { error: "Impossible de supprimer un candidat avec des candidatures actives" },
        { status: 400 }
      );
    }
    
    // Supprimer le candidat et ses données associées dans une transaction
    await prisma.$transaction(async (tx) => {
      // Supprimer les entretiens associés à toutes les candidatures
      for (const application of existingCandidate.applications) {
        if (application.interviews.length > 0) {
          await tx.interview.deleteMany({
            where: {
              applicationId: application.id
            }
          });
        }
      }
      
      // Supprimer les candidatures
      if (existingCandidate.applications.length > 0) {
        await tx.application.deleteMany({
          where: {
            candidateId: id
          }
        });
      }
      
      // Supprimer les expériences
      await tx.experience.deleteMany({
        where: {
          candidateId: id
        }
      });
      
      // Supprimer les formations
      await tx.education.deleteMany({
        where: {
          candidateId: id
        }
      });
      
      // Supprimer le candidat
      await tx.candidate.delete({
        where: { id }
      });
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'OTHER',
      id,
      { 
        action: "Suppression d'un candidat",
        candidateName: `${existingCandidate.firstName} ${existingCandidate.lastName}`
      }
    );
    
    return NextResponse.json({ message: "Candidat supprimé avec succès" });
  } catch (error) {
    console.error('Erreur lors de la suppression du candidat:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression du candidat' },
      { status: 500 }
    );
  }
} 