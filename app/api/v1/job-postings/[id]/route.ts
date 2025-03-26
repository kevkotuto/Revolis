import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une offre d'emploi spécifique
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
    
    // Récupérer l'offre d'emploi
    const jobPosting = await prisma.jobPosting.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logo: true
          }
        },
        applications: {
          // Seuls les admins peuvent voir les candidatures
          ...(permissionCheck.role === 'SUPER_ADMIN' || permissionCheck.role === 'COMPANY_ADMIN'
            ? {
                include: {
                  candidate: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      phone: true
                    }
                  },
                  interviews: {
                    select: {
                      id: true,
                      scheduledAt: true,
                      status: true,
                      interviewer: {
                        select: {
                          id: true,
                          name: true
                        }
                      }
                    }
                  }
                }
              }
            : { select: { id: true } } // Pour les utilisateurs normaux, juste le nombre
          )
        }
      }
    });
    
    // Vérifier si l'offre d'emploi existe
    if (!jobPosting) {
      return NextResponse.json({ error: "Offre d'emploi non trouvée" }, { status: 404 });
    }
    
    // Pour les utilisateurs non-admin, vérifier si l'offre est active
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.role !== 'COMPANY_ADMIN' && 
        !jobPosting.isActive) {
      return NextResponse.json(
        { error: "Cette offre d'emploi n'est pas accessible" },
        { status: 403 }
      );
    }
    
    // Si l'utilisateur est un COMPANY_ADMIN, vérifier qu'il accède à une offre de sa propre entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        jobPosting.companyId !== permissionCheck.user?.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour accéder à cette offre d'emploi" },
        { status: 403 }
      );
    }
    
    // Préparer les données à retourner en fonction du rôle
    let responseData = jobPosting;
    
    // Pour les utilisateurs normaux, masquer certaines informations
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.role !== 'COMPANY_ADMIN') {
      const { applications, ...publicData } = jobPosting;
      responseData = {
        ...publicData,
        applicationCount: applications.length
      };
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      id,
      { action: 'Consultation d\'une offre d\'emploi' }
    );
    
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'offre d\'emploi:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de l\'offre d\'emploi' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une offre d'emploi
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
    
    // Seuls les admins peuvent modifier les offres d'emploi
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour modifier des offres d'emploi" },
        { status: 403 }
      );
    }
    
    // Récupérer l'offre d'emploi existante
    const existingJobPosting = await prisma.jobPosting.findUnique({
      where: { id }
    });
    
    // Vérifier si l'offre d'emploi existe
    if (!existingJobPosting) {
      return NextResponse.json({ error: "Offre d'emploi non trouvée" }, { status: 404 });
    }
    
    // Si l'utilisateur est un COMPANY_ADMIN, vérifier qu'il modifie une offre de sa propre entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        existingJobPosting.companyId !== permissionCheck.user?.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour modifier cette offre d'emploi" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour la mise à jour de l'offre d'emploi
    const JobPostingUpdateSchema = z.object({
      title: z.string().min(3, { message: "Le titre doit contenir au moins 3 caractères" }).optional(),
      description: z.string().min(10, { message: "La description doit contenir au moins 10 caractères" }).optional(),
      requirements: z.string().optional(),
      location: z.string().optional(),
      salary: z.string().optional(),
      type: z.string().optional(),
      departmentId: z.string().optional(),
      status: z.string().optional(),
      isActive: z.boolean().optional(),
      publishDate: z.string().datetime().optional(),
      closingDate: z.string().datetime().optional().nullable(),
      contactEmail: z.string().email().optional()
    });
    
    // Valider les données
    const validationResult = JobPostingUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Préparer les données pour la mise à jour
    const updateData: any = { ...validatedData };
    
    // Convertir les dates si elles sont fournies
    if (updateData.publishDate) {
      updateData.publishDate = new Date(updateData.publishDate);
    }
    if (updateData.closingDate !== undefined) {
      updateData.closingDate = updateData.closingDate ? new Date(updateData.closingDate) : null;
    }
    
    // Mettre à jour l'offre d'emploi
    const updatedJobPosting = await prisma.jobPosting.update({
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
      permissionCheck.user?.id || 'unknown',
      'UPDATE',
      'OTHER',
      id,
      { action: 'Mise à jour d\'une offre d\'emploi', updates: validatedData }
    );
    
    return NextResponse.json(updatedJobPosting);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'offre d\'emploi:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de l\'offre d\'emploi' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une offre d'emploi
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
    
    // Seuls les admins peuvent supprimer des offres d'emploi
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour supprimer des offres d'emploi" },
        { status: 403 }
      );
    }
    
    // Récupérer l'offre d'emploi existante
    const existingJobPosting = await prisma.jobPosting.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            applications: true
          }
        }
      }
    });
    
    // Vérifier si l'offre d'emploi existe
    if (!existingJobPosting) {
      return NextResponse.json({ error: "Offre d'emploi non trouvée" }, { status: 404 });
    }
    
    // Si l'utilisateur est un COMPANY_ADMIN, vérifier qu'il supprime une offre de sa propre entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        existingJobPosting.companyId !== permissionCheck.user?.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour supprimer cette offre d'emploi" },
        { status: 403 }
      );
    }
    
    // Vérifier s'il y a des candidatures associées
    if (existingJobPosting._count.applications > 0) {
      // Option 1 : Empêcher la suppression
      // return NextResponse.json(
      //   { error: "Impossible de supprimer cette offre car elle a des candidatures associées" },
      //   { status: 400 }
      // );
      
      // Option 2 : Désactiver l'offre au lieu de la supprimer
      await prisma.jobPosting.update({
        where: { id },
        data: {
          isActive: false,
          status: 'CLOSED'
        }
      });
      
      // Journaliser l'action
      await logAction(
        permissionCheck.user?.id || 'unknown',
        'UPDATE',
        'OTHER',
        id,
        { action: 'Désactivation d\'une offre d\'emploi (au lieu de suppression)', reason: 'Candidatures existantes' }
      );
      
      return NextResponse.json({ 
        message: "L'offre d'emploi a été désactivée car elle a des candidatures associées",
        wasDeactivated: true 
      });
    }
    
    // Si pas de candidatures, supprimer l'offre
    await prisma.jobPosting.delete({
      where: { id }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'OTHER',
      id,
      { action: 'Suppression d\'une offre d\'emploi' }
    );
    
    return NextResponse.json({ 
      message: "Offre d'emploi supprimée avec succès",
      wasDeleted: true
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'offre d\'emploi:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de l\'offre d\'emploi' },
      { status: 500 }
    );
  }
} 