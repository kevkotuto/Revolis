import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '../prisma';
import { Role } from '@prisma/client';

type PermissionOptions = {
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  resource: 'USER' | 'COMPANY' | 'CLIENT' | 'PROJECT' | 'TASK' | 'PAYMENT' | 'INVOICE' | 'PRODUCT' | 'LEAD' | 'OPPORTUNITY' | 'OTHER';
  allowSelf?: boolean; // Si true, l'utilisateur peut accéder à ses propres ressources
  resourceIdParam?: string; // Nom du paramètre d'URL contenant l'ID de la ressource
};

// Type de retour de checkPermission
type PermissionResult = {
  allowed: boolean;
  response?: NextResponse<{ error: string }>;
  user?: { id: string; companyId?: string | null };
  role?: Role;
};

export async function checkPermission(
  request: NextRequest,
  options: PermissionOptions,
  params?: { [key: string]: string }
): Promise<PermissionResult> {
  // Obtenir la session utilisateur
  const session = await getServerSession();
  
  if (!session?.user) {
    return {
      allowed: false,
      response: NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    };
  }
  
  // Récupérer les détails de l'utilisateur
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  
  if (!user) {
    return {
      allowed: false,
      response: NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 })
    };
  }
  
  // Super admin a toutes les permissions
  if (user.role === 'SUPER_ADMIN') {
    return { 
      allowed: true,
      user: { id: user.id, companyId: user.companyId },
      role: user.role
    };
  }
  
  // Vérifier si l'utilisateur agit sur sa propre ressource
  if (options.allowSelf && options.resourceIdParam && params) {
    const resourceId = params[options.resourceIdParam];
    
    if (options.resource === 'USER' && resourceId === user.id) {
      return { 
        allowed: true,
        user: { id: user.id, companyId: user.companyId },
        role: user.role
      };
    }
  }
  
  // COMPANY_ADMIN peut gérer tous les utilisateurs de sa propre entreprise
  if (user.role === 'COMPANY_ADMIN' && options.resource === 'USER' && user.companyId) {
    // Pour les actions de création, autoriser directement
    if (options.action === 'CREATE') {
      return { 
        allowed: true,
        user: { id: user.id, companyId: user.companyId },
        role: user.role
      };
    }
    
    // Pour les autres actions, vérifier si l'utilisateur cible appartient à la même entreprise
    if (options.resourceIdParam && params) {
      const targetUserId = params[options.resourceIdParam];
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { companyId: true }
      });
      
      if (targetUser && targetUser.companyId === user.companyId) {
        return { 
          allowed: true,
          user: { id: user.id, companyId: user.companyId },
          role: user.role
        };
      }
    }
  }
  
  // Vérifier les permissions spécifiques
  const hasPermission = await prisma.permission.findFirst({
    where: {
      action: options.action,
      resourceType: options.resource,
      rolePermissions: {
        some: {
          role: user.role
        }
      }
    }
  });
  
  if (hasPermission) {
    return { 
      allowed: true,
      user: { id: user.id, companyId: user.companyId },
      role: user.role
    };
  }
  
  // Journaliser la tentative d'accès non autorisée
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      companyId: user.companyId,
      action: 'ACCESS_DENIED',
      resource: options.resource,
      resourceId: options.resourceIdParam && params ? params[options.resourceIdParam] : null,
      details: JSON.stringify({
        requestedAction: options.action,
        requestUrl: request.url,
        method: request.method
      })
    }
  });
  
  return {
    allowed: false,
    response: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }),
    user: { id: user.id, companyId: user.companyId },
    role: user.role
  };
}

// Fonction pour journaliser les actions réussies
export async function logAction(
  userId: string,
  action: string,
  resource: string,
  resourceId?: string,
  details?: any
) {
  try {
    // Récupérer le companyId de l'utilisateur
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true }
    });
    
    // Créer l'entrée d'audit
    return await prisma.auditLog.create({
      data: {
        userId,
        companyId: user?.companyId,
        action,
        resource,
        resourceId,
        details: details ? JSON.stringify(details) : null
      }
    });
  } catch (error) {
    console.error('Erreur lors de la journalisation de l\'action:', error);
  }
} 