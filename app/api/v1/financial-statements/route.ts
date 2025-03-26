import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les états financiers
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions (seuls les administrateurs peuvent voir les états financiers)
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'COMPANY'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Vérifier que l'utilisateur est un administrateur
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour consulter les états financiers" },
        { status: 403 }
      );
    }

    // Extraire les paramètres de la requête
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '12'); // Par défaut, 12 mois
    const companyId = searchParams.get('companyId');
    const year = searchParams.get('year');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Configurer la pagination
    const skip = (page - 1) * limit;

    // Construire la clause where pour le filtrage
    const where: any = {};

    // Filtrer par entreprise
    if (companyId) {
      where.companyId = companyId;
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      // Les admins d'entreprise ne voient que les états financiers de leur entreprise
      where.companyId = permissionCheck.user.companyId;
    }

    // Filtrer par année
    if (year) {
      const startOfYear = new Date(parseInt(year), 0, 1);
      const endOfYear = new Date(parseInt(year), 11, 31);
      where.periodStart = {
        gte: startOfYear
      };
      where.periodEnd = {
        lte: endOfYear
      };
    }

    // Filtrer par période spécifique
    if (startDate) {
      where.periodStart = {
        ...(where.periodStart || {}),
        gte: new Date(startDate)
      };
    }

    if (endDate) {
      where.periodEnd = {
        ...(where.periodEnd || {}),
        lte: new Date(endDate)
      };
    }

    // Récupérer le nombre total pour la pagination
    const total = await prisma.financialStatement.count({ where });

    // Récupérer les états financiers
    const financialStatements = await prisma.financialStatement.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        periodEnd: 'desc'
      },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'COMPANY',
      'multiple',
      { action: "Consultation des états financiers" }
    );

    return NextResponse.json({
      items: financialStatements,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des états financiers:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des états financiers' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouvel état financier ou générer automatiquement un état financier pour une période
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions (seuls les administrateurs peuvent créer des états financiers)
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'COMPANY'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Vérifier que l'utilisateur est un administrateur
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour créer des états financiers" },
        { status: 403 }
      );
    }

    // Extraire et valider les données
    const data = await request.json();
    
    // Schéma de validation
    const FinancialStatementSchema = z.object({
      companyId: z.string().min(1, "ID d'entreprise requis"),
      periodStart: z.string().refine(val => !isNaN(Date.parse(val)), {
        message: "Date de début de période invalide"
      }),
      periodEnd: z.string().refine(val => !isNaN(Date.parse(val)), {
        message: "Date de fin de période invalide"
      }),
      revenue: z.number().optional(),
      expenses: z.number().optional(),
      profit: z.number().optional(),
      generateAutomatically: z.boolean().optional()
    });
    
    // Valider les données
    const validationResult = FinancialStatementSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Convertir les dates string en objets Date
    const periodStart = new Date(validatedData.periodStart);
    const periodEnd = new Date(validatedData.periodEnd);
    
    // Vérifier que la date de fin est après la date de début
    if (periodEnd <= periodStart) {
      return NextResponse.json(
        { error: "La date de fin doit être postérieure à la date de début" },
        { status: 400 }
      );
    }
    
    // Vérifier que l'entreprise existe
    const company = await prisma.company.findUnique({
      where: { id: validatedData.companyId },
      select: { id: true }
    });
    
    if (!company) {
      return NextResponse.json(
        { error: "Entreprise non trouvée" },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de créer un état financier pour cette entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== validatedData.companyId) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas créer d'état financier pour une autre entreprise" },
        { status: 403 }
      );
    }
    
    // Vérifier qu'il n'existe pas déjà un état financier pour cette période et cette entreprise
    const existingStatement = await prisma.financialStatement.findFirst({
      where: {
        companyId: validatedData.companyId,
        OR: [
          {
            periodStart: {
              lte: periodEnd
            },
            periodEnd: {
              gte: periodStart
            }
          }
        ]
      }
    });
    
    if (existingStatement) {
      return NextResponse.json(
        { error: "Il existe déjà un état financier pour cette période" },
        { status: 409 }
      );
    }
    
    let financialData: any = {
      companyId: validatedData.companyId,
      periodStart,
      periodEnd
    };
    
    // Si génération automatique demandée, calculer les montants
    if (validatedData.generateAutomatically) {
      // Calculer le revenu à partir des factures
      const invoiceRevenue = await prisma.invoice.aggregate({
        _sum: {
          total: true
        },
        where: {
          companyId: validatedData.companyId,
          issueDate: {
            gte: periodStart,
            lte: periodEnd
          },
          status: "PAID" // Ne considérer que les factures payées
        }
      });
      
      // Calculer les dépenses (exemple: paiements aux prestataires)
      const expenses = await prisma.payment.aggregate({
        _sum: {
          amount: true
        },
        where: {
          project: {
            companyId: validatedData.companyId
          },
          date: {
            gte: periodStart,
            lte: periodEnd
          },
          paymentType: "PRESTATAIRE", // Paiements aux prestataires
          status: "COMPLETE" // Ne considérer que les paiements effectués
        }
      });
      
      // Calculer les chiffres
      const revenue = invoiceRevenue._sum.total?.toNumber() || 0;
      const expenseAmount = expenses._sum.amount?.toNumber() || 0;
      const profit = revenue - expenseAmount;
      
      financialData.revenue = revenue;
      financialData.expenses = expenseAmount;
      financialData.profit = profit;
    } else {
      // Utiliser les valeurs fournies
      financialData.revenue = validatedData.revenue || 0;
      financialData.expenses = validatedData.expenses || 0;
      financialData.profit = validatedData.profit || (financialData.revenue - financialData.expenses);
    }
    
    // Créer l'état financier
    const financialStatement = await prisma.financialStatement.create({
      data: financialData,
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'CREATE',
      'COMPANY',
      financialStatement.id,
      { 
        action: "Création d'un état financier",
        companyId: validatedData.companyId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        generated: validatedData.generateAutomatically
      }
    );
    
    return NextResponse.json(financialStatement, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de l\'état financier:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de l\'état financier' },
      { status: 500 }
    );
  }
} 