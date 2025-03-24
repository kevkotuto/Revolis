import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Plus, Search, Filter, Calendar, CheckSquare, Edit2, Trash2, ChevronDown, ChevronRight, 
  AlertTriangle, CalendarIcon 
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

// Import des composants UI
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle, DialogTrigger 
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { Task as ProjectTask } from '@/types';

// Types pour les tâches
interface Subtask {
  id?: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date | null;
  estimatedHours?: number | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  estimatedHours: number | null;
  subtasks?: Subtask[];
  projectId: string;
}

interface TaskManagementProps {
  projectId: string;
  initialTasks: ProjectTask[];
}

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

export function TaskManagement({ projectId, initialTasks }: TaskManagementProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks.map(task => ({
    ...task,
    projectId: projectId,
    estimatedHours: task.estimatedHours || null
  })));
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'TODO' as TaskStatus,
    priority: 'MEDIUM' as TaskPriority,
    dueDate: null as Date | null,
    estimatedHours: '',
  });

  // Fonction pour filtrer les tâches
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || task.status === statusFilter;
    const matchesPriority = priorityFilter === 'ALL' || task.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Fonction pour créer une nouvelle tâche
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          projectId: projectId,
          estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : null,
          subtasks: subtasks.map(subtask => ({
            title: subtask.title,
            description: subtask.description,
            status: subtask.status,
            priority: subtask.priority,
            dueDate: subtask.dueDate,
            estimatedHours: subtask.estimatedHours,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la création de la tâche');
      }

      const newTask = await response.json();
      setTasks(prev => [...prev, newTask]);
      toast.success('Tâche créée avec succès');
      resetForm();
      setIsTaskDialogOpen(false);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la création de la tâche');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour mettre à jour une tâche
  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTask) return;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/${currentTask.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : null,
          subtasks: subtasks.map(subtask => ({
            id: subtask.id,
            title: subtask.title,
            description: subtask.description,
            status: subtask.status,
            priority: subtask.priority,
            dueDate: subtask.dueDate,
            estimatedHours: subtask.estimatedHours,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour de la tâche');
      }

      const updatedTask = await response.json();
      setTasks(prev => prev.map(task => task.id === currentTask.id ? updatedTask : task));
      toast.success('Tâche mise à jour avec succès');
      resetForm();
      setIsTaskDialogOpen(false);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la mise à jour de la tâche');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour supprimer une tâche
  const handleDeleteTask = async () => {
    if (!currentTask) return;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/${currentTask.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression de la tâche');
      }

      setTasks(prev => prev.filter(task => task.id !== currentTask.id));
      toast.success('Tâche supprimée avec succès');
      setIsDeleteDialogOpen(false);
      setCurrentTask(null);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la suppression de la tâche');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour mettre à jour le statut d'une tâche rapidement
  const handleQuickStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour du statut');
      }

      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, status: newStatus } : task
      ));
      toast.success('Statut mis à jour');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la mise à jour du statut');
    }
  };

  // Fonction pour réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      status: 'TODO' as TaskStatus,
      priority: 'MEDIUM' as TaskPriority,
      dueDate: null,
      estimatedHours: '',
    });
    setSubtasks([]);
    setCurrentTask(null);
  };

  // Fonction pour ouvrir le dialogue de création de tâche
  const openCreateTaskDialog = () => {
    resetForm();
    setIsTaskDialogOpen(true);
  };

  // Fonction pour ouvrir le dialogue d'édition de tâche
  const openEditTaskDialog = (task: Task) => {
    setCurrentTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      estimatedHours: task.estimatedHours ? task.estimatedHours.toString() : '',
    });
    setSubtasks(task.subtasks || []);
    setIsTaskDialogOpen(true);
  };

  // Fonction pour ouvrir le dialogue de suppression de tâche
  const openDeleteTaskDialog = (task: Task) => {
    setCurrentTask(task);
    setIsDeleteDialogOpen(true);
  };

  // Fonction pour ajouter une sous-tâche
  const handleAddSubtask = () => {
    setSubtasks([
      ...subtasks,
      {
        title: '',
        description: '',
        status: 'TODO' as TaskStatus,
        priority: 'MEDIUM' as TaskPriority,
        dueDate: null,
        estimatedHours: null,
      },
    ]);
  };

  // Fonction pour modifier une sous-tâche
  const handleEditSubtask = (index: number, data: Partial<Subtask>) => {
    setSubtasks(prev => 
      prev.map((subtask, i) => 
        i === index ? { ...subtask, ...data } : subtask
      )
    );
  };

  // Fonction pour supprimer une sous-tâche
  const handleDeleteSubtask = (index: number) => {
    setSubtasks(prev => prev.filter((_, i) => i !== index));
  };

  // Fonction pour basculer l'expansion d'une tâche
  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  // Formatage des dates
  const formatDate = (date: Date | string | null) => {
    if (!date) return '';
    return format(new Date(date), 'dd MMM yyyy', { locale: fr });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher une tâche..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2 flex-wrap md:flex-nowrap">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TaskStatus | 'ALL')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="TODO">À faire</SelectItem>
              <SelectItem value="IN_PROGRESS">En cours</SelectItem>
              <SelectItem value="DONE">Terminé</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as TaskPriority | 'ALL')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priorité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes les priorités</SelectItem>
              <SelectItem value="LOW">Basse</SelectItem>
              <SelectItem value="MEDIUM">Moyenne</SelectItem>
              <SelectItem value="HIGH">Haute</SelectItem>
              <SelectItem value="URGENT">Urgente</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={openCreateTaskDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle tâche
          </Button>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-12 space-y-4">
          <CheckSquare className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="text-xl font-semibold">Aucune tâche trouvée</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            {tasks.length === 0
              ? "Ce projet n'a pas encore de tâches. Commencez par créer une tâche pour organiser votre travail."
              : "Aucune tâche ne correspond à vos critères de recherche."}
          </p>
          <Button onClick={openCreateTaskDialog}>
            Créer une tâche
          </Button>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-300px)]">
          <div className="space-y-3">
            {filteredTasks.map((task, index) => (
              <div
                key={task.id}
                className="border rounded-lg overflow-hidden transition-all duration-200 hover:shadow animate-list-item-appear"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors duration-200"
                  onClick={() => toggleTaskExpansion(task.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {task.subtasks && task.subtasks.length > 0 ? (
                        expandedTasks.includes(task.id) ? (
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-400" />
                        )
                      ) : (
                        <div className="w-5" />
                      )}
                      <div className="flex-1">
                        <h3 className="font-medium">{task.title}</h3>
                        {task.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex items-center space-x-2 mt-2">
                          <div className="flex items-center space-x-2">
                            <Select
                              value={task.status}
                              onValueChange={(value) => {
                                handleQuickStatusChange(task.id, value as TaskStatus);
                              }}
                              onOpenChange={(open) => {
                                if (open) {
                                  // Empêcher la propagation du clic pour éviter d'ouvrir/fermer la tâche
                                  event?.stopPropagation();
                                }
                              }}
                            >
                              <SelectTrigger className={`h-7 px-2 text-xs ${taskStatusColors[task.status]}`}>
                                <SelectValue>
                                  {task.status === 'TODO' ? 'À faire' : 
                                   task.status === 'IN_PROGRESS' ? 'En cours' : 'Terminée'}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent onClick={(e) => e.stopPropagation()}>
                                <SelectItem value="TODO">À faire</SelectItem>
                                <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                                <SelectItem value="DONE">Terminé</SelectItem>
                              </SelectContent>
                            </Select>
                            <Badge className={taskPriorityColors[task.priority]}>
                              {task.priority === 'LOW' ? 'Basse' : 
                               task.priority === 'MEDIUM' ? 'Moyenne' : 
                               task.priority === 'HIGH' ? 'Haute' : 'Urgente'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {task.dueDate && (
                        <div className="hidden md:flex items-center text-sm text-gray-500 mr-4">
                          <Calendar className="h-4 w-4 mr-1" />
                          <span>{formatDate(task.dueDate)}</span>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditTaskDialog(task);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteTaskDialog(task);
                        }}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500 md:hidden">
                    {task.dueDate && (
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span>{formatDate(task.dueDate)}</span>
                      </div>
                    )}
                    {task.estimatedHours && (
                      <span>{task.estimatedHours}h estimées</span>
                    )}
                  </div>
                </div>

                {expandedTasks.includes(task.id) && task.subtasks && task.subtasks.length > 0 && (
                  <div className="border-t bg-gray-50">
                    <div className="p-4 space-y-4">
                      <h4 className="font-medium text-sm text-gray-500">Sous-tâches</h4>
                      {task.subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="pl-4 border-l-2 border-gray-200 py-2"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h5 className="font-medium">{subtask.title}</h5>
                              {subtask.description && (
                                <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                  {subtask.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <Badge className={taskStatusColors[subtask.status]}>
                                {subtask.status === 'TODO' ? 'À faire' : 
                                 subtask.status === 'IN_PROGRESS' ? 'En cours' : 'Terminée'}
                              </Badge>
                              <Badge className={taskPriorityColors[subtask.priority]}>
                                {subtask.priority === 'LOW' ? 'Basse' : 
                                 subtask.priority === 'MEDIUM' ? 'Moyenne' : 
                                 subtask.priority === 'HIGH' ? 'Haute' : 'Urgente'}
                              </Badge>
                            </div>
                          </div>
                          {(subtask.dueDate || subtask.estimatedHours) && (
                            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                              {subtask.dueDate && (
                                <div className="flex items-center">
                                  <Calendar className="h-4 w-4 mr-1" />
                                  <span>{formatDate(subtask.dueDate)}</span>
                                </div>
                              )}
                              {subtask.estimatedHours && (
                                <span>{subtask.estimatedHours}h estimées</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Dialogue pour la création/modification de tâche */}
      <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{currentTask ? 'Modifier la tâche' : 'Nouvelle tâche'}</DialogTitle>
            <DialogDescription>
              {currentTask 
                ? 'Modifiez les détails de la tâche et cliquez sur Enregistrer pour sauvegarder vos modifications.' 
                : 'Remplissez les détails de la tâche et cliquez sur Créer pour l\'ajouter au projet.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={currentTask ? handleUpdateTask : handleCreateTask} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="task-title">Titre</Label>
                  <Input
                    id="task-title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Titre de la tâche"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="task-description">Description</Label>
                  <Textarea
                    id="task-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Description de la tâche"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="task-status">Statut</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value as TaskStatus })}
                    >
                      <SelectTrigger id="task-status">
                        <SelectValue placeholder="Sélectionner un statut" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TODO">À faire</SelectItem>
                        <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                        <SelectItem value="DONE">Terminé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="task-priority">Priorité</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => setFormData({ ...formData, priority: value as TaskPriority })}
                    >
                      <SelectTrigger id="task-priority">
                        <SelectValue placeholder="Sélectionner une priorité" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Basse</SelectItem>
                        <SelectItem value="MEDIUM">Moyenne</SelectItem>
                        <SelectItem value="HIGH">Haute</SelectItem>
                        <SelectItem value="URGENT">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="task-duedate">Date d'échéance</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="task-duedate"
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !formData.dueDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.dueDate ? (
                          format(formData.dueDate, 'PPP', { locale: fr })
                        ) : (
                          <span>Choisir une date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.dueDate || undefined}
                        onSelect={(date: Date | undefined) => setFormData({ ...formData, dueDate: date || null })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label htmlFor="task-hours">Heures estimées</Label>
                  <Input
                    id="task-hours"
                    type="number"
                    value={formData.estimatedHours}
                    onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                    placeholder="Nombre d'heures"
                    min="0"
                    step="0.5"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>Sous-tâches</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddSubtask}>
                    <Plus className="mr-2 h-4 w-4" />
                    Ajouter
                  </Button>
                </div>

                <ScrollArea className="h-[350px] border rounded-md p-4">
                  {subtasks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <AlertTriangle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                      <p>Aucune sous-tâche ajoutée</p>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleAddSubtask}
                        className="mt-2"
                      >
                        Ajouter une sous-tâche
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {subtasks.map((subtask, index) => (
                        <div key={index} className="p-3 border rounded-md">
                          <div className="flex justify-between items-start mb-2">
                            <Input
                              value={subtask.title}
                              onChange={(e) => handleEditSubtask(index, { title: e.target.value })}
                              placeholder="Titre de la sous-tâche"
                              className="flex-1 mr-2"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSubtask(index)}
                              className="h-8 w-8 p-0 text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <Select
                              value={subtask.status}
                              onValueChange={(value) => handleEditSubtask(index, { status: value as TaskStatus })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Statut" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="TODO">À faire</SelectItem>
                                <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                                <SelectItem value="DONE">Terminé</SelectItem>
                              </SelectContent>
                            </Select>

                            <Select
                              value={subtask.priority}
                              onValueChange={(value) => handleEditSubtask(index, { priority: value as TaskPriority })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Priorité" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LOW">Basse</SelectItem>
                                <SelectItem value="MEDIUM">Moyenne</SelectItem>
                                <SelectItem value="HIGH">Haute</SelectItem>
                                <SelectItem value="URGENT">Urgente</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <Textarea
                            value={subtask.description || ''}
                            onChange={(e) => handleEditSubtask(index, { description: e.target.value })}
                            placeholder="Description de la sous-tâche"
                            rows={2}
                            className="mb-2"
                          />

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Date d'échéance</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                      'w-full justify-start text-left text-xs font-normal',
                                      !subtask.dueDate && 'text-muted-foreground'
                                    )}
                                  >
                                    <CalendarIcon className="mr-2 h-3 w-3" />
                                    {subtask.dueDate ? (
                                      format(new Date(subtask.dueDate), 'dd/MM/yyyy')
                                    ) : (
                                      <span>Choisir une date</span>
                                    )}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <Calendar
                                    mode="single"
                                    selected={subtask.dueDate ? new Date(subtask.dueDate) : undefined}
                                    onSelect={(date) => handleEditSubtask(index, { dueDate: date })}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>

                            <div>
                              <Label className="text-xs">Heures estimées</Label>
                              <Input
                                type="number"
                                value={subtask.estimatedHours || ''}
                                onChange={(e) => handleEditSubtask(index, { 
                                  estimatedHours: e.target.value ? parseFloat(e.target.value) : null 
                                })}
                                placeholder="Heures"
                                size="sm"
                                min="0"
                                step="0.5"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsTaskDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 
                  (currentTask ? 'Mise à jour...' : 'Création...') : 
                  (currentTask ? 'Enregistrer' : 'Créer la tâche')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialogue de confirmation de suppression */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer la tâche</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer cette tâche ? Cette action ne peut pas être annulée.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDeleteTask} disabled={isLoading}>
              {isLoading ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 