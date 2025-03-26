import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer toutes les candidatures
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Seuls les admins peuvent voir toutes les candidatures
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour accéder aux candidatures" },
        { status: 403 }
      );
    }
    
    // Extraire les paramètres de requête
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') || undefined;
    const jobPostingId = searchParams.get('jobPostingId') || undefined;
    const candidateId = searchParams.get('candidateId') || undefined;
    const search = searchParams.get('search') || '';
    const companyId = searchParams.get('companyId') || undefined;
    
    // Calculer l'offset pour la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where
    const where: any = {};
    
    // Filtrer par statut si spécifié
    if (status) {
      where.status = status;
    }
    
    // Filtrer par offre d'emploi
    if (jobPostingId) {
      where.jobPostingId = jobPostingId;
    }
    
    // Filtrer par candidat
    if (candidateId) {
      where.candidateId = candidateId;
    }
    
    // Recherche par notes
    if (search) {
      where.OR = [
        { notes: { contains: search, mode: 'insensitive' } },
        { jobPosting: { title: { contains: search, mode: 'insensitive' } } },
        { candidate: { 
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } }
            ] 
          } 
        }
      ];
    }
    
    // Filtrer par compagnie (via l'offre d'emploi)
    if (companyId) {
      where.jobPosting = { companyId };
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Si l'utilisateur est un admin d'entreprise, n'afficher que les candidatures pour des offres de son entreprise
      where.jobPosting = { companyId: permissionCheck.user.companyId };
    }
    
    // Récupérer les candidatures
    const [applications, total] = await prisma.$transaction([
      prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          jobPosting: {
            select: {
              id: true,
              title: true,
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
              resumeUrl: true
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
            },
            orderBy: {
              scheduledAt: 'desc'
            },
            take: 1
          }
        }
      }),
      prisma.application.count({ where })
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      undefined,
      { action: 'Liste des candidatures', filters: { status, jobPostingId, candidateId, search, companyId } }
    );
    
    return NextResponse.json({
      data: applications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des candidatures:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des candidatures' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle candidature
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Tous les utilisateurs peuvent postuler (même non connectés via JWT)
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour la candidature
    const ApplicationSchema = z.object({
      jobPostingId: z.string({ message: "L'ID de l'offre d'emploi est requis" }),
      candidateId: z.string().optional(), // Optionnel si on crée un nouveau candidat
      status: z.string().default('RECEIVED'),
      notes: z.string().optional(),
      resume: z.string().optional(), // URL du CV ou base64 du fichier
      coverLetter: z.string().optional(),
      // Si candidateId n'est pas fourni, ces champs sont requis pour créer un nouveau candidat
      newCandidate: z.object({
        name: z.string().min(2, { message: "Le nom doit contenir au moins 2 caractères" }),
        email: z.string().email({ message: "Email invalide" }),
        phone: z.string().optional(),
        address: z.string().optional(),
        linkedin: z.string().optional(),
        resumeUrl: z.string().optional()
      }).optional()
    });
    
    // Valider les données
    const validationResult = ApplicationSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier que l'offre d'emploi existe et est active
    const jobPosting = await prisma.jobPosting.findUnique({
      where: { id: validatedData.jobPostingId }
    });
    
    if (!jobPosting) {
      return NextResponse.json(
        { error: "Offre d'emploi non trouvée" },
        { status: 404 }
      );
    }
    
    if (!jobPosting.isActive) {
      return NextResponse.json(
        { error: "Cette offre d'emploi n'est plus disponible" },
        { status: 400 }
      );
    }
    
    // Vérifier ou créer le candidat
    let candidateId = validatedData.candidateId;
    
    if (!candidateId) {
      if (!validatedData.newCandidate) {
        return NextResponse.json(
          { error: "Veuillez fournir soit un ID de candidat existant, soit les informations pour en créer un nouveau" },
          { status: 400 }
        );
      }
      
      // Vérifier si un candidat avec cet email existe déjà
      const existingCandidate = await prisma.candidate.findFirst({
        where: { email: validatedData.newCandidate.email }
      });
      
      if (existingCandidate) {
        candidateId = existingCandidate.id;
      } else {
        // Créer un nouveau candidat
        const newCandidate = await prisma.candidate.create({
          data: validatedData.newCandidate
        });
        candidateId = newCandidate.id;
      }
    } else {
      // Vérifier que le candidat existe
      const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId }
      });
      
      if (!candidate) {
        return NextResponse.json(
          { error: "Candidat non trouvé" },
          { status: 404 }
        );
      }
    }
    
    // Vérifier si le candidat a déjà postulé à cette offre
    const existingApplication = await prisma.application.findFirst({
      where: {
        jobPostingId: validatedData.jobPostingId,
        candidateId: candidateId
      }
    });
    
    if (existingApplication) {
      return NextResponse.json(
        { error: "Vous avez déjà postulé à cette offre d'emploi" },
        { status: 400 }
      );
    }
    
    // Créer la candidature
    const application = await prisma.application.create({
      data: {
        jobPostingId: validatedData.jobPostingId,
        candidateId: candidateId,
        status: validatedData.status,
        notes: validatedData.notes,
        resumeFile: validatedData.resume,
        coverLetter: validatedData.coverLetter
      },
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
      'CREATE',
      'OTHER',
      application.id,
      { action: 'Création d\'une candidature', jobPosting: application.jobPosting.title, candidate: application.candidate.name }
    );
    
    return NextResponse.json(application, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la candidature:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de la candidature' },
      { status: 500 }
    );
  }
} 