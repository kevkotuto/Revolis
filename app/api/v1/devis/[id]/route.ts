import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer un devis par ID
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'INVOICE'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const devisId = params.id;
    
    // Récupérer le devis avec ses items et le projet associé
    const devis = await prisma.devis.findUnique({
      where: { id: devisId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            companyId: true,
            client: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true
              }
            }
          }
        },
        items: true
      }
    });
    
    // Vérifier si le devis existe
    if (!devis) {
      return NextResponse.json(
        { error: 'Devis non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit d'accéder à ce devis
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        devis.project && 
        permissionCheck.user?.companyId !== devis.project.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour accéder à ce devis' },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'INVOICE',
      devisId,
      { action: 'Consultation d\'un devis', reference: devis.reference }
    );
    
    return NextResponse.json(devis);
  } catch (error) {
    console.error('Erreur lors de la récupération du devis:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération du devis' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un devis
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'INVOICE'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const devisId = params.id;
    const data = await request.json();
    
    // Récupérer le devis actuel
    const existingDevis = await prisma.devis.findUnique({
      where: { id: devisId },
      include: {
        project: {
          select: {
            companyId: true
          }
        },
        items: true
      }
    });
    
    // Vérifier si le devis existe
    if (!existingDevis) {
      return NextResponse.json(
        { error: 'Devis non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de modifier ce devis
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        existingDevis.project && 
        permissionCheck.user?.companyId !== existingDevis.project.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour modifier ce devis' },
        { status: 403 }
      );
    }
    
    // Définir le schéma de validation pour les items de devis
    const DevisItemSchema = z.object({
      id: z.string().optional(), // ID pour les items existants
      description: z.string().min(2, "La description doit contenir au moins 2 caractères"),
      quantity: z.number().min(1, "La quantité doit être supérieure à 0").default(1),
      unitPrice: z.number().min(0, "Le prix unitaire ne peut pas être négatif").default(0),
      total: z.number().optional()
    });
    
    // Définir le schéma de validation pour la mise à jour du devis
    const DevisUpdateSchema = z.object({
      reference: z.string().min(3, "La référence doit contenir au moins 3 caractères").optional(),
      status: z.string().optional(),
      total: z.number().optional(),
      validUntil: z.string().datetime().optional().nullable(),
      document: z.string().optional().nullable(),
      projectId: z.string().optional().nullable(),
      items: z.array(DevisItemSchema).optional()
    });
    
    // Valider les données
    const validationResult = DevisUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier le projet si un changement est demandé
    if (validatedData.projectId && validatedData.projectId !== existingDevis.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: validatedData.projectId },
        select: { companyId: true }
      });
      
      if (!project) {
        return NextResponse.json(
          { error: "Projet non trouvé" },
          { status: 404 }
        );
      }
      
      // Vérifier que l'utilisateur a le droit d'accéder à ce projet
      if (permissionCheck.role !== 'SUPER_ADMIN' && 
          permissionCheck.user?.companyId !== project.companyId) {
        return NextResponse.json(
          { error: "Vous n'avez pas les permissions pour associer ce devis à ce projet" },
          { status: 403 }
        );
      }
    }
    
    // Utiliser une transaction pour mettre à jour le devis et ses items
    const updatedDevis = await prisma.$transaction(async (tx) => {
      // Préparer les données de base pour la mise à jour
      const updateData: any = {};
      
      if (validatedData.reference !== undefined) updateData.reference = validatedData.reference;
      if (validatedData.status !== undefined) updateData.status = validatedData.status;
      if (validatedData.validUntil !== undefined) updateData.validUntil = validatedData.validUntil ? new Date(validatedData.validUntil) : null;
      if (validatedData.document !== undefined) updateData.document = validatedData.document;
      if (validatedData.projectId !== undefined) updateData.projectId = validatedData.projectId;
      
      // Mettre à jour les items si fournis
      if (validatedData.items) {
        // Supprimer tous les items existants
        await tx.devisItem.deleteMany({
          where: { devisId }
        });
        
        // Créer les nouveaux items
        const itemsCreatePromises = validatedData.items.map(item => {
          // Calculer le total de l'item si non spécifié
          const itemTotal = item.total !== undefined ? item.total : item.quantity * item.unitPrice;
          
          return tx.devisItem.create({
            data: {
              devisId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: itemTotal
            }
          });
        });
        
        await Promise.all(itemsCreatePromises);
        
        // Calculer le nouveau total du devis si les items ont changé
        if (!validatedData.total) {
          updateData.total = validatedData.items.reduce((sum, item) => {
            const itemTotal = item.total !== undefined ? item.total : item.quantity * item.unitPrice;
            return sum + itemTotal;
          }, 0);
        } else {
          updateData.total = validatedData.total;
        }
      } else if (validatedData.total !== undefined) {
        // Si seul le total est fourni, le mettre à jour
        updateData.total = validatedData.total;
      }
      
      // Mettre à jour le devis
      await tx.devis.update({
        where: { id: devisId },
        data: updateData
      });
      
      // Retourner le devis mis à jour avec ses items
      return tx.devis.findUnique({
        where: { id: devisId },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          },
          items: true
        }
      });
    });
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'UPDATE',
      'INVOICE',
      devisId,
      { action: 'Mise à jour d\'un devis', reference: updatedDevis?.reference }
    );
    
    return NextResponse.json(updatedDevis);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du devis:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour du devis' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un devis
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'INVOICE'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const devisId = params.id;
    
    // Récupérer le devis
    const devis = await prisma.devis.findUnique({
      where: { id: devisId },
      include: {
        project: {
          select: {
            companyId: true
          }
        }
      }
    });
    
    // Vérifier si le devis existe
    if (!devis) {
      return NextResponse.json(
        { error: 'Devis non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de supprimer ce devis
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        devis.project && 
        permissionCheck.user?.companyId !== devis.project.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour supprimer ce devis' },
        { status: 403 }
      );
    }
    
    // Supprimer les items du devis puis le devis lui-même dans une transaction
    await prisma.$transaction([
      prisma.devisItem.deleteMany({
        where: { devisId }
      }),
      prisma.devis.delete({
        where: { id: devisId }
      })
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'INVOICE',
      devisId,
      { action: 'Suppression d\'un devis', reference: devis.reference }
    );
    
    return NextResponse.json(
      { message: 'Devis supprimé avec succès' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression du devis:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression du devis' },
      { status: 500 }
    );
  }
} 