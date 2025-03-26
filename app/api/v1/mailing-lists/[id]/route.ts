import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';

// GET - Récupérer une mailing list par son ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const mailingListId = params.id;
    
    // Récupérer la mailing list avec ses contacts
    const mailingList = await prisma.mailingList.findUnique({
      where: { id: mailingListId },
      include: {
        contacts: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      }
    });
    
    if (!mailingList) {
      return NextResponse.json(
        { error: 'Mailing list non trouvée' },
        { status: 404 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'READ',
      'OTHER',
      mailingListId
    );
    
    return NextResponse.json(mailingList);
  } catch (error) {
    console.error('Erreur lors de la récupération de la mailing list:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la mailing list' },
      { status: 500 }
    );
  }
}

// PUT - Mettre à jour une mailing list
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const mailingListId = params.id;
    
    // Vérifier si la mailing list existe
    const mailingListExists = await prisma.mailingList.findUnique({
      where: { id: mailingListId },
      select: { id: true, companyId: true }
    });
    
    if (!mailingListExists) {
      return NextResponse.json(
        { error: 'Mailing list non trouvée' },
        { status: 404 }
      );
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la mise à jour d'une mailing list
    const mailingListUpdateSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
    });
    
    // Valider les données
    const validatedData = mailingListUpdateSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { name } = validatedData.data;
    
    // Vérifier si une autre mailing list avec le même nom existe déjà
    const existingMailingList = await prisma.mailingList.findFirst({
      where: {
        name,
        companyId: mailingListExists.companyId,
        id: { not: mailingListId }
      }
    });
    
    if (existingMailingList) {
      return NextResponse.json(
        { error: 'Une autre mailing list avec ce nom existe déjà', existingMailingListId: existingMailingList.id },
        { status: 409 }
      );
    }
    
    // Mettre à jour la mailing list
    const updatedMailingList = await prisma.mailingList.update({
      where: { id: mailingListId },
      data: { name },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'UPDATE',
      'OTHER',
      mailingListId,
      { name }
    );
    
    return NextResponse.json(updatedMailingList);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la mailing list:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la mailing list' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une mailing list
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'OTHER'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const mailingListId = params.id;
    
    // Vérifier si la mailing list existe
    const mailingList = await prisma.mailingList.findUnique({
      where: { id: mailingListId },
      select: { 
        id: true, 
        name: true,
        _count: {
          select: {
            contacts: true
          }
        }
      }
    });
    
    if (!mailingList) {
      return NextResponse.json(
        { error: 'Mailing list non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier s'il y a des campagnes associées à cette mailing list
    const campaignsCount = await prisma.campaignRecipient.count({
      where: {
        contact: {
          mailingListId: mailingListId
        }
      }
    });
    
    if (campaignsCount > 0) {
      return NextResponse.json(
        { 
          error: 'Impossible de supprimer cette mailing list car elle est utilisée dans des campagnes', 
          details: {
            campaigns: campaignsCount
          }
        },
        { status: 400 }
      );
    }
    
    // Supprimer la mailing list (les contacts associés sont simplement détachés, pas supprimés)
    await prisma.mailingList.delete({
      where: { id: mailingListId },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'DELETE',
      'OTHER',
      mailingListId,
      { name: mailingList.name }
    );
    
    return NextResponse.json({ 
      message: 'Mailing list supprimée avec succès',
      contactsDetached: mailingList._count.contacts
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la mailing list:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de la mailing list' },
      { status: 500 }
    );
  }
} 