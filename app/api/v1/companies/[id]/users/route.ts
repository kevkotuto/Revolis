import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../../lib/middleware/permissions';

// GET - Récupérer tous les utilisateurs d'une entreprise
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const companyId = params.id;
    
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'USER',
      resourceIdParam: 'id'
    }, params);
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les paramètres de la requête
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const role = url.searchParams.get('role') || '';
    
    // Construire la requête
    const where: any = {
      companyId
    };
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (role) {
      where.role = role;
    }
    
    // Exécuter la requête
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phoneNumber: true,
          countryCode: true,
          avatar: true,
          employeeNumber: true,
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'USER',
      companyId,
      { page, limit, search, role }
    );
    
    // Retourner les résultats avec pagination
    return NextResponse.json({
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs de l\'entreprise:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des utilisateurs de l\'entreprise' },
      { status: 500 }
    );
  }
}

// POST - Ajouter un utilisateur à une entreprise
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const companyId = params.id;
    
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'USER',
      resourceIdParam: 'id'
    }, params);
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'utilisateur
    const userSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
      email: z.string().email('Email invalide'),
      password: z.string().min(8, 'Le mot de passe doit comporter au moins 8 caractères'),
      role: z.enum(['USER', 'EMPLOYEE', 'MANAGER', 'COMPANY_ADMIN']).default('EMPLOYEE'),
      phoneNumber: z.string().optional(),
      countryCode: z.string().default('+225'),
      employeeNumber: z.string().optional(),
    });
    
    // Valider les données
    const validatedData = userSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { name, email, password, role, phoneNumber, countryCode, employeeNumber } = validatedData.data;
    
    // Vérifier si l'email existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    
    if (existingUser) {
      return NextResponse.json(
        { error: 'Cet email est déjà utilisé' },
        { status: 409 }
      );
    }
    
    // Vérifier si l'entreprise existe
    const companyExists = await prisma.company.findUnique({
      where: { id: companyId },
    });
    
    if (!companyExists) {
      return NextResponse.json(
        { error: 'Entreprise non trouvée' },
        { status: 404 }
      );
    }
    
    // Hacher le mot de passe
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Créer l'utilisateur
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        companyId,
        phoneNumber,
        countryCode,
        employeeNumber,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phoneNumber: true,
        countryCode: true,
        companyId: true,
        employeeNumber: true,
        createdAt: true,
      },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'USER',
      newUser.id,
      { companyId, role }
    );
    
    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de l\'ajout de l\'utilisateur à l\'entreprise:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'ajout de l\'utilisateur à l\'entreprise' },
      { status: 500 }
    );
  }
} 