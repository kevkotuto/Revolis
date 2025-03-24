/**
 * Service d'upload de fichiers
 * Utilise le serveur d'upload externe (upload.generale-ci.com)
 * ou un proxy local en cas d'échec
 */

import { FileType, UploadConfig } from '@/types';

// URL de base du service d'upload (correction: ajouter /upload au chemin)
const UPLOAD_API_URL = 'https://upload.generale-ci.com/upload';
// URL du proxy local en cas d'échec
const PROXY_API_URL = '/api/upload-proxy';

// Fonction pour générer un nom de fichier unique
const generateUniqueFileName = (originalName: string): string => {
  const timestamp = Date.now();
  const extension = originalName.split('.').pop() || '';
  // Enlever les espaces et caractères spéciaux du nom de fichier
  const cleanName = originalName
    .split('.')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
  
  return `${timestamp}-${cleanName}.${extension}`;
};

/**
 * Upload un fichier vers le serveur d'upload
 * @param file Fichier à uploader (File ou Blob)
 * @param prefix Préfixe optionnel pour le nom du fichier (ex: 'user', 'client', etc.)
 * @returns URL du fichier uploadé
 */
export async function uploadFile(file: File | Blob, prefix?: string): Promise<string> {
  console.log(`🔄 Début de l'upload avec uploadService: ${file instanceof File ? file.name : 'blob'}`);
  
  try {
    // Génère un nom de fichier unique
    const fileName = prefix 
      ? `${prefix}-${generateUniqueFileName(file instanceof File ? file.name : 'blob')}`
      : generateUniqueFileName(file instanceof File ? file.name : 'blob');
    
    console.log(`📝 Nom de fichier généré: ${fileName}`);
    
    // Création du FormData pour l'upload
    const formData = new FormData();
    // Si c'est un Blob sans nom de fichier, on en donne un
    if (file instanceof Blob && !(file instanceof File)) {
      formData.append('file', file, fileName);
    } else {
      formData.append('file', file);
    }
    
    // On essaie d'abord avec l'URL directe, puis on passe par le proxy en cas d'échec
    let response;
    let data;
    let errorMessage;
    
    // Tentative directe vers le service externe
    try {
      console.log(`📤 Tentative d'upload direct vers: ${UPLOAD_API_URL}`);
      response = await fetch(UPLOAD_API_URL, {
        method: 'POST',
        body: formData,
        mode: 'cors',
        credentials: 'same-origin',
      });
      
      console.log(`📥 Réponse reçue: status=${response.status}`);
      
      if (response.ok) {
        data = await response.json();
        console.log('✅ Données reçues (méthode directe):', data);
        
        if (data.fileUrl) {
          return data.fileUrl;
        } else {
          errorMessage = 'URL du fichier manquante dans la réponse';
        }
      } else {
        errorMessage = `Erreur HTTP ${response.status}`;
      }
    } catch (directError) {
      console.error('❌ Échec de la méthode directe:', directError);
      errorMessage = 'Échec de la connexion directe';
    }
    
    // Si la méthode directe a échoué, on essaie via le proxy local
    if (errorMessage) {
      console.log(`⚠️ La méthode directe a échoué: ${errorMessage}`);
      console.log(`🔄 Tentative via le proxy local: ${PROXY_API_URL}`);
      
      try {
        response = await fetch(PROXY_API_URL, {
          method: 'POST',
          body: formData,
        });
        
        console.log(`📥 Réponse du proxy reçue: status=${response.status}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
          console.error(`❌ Erreur du proxy: ${response.status}`, errorData);
          throw new Error(errorData.error || `Erreur lors de l'upload via le proxy: ${response.status}`);
        }
        
        data = await response.json();
        console.log('✅ Données reçues (via proxy):', data);
        
        if (!data.fileUrl) {
          console.error('❌ URL du fichier manquante dans la réponse du proxy:', data);
          throw new Error('URL du fichier manquante dans la réponse du proxy');
        }
        
        return data.fileUrl;
      } catch (proxyError) {
        console.error('❌ Échec de la méthode via proxy:', proxyError);
        throw new Error('Toutes les tentatives d\'upload ont échoué. Veuillez réessayer plus tard.');
      }
    }
    
    // Si on arrive ici, c'est qu'il y a eu un problème
    throw new Error(errorMessage || 'Erreur inconnue lors de l\'upload');
  } catch (error) {
    console.error('❌ Erreur d\'upload:', error);
    throw new Error('Le téléchargement du fichier a échoué: ' + (error instanceof Error ? error.message : 'Erreur inconnue'));
  }
}

/**
 * Upload plusieurs fichiers vers le serveur d'upload
 * @param files Tableau de fichiers à uploader
 * @param prefix Préfixe optionnel pour le nom des fichiers
 * @returns Tableau d'URLs des fichiers uploadés
 */
export async function uploadMultipleFiles(files: (File | Blob)[], prefix?: string): Promise<string[]> {
  try {
    const uploadPromises = files.map(file => uploadFile(file, prefix));
    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error('Erreur lors de l\'upload multiple:', error);
    throw new Error('Le téléchargement des fichiers a échoué');
  }
}

/**
 * Extraire le nom du fichier à partir de l'URL
 * @param url URL du fichier uploadé
 * @returns Nom du fichier
 */
export function getFileNameFromUrl(url: string): string {
  const urlParts = url.split('/');
  return urlParts[urlParts.length - 1];
}

/**
 * Vérifier si une URL est une image
 * @param url URL à vérifier
 * @returns true si c'est une image, false sinon
 */
export function isImageUrl(url: string): boolean {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
  const extension = url.split('.').pop()?.toLowerCase() || '';
  return imageExtensions.includes(extension);
}

/**
 * Vérifier si une URL est un PDF
 * @param url URL à vérifier
 * @returns true si c'est un PDF, false sinon
 */
export function isPdfUrl(url: string): boolean {
  return url.toLowerCase().endsWith('.pdf');
}

/**
 * Obtenir le type de fichier à partir de l'URL
 * @param url URL du fichier
 * @returns Type de fichier (image, pdf, document, autre)
 */
export function getFileType(url: string): FileType {
  if (isImageUrl(url)) return 'image';
  if (isPdfUrl(url)) return 'pdf';
  
  const docExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
  const extension = url.split('.').pop()?.toLowerCase() || '';
  
  if (docExtensions.includes(extension)) return 'document';
  return 'other';
} 