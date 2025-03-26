import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une valeur de champ personnalisé spécifique
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
    
    // Récupérer la valeur du champ personnalisé
    const customFieldValue = await prisma.customFieldValue.findUnique({
      where: { id },
      include: {
        customFieldDef: {
          select: {
            id: true,
            entityName: true,
            fieldName: true,
            fieldType: true,
            companyId: true
          }
        }
      }
    });
    
    if (!customFieldValue) {
      return NextResponse.json(
        { error: "Valeur de champ personnalisé non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier si l'utilisateur a le droit de voir cette valeur
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== customFieldValue.customFieldDef.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour voir cette valeur de champ personnalisé" },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'OTHER',
      id,
      { action: "Consultation d'une valeur de champ personnalisé" }
    );
    
    return NextResponse.json(customFieldValue);
  } catch (error) {
    console.error('Erreur lors de la récupération de la valeur de champ personnalisé:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de la valeur de champ personnalisé' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une valeur de champ personnalisé
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

    const id = params.id;
    
    // Récupérer la valeur du champ personnalisé
    const customFieldValue = await prisma.customFieldValue.findUnique({
      where: { id },
      include: {
        customFieldDef: {
          select: {
            id: true,
            entityName: true,
            fieldName: true,
            fieldType: true,
            companyId: true
          }
        }
      }
    });
    
    if (!customFieldValue) {
      return NextResponse.json(
        { error: "Valeur de champ personnalisé non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier si l'utilisateur a le droit de modifier cette valeur
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== customFieldValue.customFieldDef.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour modifier cette valeur de champ personnalisé" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation
    const UpdateSchema = z.object({
      value: z.string().nullable().optional()
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
    
    // Mettre à jour la valeur
    const updatedValue = await prisma.customFieldValue.update({
      where: { id },
      data: validatedData,
      include: {
        customFieldDef: {
          select: {
            entityName: true,
            fieldName: true
          }
        }
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'UPDATE',
      'OTHER',
      id,
      { 
        action: "Mise à jour d'une valeur de champ personnalisé",
        entityName: customFieldValue.customFieldDef.entityName,
        fieldName: customFieldValue.customFieldDef.fieldName,
        recordId: customFieldValue.recordId
      }
    );
    
    return NextResponse.json(updatedValue);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la valeur de champ personnalisé:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de la valeur de champ personnalisé' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une valeur de champ personnalisé
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

    const id = params.id;
    
    // Récupérer la valeur du champ personnalisé
    const customFieldValue = await prisma.customFieldValue.findUnique({
      where: { id },
      include: {
        customFieldDef: {
          select: {
            entityName: true,
            fieldName: true,
            companyId: true
          }
        }
      }
    });
    
    if (!customFieldValue) {
      return NextResponse.json(
        { error: "Valeur de champ personnalisé non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier si l'utilisateur a le droit de supprimer cette valeur
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== customFieldValue.customFieldDef.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour supprimer cette valeur de champ personnalisé" },
        { status: 403 }
      );
    }
    
    // Supprimer la valeur
    await prisma.customFieldValue.delete({
      where: { id }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'DELETE',
      'OTHER',
      id,
      { 
        action: "Suppression d'une valeur de champ personnalisé",
        entityName: customFieldValue.customFieldDef.entityName,
        fieldName: customFieldValue.customFieldDef.fieldName,
        recordId: customFieldValue.recordId
      }
    );
    
    return NextResponse.json(
      { message: "Valeur de champ personnalisé supprimée avec succès" }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression de la valeur de champ personnalisé:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de la valeur de champ personnalisé' },
      { status: 500 }
    );
  }
} 