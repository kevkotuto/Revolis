import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// GET - Récupérer tous les rôles et leurs permissions
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
    
    // Récupérer les permissions par rôle
    const rolePermissions = await prisma.rolePermission.findMany({
      include: {
        permission: true,
      },
    });
    
    // Organiser les permissions par rôle
    const rolePermissionsMap = rolePermissions.reduce((acc: any, rp) => {
      const role = rp.role;
      if (!acc[role]) {
        acc[role] = [];
      }
      acc[role].push({
        id: rp.permission.id,
        action: rp.permission.action,
        resourceType: rp.permission.resourceType,
      });
      return acc;
    }, {});
    
    return NextResponse.json(rolePermissionsMap);
  } catch (error) {
    console.error('Erreur lors de la récupération des rôles et permissions:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des rôles et permissions' },
      { status: 500 }
    );
  }
}

// POST - Ajouter une permission à un rôle
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
    
    // Schéma de validation pour l'association rôle-permission
    const rolePermissionSchema = z.object({
      role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'EMPLOYEE']),
      permissionId: z.string(),
    });
    
    // Valider les données
    const validatedData = rolePermissionSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { role, permissionId } = validatedData.data;
    
    // Vérifier si la permission existe
    const permissionExists = await prisma.permission.findUnique({
      where: { id: permissionId },
    });
    
    if (!permissionExists) {
      return NextResponse.json(
        { error: 'Permission non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier si l'association existe déjà
    const existingAssociation = await prisma.rolePermission.findFirst({
      where: {
        role,
        permissionId,
      },
    });
    
    if (existingAssociation) {
      return NextResponse.json(
        { error: 'Cette permission est déjà associée à ce rôle' },
        { status: 409 }
      );
    }
    
    // Créer l'association
    const newRolePermission = await prisma.rolePermission.create({
      data: {
        role,
        permissionId,
      },
      include: {
        permission: true,
      },
    });
    
    return NextResponse.json(newRolePermission, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de l\'association du rôle et de la permission:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'association du rôle et de la permission' },
      { status: 500 }
    );
  }
} 