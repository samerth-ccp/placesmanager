import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { powerShellService, type PowerShellResult } from "./services/powershell";
import { 
  insertModuleStatusSchema,
  insertConnectionStatusSchema,
  insertCommandHistorySchema,
  insertBuildingSchema,
  insertFloorSchema,
  insertSectionSchema,
  insertDeskSchema,
  insertRoomSchema
} from "@shared/schema";
import { z } from "zod";

// Auto-sync function for dropdown population
async function autoSyncPlacesData() {
  // Check if we have any data in the local database
  const existingBuildings = await storage.getAllBuildings();
  
  // If we already have data, no need to sync
  if (existingBuildings.length > 0) {
    console.log(`Found ${existingBuildings.length} existing buildings, skipping auto-sync`);
    return;
  }
  
  // Try to get places data from Microsoft Places
  console.log('No existing data found, attempting to sync from Microsoft Places...');
  
  // Get all buildings
  const buildingsResult = await powerShellService.getPlaces('Building');
  if (buildingsResult.exitCode !== 0) {
    throw new Error('Failed to fetch buildings from Microsoft Places');
  }
  
  const buildingsData = await powerShellService.parsePlacesOutput(`Building\n${buildingsResult.output}`);
  console.log(`Found ${buildingsData.length} buildings in Microsoft Places`);
  
  // Save buildings to local database
  for (const buildingData of buildingsData) {
    const existing = await storage.getBuildingByPlaceId(buildingData.PlaceId);
    if (!existing) {
      await storage.createBuilding({
        placeId: buildingData.PlaceId,
        name: buildingData.DisplayName || buildingData.Name || 'Unknown Building',
        description: buildingData.Description || null,
        countryOrRegion: buildingData.CountryOrRegion || null,
        state: buildingData.State || null,
        city: buildingData.City || null,
        street: buildingData.Street || null,
        postalCode: buildingData.PostalCode || null,
        phone: buildingData.Phone || null,
        isActive: true,
      });
    }
  }
  
  // Get and save floors
  const floorsResult = await powerShellService.getPlaces('Floor');
  if (floorsResult.exitCode === 0) {
    const floorsData = await powerShellService.parsePlacesOutput(`Floor\n${floorsResult.output}`);
    for (const floorData of floorsData) {
      const building = await storage.getBuildingByPlaceId(floorData.ParentId);
      if (building) {
        const existing = await storage.getFloorByPlaceId(floorData.PlaceId);
        if (!existing) {
          await storage.createFloor({
            placeId: floorData.PlaceId,
            name: floorData.DisplayName || floorData.Name || 'Unknown Floor',
            description: floorData.Description || null,
            buildingId: building.id,
            parentPlaceId: floorData.ParentId,
          });
        }
      }
    }
  }
  
  // Get and save sections
  const sectionsResult = await powerShellService.getPlaces('Section');
  if (sectionsResult.exitCode === 0) {
    const sectionsData = await powerShellService.parsePlacesOutput(`Section\n${sectionsResult.output}`);
    for (const sectionData of sectionsData) {
      const floor = await storage.getFloorByPlaceId(sectionData.ParentId);
      if (floor) {
        const existing = await storage.getSectionByPlaceId(sectionData.PlaceId);
        if (!existing) {
          await storage.createSection({
            placeId: sectionData.PlaceId,
            name: sectionData.DisplayName || sectionData.Name || 'Unknown Section',
            description: sectionData.Description || null,
            floorId: floor.id,
            parentPlaceId: sectionData.ParentId,
          });
        }
      }
    }
  }
  
  console.log('Auto-sync completed successfully');
}

