import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer la documentation
export async function GET(request: NextRequest) {
  try {
    // Extraire les paramètres de la requête
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    const category = url.searchParams.get('category');
    const publicOnly = url.searchParams.get('publicOnly') === 'true';
    const companyId = url.searchParams.get('companyId');
    
    // Construire la requête
    const where: any = {};
    
    // Si une entreprise spécifique est demandée, vérifier les permissions
    if (companyId) {
      // Pour accéder à la doc privée d'une entreprise, il faut avoir les permissions
      if (!publicOnly) {
        const permissionCheck = await checkPermission(request, {
          action: 'READ',
          resource: 'COMPANY'
        });
        
        if (!permissionCheck.allowed) {
          // Si pas autorisé, on limite aux docs publiques
          where.isPublic = true;
        }
      } else {
        // Si publicOnly est demandé explicitement
        where.isPublic = true;
      }
      
      where.companyId = companyId;
    } else {
      // Si aucune entreprise n'est spécifiée, on montre uniquement les docs publiques
      where.isPublic = true;
    }
    
    // Filtre par slug si spécifié
    if (slug) {
      where.slug = slug;
    }
    
    // Filtre par catégorie si spécifiée
    if (category) {
      where.category = category;
    }
    
    // Récupérer la documentation
    const documentation = await prisma.documentationPage.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { title: 'asc' }
      ]
    });
    
    // Si on cherche un slug spécifique et qu'on a trouvé un résultat
    if (slug && documentation.length === 1) {
      return NextResponse.json(documentation[0]);
    }
    
    // Obtenir les catégories uniques pour la navigation
    const categories = await prisma.documentationPage.groupBy({
      by: ['category'],
      where,
      _count: true,
      orderBy: {
        category: 'asc'
      }
    });
    
    return NextResponse.json({
      documentation,
      categories: categories.map(c => ({
        name: c.category,
        count: c._count
      }))
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la documentation:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la documentation' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle page de documentation
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions (seul SUPER_ADMIN ou COMPANY_ADMIN peut créer de la doc)
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'une page de documentation
    const docSchema = z.object({
      title: z.string().min(2, 'Le titre doit comporter au moins 2 caractères'),
      slug: z.string().regex(/^[a-z0-9-]+$/, 'Le slug doit contenir uniquement des lettres minuscules, des chiffres et des tirets'),
      content: z.string().min(10, 'Le contenu doit comporter au moins 10 caractères'),
      category: z.string().optional(),
      isPublic: z.boolean().default(false),
      companyId: z.string().optional(),
    });
    
    // Valider les données
    const validatedData = docSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { title, slug, content, category, isPublic, companyId } = validatedData.data;
    
    // Vérifier si le slug existe déjà
    const existingDoc = await prisma.documentationPage.findUnique({
      where: { slug }
    });
    
    if (existingDoc) {
      return NextResponse.json(
        { error: 'Ce slug est déjà utilisé' },
        { status: 409 }
      );
    }
    
    // Si un companyId est fourni, vérifier s'il existe
    if (companyId) {
      const companyExists = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true }
      });
      
      if (!companyExists) {
        return NextResponse.json(
          { error: 'Entreprise non trouvée' },
          { status: 404 }
        );
      }
    }
    
    // Créer la page de documentation
    const newDoc = await prisma.documentationPage.create({
      data: {
        title,
        slug,
        content,
        category,
        isPublic,
        companyId
      }
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'OTHER',
      newDoc.id,
      { entity: 'DOCUMENTATION', title, slug, isPublic }
    );
    
    return NextResponse.json(newDoc, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la page de documentation:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de la page de documentation' },
      { status: 500 }
    );
  }
} 