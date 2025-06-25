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
    // Get all places data first
    const buildingsResult = await powerShellService.getPlaces('Building');
    const floorsResult = await powerShellService.getPlaces('Floor');
    const sectionsResult = await powerShellService.getPlaces('Section');
    const desksResult = await powerShellService.getPlaces('Desk');
    const roomsResult = await powerShellService.getPlaces('Room');

    // Parse all data
    const buildingsData = buildingsResult.exitCode === 0 ? await powerShellService.parsePlacesOutput(`Building\n${buildingsResult.output}`) : [];
    const floorsData = floorsResult.exitCode === 0 ? await powerShellService.parsePlacesOutput(`Floor\n${floorsResult.output}`) : [];
    const sectionsData = sectionsResult.exitCode === 0 ? await powerShellService.parsePlacesOutput(`Section\n${sectionsResult.output}`) : [];
    const desksData = desksResult.exitCode === 0 ? await powerShellService.parsePlacesOutput(`Desk\n${desksResult.output}`) : [];
    const roomsData = roomsResult.exitCode === 0 ? await powerShellService.parsePlacesOutput(`Room\n${roomsResult.output}`) : [];

    // Get existing data from local database
    const existingBuildings = await storage.getAllBuildings();
    const existingFloors = await Promise.all(existingBuildings.map(b => storage.getFloorsByBuildingId(b.id))).then(floors => floors.flat());
    const existingSections = await Promise.all(existingFloors.map(f => storage.getSectionsByFloorId(f.id))).then(sections => sections.flat());
    const existingDesks = await Promise.all(existingSections.map(s => storage.getDesksBySectionId(s.id))).then(desks => desks.flat());
    const existingRooms = await Promise.all([
      ...existingSections.map(s => storage.getRoomsBySectionId?.(s.id) || []),
      ...existingFloors.map(f => storage.getRoomsByFloorId?.(f.id) || [])
    ]).then(rooms => rooms.flat());

    // Create sets of PlaceIds from Microsoft Places for efficient lookup
    const msPlacesBuildingIds = new Set(buildingsData.map(b => b.PlaceId));
    const msPlacesFloorIds = new Set(floorsData.map(f => f.PlaceId));
    const msPlacesSectionIds = new Set(sectionsData.map(s => s.PlaceId));
    const msPlacesDeskIds = new Set(desksData.map(d => d.PlaceId));
    const msPlacesRoomIds = new Set(roomsData.map(r => r.PlaceId));

    // Remove items that no longer exist in Microsoft Places
    // Remove rooms that no longer exist in Microsoft Places
    for (const room of existingRooms) {
      if (!msPlacesRoomIds.has(room.placeId)) {
        await storage.deleteRoom(room.id);
      }
    }

    // Remove desks that no longer exist in Microsoft Places
    for (const desk of existingDesks) {
      if (!msPlacesDeskIds.has(desk.placeId)) {
        await storage.deleteDesk(desk.id);
      }
    }

    // Remove sections that no longer exist in Microsoft Places
    for (const section of existingSections) {
      if (!msPlacesSectionIds.has(section.placeId)) {
        await storage.deleteSection(section.id);
      }
    }

    // Remove floors that no longer exist in Microsoft Places
    for (const floor of existingFloors) {
      if (!msPlacesFloorIds.has(floor.placeId)) {
        await storage.deleteFloor(floor.id);
      }
    }

    // Remove buildings that no longer exist in Microsoft Places
    for (const building of existingBuildings) {
      if (!msPlacesBuildingIds.has(building.placeId)) {
        await storage.deleteBuilding(building.id);
      }
    }

    // Step 1: Create all buildings first (they have no parents)
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

    // Step 2: Create floors (they belong to buildings)
    for (const floorData of floorsData) {
      const existing = await storage.getFloorByPlaceId(floorData.PlaceId);
      if (!existing) {
        const building = await storage.getBuildingByPlaceId(floorData.ParentId);
        if (building && typeof building.id === 'number') {
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

    // Step 3: Create sections (they belong to floors)
    for (const sectionData of sectionsData) {
      const existing = await storage.getSectionByPlaceId(sectionData.PlaceId);
      if (!existing) {
        const floor = await storage.getFloorByPlaceId(sectionData.ParentId);
        if (floor && typeof floor.id === 'number') {
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

    // Step 4: Create desks (they belong to sections)
    for (const deskData of desksData) {
      const existing = await storage.getDeskByPlaceId(deskData.PlaceId);
      if (!existing) {
        const section = await storage.getSectionByPlaceId(deskData.ParentId);
        if (section && typeof section.id === 'number') {
          await storage.createDesk({
            placeId: deskData.PlaceId,
            name: deskData.DisplayName || deskData.Name || 'Unknown Desk',
            type: deskData.Type || 'Desk',
            sectionId: section.id,
            parentPlaceId: deskData.ParentId,
            capacity: deskData.Capacity != null ? Number(deskData.Capacity) : null,
            isBookable: deskData.IsBookable || false,
          });
        }
      }
    }

    // Step 5: Create rooms (they can belong to sections or floors, or be orphaned)
    for (const roomData of roomsData) {
      const existing = await storage.getRoomByPlaceId?.(roomData.PlaceId);
      if (!existing) {
        // Try to find parent - first check if it's a section
        const section = await storage.getSectionByPlaceId(roomData.ParentId);
        if (section && typeof section.id === 'number') {
          // Room belongs to a section
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
        } else {
          // Try to find if parent is a floor
          const floor = await storage.getFloorByPlaceId(roomData.ParentId);
          if (floor && typeof floor.id === 'number') {
            // Room belongs directly to a floor
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
          } else {
            // Room is orphaned - create it without a parent (this can happen in Microsoft Places)
            await storage.createRoom?.({
              placeId: roomData.PlaceId,
              name: roomData.DisplayName || roomData.Name || 'Unknown Room',
              type: roomData.Type || 'Room',
              sectionId: null,
              floorId: null,
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

      console.log('Starting Exchange Online connection process...');

      // Update status to connecting
      await storage.upsertConnectionStatus({
        serviceName: 'Exchange Online',
        status: 'connecting',
        errorMessage: null,
      });

      // Attempt connection with timeout
      const connectionPromise = powerShellService.connectExchangeOnline(tenantDomain);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout after 2 minutes')), 120000)
      );
      
      const result = await Promise.race([connectionPromise, timeoutPromise]) as any;
      
      console.log('Exchange Online connection result:', {
        exitCode: result.exitCode,
        outputLength: result.output?.length,
        errorLength: result.error?.length,
        duration: result.duration
      });
      
      // Verify the connection by testing if we can run a simple Exchange command
      let verificationResult = null;
      if (result.exitCode === 0) {
        try {
          console.log('Starting connection verification...');
          verificationResult = await powerShellService.verifyExchangeOnlineConnection();
          console.log('Exchange Online connection verification result:', verificationResult);
        } catch (verifyError) {
          console.log('Exchange Online verification failed:', verifyError);
          verificationResult = {
            exitCode: 1,
            error: verifyError instanceof Error ? verifyError.message : 'Verification failed'
          };
        }
      }
      
      // Update status based on both connection and verification results
      const finalExitCode = result.exitCode === 0 && verificationResult?.exitCode === 0 ? 0 : 1;
      const status = finalExitCode === 0 ? 'connected' : 'error';
      const errorMessage = finalExitCode === 0 ? null : 
        (verificationResult?.error || result.error || 'Connection failed');
      
      console.log('Final connection status:', { status, errorMessage, finalExitCode });
      
      const updatedConnection = await storage.upsertConnectionStatus({
        serviceName: 'Exchange Online',
        status,
        errorMessage,
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
        output: result.output + (verificationResult ? `\n\nVerification: ${verificationResult.output || verificationResult.error}` : ''),
        status: finalExitCode === 0 ? 'success' : 'error',
      });

      res.json({ 
        connection: updatedConnection, 
        result,
        verification: verificationResult
      });
    } catch (error) {
      console.error('Exchange Online connection error:', error);
      
      // Update status to error
      await storage.upsertConnectionStatus({
        serviceName: 'Exchange Online',
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Connection failed',
      });
      
      res.status(500).json({ 
        message: 'Failed to connect to Exchange Online',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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

  app.get('/api/connections/exchange/status', async (req, res) => {
    try {
      // Test if Exchange Online connection is currently working
      const verificationResult = await powerShellService.verifyExchangeOnlineConnection();
      
      const status = verificationResult.exitCode === 0 ? 'connected' : 'error';
      const errorMessage = verificationResult.exitCode === 0 ? null : verificationResult.error;
      
      // Update the stored connection status
      const updatedConnection = await storage.upsertConnectionStatus({
        serviceName: 'Exchange Online',
        status,
        errorMessage,
      });
      
      res.json({ 
        connection: updatedConnection, 
        verification: verificationResult 
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to check Exchange Online connection status' });
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
      // Allow testing by bypassing connection requirement in demo mode
      if (!powerShellService.isInDemoMode()) {
        const exchangeConnection = await storage.getConnectionStatus('Exchange Online');
        console.log('Exchange Online connection status:', exchangeConnection);
        if (!exchangeConnection || exchangeConnection.status !== 'connected') {
          // For testing purposes, allow refresh even without connection
          console.log('Exchange Online not connected, but allowing refresh for testing');
        }
      }

      // Get all places data first
      const buildingsResult = await powerShellService.getPlaces('Building');
      const floorsResult = await powerShellService.getPlaces('Floor');
      const sectionsResult = await powerShellService.getPlaces('Section');  
      const desksResult = await powerShellService.getPlaces('Desk');
      const roomsResult = await powerShellService.getPlaces('Room');

      if (buildingsResult.exitCode !== 0) {
        return res.status(500).json({ 
          message: 'Failed to fetch buildings',
          error: buildingsResult.error || 'PowerShell command failed',
          requiresConnection: !powerShellService.isInDemoMode()
        });
      }

      // Parse all data
      const buildingsData = await powerShellService.parsePlacesOutput(`Building\n${buildingsResult.output}`);
      const floorsData = floorsResult.exitCode === 0 ? await powerShellService.parsePlacesOutput(`Floor\n${floorsResult.output}`) : [];
      const sectionsData = sectionsResult.exitCode === 0 ? await powerShellService.parsePlacesOutput(`Section\n${sectionsResult.output}`) : [];
      const desksData = desksResult.exitCode === 0 ? await powerShellService.parsePlacesOutput(`Desk\n${desksResult.output}`) : [];
      const roomsData = roomsResult.exitCode === 0 ? await powerShellService.parsePlacesOutput(`Room\n${roomsResult.output}`) : [];

      console.log(`Parsed buildings: ${buildingsData.length}`);
      console.log(`Parsed floors: ${floorsData.length}`);
      console.log(`Parsed sections: ${sectionsData.length}`);
      console.log(`Parsed desks: ${desksData.length}`);
      console.log(`Parsed rooms: ${roomsData.length}`);

      // Get existing data from local database
      const existingBuildings = await storage.getAllBuildings();
      const existingFloors = await Promise.all(existingBuildings.map(b => storage.getFloorsByBuildingId(b.id))).then(floors => floors.flat());
      const existingSections = await Promise.all(existingFloors.map(f => storage.getSectionsByFloorId(f.id))).then(sections => sections.flat());
      const existingDesks = await Promise.all(existingSections.map(s => storage.getDesksBySectionId(s.id))).then(desks => desks.flat());
      const existingRooms = await Promise.all([
        ...existingSections.map(s => storage.getRoomsBySectionId?.(s.id) || []),
        ...existingFloors.map(f => storage.getRoomsByFloorId?.(f.id) || [])
      ]).then(rooms => rooms.flat());

      // Create sets of PlaceIds from Microsoft Places for efficient lookup
      const msPlacesBuildingIds = new Set(buildingsData.map(b => b.PlaceId));
      const msPlacesFloorIds = new Set(floorsData.map(f => f.PlaceId));
      const msPlacesSectionIds = new Set(sectionsData.map(s => s.PlaceId));
      const msPlacesDeskIds = new Set(desksData.map(d => d.PlaceId));
      const msPlacesRoomIds = new Set(roomsData.map(r => r.PlaceId));

      // Remove items that no longer exist in Microsoft Places
      let buildingsRemoved = 0;
      let floorsRemoved = 0;
      let sectionsRemoved = 0;
      let desksRemoved = 0;
      let roomsRemoved = 0;

      // Remove rooms that no longer exist in Microsoft Places
      for (const room of existingRooms) {
        if (!msPlacesRoomIds.has(room.placeId)) {
          await storage.deleteRoom(room.id);
          roomsRemoved++;
        }
      }

      // Remove desks that no longer exist in Microsoft Places
      for (const desk of existingDesks) {
        if (!msPlacesDeskIds.has(desk.placeId)) {
          await storage.deleteDesk(desk.id);
          desksRemoved++;
        }
      }

      // Remove sections that no longer exist in Microsoft Places
      for (const section of existingSections) {
        if (!msPlacesSectionIds.has(section.placeId)) {
          await storage.deleteSection(section.id);
          sectionsRemoved++;
        }
      }

      // Remove floors that no longer exist in Microsoft Places
      for (const floor of existingFloors) {
        if (!msPlacesFloorIds.has(floor.placeId)) {
          await storage.deleteFloor(floor.id);
          floorsRemoved++;
        }
      }

      // Remove buildings that no longer exist in Microsoft Places
      for (const building of existingBuildings) {
        if (!msPlacesBuildingIds.has(building.placeId)) {
          await storage.deleteBuilding(building.id);
          buildingsRemoved++;
        }
      }

      console.log(`Removed: ${buildingsRemoved} buildings, ${floorsRemoved} floors, ${sectionsRemoved} sections, ${desksRemoved} desks, ${roomsRemoved} rooms`);

      // Step 1: Create all buildings first (they have no parents)
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

      // Step 2: Create floors (they belong to buildings)
      let floorsCreated = 0;
      for (const floorData of floorsData) {
        const existing = await storage.getFloorByPlaceId(floorData.PlaceId);
        if (!existing) {
          const building = await storage.getBuildingByPlaceId(floorData.ParentId);
          if (building && typeof building.id === 'number') {
            await storage.createFloor({
              placeId: floorData.PlaceId,
              name: floorData.DisplayName || floorData.Name || 'Unknown Floor',
              description: floorData.Description || null,
              buildingId: building.id,
              parentPlaceId: floorData.ParentId,
            });
            floorsCreated++;
          } else {
            console.warn(`No building found for floor ${floorData.DisplayName} (${floorData.PlaceId}), parentId: ${floorData.ParentId}`);
          }
        }
      }
      console.log(`Floors created: ${floorsCreated}`);

      // Step 3: Create sections (they belong to floors)
      let sectionsCreated = 0;
      for (const sectionData of sectionsData) {
        const existing = await storage.getSectionByPlaceId(sectionData.PlaceId);
        if (!existing) {
          const floor = await storage.getFloorByPlaceId(sectionData.ParentId);
          if (floor && typeof floor.id === 'number') {
            await storage.createSection({
              placeId: sectionData.PlaceId,
              name: sectionData.DisplayName || sectionData.Name || 'Unknown Section',
              description: sectionData.Description || null,
              floorId: floor.id,
              parentPlaceId: sectionData.ParentId,
            });
            sectionsCreated++;
          } else {
            console.warn(`No floor found for section ${sectionData.DisplayName} (${sectionData.PlaceId}), parentId: ${sectionData.ParentId}`);
          }
        }
      }
      console.log(`Sections created: ${sectionsCreated}`);

      // Step 4: Create desks (they belong to sections)
      let desksCreated = 0;
      for (const deskData of desksData) {
        const existing = await storage.getDeskByPlaceId(deskData.PlaceId);
        if (!existing) {
          const section = await storage.getSectionByPlaceId(deskData.ParentId);
          if (section && typeof section.id === 'number') {
            await storage.createDesk({
              placeId: deskData.PlaceId,
              name: deskData.DisplayName || deskData.Name || 'Unknown Desk',
              type: deskData.Type || 'Desk',
              sectionId: section.id,
              parentPlaceId: deskData.ParentId,
              capacity: deskData.Capacity != null ? Number(deskData.Capacity) : null,
              isBookable: deskData.IsBookable || false,
            });
            desksCreated++;
          } else {
            console.warn(`No section found for desk ${deskData.DisplayName} (${deskData.PlaceId}), parentId: ${deskData.ParentId}`);
          }
        }
      }
      console.log(`Desks created: ${desksCreated}`);

      // Step 5: Create rooms (they can belong to sections or floors, or be orphaned)
      let roomsCreated = 0;
      for (const roomData of roomsData) {
        const existing = await storage.getRoomByPlaceId?.(roomData.PlaceId);
        if (!existing) {
          // Try to find parent - first check if it's a section
          const section = await storage.getSectionByPlaceId(roomData.ParentId);
          if (section && typeof section.id === 'number') {
            // Room belongs to a section
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
          } else {
            // Try to find if parent is a floor
            const floor = await storage.getFloorByPlaceId(roomData.ParentId);
            if (floor && typeof floor.id === 'number') {
              // Room belongs directly to a floor
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
            } else {
              // Room is orphaned - create it without a parent (this can happen in Microsoft Places)
              console.warn(`No section or floor found for room ${roomData.DisplayName} (${roomData.PlaceId}), parentId: ${roomData.ParentId} - creating as orphaned room`);
              await storage.createRoom?.({
                placeId: roomData.PlaceId,
                name: roomData.DisplayName || roomData.Name || 'Unknown Room',
                type: roomData.Type || 'Room',
                sectionId: null,
                floorId: null,
                parentPlaceId: roomData.ParentId,
                emailAddress: roomData.EmailAddress || null,
                capacity: roomData.Capacity != null ? Number(roomData.Capacity) : null,
                isBookable: roomData.IsBookable || false,
              });
              roomsCreated++;
            }
          }
        }
      }
      console.log(`Rooms created: ${roomsCreated}`);

      // Log commands
      await storage.addCommandHistory({
        command: 'Get-PlaceV3 -Type Building, Floor, Section, Desk, Room',
        output: `Buildings: ${buildingsData.length}, Floors: ${floorsData.length}, Sections: ${sectionsData.length}, Desks: ${desksData.length}, Rooms: ${roomsData.length} retrieved`,
        status: 'success',
      });

      res.json({ 
        message: 'Places refreshed successfully',
        summary: {
          buildings: buildingsData.length,
          floors: floorsData.length,
          sections: sectionsData.length,
          desks: desksData.length,
          rooms: roomsData.length,
          created: {
            buildings: buildingsCreated,
            floors: floorsCreated,
            sections: sectionsCreated,
            desks: desksCreated,
            rooms: roomsCreated
          },
          removed: {
            buildings: buildingsRemoved,
            floors: floorsRemoved,
            sections: sectionsRemoved,
            desks: desksRemoved,
            rooms: roomsRemoved
          }
        }
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

  // Update places endpoints
  app.put('/api/places/building/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid building ID' });
      }

      const building = await storage.getBuildingById(id);
      if (!building) {
        return res.status(404).json({ message: 'Building not found' });
      }

      const buildingData = insertBuildingSchema.omit({ placeId: true }).parse(req.body);
      
      // Update in Microsoft Places if connected
      if (!powerShellService.isInDemoMode()) {
        try {
          const result = await powerShellService.executeCommand(
            `Set-PlaceV3 -Identity "${building.placeId}" -DisplayName "${buildingData.name}" -Description "${buildingData.description || ''}" -Phone "${buildingData.phone || ''}"`
          );
          if (result.exitCode !== 0) {
            console.warn('Failed to update building in Microsoft Places:', result.error);
          }
        } catch (error) {
          console.warn('Failed to update building in Microsoft Places:', error);
        }
      }

      // Update in local database
      const updatedBuilding = await storage.updateBuilding(id, buildingData);
      if (!updatedBuilding) {
        return res.status(500).json({ message: 'Failed to update building in database' });
      }

      // Log command
      await storage.addCommandHistory({
        command: `Set-PlaceV3 -Identity "${building.placeId}" -DisplayName "${buildingData.name}"`,
        output: `Building "${buildingData.name}" updated successfully`,
        status: 'success',
      });

      res.json({ message: 'Building updated successfully', building: updatedBuilding });
    } catch (error) {
      console.error('Update building error:', error);
      res.status(400).json({ 
        message: 'Invalid building data',
        error: error instanceof Error ? error.message : 'Unknown validation error',
        received: req.body
      });
    }
  });

  app.put('/api/places/floor/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid floor ID' });
      }

      const floor = await storage.getFloorById(id);
      if (!floor) {
        return res.status(404).json({ message: 'Floor not found' });
      }

      const floorData = insertFloorSchema.omit({ placeId: true, parentPlaceId: true }).parse(req.body);
      
      // Update in Microsoft Places if connected
      if (!powerShellService.isInDemoMode()) {
        try {
          const result = await powerShellService.executeCommand(
            `Set-PlaceV3 -Identity "${floor.placeId}" -DisplayName "${floorData.name}" -Description "${floorData.description || ''}"`
          );
          if (result.exitCode !== 0) {
            console.warn('Failed to update floor in Microsoft Places:', result.error);
          }
        } catch (error) {
          console.warn('Failed to update floor in Microsoft Places:', error);
        }
      }

      // Update in local database
      const updatedFloor = await storage.updateFloor(id, floorData);
      if (!updatedFloor) {
        return res.status(500).json({ message: 'Failed to update floor in database' });
      }

      // Log command
      await storage.addCommandHistory({
        command: `Set-PlaceV3 -Identity "${floor.placeId}" -DisplayName "${floorData.name}"`,
        output: `Floor "${floorData.name}" updated successfully`,
        status: 'success',
      });

      res.json({ message: 'Floor updated successfully', floor: updatedFloor });
    } catch (error) {
      console.error('Update floor error:', error);
      res.status(400).json({ 
        message: 'Invalid floor data',
        error: error instanceof Error ? error.message : 'Unknown validation error',
        received: req.body
      });
    }
  });

  app.put('/api/places/section/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid section ID' });
      }

      const section = await storage.getSectionById(id);
      if (!section) {
        return res.status(404).json({ message: 'Section not found' });
      }

      const sectionData = insertSectionSchema.omit({ placeId: true, parentPlaceId: true }).parse(req.body);
      
      // Update in Microsoft Places if connected
      if (!powerShellService.isInDemoMode()) {
        try {
          const result = await powerShellService.executeCommand(
            `Set-PlaceV3 -Identity "${section.placeId}" -DisplayName "${sectionData.name}" -Description "${sectionData.description || ''}"`
          );
          if (result.exitCode !== 0) {
            console.warn('Failed to update section in Microsoft Places:', result.error);
          }
        } catch (error) {
          console.warn('Failed to update section in Microsoft Places:', error);
        }
      }

      // Update in local database
      const updatedSection = await storage.updateSection(id, sectionData);
      if (!updatedSection) {
        return res.status(500).json({ message: 'Failed to update section in database' });
      }

      // Log command
      await storage.addCommandHistory({
        command: `Set-PlaceV3 -Identity "${section.placeId}" -DisplayName "${sectionData.name}"`,
        output: `Section "${sectionData.name}" updated successfully`,
        status: 'success',
      });

      res.json({ message: 'Section updated successfully', section: updatedSection });
    } catch (error) {
      console.error('Update section error:', error);
      res.status(400).json({ 
        message: 'Invalid section data',
        error: error instanceof Error ? error.message : 'Unknown validation error',
        received: req.body
      });
    }
  });

  app.put('/api/places/desk/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid desk ID' });
      }

      const desk = await storage.getDeskById(id);
      if (!desk) {
        return res.status(404).json({ message: 'Desk not found' });
      }

      const deskData = insertDeskSchema.omit({ placeId: true, parentPlaceId: true }).parse(req.body);
      
      // Update in Microsoft Places if connected
      if (!powerShellService.isInDemoMode()) {
        try {
          const result = await powerShellService.executeCommand(
            `Set-PlaceV3 -Identity "${desk.placeId}" -DisplayName "${deskData.name}" -Capacity ${deskData.capacity || 1}`
          );
          if (result.exitCode !== 0) {
            console.warn('Failed to update desk in Microsoft Places:', result.error);
          }
        } catch (error) {
          console.warn('Failed to update desk in Microsoft Places:', error);
        }
      }

      // Update in local database
      const updatedDesk = await storage.updateDesk(id, deskData);
      if (!updatedDesk) {
        return res.status(500).json({ message: 'Failed to update desk in database' });
      }

      // Log command
      await storage.addCommandHistory({
        command: `Set-PlaceV3 -Identity "${desk.placeId}" -DisplayName "${deskData.name}"`,
        output: `Desk "${deskData.name}" updated successfully`,
        status: 'success',
      });

      res.json({ message: 'Desk updated successfully', desk: updatedDesk });
    } catch (error) {
      console.error('Update desk error:', error);
      res.status(400).json({ 
        message: 'Invalid desk data',
        error: error instanceof Error ? error.message : 'Unknown validation error',
        received: req.body
      });
    }
  });

  app.put('/api/places/room/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid room ID' });
      }

      const room = await storage.getRoomById(id);
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      const roomData = insertRoomSchema.omit({ placeId: true, parentPlaceId: true, floorId: true, sectionId: true }).parse(req.body);
      
      // Update in Microsoft Places if connected
      if (!powerShellService.isInDemoMode()) {
        try {
          const result = await powerShellService.executeCommand(
            `Set-PlaceV3 -Identity "${room.placeId}" -DisplayName "${roomData.name}" -Capacity ${roomData.capacity || 1}`
          );
          if (result.exitCode !== 0) {
            console.warn('Failed to update room in Microsoft Places:', result.error);
          }
        } catch (error) {
          console.warn('Failed to update room in Microsoft Places:', error);
        }
      }

      // Update in local database
      const updatedRoom = await storage.updateRoom(id, roomData);
      if (!updatedRoom) {
        return res.status(500).json({ message: 'Failed to update room in database' });
      }

      // Log command
      await storage.addCommandHistory({
        command: `Set-PlaceV3 -Identity "${room.placeId}" -DisplayName "${roomData.name}"`,
        output: `Room "${roomData.name}" updated successfully`,
        status: 'success',
      });

      res.json({ message: 'Room updated successfully', room: updatedRoom });
    } catch (error) {
      console.error('Update room error:', error);
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

  // Delete endpoints for places
  app.delete('/api/places/building/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid building ID' });
      }

      const building = await storage.getBuildingById(id);
      if (!building) {
        return res.status(404).json({ message: 'Building not found' });
      }

      // Check if building has floors
      const floors = await storage.getFloorsByBuildingId(id);
      if (floors.length > 0) {
        return res.status(400).json({ 
          message: 'Cannot delete building with floors. Please delete all floors first.' 
        });
      }

      // Delete from Microsoft Places if connected
      if (!powerShellService.isInDemoMode()) {
        try {
          const result = await powerShellService.executeCommand(`Remove-Place -Identity "${building.placeId}"`);
          if (result.exitCode !== 0) {
            console.warn('Failed to delete building from Microsoft Places:', result.error);
          }
        } catch (error) {
          console.warn('Failed to delete building from Microsoft Places:', error);
        }
      }

      // Delete from local database
      await storage.deleteBuilding(id);

      // Log command
      await storage.addCommandHistory({
        command: `Remove-Place -Identity "${building.placeId}"`,
        output: `Building "${building.name}" deleted successfully`,
        status: 'success',
      });

      res.json({ message: 'Building deleted successfully' });
    } catch (error) {
      console.error('Delete building error:', error);
      res.status(500).json({ 
        message: 'Failed to delete building',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/places/floor/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid floor ID' });
      }

      const floor = await storage.getFloorById(id);
      if (!floor) {
        return res.status(404).json({ message: 'Floor not found' });
      }

      // Check if floor has sections
      const sections = await storage.getSectionsByFloorId(id);
      if (sections.length > 0) {
        return res.status(400).json({ 
          message: 'Cannot delete floor with sections. Please delete all sections first.' 
        });
      }

      // Delete from Microsoft Places if connected
      if (!powerShellService.isInDemoMode()) {
        try {
          const result = await powerShellService.executeCommand(`Remove-Place -Identity "${floor.placeId}"`);
          if (result.exitCode !== 0) {
            console.warn('Failed to delete floor from Microsoft Places:', result.error);
          }
        } catch (error) {
          console.warn('Failed to delete floor from Microsoft Places:', error);
        }
      }

      // Delete from local database
      await storage.deleteFloor(id);

      // Log command
      await storage.addCommandHistory({
        command: `Remove-Place -Identity "${floor.placeId}"`,
        output: `Floor "${floor.name}" deleted successfully`,
        status: 'success',
      });

      res.json({ message: 'Floor deleted successfully' });
    } catch (error) {
      console.error('Delete floor error:', error);
      res.status(500).json({ 
        message: 'Failed to delete floor',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/places/section/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid section ID' });
      }

      const section = await storage.getSectionById(id);
      if (!section) {
        return res.status(404).json({ message: 'Section not found' });
      }

      // Check if section has desks
      const desks = await storage.getDesksBySectionId(id);
      if (desks.length > 0) {
        return res.status(400).json({ 
          message: 'Cannot delete section with desks. Please delete all desks first.' 
        });
      }

      // Delete from Microsoft Places if connected
      if (!powerShellService.isInDemoMode()) {
        try {
          const result = await powerShellService.executeCommand(`Remove-Place -Identity "${section.placeId}"`);
          if (result.exitCode !== 0) {
            console.warn('Failed to delete section from Microsoft Places:', result.error);
          }
        } catch (error) {
          console.warn('Failed to delete section from Microsoft Places:', error);
        }
      }

      // Delete from local database
      await storage.deleteSection(id);

      // Log command
      await storage.addCommandHistory({
        command: `Remove-Place -Identity "${section.placeId}"`,
        output: `Section "${section.name}" deleted successfully`,
        status: 'success',
      });

      res.json({ message: 'Section deleted successfully' });
    } catch (error) {
      console.error('Delete section error:', error);
      res.status(500).json({ 
        message: 'Failed to delete section',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/places/desk/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid desk ID' });
      }

      const desk = await storage.getDeskById(id);
      if (!desk) {
        return res.status(404).json({ message: 'Desk not found' });
      }

      // Delete from Microsoft Places if connected
      if (!powerShellService.isInDemoMode()) {
        try {
          const result = await powerShellService.executeCommand(`Remove-Place -Identity "${desk.placeId}"`);
          if (result.exitCode !== 0) {
            console.warn('Failed to delete desk from Microsoft Places:', result.error);
          }
        } catch (error) {
          console.warn('Failed to delete desk from Microsoft Places:', error);
        }
      }

      // Delete from local database
      await storage.deleteDesk(id);

      // Log command
      await storage.addCommandHistory({
        command: `Remove-Place -Identity "${desk.placeId}"`,
        output: `Desk "${desk.name}" deleted successfully`,
        status: 'success',
      });

      res.json({ message: 'Desk deleted successfully' });
    } catch (error) {
      console.error('Delete desk error:', error);
      res.status(500).json({ 
        message: 'Failed to delete desk',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/places/room/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid room ID' });
      }

      const room = await storage.getRoomById(id);
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      // Delete from Microsoft Places if connected
      if (!powerShellService.isInDemoMode()) {
        try {
          // For rooms, we need to remove the mailbox as well
          if (room.emailAddress) {
            const removeMailboxResult = await powerShellService.executeCommand(`Remove-Mailbox -Identity "${room.emailAddress}" -Confirm:$false`);
            if (removeMailboxResult.exitCode !== 0) {
              console.warn('Failed to remove room mailbox:', removeMailboxResult.error);
            }
          }
          
          const result = await powerShellService.executeCommand(`Remove-Place -Identity "${room.placeId}"`);
          if (result.exitCode !== 0) {
            console.warn('Failed to delete room from Microsoft Places:', result.error);
          }
        } catch (error) {
          console.warn('Failed to delete room from Microsoft Places:', error);
        }
      }

      // Delete from local database
      await storage.deleteRoom(id);

      // Log command
      await storage.addCommandHistory({
        command: `Remove-Place -Identity "${room.placeId}"${room.emailAddress ? `; Remove-Mailbox -Identity "${room.emailAddress}"` : ''}`,
        output: `Room "${room.name}" deleted successfully`,
        status: 'success',
      });

      res.json({ message: 'Room deleted successfully' });
    } catch (error) {
      console.error('Delete room error:', error);
      res.status(500).json({ 
        message: 'Failed to delete room',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/test/powershell', async (req, res) => {
    try {
      console.log('Testing PowerShell connectivity...');
      
      // Test basic PowerShell functionality
      const testResult = await powerShellService.executeCommand('Get-Date | ConvertTo-Json');
      
      res.json({
        success: true,
        result: testResult,
        message: 'PowerShell is working correctly'
      });
    } catch (error) {
      console.error('PowerShell test failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'PowerShell test failed'
      });
    }
  });

  app.get('/api/test/exchange-module', async (req, res) => {
    try {
      console.log('Testing Exchange Online module...');
      
      // Test if Exchange Online module is available
      const moduleResult = await powerShellService.executeCommand('Get-Module -ListAvailable ExchangeOnlineManagement | ConvertTo-Json');
      
      res.json({
        success: true,
        result: moduleResult,
        message: 'Exchange Online module check completed'
      });
    } catch (error) {
      console.error('Exchange module test failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Exchange module test failed'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