// Helper to refresh places data after creation
async function refreshPlacesDataInternal() {
  // This is a simplified version of the /api/places/refresh logic
  // Only refreshes buildings, floors, sections, desks, and rooms
  try {
    // Get all buildings
    const buildingsResult = await powerShellService.getPlaces('Building');
    if (buildingsResult.exitCode === 0) {
      const buildingsData = await powerShellService.parsePlacesOutput(`Building\n${buildingsResult.output}`);
      for (const buildingData of buildingsData) {
        const existing = await storage.getBuildingByPlaceId(buildingData.PlaceId);
        if (!existing) {
          await storage.createBuilding({
            placeId: buildingData.PlaceId,
            name: buildingData.DisplayName || buildingData.Name || 'Unknown Building',
            description: buildingData.Description || null,
            countryOrRegion: buildingData.CountryOrRegion || null,
            state: buildingData.State || null,
            city: buildingData.City || null,
            street: buildingData.Street || null,
            postalCode: buildingData.PostalCode || null,
            phone: buildingData.Phone || null,
            isActive: true,
          });
        }
      }
    }
    // Floors
    const floorsResult = await powerShellService.getPlaces('Floor');
    if (floorsResult.exitCode === 0) {
      const floorsData = await powerShellService.parsePlacesOutput(`Floor\n${floorsResult.output}`);
      for (const floorData of floorsData) {
        const building = await storage.getBuildingByPlaceId(floorData.ParentId);
        if (building && typeof building.id === 'number') {
          const existing = await storage.getFloorByPlaceId(floorData.PlaceId);
          if (!existing) {
            await storage.createFloor({
              placeId: floorData.PlaceId,
              name: floorData.DisplayName || floorData.Name || 'Unknown Floor',
              description: floorData.Description || null,
              buildingId: building.id,
              parentPlaceId: floorData.ParentId,
            });
          }
        }
      }
    }
    // Sections
    const sectionsResult = await powerShellService.getPlaces('Section');
    if (sectionsResult.exitCode === 0) {
      const sectionsData = await powerShellService.parsePlacesOutput(`Section\n${sectionsResult.output}`);
      for (const sectionData of sectionsData) {
        const floor = await storage.getFloorByPlaceId(sectionData.ParentId);
        if (floor && typeof floor.id === 'number') {
          const existing = await storage.getSectionByPlaceId(sectionData.PlaceId);
          if (!existing) {
            await storage.createSection({
              placeId: sectionData.PlaceId,
              name: sectionData.DisplayName || sectionData.Name || 'Unknown Section',
              description: sectionData.Description || null,
              floorId: floor.id,
              parentPlaceId: sectionData.ParentId,
            });
          }
        }
      }
    }
    // Desks
    const desksResult = await powerShellService.getPlaces('Desk');
    if (desksResult.exitCode === 0) {
      const desksData = await powerShellService.parsePlacesOutput(`Desk\n${desksResult.output}`);
      for (const deskData of desksData) {
        const section = await storage.getSectionByPlaceId(deskData.ParentId);
        if (section && typeof section.id === 'number') {
          const existing = await storage.getDeskByPlaceId(deskData.PlaceId);
          if (!existing) {
            await storage.createDesk({
              placeId: deskData.PlaceId,
              name: deskData.DisplayName || deskData.Name || 'Unknown Desk',
              type: deskData.Type || 'Desk',
              description: deskData.Description || null,
              sectionId: section.id,
              parentPlaceId: deskData.ParentId,
              capacity: deskData.Capacity != null ? Number(deskData.Capacity) : null,
              isBookable: deskData.IsBookable || false,
            });
          }
        }
      }
    }
    // Rooms
    const roomsResult = await powerShellService.getPlaces('Room');
    if (roomsResult.exitCode === 0) {
      const roomsData = await powerShellService.parsePlacesOutput(`Room\n${roomsResult.output}`);
      for (const roomData of roomsData) {
        const section = await storage.getSectionByPlaceId(roomData.ParentId);
        const floor = await storage.getFloorByPlaceId(roomData.ParentId);
        if (section && section.id) {
          const existing = await storage.getRoomByPlaceId?.(roomData.PlaceId);
          if (!existing) {
            await storage.createRoom?.({
              placeId: roomData.PlaceId,
              name: roomData.DisplayName || roomData.Name || 'Unknown Room',
              type: roomData.Type || 'Room',
              sectionId: section.id,
              floorId: section.floorId, // Use the floor ID from the section
              parentPlaceId: roomData.ParentId,
              emailAddress: roomData.EmailAddress || null,
              capacity: roomData.Capacity != null ? Number(roomData.Capacity) : null,
              isBookable: roomData.IsBookable || false,
            });
          }
        } else if (floor && floor.id) {
          const existing = await storage.getRoomByPlaceId?.(roomData.PlaceId);
          if (!existing) {
            await storage.createRoom?.({
              placeId: roomData.PlaceId,
              name: roomData.DisplayName || roomData.Name || 'Unknown Room',
              type: roomData.Type || 'Room',
              sectionId: null, // No section
              floorId: floor.id,
              parentPlaceId: roomData.ParentId,
              emailAddress: roomData.EmailAddress || null,
              capacity: roomData.Capacity != null ? Number(roomData.Capacity) : null,
              isBookable: roomData.IsBookable || false,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Internal refresh after create failed:', err);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize PowerShell service
  try {
    await powerShellService.initialize();
    await storage.upsertConnectionStatus({
      serviceName: 'PowerShell',
      status: 'connected',
      errorMessage: null,
    });
    
    // Auto-sync places data on startup for dropdown population
    console.log('Auto-syncing places data for dropdown population...');
    try {
      await autoSyncPlacesData();
      console.log('Auto-sync completed successfully');
    } catch (syncError) {
      console.log('Auto-sync failed (this is normal if not connected to Exchange):', syncError instanceof Error ? syncError.message : 'Unknown error');
    }
  } catch (error) {
    await storage.upsertConnectionStatus({
      serviceName: 'PowerShell',
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Module management endpoints
  app.get('/api/modules', async (req, res) => {
    try {
      const modules = await storage.getAllModuleStatus();
      res.json(modules);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get module status' });
    }
  });

  app.post('/api/modules/check', async (req, res) => {
    try {
      const moduleNames = ['ExchangeOnlineManagement', 'MicrosoftPlaces', 'pwshPlaces'];
      const results = [];

      for (const moduleName of moduleNames) {
        const moduleInfo = await powerShellService.checkModuleInstalled(moduleName);
        const status = await storage.upsertModuleStatus({
          moduleName,
          status: moduleInfo.status === 'installed' ? 'installed' : 
                  moduleInfo.status === 'error' ? 'error' : 'not_installed',
          version: moduleInfo.version || null,
        });
        results.push(status);
      }

      res.json(results);
    } catch (error) {
      res.status(500).json({ message: 'Failed to check modules' });
    }
  });

  app.post('/api/modules/install', async (req, res) => {
    try {
      const { moduleName } = req.body;
      if (!moduleName) {
        return res.status(400).json({ message: 'Module name is required' });
      }

      // Update status to installing
      await storage.upsertModuleStatus({
        moduleName,
        status: 'installing',
        version: null,
      });

      // Install module
      const result = await powerShellService.installModule(moduleName);
      
      // Update status based on result
      const status = result.exitCode === 0 ? 'installed' : 'error';
      const updatedModule = await storage.upsertModuleStatus({
        moduleName,
        status,
        version: status === 'installed' ? 'Latest' : null,
      });

      // Log command
      await storage.addCommandHistory({
        command: `Install-Module -Name "${moduleName}" -Force -AllowClobber -Scope CurrentUser`,
        output: result.output,
        status: result.exitCode === 0 ? 'success' : 'error',
      });

      res.json({ module: updatedModule, result });
    } catch (error) {
      res.status(500).json({ message: 'Failed to install module' });
    }
  });

  // Connection management endpoints
  app.get('/api/connections', async (req, res) => {
    try {
      const connections = await storage.getAllConnectionStatus();
      res.json(connections);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get connection status' });
    }
  });

  app.post('/api/connections/exchange', async (req, res) => {
    try {
      const { tenantDomain } = req.body;

      // Update status to connecting
      await storage.upsertConnectionStatus({
        serviceName: 'Exchange Online',
        status: 'connecting',
        errorMessage: null,
      });

      // Attempt connection
      const result = await powerShellService.connectExchangeOnline(tenantDomain);
      
      // Update status based on result
      const status = result.exitCode === 0 ? 'connected' : 'error';
      const updatedConnection = await storage.upsertConnectionStatus({
        serviceName: 'Exchange Online',
        status,
        errorMessage: status === 'error' ? result.error || 'Connection failed' : null,
      });

      // Log command with correct syntax
      let commandText = 'Connect-ExchangeOnline';
      if (tenantDomain) {
        commandText += tenantDomain.includes('@') 
          ? ` -UserPrincipalName "${tenantDomain}"` 
          : ` -Organization "${tenantDomain}"`;
      }
      
      await storage.addCommandHistory({
        command: commandText,
        output: result.output,
        status: result.exitCode === 0 ? 'success' : 'error',
      });

      res.json({ connection: updatedConnection, result });
    } catch (error) {
      res.status(500).json({ message: 'Failed to connect to Exchange Online' });
    }
  });

  app.post('/api/connections/places', async (req, res) => {
    try {
      // Attempt to connect to Microsoft Places
      const result = await powerShellService.executeCommand('Connect-MicrosoftPlaces');
      const status = result.exitCode === 0 ? 'connected' : 'error';

      await storage.upsertConnectionStatus({
        serviceName: 'Places Module',
        status,
        errorMessage: status === 'error' ? result.error || 'Connection failed' : null,
      });

      // Log command
      await storage.addCommandHistory({
        command: 'Connect-MicrosoftPlaces',
        output: result.output,
        status,
      });

      res.json({ connection: { status }, result });
    } catch (error) {
      res.status(500).json({ message: 'Failed to connect to Microsoft Places' });
    }
  });

  // PowerShell command execution
  app.post('/api/commands/execute', async (req, res) => {
    try {
      const { command } = req.body;
      if (!command) {
        return res.status(400).json({ message: 'Command is required' });
      }

      const result = await powerShellService.executeCommand(command);

      // Log command
      await storage.addCommandHistory({
        command,
        output: result.output,
        status: result.exitCode === 0 ? 'success' : 'error',
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ message: 'Failed to execute command' });
    }
  });

  app.get('/api/commands/history', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const history = await storage.getCommandHistory(limit);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get command history' });
    }
  });

  app.delete('/api/commands/history', async (req, res) => {
    try {
      await storage.clearCommandHistory();
      res.json({ message: 'Command history cleared' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to clear command history' });
    }
  });

  // Places hierarchy endpoints
  app.get('/api/places/refresh', async (req, res) => {
    try {
      // Check if Exchange Online is connected (only in live mode)
      if (!powerShellService.isInDemoMode()) {
        const exchangeConnection = await storage.getConnectionStatus('Exchange Online');
        console.log('Exchange Online connection status:', exchangeConnection);
        if (!exchangeConnection || exchangeConnection.status !== 'connected') {
          return res.status(400).json({ 
            message: 'Exchange Online connection required',
            requiresConnection: true,
            error: 'Please connect to Exchange Online before refreshing places data'
          });
        }
      }

      // Get all buildings
      const buildingsResult = await powerShellService.getPlaces('Building');
      if (buildingsResult.exitCode !== 0) {
        return res.status(500).json({ 
          message: 'Failed to fetch buildings',
          error: buildingsResult.error || 'PowerShell command failed',
          requiresConnection: !powerShellService.isInDemoMode()
        });
      }
      const buildingsData = await powerShellService.parsePlacesOutput(`Building\n${buildingsResult.output}`);
      console.log(`Parsed buildings: ${buildingsData.length}`);
      let buildingsCreated = 0;
      for (const buildingData of buildingsData) {
        const existing = await storage.getBuildingByPlaceId(buildingData.PlaceId);
        if (!existing) {
          await storage.createBuilding({
            placeId: buildingData.PlaceId,
            name: buildingData.DisplayName || buildingData.Name || 'Unknown Building',
            description: buildingData.Description || null,
            countryOrRegion: buildingData.CountryOrRegion || null,
            state: buildingData.State || null,
            city: buildingData.City || null,
            street: buildingData.Street || null,
            postalCode: buildingData.PostalCode || null,
            phone: buildingData.Phone || null,
            isActive: true,
          });
          buildingsCreated++;
        }
      }
      console.log(`Buildings created: ${buildingsCreated}`);

      // Get all floors, sections, desks, and rooms
      const floorsResult = await powerShellService.getPlaces('Floor');
      const sectionsResult = await powerShellService.getPlaces('Section');  
      const desksResult = await powerShellService.getPlaces('Desk');
      const roomsResult = await powerShellService.getPlaces('Room');

      let floorsCreated = 0;
      if (floorsResult.exitCode === 0) {
        const floorsData = await powerShellService.parsePlacesOutput(`Floor\n${floorsResult.output}`);
        console.log(`Parsed floors: ${floorsData.length}`);
        for (const floorData of floorsData) {
          const building = await storage.getBuildingByPlaceId(floorData.ParentId);
          if (building && typeof building.id === 'number') {
            const existing = await storage.getFloorByPlaceId(floorData.PlaceId);
            if (!existing) {
              await storage.createFloor({
                placeId: floorData.PlaceId,
                name: floorData.DisplayName || floorData.Name || 'Unknown Floor',
                description: floorData.Description || null,
                buildingId: building.id,
                parentPlaceId: floorData.ParentId,
              });
              floorsCreated++;
            }
          } else {
            console.warn(`No building found for floor ${floorData.DisplayName} (${floorData.PlaceId}), parentId: ${floorData.ParentId}`);
          }
        }
      }
      console.log(`Floors created: ${floorsCreated}`);

      let sectionsCreated = 0;
      if (sectionsResult.exitCode === 0) {
        const sectionsData = await powerShellService.parsePlacesOutput(`Section\n${sectionsResult.output}`);
        console.log(`Parsed sections: ${sectionsData.length}`);
        for (const sectionData of sectionsData) {
          const floor = await storage.getFloorByPlaceId(sectionData.ParentId);
          if (floor) {
            const existing = await storage.getSectionByPlaceId(sectionData.PlaceId);
            if (!existing) {
              await storage.createSection({
                placeId: sectionData.PlaceId,
                name: sectionData.DisplayName || sectionData.Name || 'Unknown Section',
                description: sectionData.Description || null,
                floorId: floor.id,
                parentPlaceId: sectionData.ParentId,
              });
              sectionsCreated++;
            }
          } else {
            console.warn(`No floor found for section ${sectionData.DisplayName} (${sectionData.PlaceId}), parentId: ${sectionData.ParentId}`);
          }
        }
      }
      console.log(`Sections created: ${sectionsCreated}`);

      let desksCreated = 0;
      if (desksResult.exitCode === 0) {
        const desksData = await powerShellService.parsePlacesOutput(`Desk\n${desksResult.output}`);
        console.log(`Parsed desks: ${desksData.length}`);
        for (const deskData of desksData) {
          const section = await storage.getSectionByPlaceId(deskData.ParentId);
          if (section) {
            const existing = await storage.getDeskByPlaceId(deskData.PlaceId);
            if (!existing) {
              await storage.createDesk({
                placeId: deskData.PlaceId,
                name: deskData.DisplayName || deskData.Name || 'Unknown Desk',
                type: deskData.Type || 'Desk',
                sectionId: section.id,
                parentPlaceId: deskData.ParentId,
                emailAddress: deskData.EmailAddress || null,
                capacity: deskData.Capacity != null ? Number(deskData.Capacity) : null,
                isBookable: deskData.IsBookable || false,
              });
              desksCreated++;
            }
          } else {
            console.warn(`No section found for desk ${deskData.DisplayName} (${deskData.PlaceId}), parentId: ${deskData.ParentId}`);
          }
        }
      }
      console.log(`Desks created: ${desksCreated}`);

      let roomsCreated = 0;
      if (roomsResult.exitCode === 0) {
        const roomsData = await powerShellService.parsePlacesOutput(`Room\n${roomsResult.output}`);
        console.log(`Parsed rooms: ${roomsData.length}`);
        for (const roomData of roomsData) {
          const section = await storage.getSectionByPlaceId(roomData.ParentId);
          const floor = await storage.getFloorByPlaceId(roomData.ParentId);
          if (section && section.id) {
            // Room belongs to a section
            const existing = await storage.getRoomByPlaceId?.(roomData.PlaceId);
            if (!existing) {
              await storage.createRoom?.({
                placeId: roomData.PlaceId,
                name: roomData.DisplayName || roomData.Name || 'Unknown Room',
                type: roomData.Type || 'Room',
                sectionId: section.id,
                floorId: section.floorId, // Use the floor ID from the section
                parentPlaceId: roomData.ParentId,
                emailAddress: roomData.EmailAddress || null,
                capacity: roomData.Capacity != null ? Number(roomData.Capacity) : null,
                isBookable: roomData.IsBookable || false,
              });
              roomsCreated++;
            }
          } else if (floor && floor.id) {
            // Room belongs directly to a floor
            const existing = await storage.getRoomByPlaceId?.(roomData.PlaceId);
            if (!existing) {
              await storage.createRoom?.({
                placeId: roomData.PlaceId,
                name: roomData.DisplayName || roomData.Name || 'Unknown Room',
                type: roomData.Type || 'Room',
                sectionId: null, // No section
                floorId: floor.id,
                parentPlaceId: roomData.ParentId,
                emailAddress: roomData.EmailAddress || null,
                capacity: roomData.Capacity != null ? Number(roomData.Capacity) : null,
                isBookable: roomData.IsBookable || false,
              });
              roomsCreated++;
            }
          } else {
            console.warn(`No section or floor found for room ${roomData.DisplayName} (${roomData.PlaceId}), parentId: ${roomData.ParentId}`);
          }
        }
      }
      console.log(`Rooms created: ${roomsCreated}`);

      // Log commands
      await storage.addCommandHistory({
        command: 'Get-PlaceV3 -Type Building, Floor, Section, Desk',
        output: `Buildings: ${buildingsData.length} retrieved`,
        status: 'success',
      });

      res.json({ 
        message: 'Places refreshed successfully',
        buildings: buildingsData.length,
        summary: 'Places hierarchy synchronized with Microsoft 365'
      });
    } catch (error) {
      console.error('Places refresh error:', error);
      res.status(500).json({ 
        message: 'Failed to refresh places',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/places/hierarchy', async (req, res) => {
    try {
      const buildings = await storage.getAllBuildings();
      const hierarchy: any[] = [];

      for (const building of buildings) {
        const floors = await storage.getFloorsByBuildingId(building.id);
        const buildingNode: any = {
          ...building,
          floors: [] as any[],
        };

        for (const floor of floors) {
          const sections = await storage.getSectionsByFloorId(floor.id);
          const floorNode: any = {
            ...floor,
            sections: [] as any[],
            rooms: [] as any[],
          };

          // Fetch rooms directly associated with this floor
          const floorRooms = await storage.getRoomsByFloorId?.(floor.id) || [];
          floorNode.rooms = floorRooms;

          for (const section of sections) {
            const desks = await storage.getDesksBySectionId(section.id);
            const rooms = await storage.getRoomsBySectionId?.(section.id) || [];
            const sectionNode: any = {
              ...section,
              desks,
              rooms,
            };
            (floorNode.sections as any[]).push(sectionNode);
          }

          (buildingNode.floors as any[]).push(floorNode);
        }

        hierarchy.push(buildingNode);
      }

      res.json(hierarchy);
      console.dir(hierarchy, { depth: null }); // Debug log to print the full hierarchy
    } catch (error) {
      console.error('Hierarchy fetch error:', error);
      res.status(500).json({ 
        message: 'Failed to get places hierarchy',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // System mode endpoints
  app.get('/api/system/mode', async (req, res) => {
    res.json({
      platform: process.platform,
      isDemo: powerShellService.isInDemoMode(),
      canForceReal: process.platform !== 'win32'
    });
  });

  app.post('/api/system/mode/toggle', async (req, res) => {
    if (process.platform === 'win32') {
      return res.status(400).json({ message: 'Cannot toggle mode on Windows - always real mode' });
    }

    const { forceReal } = req.body;
    powerShellService.setForceRealMode(forceReal === true);
    
    res.json({
      platform: process.platform,
      isDemo: powerShellService.isInDemoMode(),
      canForceReal: true
    });
  });

  // Create new places
  app.post('/api/places/building', async (req, res) => {
    try {
      const buildingData = insertBuildingSchema.omit({ placeId: true }).parse(req.body);
      const result = await powerShellService.createPlace(
        'Building',
        buildingData.name,
        buildingData.description || undefined,
        undefined,
        {
          CountryOrRegion: buildingData.countryOrRegion || '',
          State: buildingData.state || '',
          City: buildingData.city || '',
          Street: buildingData.street || '',
          PostalCode: buildingData.postalCode || '',
        }
      );
      if (result.exitCode === 0) {
        await storage.addCommandHistory({
          command: `New-Place -Type Building -DisplayName "${buildingData.name}"`,
          output: result.output,
          status: 'success',
        });
        await refreshPlacesDataInternal();
        res.json({ message: 'Building created successfully', result });
      } else {
        res.status(500).json({ message: 'Failed to create building', error: result.error });
      }
    } catch (error) {
      res.status(400).json({ 
        message: 'Invalid building data',
        error: error instanceof Error ? error.message : 'Unknown validation error',
        received: req.body
      });
    }
  });

  app.post('/api/places/floor', async (req, res) => {
    try {
      const building = await storage.getBuildingById(req.body.buildingId);
      if (!building) {
        return res.status(400).json({ message: 'Building not found' });
      }
      const floorData = insertFloorSchema.omit({ placeId: true, parentPlaceId: true }).parse(req.body);
      const result = await powerShellService.createPlace(
        'Floor',
        floorData.name,
        floorData.description || undefined,
        building.placeId
      );
      if (result.exitCode === 0) {
        await storage.addCommandHistory({
          command: `New-Place -Type Floor -DisplayName "${floorData.name}" -ParentId "${building.placeId}"`,
          output: result.output,
          status: 'success',
        });
        await refreshPlacesDataInternal();
        res.json({ message: 'Floor created successfully', result });
      } else {
        res.status(500).json({ message: 'Failed to create floor', error: result.error });
      }
    } catch (error) {
      res.status(400).json({ 
        message: 'Invalid floor data',
        error: error instanceof Error ? error.message : 'Unknown validation error',
        received: req.body
      });
    }
  });

  app.post('/api/places/section', async (req, res) => {
    try {
      const floor = await storage.getFloorById(req.body.floorId);
      if (!floor) {
        return res.status(400).json({ message: 'Floor not found' });
      }
      const sectionData = insertSectionSchema.omit({ placeId: true, parentPlaceId: true }).parse(req.body);
      const result = await powerShellService.createPlace(
        'Section',
        sectionData.name,
        sectionData.description || undefined,
        floor.placeId
      );
      if (result.exitCode === 0) {
        await storage.addCommandHistory({
          command: `New-Place -Type Section -DisplayName "${sectionData.name}" -ParentId "${floor.placeId}"`,
          output: result.output,
          status: 'success',
        });
        await refreshPlacesDataInternal();
        res.json({ message: 'Section created successfully', result });
      } else {
        res.status(500).json({ message: 'Failed to create section', error: result.error });
      }
    } catch (error) {
      res.status(400).json({ 
        message: 'Invalid section data',
        error: error instanceof Error ? error.message : 'Unknown validation error',
        received: req.body
      });
    }
  });

  app.post('/api/places/desk', async (req, res) => {
    try {
      const section = await storage.getSectionById(req.body.sectionId);
      if (!section) {
        return res.status(400).json({ message: 'Section not found' });
      }
      const deskData = insertDeskSchema.omit({ placeId: true, parentPlaceId: true }).parse(req.body);
      const result = await powerShellService.createPlace(
        'Desk',
        deskData.name,
        deskData.description || undefined,
        section.placeId
      );
      if (result.exitCode === 0) {
        await storage.addCommandHistory({
          command: `New-Place -Type Desk -DisplayName "${deskData.name}" -ParentId "${section.placeId}"`,
          output: result.output,
          status: 'success',
        });
        await refreshPlacesDataInternal();
        res.json({ message: 'Desk created successfully', result });
      } else {
        res.status(500).json({ message: 'Failed to create desk', error: result.error });
      }
    } catch (error) {
      res.status(400).json({ 
        message: 'Invalid desk data',
        error: error instanceof Error ? error.message : 'Unknown validation error',
        received: req.body
      });
    }
  });

  app.post('/api/places/room', async (req, res) => {
    try {
      // Room can only be created under a section (Microsoft Places limitation)
      let parentPlaceId: string | undefined;
      let floorId: number | undefined;
      let sectionId: number | undefined;
      
      if (req.body.sectionId) {
        const section = await storage.getSectionById(req.body.sectionId);
        if (!section) {
          return res.status(400).json({ message: 'Section not found' });
        }
        parentPlaceId = section.placeId;
        floorId = section.floorId;
        sectionId = section.id;
      } else {
        return res.status(400).json({ 
          message: 'Section ID is required. Rooms can only be created under sections in Microsoft Places.',
          error: 'Microsoft Places limitation: Rooms must be created under sections, not directly under floors.'
        });
      }
      
      const roomData = insertRoomSchema.omit({ placeId: true, parentPlaceId: true, floorId: true, sectionId: true }).parse(req.body);
      
      const trimmedName = roomData.name.trim();

      if (!roomData.emailAddress) {
        return res.status(400).json({
          message: 'Email address is required to create a bookable room.'
        });
      }

      // Use the enhanced room creation method
      const result = await powerShellService.createRoom(
        trimmedName,
        roomData.description || '',
        parentPlaceId,
        roomData.emailAddress,
        roomData.capacity || undefined,
        roomData.isBookable || true
      );
      
      if (result.exitCode === 0) {
        await storage.addCommandHistory({
          command: `Create/associate room '${trimmedName}' with email '${roomData.emailAddress}'`,
          output: result.output,
          status: 'success',
        });
        await refreshPlacesDataInternal();
        res.json({ message: 'Room created or associated successfully', result });
      } else {
        console.error('Failed to create room in PowerShell:', result);
        res.status(500).json({ message: 'Failed to create room', error: result.error });
      }
    } catch (error) {
      console.error('Error processing /api/places/room:', error);
      res.status(400).json({ 
        message: 'Invalid room data',
        error: error instanceof Error ? error.message : 'Unknown validation error',
        received: req.body
      });
    }
  });

  // Get parent data for form dropdowns
  app.get('/api/places/parents', async (req, res) => {
    try {
      const buildings = await storage.getAllBuildings();
      const allFloors = [];
      const allSections = [];
      
      for (const building of buildings) {
        const floors = await storage.getFloorsByBuildingId(building.id);
        allFloors.push(...floors);
        
        for (const floor of floors) {
          const sections = await storage.getSectionsByFloorId(floor.id);
          allSections.push(...sections);
        }
      }

      res.json({
        buildings,
        floors: allFloors,
        sections: allSections,
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to get parent data' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
