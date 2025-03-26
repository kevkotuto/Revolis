import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/prisma';
import { sendEmail, EmailTemplates } from '@/lib/services/email-service';

// Schéma de validation pour l'inscription
const signupSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  role: z.enum(['USER', 'COMPANY_ADMIN']).optional(),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  createNewCompany: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Valider les données d'entrée
    const validationResult = signupSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { message: 'Données invalides', errors: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { 
      name, 
      email, 
      password, 
      role = 'USER', 
      companyId, 
      companyName,
      createNewCompany 
    } = validationResult.data;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: 'Cet email est déjà utilisé' },
        { status: 400 }
      );
    }

    // Hashage du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    
    let newCompanyId = companyId;
    
    // Créer une nouvelle entreprise si nécessaire
    if (createNewCompany && companyName) {
      const newCompany = await prisma.company.create({
        data: {
          name: companyName,
          email,
        }
      });
      newCompanyId = newCompany.id;
    }
    
    // Création de l'utilisateur
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role,
        companyId: newCompanyId,
      },
    });

    // Ne pas renvoyer le mot de passe dans la réponse
    const { password: _, ...userWithoutPassword } = user;

    // Envoyer un email de bienvenue
    try {
      const welcomeTemplate = EmailTemplates.welcomeEmail(user.name || 'utilisateur');
      await sendEmail({
        to: user.email,
        subject: welcomeTemplate.subject,
        html: welcomeTemplate.html
      });
    } catch (emailError) {
      // Log l'erreur mais ne pas échouer l'inscription si l'email échoue
      console.error('Erreur lors de l\'envoi de l\'email de bienvenue:', emailError);
    }

    return NextResponse.json(
      { message: 'Utilisateur créé avec succès', user: userWithoutPassword },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    return NextResponse.json(
      { message: 'Une erreur est survenue lors de l\'inscription' },
      { status: 500 }
    );
  }
} 