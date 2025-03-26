import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer tous les plans d'abonnement
export async function GET(request: NextRequest) {
  try {
    // Vérifier les permissions (SUPER_ADMIN ou COMPANY_ADMIN peuvent voir les plans)
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER' // On utilise OTHER pour les plans d'abonnement
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les paramètres
    const url = new URL(request.url);
    const billingCycle = url.searchParams.get('billingCycle') as 'MONTHLY' | 'YEARLY' | null;
    
    // Construire la requête
    const where: any = {};
    
    if (billingCycle) {
      where.billingCycle = billingCycle;
    }
    
    // Exécuter la requête
    const subscriptionPlans = await prisma.subscriptionPlan.findMany({
      where,
      include: {
        _count: {
          select: {
            companySubscriptions: true
          }
        }
      },
      orderBy: [
        { billingCycle: 'asc' },
        { price: 'asc' }
      ]
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'OTHER',
      undefined,
      { entity: 'SUBSCRIPTION_PLAN', billingCycle }
    );
    
    return NextResponse.json({ subscriptionPlans });
  } catch (error) {
    console.error('Erreur lors de la récupération des plans d\'abonnement:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des plans d\'abonnement' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau plan d'abonnement
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions (seul SUPER_ADMIN peut créer des plans)
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'OTHER' // On utilise OTHER pour les plans d'abonnement
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation
    const subscriptionPlanSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
      description: z.string().optional(),
      price: z.number().nonnegative('Le prix doit être positif ou nul'),
      billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
    });
    
    // Valider les données
    const validatedData = subscriptionPlanSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { name, description, price, billingCycle } = validatedData.data;
    
    // Créer le plan d'abonnement
    const newPlan = await prisma.subscriptionPlan.create({
      data: {
        name,
        description,
        price,
        billingCycle,
      },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'OTHER',
      newPlan.id,
      { entity: 'SUBSCRIPTION_PLAN', name, billingCycle }
    );
    
    return NextResponse.json(newPlan, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du plan d\'abonnement:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création du plan d\'abonnement' },
      { status: 500 }
    );
  }
} 