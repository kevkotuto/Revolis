'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Search, Plus, Briefcase, Calendar, Clock, Check, RefreshCcw, Users, FileText, Receipt, CreditCard, Filter, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

// Import des composants UI
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Types
interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  totalPrice: number | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
  
  client: {
    id: string;
    name: string;
    email: string | null;
  } | null;
  
  user: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  
  projectPrestataires: {
    id: string;
    role: string | null;
    prestataire: {
      id: string;
      name: string;
    };
  }[];
  
  _count: {
    tasks: number;
    payments: number;
    devis: number;
    contrats: number;
    projectParts: number;
  };
}

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

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  
  // Liste des clients uniques pour le filtre
  const [clients, setClients] = useState<{id: string, name: string}[]>([]);

  // Effet pour charger les projets au chargement de la page
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/projects');
        if (!response.ok) {
          throw new Error('Erreur lors de la récupération des projets');
        }
        const data = await response.json();
        setProjects(data);
        
        // Extraire les clients uniques pour le filtre
        const uniqueClients = data.reduce((acc: {id: string, name: string}[], project: Project) => {
          if (project.client && !acc.some(c => c.id === project.client?.id)) {
            acc.push({
              id: project.client.id,
              name: project.client.name
            });
          }
          return acc;
        }, []);
        
        setClients(uniqueClients);
      } catch (error) {
        console.error('Erreur:', error);
        toast.error("Impossible de charger les projets");
      } finally {
        setIsLoading(false);
      }
    };

    if (status === 'authenticated') {
      fetchProjects();
    }
  }, [status]);

  // Effet pour filtrer les projets
  useEffect(() => {
    if (projects.length === 0) {
      setFilteredProjects([]);
      return;
    }

    let filtered = [...projects];

    // Filtre par recherche
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(project => 
        project.name.toLowerCase().includes(term) || 
        (project.description && project.description.toLowerCase().includes(term)) ||
        (project.client && project.client.name.toLowerCase().includes(term))
      );
    }

    // Filtre par statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(project => project.status === statusFilter);
    }

    // Filtre par client
    if (clientFilter !== 'all') {
      filtered = filtered.filter(project => project.client?.id === clientFilter);
    }

    // Filtre par onglet
    if (activeTab === 'inProgress') {
      filtered = filtered.filter(project => project.status === 'IN_PROGRESS');
    } else if (activeTab === 'upcoming') {
      filtered = filtered.filter(project => project.status === 'FUTURE' || project.status === 'PENDING_VALIDATION');
    } else if (activeTab === 'completed') {
      filtered = filtered.filter(project => project.status === 'COMPLETED' || project.status === 'PUBLISHED');
    }

    setFilteredProjects(filtered);
  }, [searchTerm, statusFilter, clientFilter, projects, activeTab]);

  // Fonction pour naviguer vers la création d'un projet
  const handleAddProject = () => {
    router.push('/pro/projets/nouveau');
  };

  // Fonction pour naviguer vers les détails d'un projet
  const handleViewProject = (id: string) => {
    router.push(`/pro/projets/${id}`);
  };

  // Formater la date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Non définie';
    return format(new Date(dateString), 'dd MMM yyyy', { locale: fr });
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-t-2 border-blue-500 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold">Projets</h1>
        <Button onClick={handleAddProject}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau projet
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Projets En Cours</CardTitle>
            <CardDescription>Projets actuellement actifs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                projects.filter(p => p.status === 'IN_PROGRESS').length
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-yellow-50 border-yellow-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">En Attente</CardTitle>
            <CardDescription>Validation en attente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                projects.filter(p => p.status === 'PENDING_VALIDATION').length
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-green-50 border-green-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Terminés</CardTitle>
            <CardDescription>Projets complétés</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                projects.filter(p => p.status === 'COMPLETED').length
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-purple-50 border-purple-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total</CardTitle>
            <CardDescription>Tous les projets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                projects.length
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher un projet..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="PENDING_VALIDATION">En attente</SelectItem>
              <SelectItem value="IN_PROGRESS">En cours</SelectItem>
              <SelectItem value="COMPLETED">Terminé</SelectItem>
              <SelectItem value="PUBLISHED">Publié</SelectItem>
              <SelectItem value="FUTURE">À venir</SelectItem>
              <SelectItem value="PERSONAL">Personnel</SelectItem>
            </SelectContent>
          </Select>
          
          {clients.length > 0 && (
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les clients</SelectItem>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">Tous</TabsTrigger>
          <TabsTrigger value="inProgress">En cours</TabsTrigger>
          <TabsTrigger value="upcoming">À venir</TabsTrigger>
          <TabsTrigger value="completed">Terminés</TabsTrigger>
        </TabsList>
        
        <TabsContent value={activeTab} className="mt-0">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i} className="h-64">
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                  <CardFooter>
                    <Skeleton className="h-8 w-full" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 space-y-4">
              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full">
                <Briefcase className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold">Aucun projet trouvé</h3>
              <p className="text-gray-500 max-w-md">
                {searchTerm || statusFilter !== 'all' || clientFilter !== 'all'
                  ? "Aucun projet ne correspond à vos critères de recherche."
                  : "Commencez par créer votre premier projet en cliquant sur le bouton ci-dessus."}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((project, index) => (
                  <div
                    key={project.id}
                    className="animate-list-item-appear transition-card"
                    style={{ animationDelay: `${index * 0.05}s` }}
                    onClick={() => handleViewProject(project.id)}
                  >
                    <Card className="cursor-pointer hover:shadow-md h-full">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-xl line-clamp-1">{project.name}</CardTitle>
                            <CardDescription className="line-clamp-1">
                              {project.client ? project.client.name : "Aucun client"}
                            </CardDescription>
                          </div>
                          <Badge className={`${statusColors[project.status]} border px-2 py-1`}>
                            {statusLabels[project.status]}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-3 space-y-3">
                        {project.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {project.description}
                          </p>
                        )}
                        
                        <div className="flex flex-wrap gap-y-2 gap-x-4 text-sm">
                          {project.startDate && (
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                              <span>Début: {formatDate(project.startDate)}</span>
                            </div>
                          )}
                          
                          {project.endDate && (
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-2 text-gray-500" />
                              <span>Fin: {formatDate(project.endDate)}</span>
                            </div>
                          )}
                          
                          {project.totalPrice !== null && (
                            <div className="flex items-center">
                              <CreditCard className="h-4 w-4 mr-2 text-gray-500" />
                              <span>{project.totalPrice} {project.currency}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-2 pt-2">
                          <span className="inline-flex items-center text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                            <Check className="h-3 w-3 mr-1" /> 
                            {project._count.tasks} tâches
                          </span>
                          
                          <span className="inline-flex items-center text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                            <Users className="h-3 w-3 mr-1" /> 
                            {project.projectPrestataires.length} prestataires
                          </span>
                          
                          {project._count.devis > 0 && (
                            <span className="inline-flex items-center text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded">
                              <FileText className="h-3 w-3 mr-1" /> 
                              {project._count.devis} devis
                            </span>
                          )}
                          
                          {project._count.payments > 0 && (
                            <span className="inline-flex items-center text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded">
                              <Receipt className="h-3 w-3 mr-1" /> 
                              {project._count.payments} paiements
                            </span>
                          )}
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0">
                        <div className="w-full flex justify-between items-center">
                          <span className="text-xs text-gray-500">
                            Mis à jour: {formatDate(project.updatedAt)}
                          </span>
                          <div className="flex items-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewProject(project.id);
                              }}
                            >
                              Voir
                            </Button>
                          </div>
                        </div>
                      </CardFooter>
                    </Card>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
} 