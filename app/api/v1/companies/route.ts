import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer toutes les entreprises
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions (seul SUPER_ADMIN peut voir toutes les entreprises)
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'COMPANY'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les paramètres de la requête
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    
    // Construire la requête
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    // Exécuter la requête
    const skip = (page - 1) * limit;
    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          subscriptionType: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              users: true,
              companySubscriptions: true
            }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.company.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'COMPANY',
      undefined,
      { page, limit, search }
    );
    
    // Retourner les résultats avec pagination
    return NextResponse.json({
      companies,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des entreprises:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des entreprises' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle entreprise
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions (seul SUPER_ADMIN peut créer des entreprises)
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'COMPANY'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'entreprise
    const companySchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
      email: z.string().email('Email invalide').optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      subscriptionType: z.enum(['MONTHLY', 'YEARLY']).optional(),
      // Optionnel: Créer un admin d'entreprise en même temps
      admin: z.object({
        name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
        email: z.string().email('Email invalide'),
        password: z.string().min(8, 'Le mot de passe doit comporter au moins 8 caractères'),
        phoneNumber: z.string().optional(),
        countryCode: z.string().default('+225'),
      }).optional(),
      // Optionnel: Associer un plan d'abonnement
      subscriptionPlanId: z.string().optional(),
    });
    
    // Valider les données
    const validatedData = companySchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { 
      name, email, phone, address, subscriptionType, 
      admin, subscriptionPlanId 
    } = validatedData.data;
    
    // Créer une transaction pour assurer l'intégrité des données
    const result = await prisma.$transaction(async (prismaClient) => {
      // Créer l'entreprise
      const company = await prismaClient.company.create({
        data: {
          name,
          email,
          phone,
          address,
          subscriptionType,
        },
      });
      
      // Si un admin est spécifié, le créer
      let companyAdmin = null;
      if (admin) {
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(admin.password, 10);
        
        companyAdmin = await prismaClient.user.create({
          data: {
            name: admin.name,
            email: admin.email,
            password: hashedPassword,
            phoneNumber: admin.phoneNumber,
            countryCode: admin.countryCode,
            role: 'COMPANY_ADMIN',
            companyId: company.id,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        });
      }
      
      // Si un plan d'abonnement est spécifié, créer l'association
      let subscription = null;
      if (subscriptionPlanId) {
        // Vérifier si le plan existe
        const planExists = await prismaClient.subscriptionPlan.findUnique({
          where: { id: subscriptionPlanId },
        });
        
        if (!planExists) {
          throw new Error('Plan d\'abonnement non trouvé');
        }
        
        subscription = await prismaClient.companySubscription.create({
          data: {
            companyId: company.id,
            subscriptionPlanId,
            startDate: new Date(),
            active: true,
          },
          include: {
            subscriptionPlan: true,
          },
        });
      }
      
      return {
        company,
        admin: companyAdmin,
        subscription,
      };
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'COMPANY',
      result.company.id,
      {
        hasAdmin: !!result.admin,
        hasSubscription: !!result.subscription,
      }
    );
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de l\'entreprise:', error);
    
    // Gérer les erreurs spécifiques
    if (error instanceof Error && error.message === 'Plan d\'abonnement non trouvé') {
      return NextResponse.json(
        { error: 'Plan d\'abonnement non trouvé' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'entreprise' },
      { status: 500 }
    );
  }
} 