'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { SubtaskList } from '@/components/task/subtask-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskPriority, TaskStatus } from '@prisma/client';

interface Subtask {
  id?: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date | null;
  estimatedHours?: number | null;
}

export default function NewTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`/api/projects/${resolvedParams.id}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          projectId: resolvedParams.id,
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

      toast.success('Tâche créée avec succès');
      router.push(`/pro/projets/${resolvedParams.id}`);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la création de la tâche');
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleEditSubtask = (index: number, data: Partial<Subtask>) => {
    setSubtasks(prev => 
      prev.map((subtask, i) => 
        i === index ? { ...subtask, ...data } : subtask
      )
    );
  };

  const handleDeleteSubtask = (index: number) => {
    setSubtasks(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className="container mx-auto py-6 space-y-6 animate-fade-in"
    >
      <PageHeader
        title="Nouvelle tâche"
        subtitle="Créez une nouvelle tâche pour votre projet"
        backUrl={`/pro/projets/${resolvedParams.id}`}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4 animate-list-item-appear" style={{ animationDelay: "0.05s" }}>
            <div>
              <label className="block text-sm font-medium mb-1">Titre</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Titre de la tâche"
                required
                className="transition-all duration-200 focus:ring-2 focus:ring-primary focus:ring-opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description de la tâche"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Statut</label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as TaskStatus })}
                >
                  <SelectTrigger>
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
                <label className="block text-sm font-medium mb-1">Priorité</label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value as TaskPriority })}
                >
                  <SelectTrigger>
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
              <label className="block text-sm font-medium mb-1">Date d'échéance</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
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
              <label className="block text-sm font-medium mb-1">Heures estimées</label>
              <Input
                type="number"
                value={formData.estimatedHours}
                onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                placeholder="Nombre d'heures"
                min="0"
                step="0.5"
              />
            </div>
          </div>

          <div className="space-y-4 animate-list-item-appear" style={{ animationDelay: "0.1s" }}>
            <SubtaskList
              subtasks={subtasks}
              onAddSubtask={handleAddSubtask}
              onEditSubtask={handleEditSubtask}
              onDeleteSubtask={handleDeleteSubtask}
            />
          </div>
        </div>

        <div className="flex justify-end gap-4 animate-list-item-appear" style={{ animationDelay: "0.15s" }}>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/pro/projets/${resolvedParams.id}`)}
            className="transition-all duration-200 hover:bg-gray-100"
          >
            Annuler
          </Button>
          <Button 
            type="submit" 
            disabled={isLoading}
            className="transition-all duration-200"
          >
            {isLoading ? 'Création...' : 'Créer la tâche'}
          </Button>
        </div>
      </form>
    </div>
  );
} 