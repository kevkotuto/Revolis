import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une candidature spécifique
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
    
    // Récupérer la candidature
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        jobPosting: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            companyId: true,
            company: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        candidate: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            resumeUrl: true,
            linkedin: true
          }
        },
        interviews: {
          include: {
            interviewer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            scheduledAt: 'asc'
          }
        }
      }
    });
    
    // Vérifier si la candidature existe
    if (!application) {
      return NextResponse.json({ error: "Candidature non trouvée" }, { status: 404 });
    }
    
    // Vérifier les permissions d'accès
    const isAdmin = permissionCheck.role === 'SUPER_ADMIN';
    const isCompanyAdmin = permissionCheck.role === 'COMPANY_ADMIN' && 
                          application.jobPosting.companyId === permissionCheck.user?.companyId;
    const isCandidate = permissionCheck.user?.id === application.candidate.id;
    
    if (!isAdmin && !isCompanyAdmin && !isCandidate) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour accéder à cette candidature" },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      id,
      { action: "Consultation d'une candidature" }
    );
    
    return NextResponse.json(application);
  } catch (error) {
    console.error('Erreur lors de la récupération de la candidature:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de la candidature' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une candidature
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
    
    // Récupérer la candidature existante
    const existingApplication = await prisma.application.findUnique({
      where: { id },
      include: {
        jobPosting: {
          select: {
            companyId: true
          }
        },
        candidate: {
          select: {
            id: true
          }
        }
      }
    });
    
    // Vérifier si la candidature existe
    if (!existingApplication) {
      return NextResponse.json({ error: "Candidature non trouvée" }, { status: 404 });
    }
    
    // Vérifier les permissions de modification
    const isAdmin = permissionCheck.role === 'SUPER_ADMIN';
    const isCompanyAdmin = permissionCheck.role === 'COMPANY_ADMIN' && 
                          existingApplication.jobPosting.companyId === permissionCheck.user?.companyId;
    const isCandidate = permissionCheck.user?.id === existingApplication.candidate.id;
    
    if (!isAdmin && !isCompanyAdmin && !isCandidate) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour modifier cette candidature" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation différent selon le rôle
    let ApplicationUpdateSchema;
    
    if (isAdmin || isCompanyAdmin) {
      // Admins peuvent tout modifier
      ApplicationUpdateSchema = z.object({
        status: z.string().optional(),
        notes: z.string().optional(),
        resume: z.string().optional(),
        coverLetter: z.string().optional(),
        feedback: z.string().optional(),
        rating: z.number().min(0).max(5).optional()
      });
    } else if (isCandidate) {
      // Candidats peuvent seulement mettre à jour leur CV et lettre de motivation
      ApplicationUpdateSchema = z.object({
        resume: z.string().optional(),
        coverLetter: z.string().optional()
      });
    } else {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour modifier cette candidature" },
        { status: 403 }
      );
    }
    
    // Valider les données
    const validationResult = ApplicationUpdateSchema.safeParse(data);
    
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
    if (validatedData.status !== undefined) updateData.status = validatedData.status;
    if (validatedData.notes !== undefined) updateData.notes = validatedData.notes;
    if (validatedData.resume !== undefined) updateData.resumeFile = validatedData.resume;
    if (validatedData.coverLetter !== undefined) updateData.coverLetter = validatedData.coverLetter;
    if (validatedData.feedback !== undefined) updateData.feedback = validatedData.feedback;
    if (validatedData.rating !== undefined) updateData.rating = validatedData.rating;
    
    // Mettre à jour la candidature
    const updatedApplication = await prisma.application.update({
      where: { id },
      data: updateData,
      include: {
        jobPosting: {
          select: {
            id: true,
            title: true
          }
        },
        candidate: {
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
      { action: "Mise à jour d'une candidature", updates: validatedData }
    );
    
    return NextResponse.json(updatedApplication);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la candidature:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de la candidature' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une candidature
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
    
    // Récupérer la candidature existante
    const existingApplication = await prisma.application.findUnique({
      where: { id },
      include: {
        jobPosting: {
          select: {
            companyId: true,
            title: true
          }
        },
        candidate: {
          select: {
            id: true,
            name: true
          }
        },
        interviews: {
          select: {
            id: true
          }
        }
      }
    });
    
    // Vérifier si la candidature existe
    if (!existingApplication) {
      return NextResponse.json({ error: "Candidature non trouvée" }, { status: 404 });
    }
    
    // Seuls les admins peuvent supprimer des candidatures
    const isAdmin = permissionCheck.role === 'SUPER_ADMIN';
    const isCompanyAdmin = permissionCheck.role === 'COMPANY_ADMIN' && 
                          existingApplication.jobPosting.companyId === permissionCheck.user?.companyId;
    
    if (!isAdmin && !isCompanyAdmin) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour supprimer cette candidature" },
        { status: 403 }
      );
    }
    
    // Supprimer la candidature et les entretiens associés dans une transaction
    await prisma.$transaction(async (tx) => {
      // Supprimer les entretiens associés
      if (existingApplication.interviews.length > 0) {
        await tx.interview.deleteMany({
          where: {
            applicationId: id
          }
        });
      }
      
      // Supprimer la candidature
      await tx.application.delete({
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
        action: "Suppression d'une candidature", 
        jobPosting: existingApplication.jobPosting.title,
        candidate: existingApplication.candidate.name
      }
    );
    
    return NextResponse.json({ message: "Candidature supprimée avec succès" });
  } catch (error) {
    console.error('Erreur lors de la suppression de la candidature:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de la candidature' },
      { status: 500 }
    );
  }
} 