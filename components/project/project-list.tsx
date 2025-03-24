'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Trash2 } from 'lucide-react';

// Définir les types explicitement pour éviter les erreurs
type ProjectStatus = 'PENDING_VALIDATION' | 'IN_PROGRESS' | 'COMPLETED' | 'PUBLISHED' | 'FUTURE' | 'PERSONAL';

interface Project {
  id: string;
  name: string;
  description?: string;
  client?: string;
  status: ProjectStatus;
  startDate: Date | string;
  endDate?: Date | string | null;
  budget?: number;
  tasks?: any[];
  payments?: any[];
  documents?: any[];
}

interface ProjectListProps {
  projects: Project[];
  onDeleteProject: (id: string) => Promise<void>;
  onUpdateProject: (id: string, data: Partial<Project>) => Promise<void>;
}

export function ProjectList({ projects, onDeleteProject, onUpdateProject }: ProjectListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'ALL'>('ALL');

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || project.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'PENDING_VALIDATION':
        return 'bg-yellow-100 text-yellow-800';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'PUBLISHED':
        return 'bg-purple-100 text-purple-800';
      case 'FUTURE':
        return 'bg-indigo-100 text-indigo-800';
      case 'PERSONAL':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  const getStatusLabel = (status: ProjectStatus) => {
    switch (status) {
      case 'PENDING_VALIDATION': return 'En attente';
      case 'IN_PROGRESS': return 'En cours';
      case 'COMPLETED': return 'Terminé';
      case 'PUBLISHED': return 'Publié';
      case 'FUTURE': return 'À venir';
      case 'PERSONAL': return 'Personnel';
      default: return status;
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
              placeholder="Rechercher un projet..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="w-full md:w-48">
          <Label htmlFor="status">Statut</Label>
          <Select
            value={filterStatus}
            onValueChange={(value) => setFilterStatus(value as ProjectStatus | 'ALL')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="PENDING_VALIDATION">En attente</SelectItem>
              <SelectItem value="IN_PROGRESS">En cours</SelectItem>
              <SelectItem value="COMPLETED">Terminé</SelectItem>
              <SelectItem value="PUBLISHED">Publié</SelectItem>
              <SelectItem value="FUTURE">À venir</SelectItem>
              <SelectItem value="PERSONAL">Personnel</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Aucun projet trouvé
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project, index) => (
            <div
              key={project.id}
              className="border rounded-lg p-4 space-y-4 transition-card hover:shadow animate-list-item-appear"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{project.name}</h3>
                  <p className="text-sm text-gray-500">{project.client}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteProject(project.id)}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {project.description && (
                <p className="text-sm text-gray-600">{project.description}</p>
              )}

              <div className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(project.status)}`}>
                  {getStatusLabel(project.status)}
                </span>
                <div className="text-sm text-gray-500">
                  {new Date(project.startDate).toLocaleDateString('fr-FR')} -{' '}
                  {project.endDate
                    ? new Date(project.endDate).toLocaleDateString('fr-FR')
                    : 'En cours'}
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-gray-500">
                <div className="flex items-center space-x-4">
                  <span>{project.tasks?.length || 0} tâches</span>
                  <span>{project.payments?.length || 0} paiements</span>
                  <span>{project.documents?.length || 0} documents</span>
                </div>
                <span>{project.budget ? `${project.budget}€` : '-'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 