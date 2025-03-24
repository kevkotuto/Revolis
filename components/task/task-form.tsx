'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { SubtaskList } from './subtask-list';

const taskFormSchema = z.object({
  title: z.string().min(1, 'Le titre est requis'),
  description: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  dueDate: z.date().optional(),
  estimatedHours: z.string().optional(),
  projectPartId: z.string().optional(),
  parentTaskId: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

interface TaskFormProps {
  projectId: string;
  initialData?: TaskFormValues;
  projectParts?: Array<{ id: string; name: string }>;
  parentTasks?: Array<{ id: string; title: string }>;
  onSubmit: (data: TaskFormValues) => Promise<void>;
}

export function TaskForm({
  projectId,
  initialData,
  projectParts,
  parentTasks,
  onSubmit,
}: TaskFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [subtasks, setSubtasks] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    status: initialData?.status || 'TODO',
    priority: initialData?.priority || 'MEDIUM',
    dueDate: initialData?.dueDate ? new Date(initialData.dueDate) : null,
    estimatedHours: initialData?.estimatedHours || '',
    isSubtask: initialData?.isSubtask || false,
    parentTaskId: initialData?.parentTaskId || null,
  });

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: initialData || {
      title: '',
      description: '',
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: undefined,
      estimatedHours: '',
      projectPartId: undefined,
      parentTaskId: undefined,
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await onSubmit({
        ...formData,
        projectId,
        subtasks: subtasks.map(subtask => ({
          ...subtask,
          projectId,
        })),
      });
      setSubtasks([]);
      setFormData({
        title: '',
        description: '',
        status: 'TODO',
        priority: 'MEDIUM',
        dueDate: null,
        estimatedHours: '',
        isSubtask: false,
        parentTaskId: null,
      });
      toast.success('Tâche enregistrée avec succès');
      router.refresh();
    } catch (error) {
      toast.error('Erreur lors de l\'enregistrement de la tâche');
      console.error('Erreur:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSubtask = () => {
    setSubtasks([...subtasks, {
      title: '',
      description: '',
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: null,
      estimatedHours: '',
      isSubtask: true,
      parentTaskId: null,
    }]);
  };

  const handleEditSubtask = (index: number, data: any) => {
    const newSubtasks = [...subtasks];
    newSubtasks[index] = { ...newSubtasks[index], ...data };
    setSubtasks(newSubtasks);
  };

  const handleDeleteSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div>
          <FormLabel htmlFor="title">Titre</FormLabel>
          <FormControl>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Titre de la tâche"
              required
            />
          </FormControl>
          <FormMessage />
        </div>

        <div>
          <FormLabel htmlFor="description">Description</FormLabel>
          <FormControl>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Description de la tâche"
              className="resize-none"
            />
          </FormControl>
          <FormMessage />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FormLabel htmlFor="status">Statut</FormLabel>
            <FormControl>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as TaskStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODO">À faire</SelectItem>
                  <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                  <SelectItem value="DONE">Terminé</SelectItem>
                  <SelectItem value="CANCELLED">Annulé</SelectItem>
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </div>

          <div>
            <FormLabel htmlFor="priority">Priorité</FormLabel>
            <FormControl>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData({ ...formData, priority: value as TaskPriority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Basse</SelectItem>
                  <SelectItem value="MEDIUM">Moyenne</SelectItem>
                  <SelectItem value="HIGH">Haute</SelectItem>
                  <SelectItem value="URGENT">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FormLabel>Date d'échéance</FormLabel>
            <FormControl>
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
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.dueDate}
                    onSelect={(date) => setFormData({ ...formData, dueDate: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </FormControl>
            <FormMessage />
          </div>

          <div>
            <FormLabel htmlFor="estimatedHours">Heures estimées</FormLabel>
            <FormControl>
              <Input
                id="estimatedHours"
                type="number"
                value={formData.estimatedHours}
                onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                placeholder="0"
                min="0"
                step="0.5"
              />
            </FormControl>
            <FormMessage />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="isSubtask"
            checked={formData.isSubtask}
            onCheckedChange={(checked) => setFormData({ ...formData, isSubtask: checked })}
          />
          <FormLabel htmlFor="isSubtask">Sous-tâche</FormLabel>
        </div>

        {!formData.isSubtask && (
          <div>
            <FormLabel>Sous-tâches</FormLabel>
            <SubtaskList
              subtasks={subtasks}
              onAddSubtask={handleAddSubtask}
              onEditSubtask={handleEditSubtask}
              onDeleteSubtask={handleDeleteSubtask}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </motion.form>
  );
} 