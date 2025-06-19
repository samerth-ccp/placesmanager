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
  insertDeskSchema
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize PowerShell service
  try {
    await powerShellService.initialize();
    await storage.upsertConnectionStatus({
      serviceName: 'PowerShell',
      status: 'connected',
      errorMessage: null,
    });
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
                capacity: deskData.Capacity || null,
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
          if (section || floor) {
            const existing = await storage.getRoomByPlaceId?.(roomData.PlaceId);
            if (!existing) {
              await storage.createRoom?.({
                placeId: roomData.PlaceId,
                name: roomData.DisplayName || roomData.Name || 'Unknown Room',
                type: roomData.Type || 'Room',
                sectionId: section ? section.id : null,
                floorId: floor ? floor.id : null,
                parentPlaceId: roomData.ParentId,
                emailAddress: roomData.EmailAddress || null,
                capacity: roomData.Capacity || null,
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
      console.log('Received building data:', req.body);
      
      // Generate a unique placeId for the building
      const placeId = `building-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const buildingData = insertBuildingSchema.parse({
        ...req.body,
        placeId
      });
      console.log('Parsed building data:', buildingData);
      
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
        const building = await storage.createBuilding(buildingData);
        
        // Log command
        await storage.addCommandHistory({
          command: `New-Place -DisplayName "${buildingData.name}" -Type Building`,
          output: result.output,
          status: 'success',
        });

        res.json({ building, result });
      } else {
        res.status(500).json({ message: 'Failed to create building', error: result.error });
      }
    } catch (error) {
      console.error('Building validation error:', error);
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

      const placeId = `floor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const floorData = insertFloorSchema.parse({
        ...req.body,
        placeId,
        parentPlaceId: building.placeId,
      });

      const result = await powerShellService.createPlace(
        'Floor',
        floorData.name,
        floorData.description || undefined,
        building.placeId
      );

      if (result.exitCode === 0) {
        const floor = await storage.createFloor(floorData);
        
        await storage.addCommandHistory({
          command: `New-Place -DisplayName "${floorData.name}" -Type Floor -ParentId "${building.placeId}"`,
          output: result.output,
          status: 'success',
        });

        res.json({ floor, result });
      } else {
        res.status(500).json({ message: 'Failed to create floor', error: result.error });
      }
    } catch (error) {
      console.error('Floor validation error:', error);
      res.status(400).json({ message: 'Invalid floor data', error: error instanceof Error ? error.message : 'Unknown validation error' });
    }
  });

  app.post('/api/places/section', async (req, res) => {
    try {
      const floor = await storage.getFloorById(req.body.floorId);
      
      if (!floor) {
        return res.status(400).json({ message: 'Floor not found' });
      }

      const placeId = `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const sectionData = insertSectionSchema.parse({
        ...req.body,
        placeId,
        parentPlaceId: floor.placeId,
      });

      const result = await powerShellService.createPlace(
        'Section',
        sectionData.name,
        sectionData.description || undefined,
        floor.placeId
      );

      if (result.exitCode === 0) {
        const section = await storage.createSection(sectionData);
        
        await storage.addCommandHistory({
          command: `New-Place -DisplayName "${sectionData.name}" -Type Section -ParentId "${floor.placeId}"`,
          output: result.output,
          status: 'success',
        });

        res.json({ section, result });
      } else {
        res.status(500).json({ message: 'Failed to create section', error: result.error });
      }
    } catch (error) {
      console.error('Section validation error:', error);
      res.status(400).json({ message: 'Invalid section data', error: error instanceof Error ? error.message : 'Unknown validation error' });
    }
  });

  app.post('/api/places/desk', async (req, res) => {
    try {
      const section = await storage.getSectionById(req.body.sectionId);
      
      if (!section) {
        return res.status(400).json({ message: 'Section not found' });
      }

      const placeId = `desk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const deskData = insertDeskSchema.parse({
        ...req.body,
        placeId,
        parentPlaceId: section.placeId,
      });

      const result = await powerShellService.createPlace(
        'Desk',
        deskData.name,
        undefined,
        section.placeId,
        {
          Type: deskData.type,
          EmailAddress: deskData.emailAddress || '',
          Capacity: deskData.capacity?.toString() || '1',
          IsBookable: deskData.isBookable ? 'true' : 'false',
        }
      );

      if (result.exitCode === 0) {
        const desk = await storage.createDesk(deskData);
        
        await storage.addCommandHistory({
          command: `New-Place -DisplayName "${deskData.name}" -Type ${deskData.type} -ParentId "${section.placeId}" -EmailAddress "${deskData.emailAddress}" -Capacity ${deskData.capacity} -IsBookable $${deskData.isBookable}`,
          output: result.output,
          status: 'success',
        });

        res.json({ desk, result });
      } else {
        res.status(500).json({ message: 'Failed to create desk', error: result.error });
      }
    } catch (error) {
      console.error('Desk validation error:', error);
      res.status(400).json({ message: 'Invalid desk data', error: error instanceof Error ? error.message : 'Unknown validation error' });
    }
  });

  app.post('/api/places/room', async (req, res) => {
    try {
      const floor = await storage.getFloorById(req.body.floorId);
      
      if (!floor) {
        return res.status(400).json({ message: 'Floor not found' });
      }

      const parentId = req.body.sectionId ? 
        (await storage.getSectionById(req.body.sectionId))?.placeId : 
        floor.placeId;

      const placeId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const roomData = insertRoomSchema.parse({
        ...req.body,
        placeId,
        parentPlaceId: parentId || floor.placeId,
      });

      const result = await powerShellService.createPlace(
        'Room',
        roomData.name,
        undefined,
        parentId || floor.placeId,
        {
          EmailAddress: roomData.emailAddress || '',
          Capacity: roomData.capacity?.toString() || '1',
          IsBookable: roomData.isBookable ? 'true' : 'false',
        }
      );

      if (result.exitCode === 0) {
        const room = await storage.createRoom(roomData);
        
        await storage.addCommandHistory({
          command: `New-Place -DisplayName "${roomData.name}" -Type Room -ParentId "${parentId || floor.placeId}" -EmailAddress "${roomData.emailAddress}" -Capacity ${roomData.capacity} -IsBookable $${roomData.isBookable}`,
          output: result.output,
          status: 'success',
        });

        res.json({ room, result });
      } else {
        res.status(500).json({ message: 'Failed to create room', error: result.error });
      }
    } catch (error) {
      console.error('Room validation error:', error);
      res.status(400).json({ message: 'Invalid room data', error: error instanceof Error ? error.message : 'Unknown validation error' });
    }
  });

  // Update places endpoints
  app.put('/api/places/building/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const building = await storage.getBuildingById(id);
      
      if (!building) {
        return res.status(404).json({ message: 'Building not found' });
      }

      const buildingData = insertBuildingSchema.partial().parse(req.body);
      
      // Update via PowerShell
      const result = await powerShellService.updatePlace(building.placeId, buildingData);
      
      if (result.exitCode === 0) {
        const updated = await storage.updateBuilding(id, buildingData);
        
        await storage.addCommandHistory({
          command: `Set-Place -Identity "${building.placeId}" -DisplayName "${buildingData.name || building.name}"`,
          output: result.output,
          status: 'success',
        });

        res.json({ building: updated, result });
      } else {
        res.status(500).json({ message: 'Failed to update building', error: result.error });
      }
    } catch (error) {
      console.error('Building update error:', error);
      res.status(400).json({ message: 'Invalid building data', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put('/api/places/floor/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const floor = await storage.getFloorById(id);
      
      if (!floor) {
        return res.status(404).json({ message: 'Floor not found' });
      }

      const floorData = insertFloorSchema.partial().parse(req.body);
      
      const result = await powerShellService.updatePlace(floor.placeId, floorData);
      
      if (result.exitCode === 0) {
        const updated = await storage.updateFloor(id, floorData);
        
        await storage.addCommandHistory({
          command: `Set-Place -Identity "${floor.placeId}" -DisplayName "${floorData.name || floor.name}"`,
          output: result.output,
          status: 'success',
        });

        res.json({ floor: updated, result });
      } else {
        res.status(500).json({ message: 'Failed to update floor', error: result.error });
      }
    } catch (error) {
      console.error('Floor update error:', error);
      res.status(400).json({ message: 'Invalid floor data', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put('/api/places/section/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const section = await storage.getSectionById(id);
      
      if (!section) {
        return res.status(404).json({ message: 'Section not found' });
      }

      const sectionData = insertSectionSchema.partial().parse(req.body);
      
      const result = await powerShellService.updatePlace(section.placeId, sectionData);
      
      if (result.exitCode === 0) {
        const updated = await storage.updateSection(id, sectionData);
        
        await storage.addCommandHistory({
          command: `Set-Place -Identity "${section.placeId}" -DisplayName "${sectionData.name || section.name}"`,
          output: result.output,
          status: 'success',
        });

        res.json({ section: updated, result });
      } else {
        res.status(500).json({ message: 'Failed to update section', error: result.error });
      }
    } catch (error) {
      console.error('Section update error:', error);
      res.status(400).json({ message: 'Invalid section data', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put('/api/places/desk/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const desk = await storage.getDeskById(id);
      
      if (!desk) {
        return res.status(404).json({ message: 'Desk not found' });
      }

      const deskData = insertDeskSchema.partial().parse(req.body);
      
      const result = await powerShellService.updatePlace(desk.placeId, deskData);
      
      if (result.exitCode === 0) {
        const updated = await storage.updateDesk(id, deskData);
        
        await storage.addCommandHistory({
          command: `Set-Place -Identity "${desk.placeId}" -DisplayName "${deskData.name || desk.name}"`,
          output: result.output,
          status: 'success',
        });

        res.json({ desk: updated, result });
      } else {
        res.status(500).json({ message: 'Failed to update desk', error: result.error });
      }
    } catch (error) {
      console.error('Desk update error:', error);
      res.status(400).json({ message: 'Invalid desk data', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put('/api/places/room/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const room = await storage.getRoomById(id);
      
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      const roomData = insertRoomSchema.partial().parse(req.body);
      
      const result = await powerShellService.updatePlace(room.placeId, roomData);
      
      if (result.exitCode === 0) {
        const updated = await storage.updateRoom(id, roomData);
        
        await storage.addCommandHistory({
          command: `Set-Place -Identity "${room.placeId}" -DisplayName "${roomData.name || room.name}"`,
          output: result.output,
          status: 'success',
        });

        res.json({ room: updated, result });
      } else {
        res.status(500).json({ message: 'Failed to update room', error: result.error });
      }
    } catch (error) {
      console.error('Room update error:', error);
      res.status(400).json({ message: 'Invalid room data', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete places endpoints  
  app.delete('/api/places/building/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const building = await storage.getBuildingById(id);
      
      if (!building) {
        return res.status(404).json({ message: 'Building not found' });
      }

      // Delete via PowerShell
      const result = await powerShellService.deletePlace(building.placeId);
      
      if (result.exitCode === 0) {
        await storage.deleteBuilding(id);

        await storage.addCommandHistory({
          command: `Remove-Place -Identity "${building.placeId}" -Confirm:$false`,
          output: result.output,
          status: 'success',
        });

        res.json({ message: 'Building deleted successfully', result });
      } else {
        res.status(500).json({ message: 'Failed to delete building', error: result.error });
      }
    } catch (error) {
      console.error('Building deletion error:', error);
      res.status(500).json({ message: 'Failed to delete building', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Similar delete endpoints for other types
  app.delete('/api/places/floor/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const floor = await storage.getFloorById(id);
      
      if (!floor) {
        return res.status(404).json({ message: 'Floor not found' });
      }

      const result = await powerShellService.deletePlace(floor.placeId);
      
      if (result.exitCode === 0) {
        await storage.deleteFloor(id);

        await storage.addCommandHistory({
          command: `Remove-Place -Identity "${floor.placeId}" -Confirm:$false`,
          output: result.output,
          status: 'success',
        });

        res.json({ message: 'Floor deleted successfully', result });
      } else {
        res.status(500).json({ message: 'Failed to delete floor', error: result.error });
      }
    } catch (error) {
      console.error('Floor deletion error:', error);
      res.status(500).json({ message: 'Failed to delete floor', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete('/api/places/section/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const section = await storage.getSectionById(id);
      
      if (!section) {
        return res.status(404).json({ message: 'Section not found' });
      }

      const result = await powerShellService.deletePlace(section.placeId);
      
      if (result.exitCode === 0) {
        await storage.deleteSection(id);

        await storage.addCommandHistory({
          command: `Remove-Place -Identity "${section.placeId}" -Confirm:$false`,
          output: result.output,
          status: 'success',
        });

        res.json({ message: 'Section deleted successfully', result });
      } else {
        res.status(500).json({ message: 'Failed to delete section', error: result.error });
      }
    } catch (error) {
      console.error('Section deletion error:', error);
      res.status(500).json({ message: 'Failed to delete section', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete('/api/places/desk/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const desk = await storage.getDeskById(id);
      
      if (!desk) {
        return res.status(404).json({ message: 'Desk not found' });
      }

      const result = await powerShellService.deletePlace(desk.placeId);
      
      if (result.exitCode === 0) {
        await storage.deleteDesk(id);

        await storage.addCommandHistory({
          command: `Remove-Place -Identity "${desk.placeId}" -Confirm:$false`,
          output: result.output,
          status: 'success',
        });

        res.json({ message: 'Desk deleted successfully', result });
      } else {
        res.status(500).json({ message: 'Failed to delete desk', error: result.error });
      }
    } catch (error) {
      console.error('Desk deletion error:', error);
      res.status(500).json({ message: 'Failed to delete desk', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete('/api/places/room/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const room = await storage.getRoomById(id);
      
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      const result = await powerShellService.deletePlace(room.placeId);
      
      if (result.exitCode === 0) {
        await storage.deleteRoom(id);

        await storage.addCommandHistory({
          command: `Remove-Place -Identity "${room.placeId}" -Confirm:$false`,
          output: result.output,
          status: 'success',
        });

        res.json({ message: 'Room deleted successfully', result });
      } else {
        res.status(500).json({ message: 'Failed to delete room', error: result.error });
      }
    } catch (error) {
      console.error('Room deletion error:', error);
      res.status(500).json({ message: 'Failed to delete room', error: error instanceof Error ? error.message : 'Unknown error' });
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
