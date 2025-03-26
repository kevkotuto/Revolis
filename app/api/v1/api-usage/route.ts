import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer les statistiques d'utilisation de l'API
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions (seuls les administrateurs peuvent voir les statistiques)
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
        { error: "Vous n'avez pas les permissions nécessaires pour consulter les statistiques d'utilisation de l'API" },
        { status: 403 }
      );
    }

    // Extraire les paramètres de la requête
    const { searchParams } = new URL(request.url);
    const apiKeyId = searchParams.get('apiKeyId');
    const companyId = searchParams.get('companyId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const period = searchParams.get('period') || 'day'; // jour, semaine, mois
    
    // Préparer la période
    let intervalFormat: string;
    switch (period) {
      case 'hour':
        intervalFormat = 'hour';
        break;
      case 'week':
        intervalFormat = 'week';
        break;
      case 'month':
        intervalFormat = 'month';
        break;
      default:
        intervalFormat = 'day';
        break;
    }

    // Construire la clause where pour le filtrage
    const where: any = {};

    // Filtrer par clé API
    if (apiKeyId) {
      where.apiKeyId = apiKeyId;
    }

    // Filtrer par entreprise (via la clé API)
    if (companyId) {
      where.apiKey = {
        companyId
      };
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Les admins d'entreprise ne voient que les statistiques de leur entreprise
      where.apiKey = {
        companyId: permissionCheck.user.companyId
      };
    }

    // Filtrer par date
    if (startDate) {
      where.createdAt = {
        ...(where.createdAt || {}),
        gte: new Date(startDate)
      };
    }

    if (endDate) {
      where.createdAt = {
        ...(where.createdAt || {}),
        lte: new Date(endDate)
      };
    }

    // Récupérer les statistiques d'utilisation
    
    // Statistiques globales
    const totalCalls = await prisma.apiAccessLog.count({ where });
    
    // Appels par méthode HTTP
    const callsByMethod = await prisma.apiAccessLog.groupBy({
      by: ['method'],
      where,
      _count: true,
      orderBy: {
        _count: {
          method: 'desc'
        }
      }
    });
    
    // Endpoints les plus utilisés
    const topEndpoints = await prisma.apiAccessLog.groupBy({
      by: ['endpoint'],
      where,
      _count: true,
      orderBy: {
        _count: {
          endpoint: 'desc'
        }
      },
      take: 10
    });
    
    // Appels par clé API
    const callsByApiKey = await prisma.apiAccessLog.groupBy({
      by: ['apiKeyId'],
      where,
      _count: true,
      orderBy: {
        _count: {
          apiKeyId: 'desc'
        }
      }
    });
    
    // Enrichir les données des clés API pour l'affichage
    const apiKeysDetails = await prisma.apiKey.findMany({
      where: {
        id: {
          in: callsByApiKey.map(item => item.apiKeyId)
        }
      },
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
    });
    
    const apiKeyMap = apiKeysDetails.reduce((acc, key) => {
      acc[key.id] = key;
      return acc;
    }, {} as Record<string, any>);
    
    const enrichedCallsByApiKey = callsByApiKey.map(item => ({
      apiKeyId: item.apiKeyId,
      count: item._count,
      apiKey: apiKeyMap[item.apiKeyId]
    }));
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'OTHER',
      'multiple',
      { action: "Consultation des statistiques d'utilisation de l'API" }
    );

    return NextResponse.json({
      totalCalls,
      callsByMethod,
      topEndpoints,
      callsByApiKey: enrichedCallsByApiKey
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques d\'utilisation de l\'API:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des statistiques d\'utilisation de l\'API' },
      { status: 500 }
    );
  }
} 