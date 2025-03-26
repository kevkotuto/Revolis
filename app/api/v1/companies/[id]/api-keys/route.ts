import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../../lib/middleware/permissions';

// GET - Récupérer les clés API d'une entreprise
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const companyId = params.id;
    
    // Vérifier les permissions (SUPER_ADMIN ou COMPANY_ADMIN de cette entreprise)
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'COMPANY',
      resourceIdParam: 'id'
    }, params);
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
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
    
    // Extraire les paramètres de la requête
    const url = new URL(request.url);
    const includeRevoked = url.searchParams.get('includeRevoked') === 'true';
    
    // Construire la requête
    const where: any = {
      companyId
    };
    
    if (!includeRevoked) {
      where.revokedAt = null;
    }
    
    // Récupérer les clés API
    const apiKeys = await prisma.apiKey.findMany({
      where,
      select: {
        id: true,
        name: true,
        key: true, // La clé publique est visible
        scopes: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        revokedAt: true,
        expiresAt: true,
        _count: {
          select: {
            apiAccessLogs: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'OTHER',
      companyId,
      { entity: 'API_KEY', includeRevoked }
    );
    
    return NextResponse.json({ apiKeys });
  } catch (error) {
    console.error('Erreur lors de la récupération des clés API:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des clés API' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle clé API
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const companyId = params.id;
    
    // Vérifier les permissions (SUPER_ADMIN ou COMPANY_ADMIN de cette entreprise)
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'COMPANY',
      resourceIdParam: 'id'
    }, params);
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
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
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'une clé API
    const apiKeySchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
      description: z.string().optional(),
      scopes: z.array(z.string()).default([]),
      expiresAt: z.string().optional(), // Date d'expiration ISO
    });
    
    // Valider les données
    const validatedData = apiKeySchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { name, description, scopes, expiresAt } = validatedData.data;
    
    // Générer une clé API unique et un secret
    const apiKey = `api_${crypto.randomBytes(16).toString('hex')}`;
    const apiSecret = crypto.randomBytes(32).toString('hex');
    
    // Créer la clé API
    const newApiKey = await prisma.apiKey.create({
      data: {
        companyId,
        name,
        description,
        key: apiKey,
        secret: apiSecret, // Le secret sera renvoyé une seule fois
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'OTHER',
      newApiKey.id,
      { entity: 'API_KEY', name, scopes, hasExpiry: !!expiresAt }
    );
    
    // Renvoyer les détails de la clé API, y compris le secret (qui ne sera plus accessible ensuite)
    return NextResponse.json({
      id: newApiKey.id,
      name: newApiKey.name,
      key: newApiKey.key,
      secret: newApiKey.secret, // Inclure le secret dans la réponse
      description: newApiKey.description,
      scopes: newApiKey.scopes,
      createdAt: newApiKey.createdAt,
      expiresAt: newApiKey.expiresAt,
      message: 'Conservez le secret en lieu sûr. Il ne sera plus affiché après cette requête.'
    }, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la clé API:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de la clé API' },
      { status: 500 }
    );
  }
} 