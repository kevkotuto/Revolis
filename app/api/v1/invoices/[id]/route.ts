import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';
import { z } from 'zod';

// GET - Récupérer une facture par ID
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
    
    const invoiceId = params.id;
    
    // Récupérer la facture avec ses items et les détails associés
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        items: true
      }
    });
    
    // Vérifier si la facture existe
    if (!invoice) {
      return NextResponse.json(
        { error: 'Facture non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit d'accéder à cette facture
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== invoice.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour accéder à cette facture' },
        { status: 403 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'READ',
      'INVOICE',
      invoiceId,
      { action: 'Consultation d\'une facture', invoiceNumber: invoice.invoiceNumber }
    );
    
    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Erreur lors de la récupération de la facture:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération de la facture' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour une facture
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
    
    const invoiceId = params.id;
    const data = await request.json();
    
    // Récupérer la facture actuelle
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true
      }
    });
    
    // Vérifier si la facture existe
    if (!existingInvoice) {
      return NextResponse.json(
        { error: 'Facture non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de modifier cette facture
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== existingInvoice.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour modifier cette facture' },
        { status: 403 }
      );
    }
    
    // Définir le schéma de validation pour les items de facture
    const InvoiceItemSchema = z.object({
      id: z.string().optional(), // ID pour les items existants
      description: z.string().min(2, "La description doit contenir au moins 2 caractères"),
      quantity: z.number().min(1, "La quantité doit être supérieure à 0").default(1),
      unitPrice: z.number().min(0, "Le prix unitaire ne peut pas être négatif").default(0),
      total: z.number().optional()
    });
    
    // Définir le schéma de validation pour la mise à jour de la facture
    const InvoiceUpdateSchema = z.object({
      invoiceNumber: z.string().min(3, "Le numéro de facture doit contenir au moins 3 caractères").optional(),
      status: z.string().optional(),
      total: z.number().optional(),
      issueDate: z.string().datetime().optional(),
      dueDate: z.string().datetime().optional().nullable(),
      clientId: z.string().optional().nullable(),
      items: z.array(InvoiceItemSchema).optional()
    });
    
    // Valider les données
    const validationResult = InvoiceUpdateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // Vérifier le client si changé
    if (validatedData.clientId && validatedData.clientId !== existingInvoice.clientId) {
      const client = await prisma.client.findFirst({
        where: { 
          id: validatedData.clientId,
          companyId: existingInvoice.companyId 
        }
      });
      
      if (!client) {
        return NextResponse.json(
          { error: "Client non trouvé ou n'appartient pas à cette entreprise" },
          { status: 404 }
        );
      }
    }
    
    // Utiliser une transaction pour mettre à jour la facture et ses items
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // Préparer les données de base pour la mise à jour
      const updateData: any = {};
      
      if (validatedData.invoiceNumber !== undefined) updateData.invoiceNumber = validatedData.invoiceNumber;
      if (validatedData.status !== undefined) updateData.status = validatedData.status;
      if (validatedData.issueDate !== undefined) updateData.issueDate = new Date(validatedData.issueDate);
      if (validatedData.dueDate !== undefined) updateData.dueDate = validatedData.dueDate ? new Date(validatedData.dueDate) : null;
      if (validatedData.clientId !== undefined) updateData.clientId = validatedData.clientId;
      
      // Mettre à jour les items si fournis
      if (validatedData.items) {
        // Supprimer tous les items existants
        await tx.invoiceItem.deleteMany({
          where: { invoiceId }
        });
        
        // Créer les nouveaux items
        const itemsCreatePromises = validatedData.items.map(item => {
          // Calculer le total de l'item si non spécifié
          const itemTotal = item.total !== undefined ? item.total : item.quantity * item.unitPrice;
          
          return tx.invoiceItem.create({
            data: {
              invoiceId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: itemTotal
            }
          });
        });
        
        await Promise.all(itemsCreatePromises);
        
        // Calculer le nouveau total de la facture si les items ont changé
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
      
      // Mettre à jour la facture
      await tx.invoice.update({
        where: { id: invoiceId },
        data: updateData
      });
      
      // Retourner la facture mise à jour avec ses items
      return tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          company: {
            select: {
              id: true,
              name: true
            }
          },
          client: {
            select: {
              id: true,
              name: true,
              email: true
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
      invoiceId,
      { action: 'Mise à jour d\'une facture', invoiceNumber: updatedInvoice?.invoiceNumber }
    );
    
    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la facture:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour de la facture' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une facture
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
    
    const invoiceId = params.id;
    
    // Récupérer la facture
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        _count: {
          select: {
            items: true
          }
        }
      }
    });
    
    // Vérifier si la facture existe
    if (!invoice) {
      return NextResponse.json(
        { error: 'Facture non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de supprimer cette facture
    if (permissionCheck.role !== 'SUPER_ADMIN' && 
        permissionCheck.user?.companyId !== invoice.companyId) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour supprimer cette facture' },
        { status: 403 }
      );
    }
    
    // Ne pas permettre la suppression d'une facture avec statut autre que DRAFT ou CANCELLED
    if (invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED') {
      return NextResponse.json(
        { error: 'Impossible de supprimer une facture qui n\'est pas en brouillon ou annulée' },
        { status: 400 }
      );
    }
    
    // Supprimer les items de la facture puis la facture elle-même dans une transaction
    await prisma.$transaction([
      prisma.invoiceItem.deleteMany({
        where: { invoiceId }
      }),
      prisma.invoice.delete({
        where: { id: invoiceId }
      })
    ]);
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user?.id || 'unknown',
      'DELETE',
      'INVOICE',
      invoiceId,
      { action: 'Suppression d\'une facture', invoiceNumber: invoice.invoiceNumber }
    );
    
    return NextResponse.json(
      { message: 'Facture supprimée avec succès' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur lors de la suppression de la facture:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression de la facture' },
      { status: 500 }
    );
  }
} 