import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// Schéma de validation de requête
const querySchema = z.object({
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(10),
  search: z.string().optional(),
  companyId: z.string().optional(),
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
});

// Route GET pour obtenir tous les utilisateurs
export async function GET(request: NextRequest) {
  try {
    // Vérifier l'authentification et les autorisations
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }
    
    // Extraire les paramètres de la requête
    const url = new URL(request.url);
    const rawParams = Object.fromEntries(url.searchParams.entries());
    
    // Valider les paramètres
    const validatedParams = querySchema.safeParse(rawParams);
    
    if (!validatedParams.success) {
      return NextResponse.json(
        { error: 'Paramètres invalides', details: validatedParams.error.format() },
        { status: 400 }
      );
    }
    
    const { page, limit, search, companyId, role } = validatedParams.data;
    
    // Construire la requête
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (companyId) {
      where.companyId = companyId;
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
          companyId: true,
          createdAt: true,
          updatedAt: true,
          employeeNumber: true,
          // Exclure le mot de passe pour des raisons de sécurité
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);
    
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
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des utilisateurs' },
      { status: 500 }
    );
  }
}

// Route POST pour créer un nouvel utilisateur
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification et les autorisations
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'utilisateur
    const userSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
      email: z.string().email('Email invalide'),
      password: z.string().min(8, 'Le mot de passe doit comporter au moins 8 caractères'),
      role: z.enum(['USER', 'ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'EMPLOYEE']).default('USER'),
      companyId: z.string().optional(),
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
    
    const { name, email, password, role, companyId, phoneNumber, countryCode, employeeNumber } = validatedData.data;
    
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
        // Exclure le mot de passe pour des raisons de sécurité
      },
    });
    
    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de l\'utilisateur:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'utilisateur' },
      { status: 500 }
    );
  }
} 