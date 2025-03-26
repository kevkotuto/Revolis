import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer un entretien spécifique
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
    
    // Récupérer l'entretien
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPosting: {
              select: {
                id: true,
                title: true,
                description: true,
                companyId: true,
                company: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            },
            candidate: true
          }
        },
        interviewer: true
      }
    });
    
    // Vérifier si l'entretien existe
    if (!interview) {
      return NextResponse.json({ error: "Entretien non trouvé" }, { status: 404 });
    }
    
    // Vérifier les permissions d'accès
    const isAdmin = permissionCheck.role === 'SUPER_ADMIN';
    const isCompanyAdmin = permissionCheck.role === 'COMPANY_ADMIN' && 
                          interview.application.jobPosting.companyId === permissionCheck.user?.companyId;
    const isInterviewer = permissionCheck.user?.id === interview.interviewerId;
    
    if (!isAdmin && !isCompanyAdmin && !isInterviewer) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour accéder à cet entretien" },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      id,
      { action: "Consultation d'un entretien" }
    );
    
    return NextResponse.json(interview);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'entretien:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de l\'entretien' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un entretien
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
    
    // Récupérer l'entretien existant
    const existingInterview = await prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPosting: {
              select: {
                companyId: true
              }
            }
          }
        }
      }
    });
    
    // Vérifier si l'entretien existe
    if (!existingInterview) {
      return NextResponse.json({ error: "Entretien non trouvé" }, { status: 404 });
    }
    
    // Vérifier les permissions de modification
    const isAdmin = permissionCheck.role === 'SUPER_ADMIN';
    const isCompanyAdmin = permissionCheck.role === 'COMPANY_ADMIN' && 
                          existingInterview.application.jobPosting.companyId === permissionCheck.user?.companyId;
    const isInterviewer = permissionCheck.user?.id === existingInterview.interviewerId;
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation différent selon le rôle
    let InterviewUpdateSchema;
    
    if (isAdmin || isCompanyAdmin) {
      // Admins peuvent tout modifier
      InterviewUpdateSchema = z.object({
        applicationId: z.string().optional(),
        interviewerId: z.string().optional(),
        title: z.string().min(1, "Le titre est requis").optional(),
        scheduledAt: z.string().optional(),
        duration: z.number().min(1, "La durée doit être d'au moins 1 minute").optional(),
        status: z.string().optional(),
        type: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        questions: z.array(z.string()).optional(),
        feedbackForm: z.string().optional(),
        feedback: z.string().optional(),
        rating: z.number().min(0).max(5).optional()
      });
    } else if (isInterviewer) {
      // Interviewers peuvent uniquement modifier certains champs
      InterviewUpdateSchema = z.object({
        status: z.string().optional(),
        notes: z.string().optional(),
        feedback: z.string().optional(),
        rating: z.number().min(0).max(5).optional()
      });
    } else {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour modifier cet entretien" },
        { status: 403 }
      );
    }
    
    // Valider les données
    const validationResult = InterviewUpdateSchema.safeParse(data);
    
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
    if (validatedData.applicationId !== undefined) updateData.applicationId = validatedData.applicationId;
    if (validatedData.interviewerId !== undefined) updateData.interviewerId = validatedData.interviewerId;
    if (validatedData.title !== undefined) updateData.title = validatedData.title;
    if (validatedData.scheduledAt !== undefined) updateData.scheduledAt = new Date(validatedData.scheduledAt);
    if (validatedData.duration !== undefined) updateData.duration = validatedData.duration;
    if (validatedData.status !== undefined) updateData.status = validatedData.status;
    if (validatedData.type !== undefined) updateData.type = validatedData.type;
    if (validatedData.location !== undefined) updateData.location = validatedData.location;
    if (validatedData.notes !== undefined) updateData.notes = validatedData.notes;
    if (validatedData.questions !== undefined) updateData.questions = validatedData.questions;
    if (validatedData.feedbackForm !== undefined) updateData.feedbackForm = validatedData.feedbackForm;
    if (validatedData.feedback !== undefined) updateData.feedback = validatedData.feedback;
    if (validatedData.rating !== undefined) updateData.rating = validatedData.rating;
    
    // Mettre à jour l'entretien
    const updatedInterview = await prisma.interview.update({
      where: { id },
      data: updateData,
      include: {
        application: {
          include: {
            jobPosting: {
              select: {
                id: true,
                title: true
              }
            },
            candidate: true
          }
        },
        interviewer: true
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'UPDATE',
      'OTHER',
      id,
      { action: "Mise à jour d'un entretien", updates: validatedData }
    );
    
    return NextResponse.json(updatedInterview);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'entretien:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de l\'entretien' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un entretien
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
    
    // Récupérer l'entretien existant
    const existingInterview = await prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
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
            }
          }
        },
        interviewer: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    // Vérifier si l'entretien existe
    if (!existingInterview) {
      return NextResponse.json({ error: "Entretien non trouvé" }, { status: 404 });
    }
    
    // Seuls les admins peuvent supprimer des entretiens
    const isAdmin = permissionCheck.role === 'SUPER_ADMIN';
    const isCompanyAdmin = permissionCheck.role === 'COMPANY_ADMIN' && 
                          existingInterview.application.jobPosting.companyId === permissionCheck.user?.companyId;
    
    if (!isAdmin && !isCompanyAdmin) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour supprimer cet entretien" },
        { status: 403 }
      );
    }
    
    // Vérifier si l'entretien a déjà eu lieu
    const now = new Date();
    if (existingInterview.scheduledAt < now && existingInterview.status === 'COMPLETED') {
      return NextResponse.json(
        { error: "Impossible de supprimer un entretien déjà terminé" },
        { status: 400 }
      );
    }
    
    // Supprimer l'entretien
    await prisma.interview.delete({
      where: { id }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'OTHER',
      id,
      { 
        action: "Suppression d'un entretien", 
        application: {
          jobPosting: existingInterview.application.jobPosting.title,
          candidate: existingInterview.application.candidate.name
        },
        interviewer: existingInterview.interviewer?.name || 'Non assigné'
      }
    );
    
    return NextResponse.json({ message: "Entretien supprimé avec succès" });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'entretien:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de l\'entretien' },
      { status: 500 }
    );
  }
} 