import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';
import { DateTime } from 'luxon';

// Schéma de validation pour la génération de rapports
const reportRequestSchema = z.object({
  companyId: z.string({ required_error: 'ID d\'entreprise requis' }),
  startDate: z.string({ required_error: 'Date de début requise' }),
  endDate: z.string({ required_error: 'Date de fin requise' }),
  includeInvoices: z.boolean().default(true),
  includePayments: z.boolean().default(true),
  includeExpenses: z.boolean().default(true),
  type: z.enum(['SUMMARY', 'DETAILED']).default('SUMMARY'),
});

// GET - Récupérer les rapports financiers
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'INVOICE'
    });

    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    // Extraire les paramètres de requête
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const reportId = searchParams.get('reportId');
    
    // Si un ID de rapport est fourni, récupérer un rapport spécifique
    if (reportId) {
      const report = await prisma.financialReport.findUnique({
        where: { id: reportId },
        include: {
          data: true
        }
      });

      if (!report) {
        return NextResponse.json(
          { error: 'Rapport non trouvé' },
          { status: 404 }
        );
      }

      // Vérifier les permissions basées sur l'entreprise
      if (permissionCheck.role !== 'SUPER_ADMIN' && 
          permissionCheck.user?.companyId !== report.companyId) {
        return NextResponse.json(
          { error: "Vous n'avez pas les permissions nécessaires pour consulter ce rapport" },
          { status: 403 }
        );
      }

      // Journaliser l'action
      await logAction(
        permissionCheck.user!.id,
        'READ',
        'INVOICE',
        report.id,
        { action: "Consultation d'un rapport financier" }
      );

      return NextResponse.json(report);
    }
    
    // Vérifier les paramètres requis
    if (!companyId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Paramètres manquants - companyId, startDate et endDate sont requis" },
        { status: 400 }
      );
    }

    // Vérifier les permissions basées sur l'entreprise
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour générer des rapports pour cette entreprise" },
        { status: 403 }
      );
    }

    // Convertir les dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Récupérer les rapports existants
    const reports = await prisma.financialReport.findMany({
      where: {
        companyId,
        periodStart: {
          gte: start
        },
        periodEnd: {
          lte: end
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        data: {
          select: {
            id: true,
            type: true, 
            title: true,
            summary: true
          }
        }
      }
    });

    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'READ',
      'INVOICE',
      'multiple',
      { action: "Consultation des rapports financiers", companyId, startDate, endDate }
    );

    return NextResponse.json({
      reports
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des rapports financiers:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des rapports financiers' },
      { status: 500 }
    );
  }
}

// POST - Générer un nouveau rapport financier
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'INVOICE'
    });

    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    // Extraire et valider les données
    const data = await request.json();
    const validationResult = reportRequestSchema.safeParse(data);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const { 
      companyId, 
      startDate, 
      endDate, 
      includeInvoices, 
      includePayments, 
      includeExpenses, 
      type 
    } = validationResult.data;

    // Vérifier les permissions basées sur l'entreprise
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour générer des rapports pour cette entreprise" },
        { status: 403 }
      );
    }

    // Convertir les dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Vérifier si l'entreprise existe
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      return NextResponse.json(
        { error: "Entreprise non trouvée" },
        { status: 404 }
      );
    }

    // Générer le rapport
    const financialData = await generateFinancialReport(
      companyId, 
      start, 
      end, 
      includeInvoices, 
      includePayments, 
      includeExpenses,
      type
    );

    // Créer l'enregistrement du rapport
    const report = await prisma.financialReport.create({
      data: {
        title: `Rapport financier ${DateTime.fromJSDate(start).toFormat('dd/MM/yyyy')} - ${DateTime.fromJSDate(end).toFormat('dd/MM/yyyy')}`,
        companyId,
        periodStart: start,
        periodEnd: end,
        createdById: permissionCheck.user!.id,
        type,
        data: {
          create: financialData
        }
      },
      include: {
        data: true
      }
    });

    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'CREATE',
      'INVOICE',
      report.id,
      { action: "Génération d'un rapport financier", companyId, startDate, endDate }
    );

    return NextResponse.json(report, { status: 201 });

  } catch (error) {
    console.error('Erreur lors de la génération du rapport financier:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la génération du rapport financier' },
      { status: 500 }
    );
  }
}

// Fonction utilitaire pour générer le rapport financier
async function generateFinancialReport(
  companyId: string,
  startDate: Date,
  endDate: Date,
  includeInvoices: boolean,
  includePayments: boolean,
  includeExpenses: boolean,
  type: 'SUMMARY' | 'DETAILED'
) {
  const reportData = [];
  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalProfit = 0;

  // Récupérer les données des factures
  if (includeInvoices) {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      include: type === 'DETAILED' ? {
        items: true,
        client: {
          select: {
            id: true,
            companyName: true
          }
        }
      } : undefined
    });

    const invoiceTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
    totalRevenue += invoiceTotal;

    reportData.push({
      type: 'INVOICE_SUMMARY',
      title: 'Récapitulatif des factures',
      summary: {
        count: invoices.length,
        total: invoiceTotal,
        averageValue: invoices.length > 0 ? invoiceTotal / invoices.length : 0
      },
      details: type === 'DETAILED' ? invoices : undefined
    });
  }

  // Récupérer les données des paiements
  if (includePayments) {
    const payments = await prisma.payment.findMany({
      where: {
        companyId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      include: type === 'DETAILED' ? {
        invoice: {
          select: {
            id: true,
            number: true
          }
        },
        client: {
          select: {
            id: true,
            companyName: true
          }
        }
      } : undefined
    });

    const paymentTotal = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    reportData.push({
      type: 'PAYMENT_SUMMARY',
      title: 'Récapitulatif des paiements',
      summary: {
        count: payments.length,
        total: paymentTotal,
        averageValue: payments.length > 0 ? paymentTotal / payments.length : 0
      },
      details: type === 'DETAILED' ? payments : undefined
    });
  }

  // Récupérer les données des dépenses
  if (includeExpenses) {
    const expenses = await prisma.expense.findMany({
      where: {
        companyId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: type === 'DETAILED' ? {
        category: {
          select: {
            id: true,
            name: true
          }
        }
      } : undefined
    });

    const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    totalExpenses += expenseTotal;

    reportData.push({
      type: 'EXPENSE_SUMMARY',
      title: 'Récapitulatif des dépenses',
      summary: {
        count: expenses.length,
        total: expenseTotal,
        averageValue: expenses.length > 0 ? expenseTotal / expenses.length : 0
      },
      details: type === 'DETAILED' ? expenses : undefined
    });
  }

  // Calcul du profit
  totalProfit = totalRevenue - totalExpenses;

  // Ajouter le résumé global
  reportData.unshift({
    type: 'OVERALL_SUMMARY',
    title: 'Résumé financier global',
    summary: {
      totalRevenue,
      totalExpenses,
      totalProfit,
      profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
    }
  });

  return reportData;
} 