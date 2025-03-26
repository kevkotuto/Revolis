import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer tous les enregistrements de paie
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les paramètres de requête
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const userId = searchParams.get('userId') || undefined;
    const period = searchParams.get('period') || undefined;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined;
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : undefined;
    const search = searchParams.get('search') || '';
    const companyId = searchParams.get('companyId') || undefined;
    
    // Calculer l'offset pour la pagination
    const skip = (page - 1) * limit;
    
    // Construire la clause where
    const where: any = {};
    
    // Filtrer par utilisateur si spécifié
    if (userId) {
      where.userId = userId;
    } else if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      // Si l'utilisateur n'est pas administrateur, limiter à ses propres fiches de paie
      where.userId = permissionCheck.user?.id;
    }
    
    // Filtrer par période si spécifiée
    if (period) {
      where.period = period;
    }
    
    // Filtrer par année
    if (year) {
      where.year = year;
    }
    
    // Filtrer par mois
    if (month) {
      where.month = month;
    }
    
    // Recherche
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Filtrer par compagnie si spécifié ou si l'utilisateur est un admin d'entreprise
    if (companyId) {
      where.user = { companyId };
    } else if (permissionCheck.role === 'COMPANY_ADMIN' && permissionCheck.user?.companyId) {
      where.user = { companyId: permissionCheck.user.companyId };
    }
    
    // Récupérer les fiches de paie
    const [payrolls, total] = await prisma.$transaction([
      prisma.payroll.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { year: 'desc' },
          { month: 'desc' }
        ],
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              companyId: true,
              role: true
            }
          }
        }
      }),
      prisma.payroll.count({ where })
    ]);
    
    // Filtrage supplémentaire pour la confidentialité
    const filteredPayrolls = payrolls.map(payroll => {
      // Si l'utilisateur est l'admin ou le propriétaire de la fiche, retourner toutes les données
      if (payroll.userId === permissionCheck.user?.id || 
          permissionCheck.role === 'SUPER_ADMIN' || 
          (permissionCheck.role === 'COMPANY_ADMIN' && 
           payroll.user.companyId === permissionCheck.user?.companyId)) {
        return payroll;
      }
      
      // Sinon, masquer les données financières sensibles
      return {
        ...payroll,
        grossPay: null,
        netPay: null,
        taxes: null,
        deductions: null,
        additions: null,
        details: null
      };
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'OTHER',
      undefined,
      { action: 'Liste des fiches de paie', filters: { userId, period, year, month } }
    );
    
    return NextResponse.json({
      data: filteredPayrolls,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des fiches de paie:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des fiches de paie' },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle fiche de paie
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Seuls les admin peuvent créer des fiches de paie
    if (permissionCheck.role !== 'SUPER_ADMIN' && permissionCheck.role !== 'COMPANY_ADMIN') {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions pour créer des fiches de paie" },
        { status: 403 }
      );
    }
    
    // Extraire et valider les données
    const data = await request.json();
    
    // Définir le schéma de validation pour la fiche de paie
    const PayrollSchema = z.object({
      userId: z.string({ message: "L'ID de l'utilisateur est requis" }),
      period: z.string({ message: "La période est requise" }),
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
      grossPay: z.number().nonnegative({ message: "Le salaire brut doit être positif ou nul" }),
      netPay: z.number().nonnegative({ message: "Le salaire net doit être positif ou nul" }),
      taxes: z.number().nonnegative({ message: "Les taxes doivent être positives ou nulles" }),
      deductions: z.number().nonnegative().optional(),
      additions: z.number().nonnegative().optional(),
      issueDate: z.string().datetime().default(() => new Date().toISOString()),
      paymentDate: z.string().datetime().optional(),
      reference: z.string().optional(),
      details: z.string().optional(),
      notes: z.string().optional()
    });
    
    // Valider les données
    const validationResult = PayrollSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier que l'utilisateur existe
    const targetUser = await prisma.user.findUnique({
      where: { id: validatedData.userId },
      select: { id: true, companyId: true }
    });
    
    if (!targetUser) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }
    
    // Si l'utilisateur est un COMPANY_ADMIN, vérifier qu'il crée une fiche pour un utilisateur de sa propre entreprise
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        targetUser.companyId !== permissionCheck.user?.companyId) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas créer une fiche de paie pour un utilisateur d'une autre entreprise" },
        { status: 403 }
      );
    }
    
    // Vérifier qu'il n'existe pas déjà une fiche de paie pour cet utilisateur, cette année et ce mois
    const existingPayroll = await prisma.payroll.findFirst({
      where: {
        userId: validatedData.userId,
        year: validatedData.year,
        month: validatedData.month
      }
    });
    
    if (existingPayroll) {
      return NextResponse.json(
        { error: "Une fiche de paie existe déjà pour cet utilisateur pour cette période" },
        { status: 409 }
      );
    }
    
    // Préparer les données
    const payrollData = {
      ...validatedData,
      issueDate: new Date(validatedData.issueDate),
      paymentDate: validatedData.paymentDate ? new Date(validatedData.paymentDate) : null
    };
    
    // Créer la fiche de paie
    const payroll = await prisma.payroll.create({
      data: payrollData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'CREATE',
      'OTHER',
      payroll.id,
      { action: 'Création d\'une fiche de paie', userId: validatedData.userId, period: `${validatedData.year}-${validatedData.month}` }
    );
    
    return NextResponse.json(payroll, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la fiche de paie:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création de la fiche de paie' },
      { status: 500 }
    );
  }
} 