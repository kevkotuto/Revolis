import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// POST - Vérifier si un utilisateur a une permission spécifique
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la vérification de permission
    const checkPermissionSchema = z.object({
      userId: z.string().optional(), // Si non fourni, utilisera l'ID de l'utilisateur connecté
      action: z.enum(['CREATE', 'READ', 'UPDATE', 'DELETE']),
      resourceType: z.enum([
        'USER', 'COMPANY', 'CLIENT', 'PROJECT', 'TASK', 
        'PAYMENT', 'INVOICE', 'PRODUCT', 'LEAD', 'OPPORTUNITY', 'OTHER'
      ]),
    });
    
    // Valider les données
    const validatedData = checkPermissionSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { userId, action, resourceType } = validatedData.data;
    
    // Récupérer l'utilisateur pour lequel vérifier la permission
    const targetUser = await prisma.user.findUnique({
      where: { id: userId || session.user.id }, // Utiliser l'ID fourni ou celui de l'utilisateur connecté
    });
    
    if (!targetUser) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier si l'utilisateur est un super admin (qui a toutes les permissions)
    if (targetUser.role === 'SUPER_ADMIN') {
      return NextResponse.json({ hasPermission: true });
    }
    
    // Vérifier si la permission spécifique existe pour le rôle de l'utilisateur
    const permissionExists = await prisma.permission.findFirst({
      where: {
        action,
        resourceType,
        rolePermissions: {
          some: {
            role: targetUser.role,
          },
        },
      },
    });
    
    return NextResponse.json({ hasPermission: !!permissionExists });
  } catch (error) {
    console.error('Erreur lors de la vérification de la permission:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la vérification de la permission' },
      { status: 500 }
    );
  }
} 