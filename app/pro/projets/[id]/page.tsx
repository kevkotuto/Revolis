'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Calendar, Clock, Users, CheckSquare, BadgeDollarSign, FileText, Receipt, Pencil } from 'lucide-react';

// Import des composants UI
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead,
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

// Types
import { Project } from '@/types';

const statusLabels: Record<string, string> = {
  'PENDING_VALIDATION': 'En attente',
  'IN_PROGRESS': 'En cours',
  'COMPLETED': 'Terminé',
  'PUBLISHED': 'Publié',
  'FUTURE': 'À venir',
  'PERSONAL': 'Personnel'
};

const statusColors: Record<string, string> = {
  'PENDING_VALIDATION': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'IN_PROGRESS': 'bg-blue-100 text-blue-800 border-blue-200',
  'COMPLETED': 'bg-green-100 text-green-800 border-green-200',
  'PUBLISHED': 'bg-purple-100 text-purple-800 border-purple-200',
  'FUTURE': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'PERSONAL': 'bg-gray-100 text-gray-800 border-gray-200'
};

const taskStatusColors: Record<string, string> = {
  'TODO': 'bg-gray-100 text-gray-800',
  'IN_PROGRESS': 'bg-blue-100 text-blue-800',
  'DONE': 'bg-green-100 text-green-800'
};

const taskPriorityColors: Record<string, string> = {
  'LOW': 'bg-green-50 text-green-700',
  'MEDIUM': 'bg-blue-50 text-blue-700',
  'HIGH': 'bg-orange-50 text-orange-700',
  'URGENT': 'bg-red-50 text-red-700'
};

