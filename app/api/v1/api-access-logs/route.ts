import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission } from '../../../../lib/middleware/permissions';

// GET - Récupérer les logs d'accès API
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions (seuls les administrateurs peuvent voir les logs d'API)
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Vérifier que l'utilisateur est un administrateur
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour consulter les logs d'accès API" },
        { status: 403 }
      );
    }

    // Extraire les paramètres de la requête
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const apiKeyId = searchParams.get('apiKeyId');
    const method = searchParams.get('method');
    const endpoint = searchParams.get('endpoint');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const companyId = searchParams.get('companyId');

    // Configurer la pagination
    const skip = (page - 1) * limit;

    // Construire la clause where pour le filtrage
    const where: any = {};

    // Filtrer par clé API
    if (apiKeyId) {
      where.apiKeyId = apiKeyId;
    }

    // Filtrer par méthode HTTP
    if (method) {
      where.method = method;
    }

    // Filtrer par endpoint
    if (endpoint) {
      where.endpoint = {
        contains: endpoint,
        mode: 'insensitive'
      };
    }

    // Filtrer par date de début
    if (startDate) {
      where.createdAt = {
        ...(where.createdAt || {}),
        gte: new Date(startDate)
      };
    }

    // Filtrer par date de fin
    if (endDate) {
      where.createdAt = {
        ...(where.createdAt || {}),
        lte: new Date(endDate)
      };
    }

    // Filtrer par entreprise (selon le rôle de l'utilisateur)
    if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Le COMPANY_ADMIN ne peut voir que les logs des clés API de sa propre entreprise
      where.apiKey = {
        companyId: permissionCheck.user.companyId
      };
    } else if (companyId && permissionCheck.role === 'SUPER_ADMIN') {
      // Le SUPER_ADMIN peut voir les logs des clés API de n'importe quelle entreprise
      where.apiKey = {
        companyId: companyId
      };
    }

    // Récupérer le nombre total pour la pagination
    const total = await prisma.apiAccessLog.count({ where });

    // Récupérer les logs d'accès API
    const apiAccessLogs = await prisma.apiAccessLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        apiKey: {
          select: {
            id: true,
            name: true,
            key: true,
            companyId: true,
            company: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    return NextResponse.json({
      items: apiAccessLogs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des logs d\'accès API:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des logs d\'accès API' },
      { status: 500 }
    );
  }
} 