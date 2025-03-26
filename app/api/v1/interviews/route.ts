import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les entretiens avec filtres
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

    // Extraire les paramètres de requête
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const applicationId = searchParams.get('applicationId');
    const interviewerId = searchParams.get('interviewerId');
    const search = searchParams.get('search') || '';
    const companyId = searchParams.get('companyId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Configurer la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where pour les filtres
    const where: any = {};
    
    // Filtre par statut
    if (status) {
      where.status = status;
    }
    
    // Filtre par application
    if (applicationId) {
      where.applicationId = applicationId;
    }
    
    // Filtre par interviewer
    if (interviewerId) {
      where.interviewerId = interviewerId;
    }
    
    // Filtre par compagnie
    if (companyId) {
      where.application = {
        jobPosting: {
          companyId
        }
      };
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Pour les admins d'entreprise, filtrer par leur entreprise
      where.application = {
        jobPosting: {
          companyId: permissionCheck.user.companyId
        }
      };
    }
    
    // Filtre par plage de dates
    if (dateFrom || dateTo) {
      where.scheduledAt = {};
      
      if (dateFrom) {
        where.scheduledAt.gte = new Date(dateFrom);
      }
      
      if (dateTo) {
        where.scheduledAt.lte = new Date(dateTo);
      }
    }
    
    // Filtre par recherche (titre d'entretien, nom du candidat, etc.)
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { 
          application: { 
            candidate: { 
              OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } }
              ]
            } 
          } 
        },
        { 
          interviewer: { 
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } }
            ]
          } 
        }
      ];
    }
    
    // Récupérer le nombre total d'entretiens pour pagination
    const total = await prisma.interview.count({ where });
    
    // Récupérer les entretiens
    const interviews = await prisma.interview.findMany({
      where,
      include: {
        application: {
          include: {
            jobPosting: {
              select: {
                id: true,
                title: true,
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
                firstName: true,
                lastName: true,
                email: true,
                phone: true
              }
            }
          }
        },
        interviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      skip,
      take: limit,
      orderBy: {
        scheduledAt: 'asc'
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des entretiens", filters: { status, applicationId, interviewerId, companyId, dateFrom, dateTo, search } }
    );
    
    return NextResponse.json({
      items: interviews,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des entretiens:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des entretiens' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouvel entretien
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
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation des données d'entretien
    const InterviewSchema = z.object({
      applicationId: z.string(),
      interviewerId: z.string(),
      title: z.string().min(1, "Le titre est requis"),
      scheduledAt: z.string(),
      duration: z.number().min(1, "La durée doit être d'au moins 1 minute"),
      status: z.string().optional(),
      type: z.string().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
      questions: z.array(z.string()).optional(),
      feedbackForm: z.string().optional(),
      feedback: z.string().optional(),
      rating: z.number().min(0).max(5).optional()
    });
    
    // Valider les données
    const validationResult = InterviewSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier si l'application existe
    const application = await prisma.application.findUnique({
      where: { id: validatedData.applicationId },
      include: {
        jobPosting: {
          select: {
            companyId: true
          }
        },
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });
    
    if (!application) {
      return NextResponse.json({ error: "Candidature non trouvée" }, { status: 404 });
    }
    
    // Vérifier les permissions de création d'entretien pour cette candidature
    const isAdmin = permissionCheck.role === 'SUPER_ADMIN';
    const isCompanyAdmin = permissionCheck.role === 'COMPANY_ADMIN' && 
                          application.jobPosting.companyId === permissionCheck.user?.companyId;
    
    if (!isAdmin && !isCompanyAdmin) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour créer un entretien pour cette candidature" },
        { status: 403 }
      );
    }
    
    // Vérifier si l'interviewer existe
    const interviewer = await prisma.user.findUnique({
      where: { id: validatedData.interviewerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      }
    });
    
    if (!interviewer) {
      return NextResponse.json({ error: "Interviewer non trouvé" }, { status: 404 });
    }
    
    // Préparer les données pour la création
    const interviewData = {
      applicationId: validatedData.applicationId,
      interviewerId: validatedData.interviewerId,
      title: validatedData.title,
      scheduledAt: new Date(validatedData.scheduledAt),
      duration: validatedData.duration,
      status: validatedData.status || "PLANNED",
      type: validatedData.type,
      location: validatedData.location,
      notes: validatedData.notes,
      questions: validatedData.questions,
      feedbackForm: validatedData.feedbackForm,
      feedback: validatedData.feedback,
      rating: validatedData.rating
    };
    
    // Créer l'entretien
    const interview = await prisma.interview.create({
      data: interviewData,
      include: {
        application: {
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
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        interviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });
    
    // Construire le nom du candidat à partir de firstName et lastName
    const candidateName = `${interview.application.candidate.firstName} ${interview.application.candidate.lastName}`.trim();
    const jobPostingTitle = interview.application.jobPosting.title;
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'OTHER',
      interview.id,
      { 
        action: "Création d'un entretien",
        title: validatedData.title,
        candidateId: interview.application.candidate.id,
        candidateName,
        jobPostingTitle
      }
    );
    
    return NextResponse.json(interview, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de l\'entretien:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de l\'entretien' },
      { status: 500 }
    );
  }
} 