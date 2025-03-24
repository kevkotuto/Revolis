import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {prisma} from '@/lib/prisma';

// GET /api/tasks
export async function GET(request: NextRequest) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const projectPartId = searchParams.get('projectPartId');
    const parentTaskId = searchParams.get('parentTaskId');

    // Construction de la requête avec filtres optionnels
    const whereClause: any = {};
    
    if (projectId) {
      whereClause.projectId = projectId;
    }
    
    if (userId) {
      whereClause.assignedToId = userId;
    }
    
    if (status) {
      whereClause.status = status;
    }
    
    if (projectPartId) {
      whereClause.projectPartId = projectPartId;
    }
    
    // Filtrer par tâches principales ou sous-tâches
    if (parentTaskId) {
      whereClause.parentTaskId = parentTaskId;
    } else if (parentTaskId === 'null') {
      // Si parentTaskId est explicitement "null", chercher les tâches principales
      whereClause.parentTaskId = null;
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        projectPart: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        parentTask: {
          select: {
            id: true,
            title: true,
          },
        },
        _count: {
          select: {
            subTasks: true,
            comments: true,
          },
        },
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Erreur lors de la récupération des tâches:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// POST /api/tasks
export async function POST(request: NextRequest) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const data = await request.json();
    
    // Validation des données
    if (!data.title || data.title.trim() === '') {
      return NextResponse.json(
        { error: 'Le titre de la tâche est requis' },
        { status: 400 }
      );
    }

    // Création de la tâche
    const taskData: any = {
      title: data.title.trim(),
      description: data.description?.trim() || null,
      status: data.status || 'TODO',
      priority: data.priority || 'MEDIUM',
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      estimatedHours: data.estimatedHours || null,
      actualHours: data.actualHours || null,
    };

    // Ajout des relations
    if (data.projectId) {
      // Vérifier que le projet existe
      const project = await prisma.project.findUnique({
        where: { id: data.projectId },
      });
      
      if (!project) {
        return NextResponse.json(
          { error: 'Projet non trouvé' },
          { status: 404 }
        );
      }
      
      taskData.project = { connect: { id: data.projectId } };
    }

    if (data.projectPartId) {
      // Vérifier que la partie du projet existe
      const projectPart = await prisma.projectPart.findUnique({
        where: { id: data.projectPartId },
      });
      
      if (!projectPart) {
        return NextResponse.json(
          { error: 'Partie du projet non trouvée' },
          { status: 404 }
        );
      }
      
      taskData.projectPart = { connect: { id: data.projectPartId } };
    }

    if (data.assignedToId) {
      // Vérifier que l'utilisateur existe
      const user = await prisma.user.findUnique({
        where: { id: data.assignedToId },
      });
      
      if (!user) {
        return NextResponse.json(
          { error: 'Utilisateur non trouvé' },
          { status: 404 }
        );
      }
      
      taskData.assignedTo = { connect: { id: data.assignedToId } };
    }

    if (data.parentTaskId) {
      // Vérifier que la tâche parente existe
      const parentTask = await prisma.task.findUnique({
        where: { id: data.parentTaskId },
      });
      
      if (!parentTask) {
        return NextResponse.json(
          { error: 'Tâche parente non trouvée' },
          { status: 404 }
        );
      }
      
      taskData.parentTask = { connect: { id: data.parentTaskId } };
      
      // Si tâche parente a un projet ou une partie, la sous-tâche les hérite
      if (parentTask.projectId && !data.projectId) {
        taskData.project = { connect: { id: parentTask.projectId } };
      }
      
      if (parentTask.projectPartId && !data.projectPartId) {
        taskData.projectPart = { connect: { id: parentTask.projectPartId } };
      }
    }

    // Créer la tâche
    const task = await prisma.task.create({
      data: taskData,
      include: {
        project: true,
        projectPart: true,
        assignedTo: true,
        parentTask: true,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Erreur lors de la création de la tâche:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
} 