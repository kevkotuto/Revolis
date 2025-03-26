import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer les valeurs des champs personnalisés
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

    // Extraire les paramètres de la requête
    const { searchParams } = new URL(request.url);
    const entityName = searchParams.get('entityName');
    const recordId = searchParams.get('recordId');
    const customFieldDefId = searchParams.get('customFieldDefId');
    const companyId = searchParams.get('companyId');

    // Construire la clause where pour le filtrage
    const where: any = {};

    // Filtrer par ID d'enregistrement
    if (recordId) {
      where.recordId = recordId;
    }

    // Filtrer par ID de définition de champ personnalisé
    if (customFieldDefId) {
      where.customFieldDefId = customFieldDefId;
    }

    // Filtrer par nom d'entité (via la définition du champ)
    if (entityName) {
      where.customFieldDef = {
        entityName
      };
    }

    // Filtrer par entreprise (via la définition du champ)
    if (companyId) {
      where.customFieldDef = {
        ...(where.customFieldDef || {}),
        companyId
      };
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Les admins d'entreprise ne voient que les valeurs de leur entreprise
      where.customFieldDef = {
        ...(where.customFieldDef || {}),
        companyId: permissionCheck.user.companyId
      };
    }

    // Récupérer les valeurs des champs personnalisés
    const customFieldValues = await prisma.customFieldValue.findMany({
      where,
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

    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des valeurs de champs personnalisés" }
    );

    return NextResponse.json(customFieldValues);
  } catch (error) {
    console.error('Erreur lors de la récupération des valeurs de champs personnalisés:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des valeurs de champs personnalisés' },
      { status: 500 }
    );
  }
}

// POST - Créer ou mettre à jour une valeur de champ personnalisé
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
    
    // Schéma de validation
    const CustomValueSchema = z.object({
      customFieldDefId: z.string().min(1, "ID de définition de champ requis"),
      recordId: z.string().min(1, "ID d'enregistrement requis"),
      value: z.string().nullable().optional()
    });
    
    // Valider les données
    const validationResult = CustomValueSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier que la définition de champ existe
    const customFieldDef = await prisma.customFieldDefinition.findUnique({
      where: { id: validatedData.customFieldDefId }
    });
    
    if (!customFieldDef) {
      return NextResponse.json(
        { error: "Définition de champ personnalisé non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier si l'utilisateur a le droit de créer/modifier cette valeur
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== customFieldDef.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour gérer cette valeur de champ personnalisé" },
        { status: 403 }
      );
    }
    
    // Vérifier si une valeur existe déjà pour ce champ et cet enregistrement
    const existingValue = await prisma.customFieldValue.findFirst({
      where: {
        customFieldDefId: validatedData.customFieldDefId,
        recordId: validatedData.recordId
      }
    });
    
    let result;
    
    if (existingValue) {
      // Mettre à jour la valeur existante
      result = await prisma.customFieldValue.update({
        where: { id: existingValue.id },
        data: { value: validatedData.value },
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
        result.id,
        { 
          action: "Mise à jour d'une valeur de champ personnalisé",
          entityName: result.customFieldDef.entityName,
          fieldName: result.customFieldDef.fieldName,
          recordId: validatedData.recordId
        }
      );
    } else {
      // Créer une nouvelle valeur
      result = await prisma.customFieldValue.create({
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
        'CREATE',
        'OTHER',
        result.id,
        { 
          action: "Création d'une valeur de champ personnalisé",
          entityName: result.customFieldDef.entityName,
          fieldName: result.customFieldDef.fieldName,
          recordId: validatedData.recordId
        }
      );
    }
    
    return NextResponse.json(result, { status: existingValue ? 200 : 201 });
  } catch (error) {
    console.error('Erreur lors de la création/mise à jour de la valeur de champ personnalisé:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création/mise à jour de la valeur de champ personnalisé' },
      { status: 500 }
    );
  }
} 