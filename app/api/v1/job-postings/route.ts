import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer toutes les offres d'emploi
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
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') || undefined;
    const isActive = searchParams.get('isActive') ? searchParams.get('isActive') === 'true' : undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const search = searchParams.get('search') || '';
    const companyId = searchParams.get('companyId') || undefined;
    const location = searchParams.get('location') || undefined;
    
    // Calculer l'offset pour la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where
    const where: any = {};
    
    // Filtrer par statut si spécifié
    if (status) {
      where.status = status;
    }
    
    // Filtrer par état actif/inactif
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    
    // Filtrer par département
    if (departmentId) {
      where.departmentId = departmentId;
    }
    
    // Filtrer par lieu
    if (location) {
      where.location = { contains: location, mode: 'insensitive' };
    }
    
    // Recherche par titre ou description
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { requirements: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Filtrer par compagnie
    if (companyId) {
      where.companyId = companyId;
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Si l'utilisateur est un admin d'entreprise, n'afficher que les offres de son entreprise
      where.companyId = permissionCheck.user.companyId;
    }
    
    // Pour les utilisateurs non-admin, ne montrer que les offres actives
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      where.isActive = true;
    }
    
    // Récupérer les offres d'emploi
    const [jobPostings, total] = await prisma.$transaction([
      prisma.jobPosting.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              applications: true
            }
          }
        }
      }),
      prisma.jobPosting.count({ where })
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      undefined,
      { action: 'Liste des offres d\'emploi', filters: { status, isActive, departmentId, search, companyId } }
    );
    
    return NextResponse.json({
      data: jobPostings,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des offres d\'emploi:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des offres d\'emploi' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle offre d'emploi
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
    
    // Seuls les admins peuvent créer des offres d'emploi
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour créer des offres d'emploi" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour l'offre d'emploi
    const JobPostingSchema = z.object({
      title: z.string().min(3, { message: "Le titre doit contenir au moins 3 caractères" }),
      description: z.string().min(10, { message: "La description doit contenir au moins 10 caractères" }),
      requirements: z.string().optional(),
      location: z.string().optional(),
      salary: z.string().optional(),
      type: z.string().optional(), // Type de contrat (CDI, CDD, etc.)
      departmentId: z.string().optional(),
      status: z.string().default('OPEN'),
      isActive: z.boolean().default(true),
      publishDate: z.string().datetime().default(() => new Date().toISOString()),
      closingDate: z.string().datetime().optional(),
      companyId: z.string().optional(),
      contactEmail: z.string().email().optional()
    });
    
    // Valider les données
    const validationResult = JobPostingSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Déterminer l'ID de l'entreprise
    let companyId = validatedData.companyId;
    
    // Si companyId n'est pas fourni, utiliser celui de l'utilisateur
    if (!companyId) {
      if (permissionCheck.user?.companyId) {
        companyId = permissionCheck.user.companyId;
      } else if (permissionCheck.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { error: "ID d'entreprise requis" },
          { status: 400 }
        );
      }
    } 
    // Si companyId est fourni et différent de celui de l'utilisateur (pour COMPANY_ADMIN)
    else if (permissionCheck.role === 'COMPANY_ADMIN' && 
             companyId !== permissionCheck.user?.companyId) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas créer une offre d'emploi pour une autre entreprise" },
        { status: 403 }
      );
    }
    
    // Vérifier que l'entreprise existe
    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      });
      
      if (!company) {
        return NextResponse.json(
          { error: "Entreprise non trouvée" },
          { status: 404 }
        );
      }
    }
    
    // Vérifier le département si spécifié
    if (validatedData.departmentId) {
      // Ajouter la vérification du département si nécessaire
      // Cette partie dépend de votre modèle de données
    }
    
    // Préparer les données
    const jobPostingData = {
      ...validatedData,
      publishDate: new Date(validatedData.publishDate),
      closingDate: validatedData.closingDate ? new Date(validatedData.closingDate) : null,
      companyId
    };
    
    // Créer l'offre d'emploi
    const jobPosting = await prisma.jobPosting.create({
      data: jobPostingData,
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
      'CREATE',
      'OTHER',
      jobPosting.id,
      { action: 'Création d\'une offre d\'emploi', title: validatedData.title }
    );
    
    return NextResponse.json(jobPosting, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de l\'offre d\'emploi:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de l\'offre d\'emploi' },
      { status: 500 }
    );
  }
} 