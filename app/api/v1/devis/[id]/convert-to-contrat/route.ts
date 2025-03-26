import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { checkPermission, logAction } from '../../../../../../lib/middleware/permissions';

// POST - Convertir un devis en contrat
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier les permissions
    const permissionCheck = await checkPermission(request, {
      action: 'CREATE',
      resource: 'PROJECT'
    });
    
    if (!permissionCheck.allowed) {
      return permissionCheck.response;
    }

    const devisId = params.id;
    
    // Récupérer le devis
    const devis = await prisma.devis.findUnique({
      where: { id: devisId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            companyId: true
          }
        }
      }
    });
    
    if (!devis) {
      return NextResponse.json(
        { error: "Devis non trouvé" },
        { status: 404 }
      );
    }
    
    // Vérifier que le devis a un projet associé
    if (!devis.projectId) {
      return NextResponse.json(
        { error: "Ce devis n'est pas associé à un projet" },
        { status: 400 }
      );
    }
    
    // Vérifier que l'utilisateur a le droit de créer un contrat pour ce projet
    if (permissionCheck.role === 'COMPANY_ADMIN' && 
        permissionCheck.user?.companyId !== devis.project?.companyId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour créer un contrat pour ce projet" },
        { status: 403 }
      );
    }
    
    // Extraire les données de la requête (optionnel)
    const data = await request.json().catch(() => ({}));
    
    // Créer le contrat
    const contrat = await prisma.contrat.create({
      data: {
        title: data.title || `Contrat - ${devis.reference}`,
        content: data.content || `Contrat basé sur le devis ${devis.reference}`,
        status: "DRAFT",
        projectId: devis.projectId
      }
    });
    
    // Mettre à jour le devis si nécessaire (marquer comme converti)
    if (data.updateDevisStatus) {
      await prisma.devis.update({
        where: { id: devisId },
        data: {
          status: "ACCEPTED"
        }
      });
    }
    
    // Journaliser l'action
    await logAction(
      permissionCheck.user!.id,
      'CREATE',
      'PROJECT',
      contrat.id,
      { 
        action: "Conversion d'un devis en contrat",
        devisId: devisId,
        projectId: devis.projectId
      }
    );
    
    return NextResponse.json(contrat, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la conversion du devis en contrat:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la conversion du devis en contrat' },
      { status: 500 }
    );
  }
} 