const paymentStatusColors: Record<string, string> = {
  'PENDING': 'bg-yellow-100 text-yellow-800',
  'PARTIAL': 'bg-blue-100 text-blue-800',
  'COMPLETE': 'bg-green-100 text-green-800',
  'REFUNDED': 'bg-purple-100 text-purple-800',
  'CANCELLED': 'bg-red-100 text-red-800'
};

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  // Effet pour charger les détails du projet
  useEffect(() => {
    const fetchProjectDetails = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/projects/${projectId}`);
        if (!response.ok) {
          throw new Error('Erreur lors de la récupération des détails du projet');
        }
        const data = await response.json();
        setProject(data);
      } catch (error) {
        console.error('Erreur:', error);
        toast.error("Impossible de charger les détails du projet");
      } finally {
        setIsLoading(false);
      }
    };

    if (status === 'authenticated' && projectId) {
      fetchProjectDetails();
    }
  }, [projectId, status]);

  // Formater la date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Non définie';
    return format(new Date(dateString), 'dd MMMM yyyy', { locale: fr });
  };

  // Calculer le progrès des tâches
  const calculateTaskProgress = () => {
    if (!project?.tasks || project.tasks.length === 0) return 0;
    const completedTasks = project.tasks.filter(task => task.status === 'DONE').length;
    return Math.round((completedTasks / project.tasks.length) * 100);
  };

  // Calculer le progrès des paiements
  const calculatePaymentProgress = () => {
    if (!project?.totalPrice || !project.payments || project.payments.length === 0) return 0;
    const totalPaid = project.payments
      .filter(payment => payment.paymentStatus !== 'CANCELLED' && payment.paymentStatus !== 'REFUNDED')
      .reduce((sum, payment) => sum + payment.amount, 0);
    return Math.min(Math.round((totalPaid / project.totalPrice) * 100), 100);
  };

  // Navigation vers la modification du projet
  const handleEditProject = () => {
    router.push(`/pro/projets/${projectId}/modifier`);
  };

  // Navigation vers la liste de projets
  const handleBackToProjects = () => {
    router.push('/pro/projets');
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Skeleton className="h-9 w-64" />
        </div>

        <div className="space-y-4">
          <Skeleton className="h-56 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
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
        <Button onClick={handleBackToProjects}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux projets
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBackToProjects}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold line-clamp-1">{project.name}</h1>
          <Badge className={`${statusColors[project.status]} border px-2 py-1`}>
            {statusLabels[project.status]}
          </Badge>
        </div>
        
        <Button onClick={handleEditProject}>
          <Pencil className="mr-2 h-4 w-4" />
          Modifier
        </Button>
      </div>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="tasks">Tâches</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        
        {/* Vue d'ensemble */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Calendar className="mr-2 h-5 w-5 text-gray-500" />
                  Calendrier
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Date de début:</span>
                    <span className="font-medium">{formatDate(project.startDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Date de fin prévue:</span>
                    <span className="font-medium">{formatDate(project.endDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Créé le:</span>
                    <span className="font-medium">{formatDate(project.createdAt)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <CheckSquare className="mr-2 h-5 w-5 text-gray-500" />
                  Tâches
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Progression:</span>
                    <span className="font-medium">{calculateTaskProgress()}%</span>
                  </div>
                  <Progress value={calculateTaskProgress()} className="h-2" />
                  <div className="flex justify-between text-sm">
                    <span>{project.tasks.filter(t => t.status === 'DONE').length} terminées</span>
                    <span>{project.tasks.length} total</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setActiveTab('tasks')}>
                  Voir les tâches
                </Button>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <BadgeDollarSign className="mr-2 h-5 w-5 text-gray-500" />
                  Finance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Budget total:</span>
                    <span className="font-medium">{project.totalPrice?.toLocaleString()} {project.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Paiements reçus:</span>
                    <span className="font-medium">
                      {project.payments
                        .filter(p => p.paymentStatus !== 'CANCELLED' && p.paymentStatus !== 'REFUNDED')
                        .reduce((sum, p) => sum + p.amount, 0).toLocaleString()} {project.currency}
                    </span>
                  </div>
                  <Progress value={calculatePaymentProgress()} className="h-2" />
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setActiveTab('finance')}>
                  Gérer les finances
                </Button>
              </CardFooter>
            </Card>
          </div>
          
          {/* Description du projet */}
          {project.description && (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line">{project.description}</p>
              </CardContent>
            </Card>
          )}
          
          {/* Client et Prestataires */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Building2 className="mr-2 h-5 w-5 text-gray-500" />
                  Client
                </CardTitle>
              </CardHeader>
              <CardContent>
                {project.client ? (
                  <div className="space-y-3">
                    <div className="text-xl font-medium">{project.client.name}</div>
                    {project.client.email && (
                      <div className="text-sm text-gray-600">{project.client.email}</div>
                    )}
                    <Button variant="outline" size="sm" onClick={() => router.push(`/pro/clients/${project.client?.id}`)}>
                      Voir le profil
                    </Button>
                  </div>
                ) : (
                  <div className="text-gray-500">Aucun client associé à ce projet</div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center">
                  <Users className="mr-2 h-5 w-5 text-gray-500" />
                  Prestataires
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => router.push(`/pro/projets/${project.id}/prestataires`)}>
                  Gérer
                </Button>
              </CardHeader>
              <CardContent>
                {project.projectPrestataires.length > 0 ? (
                  <div className="space-y-3">
                    {project.projectPrestataires.map((pp) => (
                      <div key={pp.id} className="flex justify-between items-center pb-2 border-b border-gray-100">
                        <div>
                          <div className="font-medium">{pp.prestataire.name}</div>
                          {pp.role && <div className="text-sm text-gray-500">{pp.role}</div>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/pro/prestataires/${pp.prestataire.id}`)}>
                          Détails
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500">Aucun prestataire associé à ce projet</div>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Parties du projet */}
          {project.projectParts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Parties du projet</CardTitle>
                <CardDescription>
                  Parties qui composent ce projet et leurs budgets
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {project.projectParts.map((part) => (
                    <div key={part.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <div className="font-medium">{part.name}</div>
                        {part.description && <div className="text-sm text-gray-500">{part.description}</div>}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-semibold">{part.price} {project.currency}</div>
                        <Badge variant={part.completed ? "secondary" : "outline"}>
                          {part.completed ? 'Complété' : 'En cours'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Activité récente */}
          <Card>
            <CardHeader>
              <CardTitle>Activité récente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-gray-500 text-center py-4">
                Fonctionnalité à venir
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Tâches */}
        <TabsContent value="tasks" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Tâches du projet</CardTitle>
              <Button onClick={() => router.push(`/pro/projets/${project.id}/taches/nouvelle`)}>
                Nouvelle tâche
              </Button>
            </CardHeader>
            <CardContent>
              {project.tasks.length > 0 ? (
                <ScrollArea className="h-[calc(100vh-300px)]">
                  <div className="space-y-3">
                    {project.tasks.map((task) => (
                      <div 
                        key={task.id} 
                        className="p-4 border rounded-md hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/pro/projets/${project.id}/taches/${task.id}`)}
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="font-medium">{task.title}</div>
                            {task.description && (
                              <div className="text-sm text-gray-500 line-clamp-2">{task.description}</div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Badge className={taskStatusColors[task.status]}>
                              {task.status === 'TODO' ? 'À faire' : task.status === 'IN_PROGRESS' ? 'En cours' : 'Terminée'}
                            </Badge>
                            <Badge className={taskPriorityColors[task.priority]}>
                              {task.priority === 'LOW' ? 'Basse' : task.priority === 'MEDIUM' ? 'Moyenne' : task.priority === 'HIGH' ? 'Haute' : 'Urgente'}
                            </Badge>
                          </div>
                        </div>
                        {task.dueDate && (
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Calendar className="mr-1 h-4 w-4" />
                            <span>Échéance: {formatDate(task.dueDate)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-12 space-y-4">
                  <CheckSquare className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="text-xl font-semibold">Aucune tâche</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    Ce projet n'a pas encore de tâches. Commencez par créer une tâche pour organiser votre travail.
                  </p>
                  <Button onClick={() => router.push(`/pro/projets/${project.id}/taches/nouvelle`)}>
                    Créer une tâche
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Finance */}
        <TabsContent value="finance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-green-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <BadgeDollarSign className="mr-2 h-5 w-5 text-green-600" />
                  Total reçu
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-700">
                  {project.payments
                    .filter(p => p.paymentType === 'CLIENT' && p.paymentStatus !== 'CANCELLED' && p.paymentStatus !== 'REFUNDED')
                    .reduce((sum, p) => sum + p.amount, 0).toLocaleString()} {project.currency}
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-red-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <BadgeDollarSign className="mr-2 h-5 w-5 text-red-600" />
                  Total payé
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-700">
                  {project.payments
                    .filter(p => p.paymentType === 'PRESTATAIRE' && p.paymentStatus !== 'CANCELLED' && p.paymentStatus !== 'REFUNDED')
                    .reduce((sum, p) => sum + p.amount, 0).toLocaleString()} {project.currency}
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-blue-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <BadgeDollarSign className="mr-2 h-5 w-5 text-blue-600" />
                  Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-700">
                  {(project.payments
                    .filter(p => p.paymentType === 'CLIENT' && p.paymentStatus !== 'CANCELLED' && p.paymentStatus !== 'REFUNDED')
                    .reduce((sum, p) => sum + p.amount, 0) - 
                    project.payments
                    .filter(p => p.paymentType === 'PRESTATAIRE' && p.paymentStatus !== 'CANCELLED' && p.paymentStatus !== 'REFUNDED')
                    .reduce((sum, p) => sum + p.amount, 0)).toLocaleString()} {project.currency}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Paiements</CardTitle>
              <Button onClick={() => router.push(`/pro/projets/${project.id}/paiements/nouveau`)}>
                Ajouter un paiement
              </Button>
            </CardHeader>
            <CardContent>
              {project.payments.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Montant</TableHead>
                          <TableHead className="text-center">Statut</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {project.payments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {formatDate(payment.date)}
                            </TableCell>
                            <TableCell className="max-w-[250px] truncate">
                              {payment.description || '-'}
                            </TableCell>
                            <TableCell>
                              {payment.paymentType === 'CLIENT' ? 'Client' : 
                               payment.paymentType === 'PRESTATAIRE' ? 'Prestataire' :
                               payment.paymentType === 'SUBSCRIPTION' ? 'Abonnement' : 'Autre'}
                            </TableCell>
                            <TableCell className={`text-right font-semibold
                              ${payment.paymentType === 'CLIENT' ? 'text-green-600' : 'text-red-600'}`}>
                              {payment.paymentType === 'CLIENT' ? '+' : '-'}{payment.amount.toLocaleString()} {project.currency}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={paymentStatusColors[payment.paymentStatus]}>
                                {payment.paymentStatus === 'PENDING' ? 'En attente' : 
                                 payment.paymentStatus === 'PARTIAL' ? 'Partiel' : 
                                 payment.paymentStatus === 'COMPLETE' ? 'Complet' : 
                                 payment.paymentStatus === 'REFUNDED' ? 'Remboursé' : 'Annulé'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => router.push(`/pro/projets/${project.id}/paiements/${payment.id}`)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-12 space-y-4">
                  <Receipt className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="text-xl font-semibold">Aucun paiement</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    Aucun paiement n'a encore été enregistré pour ce projet.
                  </p>
                  <Button onClick={() => router.push(`/pro/projets/${project.id}/paiements/nouveau`)}>
                    Ajouter un paiement
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Documents */}
        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Documents</CardTitle>
              <Button onClick={() => router.push(`/pro/projets/${project.id}/documents/nouveau`)}>
                Ajouter un document
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-gray-500 text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold">Fonctionnalité à venir</h3>
                <p className="text-gray-500 max-w-md mx-auto mt-2">
                  La gestion des documents sera bientôt disponible.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 