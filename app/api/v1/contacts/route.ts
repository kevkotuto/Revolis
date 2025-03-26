import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../lib/middleware/permissions';

// GET - Récupérer tous les contacts
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
    
    // Extraire les paramètres de la requête
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const companyId = url.searchParams.get('companyId') || '';
    const mailingListId = url.searchParams.get('mailingListId') || '';
    
    // Construire la requête
    const where: any = {};
    
    if (companyId) {
      where.companyId = companyId;
    }
    
    if (mailingListId) {
      where.mailingListId = mailingListId;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    // Exécuter la requête
    const skip = (page - 1) * limit;
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
          mailingList: {
            select: {
              id: true,
              name: true,
            }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.contact.count({ where }),
    ]);
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'LIST',
      'OTHER',
      undefined,
      { page, limit, search, companyId, mailingListId }
    );
    
    // Retourner les résultats avec pagination
    return NextResponse.json({
      contacts,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des contacts:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des contacts' },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau contact
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
    
    // Extraire les données du corps de la requête
    const body = await request.json();
    
    // Schéma de validation pour la création d'un contact
    const contactSchema = z.object({
      email: z.string().email('Email invalide'),
      name: z.string().optional(),
      phone: z.string().optional(),
      companyId: z.string(),
      mailingListId: z.string().optional(),
    });
    
    // Valider les données
    const validatedData = contactSchema.safeParse(body);
    
    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validatedData.error.format() },
        { status: 400 }
      );
    }
    
    const { email, name, phone, companyId, mailingListId } = validatedData.data;
    
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
    
    // Vérifier si la mailing list existe
    if (mailingListId) {
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
      
      // Vérifier que la mailing list appartient à l'entreprise
      if (mailingListExists.companyId !== companyId) {
        return NextResponse.json(
          { error: 'La mailing list n\'appartient pas à l\'entreprise spécifiée' },
          { status: 400 }
        );
      }
    }
    
    // Vérifier si un contact avec le même email existe déjà
    const existingContact = await prisma.contact.findFirst({
      where: {
        email,
        companyId,
      }
    });
    
    if (existingContact) {
      // Si le contact existe et qu'on veut l'ajouter à une mailing list
      if (mailingListId && existingContact.mailingListId !== mailingListId) {
        // Mettre à jour le contact existant avec la nouvelle mailing list
        const updatedContact = await prisma.contact.update({
          where: { id: existingContact.id },
          data: { mailingListId }
        });
        
        // Journaliser l'action
        await logAction(
          request.headers.get('x-user-id') || 'unknown',
          'UPDATE',
          'OTHER',
          existingContact.id,
          { email, mailingListId }
        );
        
        return NextResponse.json({
          message: 'Contact existant ajouté à la mailing list',
          contact: updatedContact
        });
      } else {
        return NextResponse.json(
          { error: 'Un contact avec cet email existe déjà', existingContactId: existingContact.id },
          { status: 409 }
        );
      }
    }
    
    // Créer le contact
    const newContact = await prisma.contact.create({
      data: {
        email,
        name,
        phone,
        companyId,
        mailingListId,
      },
    });
    
    // Journaliser l'action
    await logAction(
      request.headers.get('x-user-id') || 'unknown',
      'CREATE',
      'OTHER',
      newContact.id,
      { email, name, mailingListId }
    );
    
    return NextResponse.json(newContact, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création du contact:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création du contact' },
      { status: 500 }
    );
  }
} 