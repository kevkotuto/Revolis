import nodemailer from 'nodemailer';
import { EmailPayload } from '@/types';

// Configuration du transporteur d'emails
const getEmailTransporter = () => {
  // En environnement de développement, utiliser Ethereal (faux service SMTP pour tests)
  if (process.env.NODE_ENV === 'development' && !process.env.USE_REAL_EMAIL) {
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: process.env.ETHEREAL_EMAIL || 'ethereal.user@ethereal.email',
        pass: process.env.ETHEREAL_PASSWORD || 'ethereal_password'
      }
    });
  }
  
  // Configuration pour Gmail (alternative) - très fiable pour les tests
  if (process.env.USE_GMAIL === 'true') {
    console.log("Utilisation de Gmail comme transporteur");
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD // Mot de passe d'application
      }
    });
  }
  
  // En production, utiliser un vrai service SMTP
  console.log("Utilisation du transporteur SMTP standard");
  return nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT) || 587,
    secure: false, // Pour le port 587, secure doit être false
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD
    },
    tls: {
      // Ne pas échouer sur les certificats invalides
      rejectUnauthorized: false
    },
    debug: true
  });
};

// Fonction pour envoyer un email
export const sendEmail = async (payload: EmailPayload) => {
  const transporter = getEmailTransporter();
  
  const defaultFrom = process.env.EMAIL_FROM || 'noreply@revolis.com';
  
  const mailOptions = {
    from: payload.from || defaultFrom,
    to: payload.to,
    subject: payload.subject,
    html: payload.html
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    
    console.log("Email envoyé avec succès");
    console.log("Host:", process.env.EMAIL_SERVER_HOST);
    console.log("User:", process.env.EMAIL_SERVER_USER);
    
    if (process.env.NODE_ENV === 'development') {
      // En développement, afficher l'URL de prévisualisation fournie par Ethereal
      console.log(`Email envoyé: ${info.messageId}`);
      console.log(`Aperçu de l'email: ${nodemailer.getTestMessageUrl(info)}`);
    }
    
    return info;
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    console.error('Détails de configuration:');
    console.error('Host:', process.env.EMAIL_SERVER_HOST);
    console.error('Port:', process.env.EMAIL_SERVER_PORT);
    console.error('User:', process.env.EMAIL_SERVER_USER);
    console.error('From:', payload.from || defaultFrom);
    console.error('To:', payload.to);
    throw error;
  }
};

// Types pour les templates d'emails
interface EmailTemplate {
  subject: string;
  html: string;
}

// Modèles d'emails
export const EmailTemplates = {
  // Template pour la confirmation d'inscription
  welcomeEmail: (username: string): EmailTemplate => ({
    subject: 'Bienvenue sur Revolis',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h1 style="color: #333;">Bienvenue sur Revolis, ${username} !</h1>
        <p>Nous sommes ravis de vous compter parmi nos utilisateurs.</p>
        <p>Avec Revolis, vous pouvez gérer vos projets personnels et professionnels en toute simplicité.</p>
        <div style="margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Commencer à utiliser Revolis
          </a>
        </div>
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        <p>L'équipe Revolis</p>
      </div>
    `
  }),

  // Template pour la réinitialisation de mot de passe
  resetPasswordEmail: (username: string, resetLink: string): EmailTemplate => ({
    subject: 'Réinitialisation de votre mot de passe Revolis',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h1 style="color: #333;">Réinitialisation de mot de passe</h1>
        <p>Bonjour ${username},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe Revolis.</p>
        <p>Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe :</p>
        <div style="margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Réinitialiser mon mot de passe
          </a>
        </div>
        <p>Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.</p>
        <p>L'équipe Revolis</p>
      </div>
    `
  }),
  
  // Template pour la notification
  notificationEmail: (username: string, message: string, actionLink?: string, actionText?: string): EmailTemplate => ({
    subject: 'Notification Revolis',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h1 style="color: #333;">Notification</h1>
        <p>Bonjour ${username},</p>
        <p>${message}</p>
        ${actionLink && actionText ? `
        <div style="margin: 30px 0;">
          <a href="${actionLink}" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            ${actionText}
          </a>
        </div>
        ` : ''}
        <p>L'équipe Revolis</p>
      </div>
    `
  })
}; 