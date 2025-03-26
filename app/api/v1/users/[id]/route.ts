import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';

// GET - Récupérer un utilisateur par son ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'USER',
      allowSelf: true,
      resourceIdParam: 'id'
    }, params);
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const userId = params.id;
    
    // Récupérer l'utilisateur
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phoneNumber: true,
        countryCode: true,
        avatar: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
        employeeNumber: true,
        // Exclure le mot de passe
      },
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }
    
    // Journaliser l'accès
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'VIEW',
      'USER',
      userId
    );
    
    return NextResponse.json(user);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'utilisateur' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un utilisateur
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'USER',
      allowSelf: true,
      resourceIdParam: 'id'
    }, params);
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const userId = params.id;
    
    // Vérifier si l'utilisateur existe
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!existingUser) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la mise à jour d'utilisateur
    const updateUserSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères').optional(),
      email: z.string().email('Email invalide').optional(),
      password: z.string().min(8, 'Le mot de passe doit comporter au moins 8 caractères').optional(),
      role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
      companyId: z.string().optional().nullable(),
      phoneNumber: z.string().optional().nullable(),
      countryCode: z.string().optional(),
      employeeNumber: z.string().optional().nullable(),
      avatar: z.string().optional().nullable(),
    });
    
    // Valider les données
    const validatedData = updateUserSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const updateData: any = { ...validatedData.data };
    
    // Si le mot de passe est fourni, le hacher
    if (updateData.password) {
      const bcrypt = require('bcryptjs');
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    
    // Si l'email est modifié, vérifier qu'il n'est pas déjà utilisé
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: updateData.email },
      });
      
      if (emailExists) {
        return NextResponse.json(
          { error: 'Cet email est déjà utilisé' },
          { status: 409 }
        );
      }
    }
    
    // Mettre à jour l'utilisateur
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phoneNumber: true,
        countryCode: true,
        avatar: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
        employeeNumber: true,
        // Exclure le mot de passe
      },
    });
    
    // Journaliser la mise à jour
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'UPDATE',
      'USER',
      userId,
      { updatedFields: Object.keys(updateData) }
    );
    
    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'utilisateur:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'utilisateur' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un utilisateur
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'USER',
      resourceIdParam: 'id'
    }, params);
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const userId = params.id;
    
    // Vérifier si l'utilisateur existe
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true
      }
    });
    
    if (!existingUser) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }
    
    // Supprimer l'utilisateur
    await prisma.user.delete({
      where: { id: userId },
    });
    
    // Journaliser la suppression
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'DELETE',
      'USER',
      userId,
      { deletedUser: existingUser }
    );
    
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'utilisateur:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'utilisateur' },
      { status: 500 }
    );
  }
} 