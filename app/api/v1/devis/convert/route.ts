import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';

// Schéma de validation pour la conversion de devis en contrat
const convertDevisSchema = z.object({
  devisId: z.string({ required_error: 'ID de devis requis' }),
  status: z.enum(['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED']).default('ACTIVE'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  termsAndConditions: z.string().optional(),
  additionalNotes: z.string().optional(),
});

// POST - Convertir un devis en contrat
export async function POST(request: NextRequest) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'INVOICE' // Utilisation de INVOICE comme ressource pour les contrats
    });

    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    // Extraire et valider les données
    const data = await request.json();
    const validationResult = convertDevisSchema.safeParse(data);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const { devisId, status, startDate, endDate, termsAndConditions, additionalNotes } = validationResult.data;

    // Vérifier que le devis existe
    const devis = await prisma.devis.findUnique({
      where: { id: devisId },
      include: {
        items: true,
        project: {
          select: {
            id: true,
            name: true,
            companyId: true,
            clientId: true,
          }
        }
      }
    });

    if (!devis) {
      return NextResponse.json(
        { error: "Devis non trouvé" },
        { status: 404 }
      );
    }

    // Vérifier que le devis a le statut ACCEPTED
    if (devis.status !== 'ACCEPTED') {
      return NextResponse.json(
        { error: "Seuls les devis acceptés peuvent être convertis en contrats" },
        { status: 400 }
      );
    }

    // Vérifier les permissions basées sur l'entreprise
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== devis.project?.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les permissions nécessaires pour convertir ce devis en contrat" },
        { status: 403 }
      );
    }

    // S'assurer que le projet existe
    if (!devis.project) {
      return NextResponse.json(
        { error: "Le devis n'est pas associé à un projet valide" },
        { status: 400 }
      );
    }

    // Créer le contrat à partir du devis
    const contrat = await prisma.$transaction(async (tx) => {
      // Mettre à jour le statut du devis
      await tx.devis.update({
        where: { id: devisId },
        data: { 
          status: 'CONVERTED',
          updatedAt: new Date()
        }
      });

      // Créer le contrat
      const newContract = await tx.contrat.create({
        data: {
          title: `Contrat basé sur devis: ${devis.reference || devis.id}`,
          status,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : null,
          termsAndConditions: termsAndConditions || '',
          totalAmount: devis.total || new Decimal(0),
          projectId: devis.projectId,
          clientId: devis.project.clientId || '',
          companyId: devis.project.companyId || '',
          createdById: permissionCheck.user!.id,
          sourceDevisId: devis.id,
          additionalNotes,
          items: {
            create: devis.items.map(item => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.total, // Utiliser item.total au lieu de totalPrice
              type: 'SERVICE' // Définir une valeur par défaut pour type
            }))
          }
        },
        include: {
          items: true,
          project: {
            select: {
              id: true,
              name: true,
              clientId: true
            }
          },
          client: {
            select: {
              id: true,
              companyName: true
            }
          }
        }
      });

      return newContract;
    });

    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'CREATE',
      'INVOICE', // Utilisation de INVOICE comme ressource pour les contrats
      contrat.id,
      { action: "Conversion d'un devis en contrat", devisId }
    );

    return NextResponse.json(contrat, { status: 201 });

  } catch (error) {
    console.error('Erreur lors de la conversion du devis en contrat:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la conversion du devis en contrat' },
      { status: 500 }
    );
  }
} 