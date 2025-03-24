'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
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

interface SubtaskListProps {
  subtasks: Subtask[];
  onAddSubtask: () => void;
  onEditSubtask: (index: number, data: Partial<Subtask>) => void;
  onDeleteSubtask: (index: number) => void;
}

export function SubtaskList({ subtasks, onAddSubtask, onEditSubtask, onDeleteSubtask }: SubtaskListProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium">Sous-tâches</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddSubtask}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Ajouter une sous-tâche
        </Button>
      </div>

      {subtasks.map((subtask, index) => (
        <div
          key={index}
          className="border rounded-lg p-4 space-y-4 transition-card hover:shadow animate-list-item-appear"
          style={{ animationDelay: `${index * 0.05}s` }}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1 space-y-4">
              <div>
                <Label htmlFor={`subtask-title-${index}`}>Titre</Label>
                <Input
                  id={`subtask-title-${index}`}
                  value={subtask.title}
                  onChange={(e) => onEditSubtask(index, { title: e.target.value })}
                  placeholder="Titre de la sous-tâche"
                  required
                />
              </div>

              <div>
                <Label htmlFor={`subtask-description-${index}`}>Description</Label>
                <Textarea
                  id={`subtask-description-${index}`}
                  value={subtask.description || ''}
                  onChange={(e) => onEditSubtask(index, { description: e.target.value })}
                  placeholder="Description de la sous-tâche"
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`subtask-status-${index}`}>Statut</Label>
                  <Select
                    value={subtask.status}
                    onValueChange={(value) => onEditSubtask(index, { status: value as TaskStatus })}
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
                  <Label htmlFor={`subtask-priority-${index}`}>Priorité</Label>
                  <Select
                    value={subtask.priority}
                    onValueChange={(value) => onEditSubtask(index, { priority: value as TaskPriority })}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Date d'échéance</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !subtask.dueDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {subtask.dueDate ? (
                          format(subtask.dueDate, 'PPP', { locale: fr })
                        ) : (
                          <span>Choisir une date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={subtask.dueDate || undefined}
                        onSelect={(date) => onEditSubtask(index, { dueDate: date || null })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label htmlFor={`subtask-hours-${index}`}>Heures estimées</Label>
                  <Input
                    id={`subtask-hours-${index}`}
                    type="number"
                    value={subtask.estimatedHours || ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? null : parseFloat(e.target.value);
                      onEditSubtask(index, { estimatedHours: value });
                    }}
                    placeholder="0"
                    min="0"
                    step="0.5"
                  />
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDeleteSubtask(index)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
} 