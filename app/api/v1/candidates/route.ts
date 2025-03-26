import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les candidats avec filtres
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
    const companyId = searchParams.get('companyId');
    const search = searchParams.get('search') || '';
    const skillId = searchParams.get('skillId');
    const onlyActive = searchParams.get('onlyActive') === 'true';

    // Configurer la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where pour les filtres
    const where: any = {};
    
    // Filtre par statut
    if (status) {
      where.status = status;
    }
    
    // Filtre par compagnie (cherche les candidats qui ont postulé à des offres de cette compagnie)
    if (companyId) {
      where.applications = {
        some: {
          jobPosting: {
            companyId
          }
        }
      };
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Pour les admins d'entreprise, filtrer par leur entreprise
      where.applications = {
        some: {
          jobPosting: {
            companyId: permissionCheck.user.companyId
          }
        }
      };
    }
    
    // Filtre pour ne montrer que les candidats actifs
    if (onlyActive) {
      where.active = true;
    }
    
    // Filtre par compétence
    if (skillId) {
      where.skills = {
        some: {
          id: skillId
        }
      };
    }
    
    // Filtre par recherche (email, nom, etc.)
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { skills: { 
            some: { 
              name: { contains: search, mode: 'insensitive' } 
            } 
          } 
        }
      ];
    }
    
    // Récupérer le nombre total de candidats pour pagination
    const total = await prisma.candidate.count({ where });
    
    // Récupérer les candidats
    const candidates = await prisma.candidate.findMany({
      where,
      include: {
        skills: {
          select: {
            id: true,
            name: true,
            category: true
          }
        },
        applications: {
          select: {
            id: true,
            status: true,
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
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 5 // Limiter à 5 candidatures récentes
        }
      },
      skip,
      take: limit,
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des candidats", filters: { status, companyId, skillId, onlyActive, search } }
    );
    
    return NextResponse.json({
      items: candidates,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des candidats:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des candidats' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau candidat
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
    
    // Schéma de validation des données du candidat
    const CandidateSchema = z.object({
      email: z.string().email("Email invalide"),
      firstName: z.string().min(1, "Le prénom est requis"),
      lastName: z.string().min(1, "Le nom est requis"),
      phone: z.string().optional(),
      address: z.string().optional(),
      resumeUrl: z.string().url("URL de CV invalide").optional(),
      linkedin: z.string().url("URL LinkedIn invalide").optional(),
      portfolio: z.string().url("URL de portfolio invalide").optional(),
      skills: z.array(z.string()).optional(),
      education: z.array(
        z.object({
          institution: z.string(),
          degree: z.string(),
          fieldOfStudy: z.string(),
          startDate: z.string(),
          endDate: z.string().optional(),
          description: z.string().optional()
        })
      ).optional(),
      experience: z.array(
        z.object({
          company: z.string(),
          position: z.string(),
          location: z.string().optional(),
          startDate: z.string(),
          endDate: z.string().optional(),
          description: z.string().optional()
        })
      ).optional(),
      notes: z.string().optional(),
      status: z.string().optional()
    });
    
    // Valider les données
    const validationResult = CandidateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier si le candidat existe déjà
    const existingCandidate = await prisma.candidate.findUnique({
      where: { email: validatedData.email }
    });
    
    if (existingCandidate) {
      return NextResponse.json(
        { error: "Un candidat avec cet email existe déjà" },
        { status: 409 }
      );
    }
    
    // Préparer les données pour la création
    const candidateData: any = {
      email: validatedData.email,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      phone: validatedData.phone,
      address: validatedData.address,
      resumeUrl: validatedData.resumeUrl,
      linkedin: validatedData.linkedin,
      portfolio: validatedData.portfolio,
      notes: validatedData.notes,
      status: validatedData.status || "ACTIVE",
      active: true
    };
    
    // Ajouter les compétences si fournies
    if (validatedData.skills && validatedData.skills.length > 0) {
      candidateData.skills = {
        connect: validatedData.skills.map(skillId => ({ id: skillId }))
      };
    }
    
    // Ajouter l'éducation si fournie
    if (validatedData.education && validatedData.education.length > 0) {
      candidateData.education = {
        create: validatedData.education.map(edu => ({
          institution: edu.institution,
          degree: edu.degree,
          fieldOfStudy: edu.fieldOfStudy,
          startDate: new Date(edu.startDate),
          endDate: edu.endDate ? new Date(edu.endDate) : null,
          description: edu.description
        }))
      };
    }
    
    // Ajouter l'expérience si fournie
    if (validatedData.experience && validatedData.experience.length > 0) {
      candidateData.experience = {
        create: validatedData.experience.map(exp => ({
          company: exp.company,
          position: exp.position,
          location: exp.location,
          startDate: new Date(exp.startDate),
          endDate: exp.endDate ? new Date(exp.endDate) : null,
          description: exp.description
        }))
      };
    }
    
    // Créer le candidat
    const candidate = await prisma.candidate.create({
      data: candidateData,
      include: {
        skills: true,
        education: true,
        experience: true
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'OTHER',
      candidate.id,
      { 
        action: "Création d'un candidat",
        email: candidate.email,
        name: `${candidate.firstName} ${candidate.lastName}`
      }
    );
    
    return NextResponse.json(candidate, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du candidat:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création du candidat' },
      { status: 500 }
    );
  }
} 