export interface ConnectionStatus {
  serviceName: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastConnected?: Date;
  errorMessage?: string;
}

export interface ModuleStatus {
  moduleName: string;
  status: 'installed' | 'installing' | 'not_installed' | 'error';
  version?: string;
  lastChecked: Date;
}

export interface CommandResult {
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
}

export interface PlaceNode {
  id: number;
  placeId: string;
  name: string;
  description?: string;
  type: 'building' | 'floor' | 'section' | 'desk' | 'room' | 'workspace';
  children?: PlaceNode[];
  isActive?: boolean;
  isBookable?: boolean;
  capacity?: number;
  emailAddress?: string;
}

export interface HierarchyNode {
  id: number;
  placeId: string;
  name: string;
  description?: string;
  floors?: {
    id: number;
    placeId: string;
    name: string;
    description?: string;
    sections?: {
      id: number;
      placeId: string;
      name: string;
      description?: string;
      desks?: {
        id: number;
        placeId: string;
        name: string;
        type: string;
        emailAddress?: string;
        capacity?: number;
        isBookable?: boolean;
      }[];
    }[];
  }[];
}

export interface SystemMode {
  platform: string;
  isDemo: boolean;
  canForceReal: boolean;
}
