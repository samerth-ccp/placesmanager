import { 
  users, buildings, floors, sections, desks, moduleStatus, connectionStatus, commandHistory,
  type User, type InsertUser, type Building, type InsertBuilding,
  type Floor, type InsertFloor, type Section, type InsertSection,
  type Desk, type InsertDesk, type ModuleStatus, type InsertModuleStatus,
  type ConnectionStatus, type InsertConnectionStatus,
  type CommandHistory, type InsertCommandHistory
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Building methods
  getAllBuildings(): Promise<Building[]>;
  getBuildingById(id: number): Promise<Building | undefined>;
  getBuildingByPlaceId(placeId: string): Promise<Building | undefined>;
  createBuilding(building: InsertBuilding): Promise<Building>;
  updateBuilding(id: number, building: Partial<InsertBuilding>): Promise<Building | undefined>;

  // Floor methods
  getFloorsByBuildingId(buildingId: number): Promise<Floor[]>;
  getFloorByPlaceId(placeId: string): Promise<Floor | undefined>;
  createFloor(floor: InsertFloor): Promise<Floor>;

  // Section methods
  getSectionsByFloorId(floorId: number): Promise<Section[]>;
  getSectionByPlaceId(placeId: string): Promise<Section | undefined>;
  createSection(section: InsertSection): Promise<Section>;

  // Desk methods
  getDesksBySectionId(sectionId: number): Promise<Desk[]>;
  getDeskByPlaceId(placeId: string): Promise<Desk | undefined>;
  createDesk(desk: InsertDesk): Promise<Desk>;

  // Module status methods
  getAllModuleStatus(): Promise<ModuleStatus[]>;
  getModuleStatus(moduleName: string): Promise<ModuleStatus | undefined>;
  upsertModuleStatus(moduleStatus: InsertModuleStatus): Promise<ModuleStatus>;

  // Connection status methods
  getAllConnectionStatus(): Promise<ConnectionStatus[]>;
  getConnectionStatus(serviceName: string): Promise<ConnectionStatus | undefined>;
  upsertConnectionStatus(connectionStatus: InsertConnectionStatus): Promise<ConnectionStatus>;

  // Command history methods
  getCommandHistory(limit?: number): Promise<CommandHistory[]>;
  addCommandHistory(command: InsertCommandHistory): Promise<CommandHistory>;
  clearCommandHistory(): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private buildings: Map<number, Building>;
  private floors: Map<number, Floor>;
  private sections: Map<number, Section>;
  private desks: Map<number, Desk>;
  private moduleStatuses: Map<string, ModuleStatus>;
  private connectionStatuses: Map<string, ConnectionStatus>;
  private commandHistories: CommandHistory[];
  private currentId: number;

  constructor() {
    this.users = new Map();
    this.buildings = new Map();
    this.floors = new Map();
    this.sections = new Map();
    this.desks = new Map();
    this.moduleStatuses = new Map();
    this.connectionStatuses = new Map();
    this.commandHistories = [];
    this.currentId = 1;

    // Initialize default module and connection statuses
    this.initializeDefaults();
  }

  private initializeDefaults() {
    // Initialize module statuses
    const modules = [
      { moduleName: 'ExchangeOnlineManagement', status: 'not_installed' as const },
      { moduleName: 'Microsoft.Graph.Places', status: 'not_installed' as const },
      { moduleName: 'Microsoft.Places.PowerShell', status: 'not_installed' as const },
    ];

    modules.forEach(module => {
      const status: ModuleStatus = {
        id: this.currentId++,
        ...module,
        version: null,
        lastChecked: new Date(),
      };
      this.moduleStatuses.set(module.moduleName, status);
    });

    // Initialize connection statuses
    const connections = [
      { serviceName: 'PowerShell', status: 'disconnected' as const },
      { serviceName: 'Exchange Online', status: 'disconnected' as const },
      { serviceName: 'Places Module', status: 'disconnected' as const },
    ];

    connections.forEach(connection => {
      const status: ConnectionStatus = {
        id: this.currentId++,
        ...connection,
        lastConnected: null,
        errorMessage: null,
      };
      this.connectionStatuses.set(connection.serviceName, status);
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Building methods
  async getAllBuildings(): Promise<Building[]> {
    return Array.from(this.buildings.values());
  }

  async getBuildingById(id: number): Promise<Building | undefined> {
    return this.buildings.get(id);
  }

  async getBuildingByPlaceId(placeId: string): Promise<Building | undefined> {
    return Array.from(this.buildings.values()).find(building => building.placeId === placeId);
  }

  async createBuilding(insertBuilding: InsertBuilding): Promise<Building> {
    const id = this.currentId++;
    const building: Building = {
      ...insertBuilding,
      id,
      createdAt: new Date(),
    };
    this.buildings.set(id, building);
    return building;
  }

  async updateBuilding(id: number, updateData: Partial<InsertBuilding>): Promise<Building | undefined> {
    const building = this.buildings.get(id);
    if (!building) return undefined;

    const updated: Building = { ...building, ...updateData };
    this.buildings.set(id, updated);
    return updated;
  }

  // Floor methods
  async getFloorsByBuildingId(buildingId: number): Promise<Floor[]> {
    return Array.from(this.floors.values()).filter(floor => floor.buildingId === buildingId);
  }

  async getFloorByPlaceId(placeId: string): Promise<Floor | undefined> {
    return Array.from(this.floors.values()).find(floor => floor.placeId === placeId);
  }

  async createFloor(insertFloor: InsertFloor): Promise<Floor> {
    const id = this.currentId++;
    const floor: Floor = {
      ...insertFloor,
      id,
      createdAt: new Date(),
    };
    this.floors.set(id, floor);
    return floor;
  }

  // Section methods
  async getSectionsByFloorId(floorId: number): Promise<Section[]> {
    return Array.from(this.sections.values()).filter(section => section.floorId === floorId);
  }

  async getSectionByPlaceId(placeId: string): Promise<Section | undefined> {
    return Array.from(this.sections.values()).find(section => section.placeId === placeId);
  }

  async createSection(insertSection: InsertSection): Promise<Section> {
    const id = this.currentId++;
    const section: Section = {
      ...insertSection,
      id,
      createdAt: new Date(),
    };
    this.sections.set(id, section);
    return section;
  }

  // Desk methods
  async getDesksBySectionId(sectionId: number): Promise<Desk[]> {
    return Array.from(this.desks.values()).filter(desk => desk.sectionId === sectionId);
  }

  async getDeskByPlaceId(placeId: string): Promise<Desk | undefined> {
    return Array.from(this.desks.values()).find(desk => desk.placeId === placeId);
  }

  async createDesk(insertDesk: InsertDesk): Promise<Desk> {
    const id = this.currentId++;
    const desk: Desk = {
      ...insertDesk,
      id,
      createdAt: new Date(),
    };
    this.desks.set(id, desk);
    return desk;
  }

  // Module status methods
  async getAllModuleStatus(): Promise<ModuleStatus[]> {
    return Array.from(this.moduleStatuses.values());
  }

  async getModuleStatus(moduleName: string): Promise<ModuleStatus | undefined> {
    return this.moduleStatuses.get(moduleName);
  }

  async upsertModuleStatus(insertModuleStatus: InsertModuleStatus): Promise<ModuleStatus> {
    const existing = this.moduleStatuses.get(insertModuleStatus.moduleName);
    const moduleStatus: ModuleStatus = {
      id: existing?.id || this.currentId++,
      ...insertModuleStatus,
      lastChecked: new Date(),
    };
    this.moduleStatuses.set(insertModuleStatus.moduleName, moduleStatus);
    return moduleStatus;
  }

  // Connection status methods
  async getAllConnectionStatus(): Promise<ConnectionStatus[]> {
    return Array.from(this.connectionStatuses.values());
  }

  async getConnectionStatus(serviceName: string): Promise<ConnectionStatus | undefined> {
    return this.connectionStatuses.get(serviceName);
  }

  async upsertConnectionStatus(insertConnectionStatus: InsertConnectionStatus): Promise<ConnectionStatus> {
    const existing = this.connectionStatuses.get(insertConnectionStatus.serviceName);
    const connectionStatus: ConnectionStatus = {
      id: existing?.id || this.currentId++,
      ...insertConnectionStatus,
      lastConnected: insertConnectionStatus.status === 'connected' ? new Date() : existing?.lastConnected || null,
    };
    this.connectionStatuses.set(insertConnectionStatus.serviceName, connectionStatus);
    return connectionStatus;
  }

  // Command history methods
  async getCommandHistory(limit: number = 50): Promise<CommandHistory[]> {
    return this.commandHistories
      .sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime())
      .slice(0, limit);
  }

  async addCommandHistory(insertCommandHistory: InsertCommandHistory): Promise<CommandHistory> {
    const commandHistory: CommandHistory = {
      id: this.currentId++,
      ...insertCommandHistory,
      executedAt: new Date(),
    };
    this.commandHistories.push(commandHistory);
    return commandHistory;
  }

  async clearCommandHistory(): Promise<void> {
    this.commandHistories = [];
  }
}

export const storage = new MemStorage();
