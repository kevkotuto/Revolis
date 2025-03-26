import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer tous les leads
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'LEAD'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les paramètres de la requête
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || '';
    const source = url.searchParams.get('source') || '';
    const companyId = url.searchParams.get('companyId') || '';
    const onlyNotConverted = url.searchParams.get('onlyNotConverted') === 'true';
    
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
    
    if (status) {
      where.status = status;
    }
    
    if (source) {
      where.source = source;
    }
    
    if (onlyNotConverted) {
      where.convertedToClientId = null;
    }
    
    // Exécuter la requête
    const skip = (page - 1) * limit;
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          source: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          convertedToClientId: true,
          convertedToClient: {
            select: {
              id: true,
              name: true,
            }
          },
          _count: {
            select: {
              opportunities: true
            }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.lead.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'LEAD',
      undefined,
      { page, limit, search, status, source }
    );
    
    // Retourner les résultats avec pagination
    return NextResponse.json({
      leads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des leads:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des leads' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau lead
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'LEAD'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'un lead
    const leadSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
      email: z.string().email('Email invalide').optional(),
      phone: z.string().optional(),
      source: z.string().optional(),
      status: z.string().default('NEW'),
      companyId: z.string(),
    });
    
    // Valider les données
    const validatedData = leadSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { name, email, phone, source, status, companyId } = validatedData.data;
    
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
    
    // Vérifier si un lead avec le même email existe déjà
    if (email) {
      const existingLead = await prisma.lead.findFirst({
        where: {
          email,
          companyId,
        }
      });
      
      if (existingLead) {
        return NextResponse.json(
          { error: 'Un lead avec cet email existe déjà', existingLeadId: existingLead.id },
          { status: 409 }
        );
      }
    }
    
    // Créer le lead
    const newLead = await prisma.lead.create({
      data: {
        name,
        email,
        phone,
        source,
        status,
        companyId,
      },
    });
    
    // Créer automatiquement une activité pour la création du lead
    await prisma.activity.create({
      data: {
        companyId,
        type: 'LEAD_CREATED',
        subject: `Nouveau lead : ${name}`,
        description: `Lead créé ${source ? 'via ' + source : ''}`,
        relatedTo: 'LEAD',
        relatedId: newLead.id,
        status: 'COMPLETED',
        completedAt: new Date(),
      }
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'LEAD',
      newLead.id,
      { name, email, source, status }
    );
    
    return NextResponse.json(newLead, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du lead:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création du lead' },
      { status: 500 }
    );
  }
} 