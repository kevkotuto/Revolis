import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission } from '../../../../lib/middleware/permissions';

// GET - Récupérer les logs d'audit
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions (seuls les administrateurs peuvent voir les logs)
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER' // On utilise OTHER car les logs d'audit concernent plusieurs ressources
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Vérifier que l'utilisateur est un administrateur
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour consulter les logs d'audit" },
        { status: 403 }
      );
    }

    // Extraire les paramètres de la requête
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');
    const resource = searchParams.get('resource');
    const resourceId = searchParams.get('resourceId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const companyId = searchParams.get('companyId');

    // Configurer la pagination
    const skip = (page - 1) * limit;

    // Construire la clause where pour le filtrage
    const where: any = {};

    // Filtrer par utilisateur
    if (userId) {
      where.userId = userId;
    }

    // Filtrer par action
    if (action) {
      where.action = action;
    }

    // Filtrer par ressource
    if (resource) {
      where.resource = resource;
    }

    // Filtrer par ID de ressource
    if (resourceId) {
      where.resourceId = resourceId;
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
    if (companyId && permissionCheck.role === 'SUPER_ADMIN') {
      // Le SUPER_ADMIN peut voir les logs de n'importe quelle entreprise
      where.companyId = companyId;
    } else if (permissionCheck.role === 'COMPANY_ADMIN') {
      // Le COMPANY_ADMIN ne peut voir que les logs de sa propre entreprise
      where.companyId = permissionCheck.user?.companyId;
    }

    // Récupérer le nombre total pour la pagination
    const total = await prisma.auditLog.count({ where });

    // Récupérer les logs d'audit
    const auditLogs = await prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true
          }
        },
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Transformer les détails JSON en objets JavaScript
    const formattedLogs = auditLogs.map(log => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null
    }));

    return NextResponse.json({
      items: formattedLogs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des logs d\'audit:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des logs d\'audit' },
      { status: 500 }
    );
  }
} 