'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { ArrowLeft, Users, CheckSquare, AlertTriangle, Receipt, FileText } from 'lucide-react';

// Import des composants UI
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Project {
  id: string;
  name: string;
}

export default function ProjectSubPage({ params }: { params: Promise<{ id: string, pageType: string }> }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Utiliser les ID depuis les paramètres
  const { id: projectId, pageType } = use(params);

  // Effet pour charger les infos de base du projet
  useEffect(() => {
    const fetchProjectInfo = async () => {
      try {
        setIsLoading(true);
        // Utilisation de l'API existante - sans "/basic"
        const response = await fetch(`/api/projects/${projectId}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Erreur lors de la récupération des détails du projet');
        }
        const data = await response.json();
        // On extrait juste les informations minimales dont on a besoin
        setProject({
          id: data.id,
          name: data.name
        });
      } catch (error) {
        console.error('Erreur:', error);
        toast.error("Impossible de charger les informations du projet");
      } finally {
        setIsLoading(false);
      }
    };

    if (status === 'authenticated' && projectId) {
      fetchProjectInfo();
    }
  }, [projectId, status]);

  const handleBackToProject = () => {
    router.push(`/pro/projets/${projectId}`);
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-t-2 border-blue-500 rounded-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
        <h3 className="text-xl font-semibold">Projet non trouvé</h3>
        <p className="text-gray-500 max-w-md">
          Le projet que vous recherchez n'existe pas ou vous n'avez pas les permissions nécessaires.
        </p>
        <Button onClick={() => router.push('/pro/projets')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux projets
        </Button>
      </div>
    );
  }

  const renderPageContent = () => {
    switch(pageType) {
      case 'taches':
        return <TasksPage projectId={projectId} projectName={project.name} />;
      case 'prestataires':
        return <PrestataireManagementPage projectId={projectId} projectName={project.name} />;
      case 'paiements':
        return <PaymentsPage projectId={projectId} projectName={project.name} />;
      case 'documents':
        return <DocumentsPage projectId={projectId} projectName={project.name} />;
      default:
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
            <AlertTriangle className="h-12 w-12 text-yellow-500" />
            <h3 className="text-xl font-semibold">Page non trouvée</h3>
            <p className="text-gray-500 max-w-md">
              La page que vous recherchez n'existe pas.
            </p>
            <Button onClick={handleBackToProject}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour au projet
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBackToProject}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{getPageTitle(pageType)}</h1>
          <p className="text-gray-500">Projet: {project.name}</p>
        </div>
      </div>

      {renderPageContent()}
    </div>
  );
}

// Fonction pour obtenir le titre de la page en fonction du type
function getPageTitle(pageType: string): string {
  switch(pageType) {
    case 'taches':
      return 'Gestion des tâches';
    case 'prestataires':
      return 'Gestion des prestataires';
    case 'paiements':
      return 'Gestion des paiements';
    case 'documents':
      return 'Gestion des documents';
    default:
      return 'Détails';
  }
}

// Composant pour la gestion des tâches
function TasksPage({ projectId, projectName }: { projectId: string, projectName: string }) {
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Charger les tâches du projet (à implémenter)
    setIsLoading(false);
  }, [projectId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center">
          <CheckSquare className="mr-2 h-5 w-5 text-gray-500" />
          Tâches du projet
        </CardTitle>
        <Button onClick={() => router.push(`/pro/projets/${projectId}/taches/nouvelle`)}>
          Nouvelle tâche
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 space-y-4">
          <CheckSquare className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="text-xl font-semibold">Fonctionnalité à venir</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            La gestion des tâches sera bientôt disponible.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Composant pour la gestion des prestataires
function PrestataireManagementPage({ projectId, projectName }: { projectId: string, projectName: string }) {
  const router = useRouter();
  const [prestataires, setPrestataires] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Charger les prestataires du projet (à implémenter)
    setIsLoading(false);
  }, [projectId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center">
          <Users className="mr-2 h-5 w-5 text-gray-500" />
          Prestataires du projet
        </CardTitle>
        <Button onClick={() => router.push(`/pro/projets/${projectId}/ajouter-prestataire`)}>
          Ajouter un prestataire
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 space-y-4">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="text-xl font-semibold">Fonctionnalité à venir</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            La gestion des prestataires sera bientôt disponible.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Composant pour la gestion des paiements
function PaymentsPage({ projectId, projectName }: { projectId: string, projectName: string }) {
  const router = useRouter();
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Charger les paiements du projet (à implémenter)
    setIsLoading(false);
  }, [projectId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center">
          <Receipt className="mr-2 h-5 w-5 text-gray-500" />
          Paiements
        </CardTitle>
        <Button onClick={() => router.push(`/pro/projets/${projectId}/paiements/nouveau`)}>
          Ajouter un paiement
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 space-y-4">
          <Receipt className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="text-xl font-semibold">Fonctionnalité à venir</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            La gestion des paiements sera bientôt disponible.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Composant pour la gestion des documents
function DocumentsPage({ projectId, projectName }: { projectId: string, projectName: string }) {
  const router = useRouter();
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Charger les documents du projet (à implémenter)
    setIsLoading(false);
  }, [projectId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center">
          <FileText className="mr-2 h-5 w-5 text-gray-500" />
          Documents
        </CardTitle>
        <Button onClick={() => router.push(`/pro/projets/${projectId}/documents/ajouter`)}>
          Ajouter un document
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 space-y-4">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="text-xl font-semibold">Fonctionnalité à venir</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            La gestion des documents sera bientôt disponible.
          </p>
        </div>
      </CardContent>
    </Card>
  );
} 