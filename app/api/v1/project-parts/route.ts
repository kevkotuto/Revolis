import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer les parties d'un projet
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les paramètres de requête
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    
    // Vérifier si le projectId est fourni
    if (!projectId) {
      return NextResponse.json(
        { error: 'L\'ID du projet est requis' },
        { status: 400 }
      );
    }
    
    // Vérifier si le projet existe et appartient à la bonne entreprise
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { companyId: true }
    });
    
    if (!project) {
      return NextResponse.json(
        { error: 'Projet non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit d'accéder à ce projet
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== project.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour accéder à ce projet' },
        { status: 403 }
      );
    }
    
    // Récupérer les parties du projet
    const projectParts = await prisma.projectPart.findMany({
      where: { projectId },
      include: {
        _count: {
          select: {
            tasks: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'PROJECT',
      projectId,
      { action: 'Liste des parties du projet' }
    );
    
    return NextResponse.json(projectParts);
  } catch (error) {
    console.error('Erreur lors de la récupération des parties du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des parties du projet' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle partie de projet
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation
    const ProjectPartSchema = z.object({
      name: z.string().min(2, "Le nom de la partie doit contenir au moins 2 caractères"),
      description: z.string().optional(),
      price: z.number().min(0).default(0),
      completed: z.boolean().default(false),
      projectId: z.string()
    });
    
    // Valider les données
    const validationResult = ProjectPartSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier si le projet existe et appartient à la bonne entreprise
    const project = await prisma.project.findUnique({
      where: { id: validatedData.projectId },
      select: { companyId: true, isFixedPrice: true, totalPrice: true }
    });
    
    if (!project) {
      return NextResponse.json(
        { error: 'Projet non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de modifier ce projet
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== project.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour modifier ce projet' },
        { status: 403 }
      );
    }
    
    // Utiliser une transaction pour la création et la mise à jour du prix total
    const result = await prisma.$transaction(async (tx) => {
      // Créer la partie du projet
      const projectPart = await tx.projectPart.create({
        data: {
          name: validatedData.name,
          description: validatedData.description,
          price: validatedData.price,
          completed: validatedData.completed,
          project: { connect: { id: validatedData.projectId } }
        }
      });
      
      // Si le projet n'est pas à prix fixe, mettre à jour le prix total
      if (!project.isFixedPrice) {
        const currentPrice = project.totalPrice ? parseFloat(project.totalPrice.toString()) : 0;
        const newPrice = currentPrice + validatedData.price;
        
        await tx.project.update({
          where: { id: validatedData.projectId },
          data: { totalPrice: newPrice }
        });
      }
      
      return projectPart;
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'PROJECT',
      validatedData.projectId,
      { action: 'Création d\'une partie de projet', partName: validatedData.name }
    );
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la partie du projet:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de la partie du projet' },
      { status: 500 }
    );
  }
} 