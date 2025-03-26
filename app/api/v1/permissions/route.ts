import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// GET - Récupérer toutes les permissions
export async function GET(request: NextRequest) {
  try {
    // Vérifier l'authentification et les autorisations
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }
    
    // Extraire les paramètres de la requête
    const url = new URL(request.url);
    const resourceType = url.searchParams.get('resourceType');
    const action = url.searchParams.get('action');
    
    // Construire la requête
    const where: any = {};
    
    if (resourceType) {
      where.resourceType = resourceType;
    }
    
    if (action) {
      where.action = action;
    }
    
    // Récupérer les permissions
    const permissions = await prisma.permission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    
    return NextResponse.json(permissions);
  } catch (error) {
    console.error('Erreur lors de la récupération des permissions:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des permissions' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle permission
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification et les autorisations
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création de permission
    const permissionSchema = z.object({
      action: z.enum(['CREATE', 'READ', 'UPDATE', 'DELETE']),
      resourceType: z.enum([
        'USER', 'COMPANY', 'CLIENT', 'PROJECT', 'TASK', 
        'PAYMENT', 'INVOICE', 'PRODUCT', 'LEAD', 'OPPORTUNITY', 'OTHER'
      ]),
    });
    
    // Valider les données
    const validatedData = permissionSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { action, resourceType } = validatedData.data;
    
    // Vérifier si la permission existe déjà
    const existingPermission = await prisma.permission.findFirst({
      where: {
        action,
        resourceType,
      },
    });
    
    if (existingPermission) {
      return NextResponse.json(
        { error: 'Cette permission existe déjà' },
        { status: 409 }
      );
    }
    
    // Créer la permission
    const newPermission = await prisma.permission.create({
      data: {
        action,
        resourceType,
      },
    });
    
    return NextResponse.json(newPermission, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la permission:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de la permission' },
      { status: 500 }
    );
  }
} 