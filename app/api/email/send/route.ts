import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { sendEmail } from '@/lib/services/email-service';
import { EmailPayload } from '@/types';

export async function POST(req: Request) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession();
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Vous devez être connecté pour envoyer un email' },
        { status: 401 }
      );
    }
    
    // Récupérer les données de la requête
    const { to, subject, html } = await req.json() as EmailPayload;
    
    // Validation basique
    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Les champs destinataire, sujet et contenu sont obligatoires' },
        { status: 400 }
      );
    }
    
    // Envoyer l'email
    const result = await sendEmail({ to, subject, html });
    
    return NextResponse.json(
      { success: true, messageId: result.messageId },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    
    return NextResponse.json(
      { error: error.message || 'Une erreur est survenue lors de l\'envoi de l\'email' },
      { status: 500 }
    );
  }
} 