import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une définition de champ personnalisé spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    const id = params.id;
    
    // Récupérer la définition de champ personnalisé
    const customFieldDefinition = await prisma.customFieldDefinition.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        },
        _count: {
          select: {
            customValues: true
          }
        }
      }
    });
    
    if (!customFieldDefinition) {
      return NextResponse.json(
        { error: "Définition de champ personnalisé non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier si l'utilisateur a le droit de voir cette définition
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== customFieldDefinition.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour voir cette définition de champ personnalisé" },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'OTHER',
      id,
      { action: "Consultation d'une définition de champ personnalisé" }
    );
    
    return NextResponse.json(customFieldDefinition);
  } catch (error) {
    console.error('Erreur lors de la récupération de la définition de champ personnalisé:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de la définition de champ personnalisé' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une définition de champ personnalisé
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Seuls les admins peuvent modifier des champs personnalisés
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour modifier des champs personnalisés" },
        { status: 403 }
      );
    }

    const id = params.id;
    
    // Récupérer la définition de champ personnalisé
    const customFieldDefinition = await prisma.customFieldDefinition.findUnique({
      where: { id }
    });
    
    if (!customFieldDefinition) {
      return NextResponse.json(
        { error: "Définition de champ personnalisé non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier si l'utilisateur a le droit de modifier cette définition
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== customFieldDefinition.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour modifier cette définition de champ personnalisé" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation
    const UpdateSchema = z.object({
      fieldType: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTISELECT"], {
        errorMap: () => ({ message: "Type de champ invalide" })
      }).optional(),
      options: z.array(z.string()).optional(),
      description: z.string().optional()
    });
    
    // Valider les données
    const validationResult = UpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Mettre à jour la définition
    const updatedField = await prisma.customFieldDefinition.update({
      where: { id },
      data: validatedData
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'UPDATE',
      'OTHER',
      id,
      { 
        action: "Mise à jour d'une définition de champ personnalisé",
        entityName: customFieldDefinition.entityName,
        fieldName: customFieldDefinition.fieldName
      }
    );
    
    return NextResponse.json(updatedField);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la définition de champ personnalisé:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de la définition de champ personnalisé' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une définition de champ personnalisé
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Seuls les admins peuvent supprimer des champs personnalisés
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour supprimer des champs personnalisés" },
        { status: 403 }
      );
    }

    const id = params.id;
    
    // Récupérer la définition de champ personnalisé
    const customFieldDefinition = await prisma.customFieldDefinition.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            customValues: true
          }
        }
      }
    });
    
    if (!customFieldDefinition) {
      return NextResponse.json(
        { error: "Définition de champ personnalisé non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier si l'utilisateur a le droit de supprimer cette définition
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== customFieldDefinition.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour supprimer cette définition de champ personnalisé" },
        { status: 403 }
      );
    }
    
    // Avertir si le champ est utilisé
    if (customFieldDefinition._count.customValues > 0) {
      return NextResponse.json(
        { 
          error: "Ce champ personnalisé est utilisé par des enregistrements",
          count: customFieldDefinition._count.customValues 
        },
        { status: 400 }
      );
    }
    
    // Supprimer la définition
    await prisma.customFieldDefinition.delete({
      where: { id }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'DELETE',
      'OTHER',
      id,
      { 
        action: "Suppression d'une définition de champ personnalisé",
        entityName: customFieldDefinition.entityName,
        fieldName: customFieldDefinition.fieldName
      }
    );
    
    return NextResponse.json(
      { message: "Définition de champ personnalisé supprimée avec succès" }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression de la définition de champ personnalisé:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de la définition de champ personnalisé' },
      { status: 500 }
    );
  }
} 