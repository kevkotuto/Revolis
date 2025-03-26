import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer toutes les mailing lists
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
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const companyId = url.searchParams.get('companyId') || '';
    
    // Construire la requête
    const where: any = {};
    
    if (companyId) {
      where.companyId = companyId;
    }
    
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    
    // Exécuter la requête
    const skip = (page - 1) * limit;
    const [mailingLists, total] = await Promise.all([
      prisma.mailingList.findMany({
        where,
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              contacts: true
            }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.mailingList.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'OTHER',
      undefined,
      { page, limit, search, companyId }
    );
    
    // Retourner les résultats avec pagination
    return NextResponse.json({
      mailingLists,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des mailing lists:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des mailing lists' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle mailing list
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
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'une mailing list
    const mailingListSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
      companyId: z.string(),
    });
    
    // Valider les données
    const validatedData = mailingListSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { name, companyId } = validatedData.data;
    
    // Vérifier si l'entreprise existe
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
    
    // Vérifier si une mailing list avec le même nom existe déjà pour cette entreprise
    const existingMailingList = await prisma.mailingList.findFirst({
      where: {
        name,
        companyId,
      }
    });
    
    if (existingMailingList) {
      return NextResponse.json(
        { error: 'Une mailing list avec ce nom existe déjà', existingMailingListId: existingMailingList.id },
        { status: 409 }
      );
    }
    
    // Créer la mailing list
    const newMailingList = await prisma.mailingList.create({
      data: {
        name,
        companyId,
      },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'OTHER',
      newMailingList.id,
      { name }
    );
    
    return NextResponse.json(newMailingList, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la mailing list:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de la mailing list' },
      { status: 500 }
    );
  }
} 