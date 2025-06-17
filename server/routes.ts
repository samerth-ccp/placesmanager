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
      
      // Store buildings in database
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

      // Get all floors, sections, and desks
      const floorsResult = await powerShellService.getPlaces('Floor');
      const sectionsResult = await powerShellService.getPlaces('Section');  
      const desksResult = await powerShellService.getPlaces('Desk');

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

      if (desksResult.exitCode === 0) {
        const desksData = await powerShellService.parsePlacesOutput(`Desk\n${desksResult.output}`);
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
            }
          }
        }
      }

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
          };

          for (const section of sections) {
            const desks = await storage.getDesksBySectionId(section.id);
            const sectionNode: any = {
              ...section,
              desks,
            };
            (floorNode.sections as any[]).push(sectionNode);
          }

          (buildingNode.floors as any[]).push(floorNode);
        }

        hierarchy.push(buildingNode);
      }

      res.json(hierarchy);
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
      const buildingData = insertBuildingSchema.parse(req.body);
      
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
          command: `New-Place -Type Building -Name "${buildingData.name}"`,
          output: result.output,
          status: 'success',
        });

        res.json({ building, result });
      } else {
        res.status(500).json({ message: 'Failed to create building', error: result.error });
      }
    } catch (error) {
      res.status(400).json({ message: 'Invalid building data' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
