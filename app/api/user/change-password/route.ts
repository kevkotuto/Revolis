import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { sendEmail, EmailTemplates } from '@/lib/services/email-service';

const prisma = new PrismaClient();

export async function PUT(req: Request) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession();
    
    if (!session || !session.user) {
      return NextResponse.json(
        { message: 'Vous devez être connecté pour effectuer cette action' },
        { status: 401 }
      );
    }
    
    const { currentPassword, newPassword } = await req.json();
    
    // Validation basique
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { message: 'Le mot de passe actuel et le nouveau mot de passe sont obligatoires' },
        { status: 400 }
      );
    }
    
    // Récupérer l'utilisateur avec son mot de passe
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
      },
    });
    
    if (!user) {
      return NextResponse.json(
        { message: 'Utilisateur introuvable' },
        { status: 404 }
      );
    }
    
    // Vérifier que le mot de passe actuel est correct
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isPasswordValid) {
      return NextResponse.json(
        { message: 'Mot de passe actuel incorrect' },
        { status: 400 }
      );
    }
    
    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Mettre à jour le mot de passe
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });
    
    // Envoyer un email de notification
    try {
      const passwordChangedTemplate = EmailTemplates.notificationEmail(
        user.name || 'utilisateur',
        'Votre mot de passe a été modifié avec succès. Si vous n\'êtes pas à l\'origine de cette action, veuillez contacter notre support immédiatement.'
      );
      
      await sendEmail({
        to: user.email,
        subject: passwordChangedTemplate.subject,
        html: passwordChangedTemplate.html,
      });
    } catch (emailError) {
      // Log l'erreur mais ne pas faire échouer la requête
      console.error('Erreur lors de l\'envoi de l\'email de notification:', emailError);
    }
    
    return NextResponse.json(
      { message: 'Mot de passe modifié avec succès' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Erreur lors du changement de mot de passe:', error);
    
    return NextResponse.json(
      { message: error.message || 'Une erreur est survenue lors du changement de mot de passe' },
      { status: 500 }
    );
  }
} 