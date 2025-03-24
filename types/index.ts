// Types communs pour l'application

// Types pour les fichiers
export type FileType = 'image' | 'pdf' | 'document' | 'other';

// Types pour les emails
export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

// Types pour les prestataires
export interface Prestataire {
  id: string;
  name: string;
  role?: string | null;
}

// Types pour les projets
export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  totalPrice: number | null;
  currency: string;
  isFixedPrice: boolean;
  createdAt: string;
  updatedAt: string;
  
  client: Client | null;
  user: User | null;
  projectPrestataires: ProjectPrestataire[];
  projectParts: ProjectPart[];
  tasks: Task[];
  payments: Payment[];
  devis: Devis[];
  contrats: Contrat[];
}

// Types pour les clients
export interface Client {
  id: string;
  name: string;
  email: string | null;
}

// Types pour les utilisateurs
export interface User {
  id: string;
  name: string | null;
  email: string;
}

// Types pour les prestataires de projet
export interface ProjectPrestataire {
  id: string;
  role: string | null;
  prestataire: {
    id: string;
    name: string;
    email: string | null;
  };
}

// Types pour les parties de projet
export interface ProjectPart {
  id: string;
  name: string;
  description: string | null;
  price: number;
  completed: boolean;
}

// Types pour les tâches
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
}

// Types pour les paiements
export interface Payment {
  id: string;
  amount: number;
  date: string;
  paymentType: string;
  paymentStatus: string;
  description: string | null;
}

// Types pour les devis
export interface Devis {
  id: string;
  reference: string;
  total: number;
  status: string;
  createdAt: string;
}

// Types pour les contrats
export interface Contrat {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

// Types pour les taux de change
export interface ExchangeRate {
  sourceCurrency: string;
  targetCurrency: string;
  rate: number;
}

// Types pour l'upload de fichiers
export interface UploadConfig {
  path: string;
  allowedTypes: string[];
  maxSize: number;
  processImage: boolean;
  width?: number;
  height?: number;
}

// Types pour les composants UI
export interface FileUploadProps {
  onUpload: (urls: string[]) => void;
  onError?: (error: Error) => void;
  currentFiles?: string[];
  multiple?: boolean;
  accept?: string;
  maxSize?: number;
  className?: string;
  buttonText?: string;
  dropzoneText?: string;
  prefix?: string;
  showPreviews?: boolean;
  previewHeight?: number;
}

// Types pour le thème
export type Theme = 'light' | 'dark' | 'system';

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

export interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
} 