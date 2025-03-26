import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../../lib/middleware/permissions';

// GET - Récupérer les abonnements d'une entreprise
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
    
    // Récupérer les abonnements
    const subscriptions = await prisma.companySubscription.findMany({
      where: { companyId },
      include: {
        subscriptionPlan: true
      },
      orderBy: { startDate: 'desc' }
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'OTHER',
      companyId,
      { entity: 'COMPANY_SUBSCRIPTION' }
    );
    
    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error('Erreur lors de la récupération des abonnements:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des abonnements' },
      { status: 500 }
    );
  }
}

// POST - Ajouter un abonnement à une entreprise
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const companyId = params.id;
    
    // Vérifier les permissions (seul SUPER_ADMIN peut ajouter des abonnements)
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
    
    // Schéma de validation pour l'ajout d'un abonnement
    const subscriptionSchema = z.object({
      subscriptionPlanId: z.string(),
      startDate: z.string().optional(), // Optionnel, par défaut date courante
      endDate: z.string().optional(),
      active: z.boolean().default(true),
    });
    
    // Valider les données
    const validatedData = subscriptionSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { subscriptionPlanId, startDate, endDate, active } = validatedData.data;
    
    // Vérifier si le plan d'abonnement existe
    const planExists = await prisma.subscriptionPlan.findUnique({
      where: { id: subscriptionPlanId },
    });
    
    if (!planExists) {
      return NextResponse.json(
        { error: 'Plan d\'abonnement non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier si l'association existe déjà
    const existingSubscription = await prisma.companySubscription.findFirst({
      where: {
        companyId,
        subscriptionPlanId,
      },
    });
    
    if (existingSubscription) {
      // Mettre à jour l'abonnement existant
      const updatedSubscription = await prisma.companySubscription.update({
        where: { id: existingSubscription.id },
        data: {
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : null,
          active,
        },
        include: {
          subscriptionPlan: true,
        },
      });
      
      // Journaliser l'action
      await logAction(
        request.headers.get('x-user-id') || 'unknown',
        'UPDATE',
        'OTHER',
        updatedSubscription.id,
        { entity: 'COMPANY_SUBSCRIPTION', companyId, planId: subscriptionPlanId }
      );
      
      return NextResponse.json(updatedSubscription);
    } else {
      // Créer un nouvel abonnement
      const newSubscription = await prisma.companySubscription.create({
        data: {
          companyId,
          subscriptionPlanId,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : null,
          active,
        },
        include: {
          subscriptionPlan: true,
        },
      });
      
      // Mettre à jour le type d'abonnement de l'entreprise si nécessaire
      if (active && !endDate && planExists.billingCycle) {
        await prisma.company.update({
          where: { id: companyId },
          data: {
            subscriptionType: planExists.billingCycle,
          },
        });
      }
      
      // Journaliser l'action
      await logAction(
        request.headers.get('x-user-id') || 'unknown',
        'CREATE',
        'OTHER',
        newSubscription.id,
        { entity: 'COMPANY_SUBSCRIPTION', companyId, planId: subscriptionPlanId }
      );
      
      return NextResponse.json(newSubscription, { status: 201 });
    }
  } catch (error) {
    console.error('Erreur lors de l\'ajout de l\'abonnement:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'ajout de l\'abonnement' },
      { status: 500 }
    );
  }
} 