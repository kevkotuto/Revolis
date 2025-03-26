import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../lib/middleware/permissions';

// GET - Récupérer un client par son ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'READ',
      resource: 'CLIENT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const clientId = params.id;
    
    // Récupérer le client
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        projects: {
          select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            status: true,
            issueDate: true,
          },
          take: 5,
          orderBy: { issueDate: 'desc' },
        },
        saleOrders: {
          select: {
            id: true,
            orderDate: true,
            status: true,
          },
          take: 5,
          orderBy: { orderDate: 'desc' },
        },
      }
    });
    
    if (!client) {
      return NextResponse.json(
        { error: 'Client non trouvé' },
        { status: 404 }
      );
    }
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'READ',
      'CLIENT',
      clientId
    );
    
    return NextResponse.json(client);
  } catch (error) {
    console.error('Erreur lors de la récupération du client:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du client' },
      { status: 500 }
    );
  }
}

// PUT - Mettre à jour un client
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'UPDATE',
      resource: 'CLIENT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const clientId = params.id;
    
    // Vérifier si le client existe
    const clientExists = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, companyId: true }
    });
    
    if (!clientExists) {
      return NextResponse.json(
        { error: 'Client non trouvé' },
        { status: 404 }
      );
    }
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la mise à jour d'un client
    const clientUpdateSchema = z.object({
      name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères').optional(),
      email: z.string().email('Email invalide').optional(),
      phone: z.string().optional(),
      logo: z.string().optional(),
      documents: z.array(z.string()).optional(),
      notes: z.string().optional(),
    });
    
    // Valider les données
    const validatedData = clientUpdateSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { name, email, phone, logo, documents, notes } = validatedData.data;
    
    // Vérifier si un autre client avec le même email existe déjà
    if (email) {
      const existingClient = await prisma.client.findFirst({
        where: {
          email,
          companyId: clientExists.companyId,
          id: { not: clientId }
        }
      });
      
      if (existingClient) {
        return NextResponse.json(
          { error: 'Un autre client avec cet email existe déjà', existingClientId: existingClient.id },
          { status: 409 }
        );
      }
    }
    
    // Mettre à jour le client
    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(phone !== undefined && { phone }),
        ...(logo !== undefined && { logo }),
        ...(documents && { documents }),
        ...(notes !== undefined && { notes }),
      },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'UPDATE',
      'CLIENT',
      clientId,
      { name, email }
    );
    
    return NextResponse.json(updatedClient);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du client:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour du client' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un client
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'DELETE',
      resource: 'CLIENT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }
    
    const clientId = params.id;
    
    // Vérifier si le client existe
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { 
        id: true, 
        name: true,
        _count: {
          select: {
            projects: true,
            invoices: true,
            saleOrders: true
          }
        }
      }
    });
    
    if (!client) {
      return NextResponse.json(
        { error: 'Client non trouvé' },
        { status: 404 }
      );
    }
    
    // Vérifier si le client a des relations (projets, factures, commandes)
    if (client._count.projects > 0 || client._count.invoices > 0 || client._count.saleOrders > 0) {
      return NextResponse.json(
        { 
          error: 'Impossible de supprimer ce client car il a des relations actives', 
          details: {
            projects: client._count.projects,
            invoices: client._count.invoices,
            saleOrders: client._count.saleOrders
          }
        },
        { status: 400 }
      );
    }
    
    // Supprimer le client
    await prisma.client.delete({
      where: { id: clientId },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'DELETE',
      'CLIENT',
      clientId,
      { name: client.name }
    );
    
    return NextResponse.json({ message: 'Client supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du client:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la suppression du client' },
      { status: 500 }
    );
  }
} 