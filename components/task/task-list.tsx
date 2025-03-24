'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, ChevronDown, ChevronRight, Search, Trash2, Edit2 } from 'lucide-react';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  estimatedHours: number | null;
  subtasks?: Task[];
}

interface TaskListProps {
  tasks: Task[];
  onDeleteTask: (id: string) => Promise<void>;
  onUpdateTask: (id: string, data: Partial<Task>) => Promise<void>;
}

export function TaskList({ tasks, onDeleteTask, onUpdateTask }: TaskListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'ALL'>('ALL');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'ALL'>('ALL');
  const [expandedTasks, setExpandedTasks] = useState<string[]>([]);

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || task.status === filterStatus;
    const matchesPriority = filterPriority === 'ALL' || task.priority === filterPriority;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await onUpdateTask(taskId, { status: newStatus });
      toast.success('Statut mis à jour');
    } catch (error) {
      toast.error('Erreur lors de la mise à jour du statut');
    }
  };

  const handlePriorityChange = async (taskId: string, newPriority: TaskPriority) => {
    try {
      await onUpdateTask(taskId, { priority: newPriority });
      toast.success('Priorité mise à jour');
    } catch (error) {
      toast.error('Erreur lors de la mise à jour de la priorité');
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'TODO':
        return 'bg-gray-100 text-gray-800';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800';
      case 'DONE':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case 'LOW':
        return 'bg-gray-100 text-gray-800';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800';
      case 'URGENT':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <Label htmlFor="search">Rechercher</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une tâche..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="w-full md:w-48">
          <Label htmlFor="status">Statut</Label>
          <Select
            value={filterStatus}
            onValueChange={(value) => setFilterStatus(value as TaskStatus | 'ALL')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="TODO">À faire</SelectItem>
              <SelectItem value="IN_PROGRESS">En cours</SelectItem>
              <SelectItem value="DONE">Terminé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-48">
          <Label htmlFor="priority">Priorité</Label>
          <Select
            value={filterPriority}
            onValueChange={(value) => setFilterPriority(value as TaskPriority | 'ALL')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Toutes les priorités" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes les priorités</SelectItem>
              <SelectItem value="LOW">Basse</SelectItem>
              <SelectItem value="MEDIUM">Moyenne</SelectItem>
              <SelectItem value="HIGH">Haute</SelectItem>
              <SelectItem value="URGENT">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Aucune tâche trouvée
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task, index) => (
            <div
              key={task.id}
              className="border rounded-lg overflow-hidden transition-card hover:shadow animate-list-item-appear"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors duration-200"
                onClick={() => toggleTask(task.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {task.subtasks && task.subtasks.length > 0 ? (
                      expandedTasks.includes(task.id) ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      )
                    ) : null}
                    <div>
                      <h3 className="font-medium">{task.title}</h3>
                      <div className="flex items-center space-x-2 mt-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={`px-2 py-1 rounded-full text-xs ${getStatusColor(task.status)} cursor-pointer hover:opacity-80`}>
                              {task.status === 'TODO' ? 'À faire' : 
                               task.status === 'IN_PROGRESS' ? 'En cours' : 
                               task.status === 'DONE' ? 'Terminé' : task.status}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(task.id, 'TODO');
                            }}>
                              À faire
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(task.id, 'IN_PROGRESS');
                            }}>
                              En cours
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(task.id, 'DONE');
                            }}>
                              Terminé
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(task.priority)} cursor-pointer hover:opacity-80`}>
                              {task.priority === 'LOW' ? 'Basse' : 
                               task.priority === 'MEDIUM' ? 'Moyenne' : 
                               task.priority === 'HIGH' ? 'Haute' :
                               task.priority === 'URGENT' ? 'Urgente' : task.priority}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handlePriorityChange(task.id, 'LOW');
                            }}>
                              Basse
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handlePriorityChange(task.id, 'MEDIUM');
                            }}>
                              Moyenne
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handlePriorityChange(task.id, 'HIGH');
                            }}>
                              Haute
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handlePriorityChange(task.id, 'URGENT');
                            }}>
                              Urgente
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Logique d'édition à implémenter
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
                        onDeleteTask(task.id);
                      }}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {task.description && (
                  <p className="text-sm text-gray-600 mt-2">{task.description}</p>
                )}

                <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                  {task.dueDate && (
                    <div className="flex items-center">
                      <CalendarIcon className="h-4 w-4 mr-1" />
                      <span>{new Date(task.dueDate).toLocaleDateString('fr-FR')}</span>
                    </div>
                  )}
                  {task.estimatedHours && (
                    <span>{task.estimatedHours}h estimées</span>
                  )}
                </div>
              </div>

              {expandedTasks.includes(task.id) && task.subtasks && task.subtasks.length > 0 && (
                <div className="border-t">
                  <div className="p-4 space-y-4">
                    {task.subtasks.map((subtask) => (
                      <div
                        key={subtask.id}
                        className="pl-4 border-l-2 border-gray-100"
                      >
                        <h4 className="font-medium">{subtask.title}</h4>
                        {subtask.description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {subtask.description}
                          </p>
                        )}
                        <div className="flex items-center space-x-2 mt-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className={`px-2 py-1 rounded-full text-xs ${getStatusColor(subtask.status)} cursor-pointer hover:opacity-80`}>
                                {subtask.status === 'TODO' ? 'À faire' : 
                                 subtask.status === 'IN_PROGRESS' ? 'En cours' : 
                                 subtask.status === 'DONE' ? 'Terminé' : subtask.status}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={() => handleStatusChange(subtask.id, 'TODO')}>
                                À faire
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(subtask.id, 'IN_PROGRESS')}>
                                En cours
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(subtask.id, 'DONE')}>
                                Terminé
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(subtask.priority)} cursor-pointer hover:opacity-80`}>
                                {subtask.priority === 'LOW' ? 'Basse' : 
                                 subtask.priority === 'MEDIUM' ? 'Moyenne' : 
                                 subtask.priority === 'HIGH' ? 'Haute' :
                                 subtask.priority === 'URGENT' ? 'Urgente' : subtask.priority}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={() => handlePriorityChange(subtask.id, 'LOW')}>
                                Basse
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePriorityChange(subtask.id, 'MEDIUM')}>
                                Moyenne
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePriorityChange(subtask.id, 'HIGH')}>
                                Haute
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePriorityChange(subtask.id, 'URGENT')}>
                                Urgente
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 