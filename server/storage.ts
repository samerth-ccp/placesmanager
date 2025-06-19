import { 
  users, buildings, floors, sections, desks, moduleStatus, connectionStatus, commandHistory,
  type User, type InsertUser, type Building, type InsertBuilding,
  type Floor, type InsertFloor, type Section, type InsertSection,
  type Desk, type InsertDesk, type Room, type InsertRoom, type ModuleStatus, type InsertModuleStatus,
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
  deleteBuilding(id: number): Promise<void>;

  // Floor methods
  getFloorsByBuildingId(buildingId: number): Promise<Floor[]>;
  getFloorById(id: number): Promise<Floor | undefined>;
  getFloorByPlaceId(placeId: string): Promise<Floor | undefined>;
  createFloor(floor: InsertFloor): Promise<Floor>;
  updateFloor(id: number, floor: Partial<InsertFloor>): Promise<Floor | undefined>;
  deleteFloor(id: number): Promise<void>;

  // Section methods
  getSectionsByFloorId(floorId: number): Promise<Section[]>;
  getSectionById(id: number): Promise<Section | undefined>;
  getSectionByPlaceId(placeId: string): Promise<Section | undefined>;
  createSection(section: InsertSection): Promise<Section>;
  updateSection(id: number, section: Partial<InsertSection>): Promise<Section | undefined>;
  deleteSection(id: number): Promise<void>;

  // Desk methods
  getDesksBySectionId(sectionId: number): Promise<Desk[]>;
  getDeskById(id: number): Promise<Desk | undefined>;
  getDeskByPlaceId(placeId: string): Promise<Desk | undefined>;
  createDesk(desk: InsertDesk): Promise<Desk>;
  updateDesk(id: number, desk: Partial<InsertDesk>): Promise<Desk | undefined>;
  deleteDesk(id: number): Promise<void>;

  // Room methods
  getRoomsBySectionId(sectionId: number): Promise<Room[]>;
  getRoomsByFloorId(floorId: number): Promise<Room[]>;
  getRoomById(id: number): Promise<Room | undefined>;
  getRoomByPlaceId(placeId: string): Promise<Room | undefined>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoom(id: number, room: Partial<InsertRoom>): Promise<Room | undefined>;
  deleteRoom(id: number): Promise<void>;

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
  private rooms: Map<number, Room>;
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
    this.rooms = new Map();
    this.moduleStatuses = new Map();
    this.connectionStatuses = new Map();
    this.commandHistories = [];
    this.currentId = 1;

    // Initialize default module and connection statuses
    this.initializeDefaults();
  }

  private initializeDefaults() {
    // Demo mode for non-Windows environments
    const isDemoMode = process.platform !== 'win32';

    // Initialize module statuses - ensure they show as installed in demo mode
    const modules = [
      { moduleName: 'ExchangeOnlineManagement', status: 'installed' as const, version: '3.0.0' },
      { moduleName: 'MicrosoftPlaces', status: 'installed' as const, version: '1.0.0' },
      { moduleName: 'pwshPlaces', status: 'installed' as const, version: '1.0.3' },
    ];

    modules.forEach(module => {
      const status: ModuleStatus = {
        id: this.currentId++,
        moduleName: module.moduleName,
        status: module.status,
        version: module.version ?? null,
        lastChecked: new Date(),
      };
      this.moduleStatuses.set(module.moduleName, status);
    });

    // Initialize connection statuses
    const connections = [
      { serviceName: 'PowerShell', status: isDemoMode ? 'connected' as const : 'disconnected' as const },
      { serviceName: 'Exchange Online', status: isDemoMode ? 'disconnected' as const : 'disconnected' as const },
      { serviceName: 'Places Module', status: isDemoMode ? 'connected' as const : 'disconnected' as const },
    ];

    connections.forEach(connection => {
      const status: ConnectionStatus = {
        id: this.currentId++,
        serviceName: connection.serviceName,
        status: connection.status,
        lastConnected: isDemoMode ? new Date() : null,
        errorMessage: null,
      };
      this.connectionStatuses.set(connection.serviceName, status);
    });

    // Add demo data if in demo mode
    if (isDemoMode) {
      this.initializeDemoData();
    }
  }

  private initializeDemoData() {
    // Create demo buildings
    const building1: Building = {
      id: this.currentId++,
      placeId: '2b0b9b4b-525d-4718-a1b6-75c8ab3c8f56',
      name: 'ThoughtsWin',
      description: 'ThoughtsWin Systems',
      countryOrRegion: 'CA',
      state: 'BC',
      city: 'Surrey',
      street: '9900 King George Blvd',
      postalCode: 'V3T 0K7',
      phone: '+1 604 496 1799',
      isActive: true,
      createdAt: new Date(),
    };

    const building2: Building = {
      id: this.currentId++,
      placeId: '3c1c8c5c-636e-5829-b2c7-86d9bc4d9g67',
      name: 'VancouverHouse',
      description: 'Vancouver House',
      countryOrRegion: 'CA',
      state: 'BC',
      city: 'Vancouver',
      street: '3301-1480 Howe St',
      postalCode: 'V6Z 0G5',
      phone: null,
      isActive: true,
      createdAt: new Date(),
    };

    this.buildings.set(building1.id, building1);
    this.buildings.set(building2.id, building2);

    // Create demo floors
    const floor1: Floor = {
      id: this.currentId++,
      placeId: '31d81535-c9f1-410b-a723-bf0a5c7f7485',
      buildingId: building1.id,
      parentPlaceId: building1.placeId,
      name: 'Main',
      description: 'Main Floor- 204',
      displayName: 'Main',
      createdAt: new Date(),
    };

    const floor2: Floor = {
      id: this.currentId++,
      placeId: '42e92646-d0e2-521c-c834-97eacd5e8g96',
      buildingId: building2.id,
      parentPlaceId: building2.placeId,
      name: 'Ground',
      description: 'Ground Floor',
      displayName: 'Ground',
      createdAt: new Date(),
    };

    this.floors.set(floor1.id, floor1);
    this.floors.set(floor2.id, floor2);

    // Create demo sections
    const section1: Section = {
      id: this.currentId++,
      placeId: '53f03757-e1f3-632d-d945-a8fbde6f9ha7',
      floorId: floor1.id,
      parentPlaceId: floor1.placeId,
      name: 'Foyer',
      description: 'Customer Service',
      displayName: 'Foyer',
      createdAt: new Date(),
    };

    const section2: Section = {
      id: this.currentId++,
      placeId: '64g14868-f2g4-743e-ea56-b9gcef7g0ib8',
      floorId: floor1.id,
      parentPlaceId: floor1.placeId,
      name: 'Offices',
      description: 'Office Spaces',
      displayName: 'Offices',
      createdAt: new Date(),
    };

    this.sections.set(section1.id, section1);
    this.sections.set(section2.id, section2);

    // Create demo desks
    const desk1: Desk = {
      id: this.currentId++,
      placeId: '75h25979-g3h5-854f-fb67-cahdg8h1jc9',
      sectionId: section1.id,
      parentPlaceId: section1.placeId,
      name: 'Desks A',
      type: 'Desk',
      emailAddress: 'desksa.foyer.thoughtswin@cloudpharmacy.com',
      capacity: 1,
      isBookable: true,
      createdAt: new Date(),
    };

    const desk2: Desk = {
      id: this.currentId++,
      placeId: '86i3608a-h4i6-965g-gc78-dbieg9i2kd0',
      sectionId: section2.id,
      parentPlaceId: section2.placeId,
      name: '404-Cloud',
      type: 'Workspace',
      emailAddress: '404cloud.offices.thoughtswin@cloudpharmacy.com',
      capacity: 4,
      isBookable: true,
      createdAt: new Date(),
    };

    this.desks.set(desk1.id, desk1);
    this.desks.set(desk2.id, desk2);
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
      id,
      placeId: insertBuilding.placeId,
      name: insertBuilding.name,
      description: insertBuilding.description ?? null,
      countryOrRegion: insertBuilding.countryOrRegion ?? null,
      state: insertBuilding.state ?? null,
      city: insertBuilding.city ?? null,
      street: insertBuilding.street ?? null,
      postalCode: insertBuilding.postalCode ?? null,
      phone: insertBuilding.phone ?? null,
      isActive: insertBuilding.isActive ?? null,
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

  async deleteBuilding(id: number): Promise<void> {
    this.buildings.delete(id);
  }

  // Floor methods
  async getFloorsByBuildingId(buildingId: number): Promise<Floor[]> {
    return Array.from(this.floors.values()).filter(floor => floor.buildingId === buildingId);
  }

  async getFloorById(id: number): Promise<Floor | undefined> {
    return this.floors.get(id);
  }

  async getFloorByPlaceId(placeId: string): Promise<Floor | undefined> {
    return Array.from(this.floors.values()).find(floor => floor.placeId === placeId);
  }

  async createFloor(insertFloor: InsertFloor): Promise<Floor> {
    const id = this.currentId++;
    const floor: Floor = {
      id,
      placeId: insertFloor.placeId,
      buildingId: insertFloor.buildingId ?? null,
      parentPlaceId: insertFloor.parentPlaceId,
      name: insertFloor.name,
      description: insertFloor.description ?? null,
      displayName: insertFloor.displayName ?? null,
      createdAt: new Date(),
    };
    this.floors.set(id, floor);
    return floor;
  }

  async updateFloor(id: number, updateData: Partial<InsertFloor>): Promise<Floor | undefined> {
    const floor = this.floors.get(id);
    if (!floor) return undefined;
    
    const updated: Floor = { ...floor, ...updateData };
    this.floors.set(id, updated);
    return updated;
  }

  async deleteFloor(id: number): Promise<void> {
    this.floors.delete(id);
  }

  // Section methods
  async getSectionsByFloorId(floorId: number): Promise<Section[]> {
    return Array.from(this.sections.values()).filter(section => section.floorId === floorId);
  }

  async getSectionById(id: number): Promise<Section | undefined> {
    return this.sections.get(id);
  }

  async getSectionByPlaceId(placeId: string): Promise<Section | undefined> {
    return Array.from(this.sections.values()).find(section => section.placeId === placeId);
  }

  async createSection(insertSection: InsertSection): Promise<Section> {
    const id = this.currentId++;
    const section: Section = {
      id,
      placeId: insertSection.placeId,
      floorId: insertSection.floorId ?? null,
      parentPlaceId: insertSection.parentPlaceId,
      name: insertSection.name,
      description: insertSection.description ?? null,
      displayName: insertSection.displayName ?? null,
      createdAt: new Date(),
    };
    this.sections.set(id, section);
    return section;
  }

  async updateSection(id: number, updateData: Partial<InsertSection>): Promise<Section | undefined> {
    const section = this.sections.get(id);
    if (!section) return undefined;
    
    const updated: Section = { ...section, ...updateData };
    this.sections.set(id, updated);
    return updated;
  }

  async deleteSection(id: number): Promise<void> {
    this.sections.delete(id);
  }

  // Desk methods
  async getDesksBySectionId(sectionId: number): Promise<Desk[]> {
    return Array.from(this.desks.values()).filter(desk => desk.sectionId === sectionId);
  }

  async getDeskById(id: number): Promise<Desk | undefined> {
    return this.desks.get(id);
  }

  async getDeskByPlaceId(placeId: string): Promise<Desk | undefined> {
    return Array.from(this.desks.values()).find(desk => desk.placeId === placeId);
  }

  async createDesk(insertDesk: InsertDesk): Promise<Desk> {
    const id = this.currentId++;
    const desk: Desk = {
      id,
      placeId: insertDesk.placeId,
      sectionId: insertDesk.sectionId ?? null,
      parentPlaceId: insertDesk.parentPlaceId,
      name: insertDesk.name,
      type: insertDesk.type,
      emailAddress: insertDesk.emailAddress ?? null,
      capacity: insertDesk.capacity ?? null,
      isBookable: insertDesk.isBookable ?? null,
      createdAt: new Date(),
    };
    this.desks.set(id, desk);
    return desk;
  }

  async updateDesk(id: number, updateData: Partial<InsertDesk>): Promise<Desk | undefined> {
    const desk = this.desks.get(id);
    if (!desk) return undefined;
    
    const updated: Desk = { ...desk, ...updateData };
    this.desks.set(id, updated);
    return updated;
  }

  async deleteDesk(id: number): Promise<void> {
    this.desks.delete(id);
  }

  // Room methods
  async getRoomsBySectionId(sectionId: number): Promise<Room[]> {
    return Array.from(this.rooms.values()).filter(room => room.sectionId === sectionId);
  }

  async getRoomsByFloorId(floorId: number): Promise<Room[]> {
    return Array.from(this.rooms.values()).filter(room => room.floorId === floorId);
  }

  async getRoomById(id: number): Promise<Room | undefined> {
    return this.rooms.get(id);
  }

  async getRoomByPlaceId(placeId: string): Promise<Room | undefined> {
    return Array.from(this.rooms.values()).find(room => room.placeId === placeId);
  }

  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const id = this.currentId++;
    const room: Room = {
      id,
      placeId: insertRoom.placeId,
      sectionId: insertRoom.sectionId ?? null,
      floorId: insertRoom.floorId ?? null,
      parentPlaceId: insertRoom.parentPlaceId,
      name: insertRoom.name,
      type: insertRoom.type,
      emailAddress: insertRoom.emailAddress ?? null,
      capacity: insertRoom.capacity ?? null,
      isBookable: insertRoom.isBookable ?? null,
      createdAt: new Date(),
    };
    this.rooms.set(id, room);
    return room;
  }

  async updateRoom(id: number, updateData: Partial<InsertRoom>): Promise<Room | undefined> {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    
    const updated: Room = { ...room, ...updateData };
    this.rooms.set(id, updated);
    return updated;
  }

  async deleteRoom(id: number): Promise<void> {
    this.rooms.delete(id);
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
      errorMessage: insertConnectionStatus.errorMessage ?? null,
    };
    this.connectionStatuses.set(insertConnectionStatus.serviceName, connectionStatus);
    return connectionStatus;
  }

  // Command history methods
  async getCommandHistory(limit: number = 50): Promise<CommandHistory[]> {
    return this.commandHistories
      .sort((a, b) => {
        const aTime = a.executedAt instanceof Date ? a.executedAt.getTime() : 0;
        const bTime = b.executedAt instanceof Date ? b.executedAt.getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, limit);
  }

  async addCommandHistory(insertCommandHistory: InsertCommandHistory): Promise<CommandHistory> {
    const id = this.currentId++;
    const history: CommandHistory = {
      id,
      command: insertCommandHistory.command,
      output: insertCommandHistory.output ?? null,
      status: insertCommandHistory.status,
      executedAt: new Date(),
    };
    this.commandHistories.push(history);
    return history;
  }

  async clearCommandHistory(): Promise<void> {
    this.commandHistories = [];
  }
}

export const storage = new MemStorage();
