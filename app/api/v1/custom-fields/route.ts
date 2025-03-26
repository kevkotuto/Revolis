import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer toutes les définitions de champs personnalisés
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
    const companyId = searchParams.get('companyId');
    const fieldName = searchParams.get('fieldName');

    // Construire la clause where pour le filtrage
    const where: any = {};

    // Filtrer par nom d'entité
    if (entityName) {
      where.entityName = entityName;
    }

    // Filtrer par nom de champ
    if (fieldName) {
      where.fieldName = {
        contains: fieldName,
        mode: 'insensitive'
      };
    }

    // Filtrer par entreprise
    if (companyId) {
      where.companyId = companyId;
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Les admins d'entreprise ne voient que les champs de leur entreprise
      where.companyId = permissionCheck.user.companyId;
    }

    // Récupérer les définitions de champs personnalisés
    const customFieldDefinitions = await prisma.customFieldDefinition.findMany({
      where,
      orderBy: {
        entityName: 'asc'
      },
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

    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des définitions de champs personnalisés" }
    );

    return NextResponse.json(customFieldDefinitions);
  } catch (error) {
    console.error('Erreur lors de la récupération des définitions de champs personnalisés:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des définitions de champs personnalisés' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle définition de champ personnalisé
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions (seuls les administrateurs peuvent créer des champs personnalisés)
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Seuls les admins peuvent créer des champs personnalisés
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour créer des champs personnalisés" },
        { status: 403 }
      );
    }

    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation
    const CustomFieldSchema = z.object({
      entityName: z.string().min(1, "Nom d'entité requis"),
      fieldName: z.string().min(1, "Nom de champ requis").regex(/^[a-zA-Z0-9_]+$/, "Le nom du champ ne doit contenir que des lettres, chiffres et underscores"),
      fieldType: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTISELECT"], {
        errorMap: () => ({ message: "Type de champ invalide" })
      }),
      companyId: z.string().min(1, "ID d'entreprise requis"),
      options: z.array(z.string()).optional(),
      description: z.string().optional()
    });
    
    // Valider les données
    const validationResult = CustomFieldSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier que l'entreprise existe
    const company = await prisma.company.findUnique({
      where: { id: validatedData.companyId },
      select: { id: true }
    });
    
    if (!company) {
      return NextResponse.json(
        { error: "Entreprise non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de créer des champs pour cette entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== validatedData.companyId) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas créer des champs personnalisés pour une autre entreprise" },
        { status: 403 }
      );
    }
    
    // Vérifier que ce champ n'existe pas déjà pour cette entité dans cette entreprise
    const existingField = await prisma.customFieldDefinition.findFirst({
      where: {
        companyId: validatedData.companyId,
        entityName: validatedData.entityName,
        fieldName: validatedData.fieldName
      }
    });
    
    if (existingField) {
      return NextResponse.json(
        { error: "Un champ avec ce nom existe déjà pour cette entité dans cette entreprise" },
        { status: 409 }
      );
    }
    
    // Créer la définition de champ personnalisé
    const customField = await prisma.customFieldDefinition.create({
      data: {
        entityName: validatedData.entityName,
        fieldName: validatedData.fieldName,
        fieldType: validatedData.fieldType,
        companyId: validatedData.companyId
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'CREATE',
      'OTHER',
      customField.id,
      { 
        action: "Création d'une définition de champ personnalisé",
        entityName: validatedData.entityName,
        fieldName: validatedData.fieldName
      }
    );
    
    return NextResponse.json(customField, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la définition de champ personnalisé:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de la définition de champ personnalisé' },
      { status: 500 }
    );
  }
} 