import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

// Schéma de validation pour la mise à jour du profil
const updateProfileSchema = z.object({
  name: z.string().optional(),
  avatar: z.string().nullable().optional(),
});

// GET /api/user/profile
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération du profil' },
      { status: 500 }
    );
  }
}

// PATCH /api/user/profile
export async function PATCH(request: NextRequest) {
  console.log('🔄 Début du traitement de la mise à jour du profil...');
  try {
    console.log('🔒 Vérification de l\'authentification...');
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      console.error('❌ Authentification échouée: Aucune session utilisateur');
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    console.log(`✅ Utilisateur authentifié: ${session.user.email} (ID: ${userId})`);
    
    console.log('📦 Récupération des données de la requête...');
    const body = await request.json();
    console.log('📋 Données reçues:', body);
    
    // Validation des données
    console.log('🔍 Validation des données...');
    const validationResult = updateProfileSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('❌ Validation échouée:', validationResult.error.format());
      return NextResponse.json(
        { error: 'Données invalides', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    console.log('✅ Données validées:', validatedData);
    
    // Mise à jour du profil
    console.log('🔄 Mise à jour du profil dans la base de données...');
    console.log('📋 Données à mettre à jour:', {
      ...(validatedData.name !== undefined && { name: validatedData.name }),
      ...(validatedData.avatar !== undefined && { avatar: validatedData.avatar }),
    });
    
    try {
      const updatedUser = await db.user.update({
        where: { id: userId },
        data: {
          ...(validatedData.name !== undefined && { name: validatedData.name }),
          ...(validatedData.avatar !== undefined && { avatar: validatedData.avatar }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
          updatedAt: true,
        },
      });
      
      console.log('✅ Profil mis à jour avec succès:', updatedUser);
      return NextResponse.json(updatedUser);
    } catch (dbError) {
      console.error('❌ Erreur lors de la mise à jour dans la base de données:', dbError);
      throw dbError;
    }
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du profil:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour du profil' },
      { status: 500 }
    );
  }
} 