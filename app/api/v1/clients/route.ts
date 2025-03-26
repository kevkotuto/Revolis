import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer tous les clients
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'CLIENT'
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
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    // Exécuter la requête
    const skip = (page - 1) * limit;
    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          logo: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              projects: true,
              invoices: true,
            }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.client.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'CLIENT',
      undefined,
      { page, limit, search, companyId }
    );
    
    // Retourner les résultats avec pagination
    return NextResponse.json({
      clients,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des clients:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des clients' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau client
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'CLIENT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'un client
    const clientSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
      email: z.string().email('Email invalide').optional(),
      phone: z.string().optional(),
      logo: z.string().optional(),
      documents: z.array(z.string()).optional(),
      companyId: z.string(),
      notes: z.string().optional(),
    });
    
    // Valider les données
    const validatedData = clientSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { name, email, phone, logo, documents, companyId, notes } = validatedData.data;
    
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
    
    // Vérifier si un client avec le même email existe déjà
    if (email) {
      const existingClient = await prisma.client.findFirst({
        where: {
          email,
          companyId,
        }
      });
      
      if (existingClient) {
        return NextResponse.json(
          { error: 'Un client avec cet email existe déjà', existingClientId: existingClient.id },
          { status: 409 }
        );
      }
    }
    
    // Créer le client
    const newClient = await prisma.client.create({
      data: {
        name,
        email,
        phone,
        logo,
        documents: documents || [],
        companyId,
      },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'CLIENT',
      newClient.id,
      { name, email }
    );
    
    return NextResponse.json(newClient, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du client:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création du client' },
      { status: 500 }
    );
  }
} 