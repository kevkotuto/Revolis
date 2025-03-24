'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentManager } from '@/components/document/document-manager';
import { prisma } from '@/lib/prisma';

export default function DocumentsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const projectData = await prisma.project.findUnique({
          where: { id: params.id },
          select: {
            id: true,
            name: true,
            images: true,
            documents: true,
          },
        });

        if (!projectData) {
          toast.error('Projet non trouvé');
          router.push('/pro/projets');
          return;
        }

        setProject(projectData);
      } catch (error) {
        console.error('Erreur lors du chargement du projet:', error);
        toast.error('Erreur lors du chargement du projet');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [params.id, router]);

  const handleImagesChange = async (urls: string[]) => {
    try {
      const response = await fetch(`/api/projects/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ images: urls }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour des images');
      }

      setProject((prev: any) => ({ ...prev, images: urls }));
    } catch (error) {
      console.error('Erreur:', error);
      throw error;
    }
  };

  const handleDocumentsChange = async (urls: string[]) => {
    try {
      const response = await fetch(`/api/projects/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documents: urls }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour des documents');
      }

      setProject((prev: any) => ({ ...prev, documents: urls }));
    } catch (error) {
      console.error('Erreur:', error);
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <DocumentManager
        projectId={project.id}
        currentImages={project.images}
        currentDocuments={project.documents}
        onImagesChange={handleImagesChange}
        onDocumentsChange={handleDocumentsChange}
      />
    </div>
  );
} 