import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { mkdir, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { z } from 'zod';
import sharp from 'sharp';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

interface UploadConfig {
  path: string;
  allowedTypes: string[];
  maxSize: number;
  processImage: boolean;
  width?: number;
  height?: number;
}

// Configuration des types d'upload autorisés et leurs chemins
const UPLOAD_CONFIG: Record<string, UploadConfig> = {
  avatar: {
    path: 'uploads/avatars',
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSize: 2 * 1024 * 1024, // 2MB
    processImage: true,
    width: 200,
    height: 200,
  },
  client: {
    path: 'uploads/clients',
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxSize: 5 * 1024 * 1024, // 5MB
    processImage: true,
    width: 800,
    height: 600,
  },
  provider: {
    path: 'uploads/providers',
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxSize: 5 * 1024 * 1024, // 5MB
    processImage: true,
    width: 800,
    height: 600,
  },
  document: {
    path: 'uploads/documents',
    allowedTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
    processImage: false,
  },
};

// Schéma de validation du type d'upload
const uploadTypeSchema = z.enum(['avatar', 'client', 'provider', 'document']);

export async function POST(request: NextRequest) {
  console.log('🔄 Début du traitement de l\'upload...');
  try {
    // Vérifier l'authentification
    console.log('🔒 Vérification de l\'authentification...');
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      console.error('❌ Authentification échouée: Aucune session utilisateur');
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    console.log(`✅ Utilisateur authentifié: ${session.user.email} (ID: ${session.user.id})`);

    // Récupérer l'ID de l'utilisateur connecté
    const userId = session.user.id;

    // Récupérer les données du formulaire
    console.log('📦 Récupération des données du formulaire...');
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;
    const relatedId = formData.get('relatedId') as string | null;
    
    console.log(`📋 Données reçues: type=${type}, relatedId=${relatedId}`);
    console.log(`📄 Fichier reçu: ${file ? `${file.name} (${file.size} octets, ${file.type})` : 'aucun'}`);

    // Valider le type d'upload
    console.log('🔍 Validation du type d\'upload...');
    const validTypeResult = uploadTypeSchema.safeParse(type);
    if (!validTypeResult.success) {
      console.error(`❌ Type d'upload invalide: ${type}`);
      return NextResponse.json(
        { error: 'Type d\'upload invalide' },
        { status: 400 }
      );
    }

    const uploadType = validTypeResult.data;
    const config = UPLOAD_CONFIG[uploadType];
    console.log(`✅ Type d'upload valide: ${uploadType}`);

    // Vérifier que le fichier existe
    if (!file) {
      console.error('❌ Aucun fichier fourni dans la requête');
      return NextResponse.json(
        { error: 'Aucun fichier fourni' },
        { status: 400 }
      );
    }

    // Vérifier le type MIME
    console.log(`🔍 Vérification du type MIME: ${file.type}`);
    if (!config.allowedTypes.includes(file.type)) {
      console.error(`❌ Type de fichier non autorisé: ${file.type}`);
      return NextResponse.json(
        { 
          error: 'Type de fichier non autorisé', 
          allowedTypes: config.allowedTypes 
        },
        { status: 400 }
      );
    }
    console.log(`✅ Type de fichier autorisé: ${file.type}`);

    // Vérifier la taille du fichier
    console.log(`🔍 Vérification de la taille du fichier: ${file.size} octets`);
    if (file.size > config.maxSize) {
      const maxSizeMB = config.maxSize / (1024 * 1024);
      console.error(`❌ Fichier trop volumineux: ${file.size} octets (max: ${config.maxSize} octets)`);
      return NextResponse.json(
        { 
          error: `La taille du fichier dépasse la limite autorisée de ${maxSizeMB}MB` 
        },
        { status: 400 }
      );
    }
    console.log(`✅ Taille de fichier valide: ${file.size} octets`);

    // Créer un nom de fichier unique
    const fileExtension = extname(file.name);
    const fileName = `${uuidv4()}${fileExtension}`;
    const relativePath = `${config.path}/${fileName}`;
    const publicPath = `/uploads/${uploadType}s/${fileName}`;
    console.log(`📝 Nom de fichier généré: ${fileName}`);
    console.log(`📁 Chemin relatif: ${relativePath}`);
    console.log(`🌐 URL publique: ${publicPath}`);

    // Créer le répertoire d'upload si nécessaire
    const uploadDir = join(process.cwd(), 'public', config.path);
    console.log(`📂 Création du répertoire d'upload: ${uploadDir}`);
    try {
      await mkdir(uploadDir, { recursive: true });
      console.log(`✅ Répertoire créé ou existant: ${uploadDir}`);
    } catch (dirError) {
      console.error(`❌ Erreur lors de la création du répertoire: ${dirError}`);
      throw dirError;
    }

    // Chemin complet du fichier
    const filePath = join(uploadDir, fileName);
    console.log(`📄 Chemin complet du fichier: ${filePath}`);

    // Traiter l'image si nécessaire
    if (config.processImage && file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
      console.log('🖼️ Traitement de l\'image avec Sharp...');
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        console.log(`✅ Buffer créé: ${buffer.length} octets`);
        
        let sharpInstance = sharp(buffer);
        
        // Redimensionner l'image si les dimensions sont spécifiées
        if (config.width && config.height) {
          const width = config.width as number;
          const height = config.height as number;
          console.log(`🔄 Redimensionnement de l'image à ${width}x${height}`);
          sharpInstance = sharpInstance.resize(width, height, {
            fit: 'cover',
            position: 'centre'
          });
        }
        
        // Convertir en WebP pour une meilleure compression (sauf pour les avatars qui restent au format original)
        if (uploadType !== 'avatar') {
          console.log('🔄 Conversion en WebP...');
          await sharpInstance.webp({ quality: 80 }).toFile(filePath.replace(fileExtension, '.webp'));
          console.log(`✅ Image convertie et enregistrée: ${filePath.replace(fileExtension, '.webp')}`);
        } else {
          console.log(`🔄 Enregistrement de l'image au format original...`);
          await sharpInstance.toFile(filePath);
          console.log(`✅ Image enregistrée: ${filePath}`);
        }
      } catch (sharpError) {
        console.error(`❌ Erreur lors du traitement de l'image: ${sharpError}`);
        throw sharpError;
      }
    } else {
      // Enregistrer le fichier tel quel pour les autres types
      console.log('📄 Enregistrement du fichier sans traitement...');
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        console.log(`✅ Buffer créé: ${buffer.length} octets`);
        await writeFile(filePath, buffer);
        console.log(`✅ Fichier enregistré: ${filePath}`);
      } catch (writeError) {
        console.error(`❌ Erreur lors de l'écriture du fichier: ${writeError}`);
        throw writeError;
      }
    }

    // Enregistrer les informations du fichier dans la base de données
    console.log('💾 Enregistrement des informations du fichier dans la base de données...');
    let upload;
    try {
      upload = await db.upload.create({
        data: {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          filePath: relativePath,
          publicUrl: publicPath,
          uploadType,
          userId,
          ...(relatedId && { relatedId }),
        }
      });
      console.log(`✅ Fichier enregistré dans la base de données, ID: ${upload.id}`);

      // Si c'est un avatar, mettre à jour l'utilisateur
      if (uploadType === 'avatar') {
        console.log(`👤 Mise à jour de l'avatar de l'utilisateur (ID: ${userId})...`);
        await db.user.update({
          where: { id: userId },
          data: { avatar: publicPath }
        });
        console.log(`✅ Avatar de l'utilisateur mis à jour: ${publicPath}`);
      }
    } catch (dbError) {
      console.error(`❌ Erreur lors de l'enregistrement dans la base de données: ${dbError}`);
      throw dbError;
    }

    console.log('✅ Upload terminé avec succès!');
    return NextResponse.json({
      success: true,
      url: publicPath,
      uploadId: upload.id,
    });

  } catch (error) {
    console.error('❌ Erreur lors de l\'upload:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors du traitement de l\'upload' },
      { status: 500 }
    );
  }
} 