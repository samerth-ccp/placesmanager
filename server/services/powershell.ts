import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export interface PowerShellResult {
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
}

export interface ModuleInfo {
  name: string;
  version?: string;
  status: 'installed' | 'not_installed' | 'error';
}

export class PowerShellService {
  private static instance: PowerShellService;
  private psProcess: ChildProcess | null = null;
  private isInitialized = false;
  private forceRealMode = false;

  static getInstance(): PowerShellService {
    if (!PowerShellService.instance) {
      PowerShellService.instance = new PowerShellService();
    }
    return PowerShellService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Test PowerShell availability
      await this.executeCommand('Get-Host');
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize PowerShell: ${error}`);
    }
  }

  setForceRealMode(enabled: boolean): void {
    this.forceRealMode = enabled;
  }

  isInDemoMode(): boolean {
    return process.platform !== 'win32' && !this.forceRealMode;
  }

  async executeCommand(command: string, timeoutMs: number = 30000): Promise<PowerShellResult> {
    const startTime = Date.now();

    // Demo mode for non-Windows environments (unless forced to real mode)
    if (this.isInDemoMode()) {
      return this.executeDemoCommand(command, startTime);
    }

    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const psCommand = isWindows ? 'powershell.exe' : 'pwsh';
      const psArgs = isWindows 
        ? ['-NoProfile', '-NonInteractive', '-Command', command]
        : ['-NoProfile', '-NonInteractive', '-Command', command];

      const ps = spawn(psCommand, psArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      let output = '';
      let errorOutput = '';

      ps.stdout?.on('data', (data) => {
        output += data.toString();
      });

      ps.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      const timeout = setTimeout(() => {
        ps.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      ps.on('close', (code) => {
        clearTimeout(timeout);
        const duration = Date.now() - startTime;
        
        resolve({
          output: output.trim(),
          error: errorOutput.trim() || undefined,
          exitCode: code || 0,
          duration,
        });
      });

      ps.on('error', (error) => {
        clearTimeout(timeout);
        const duration = Date.now() - startTime;
        resolve({
          output: `Error executing PowerShell command: ${error.message}`,
          error: error.message,
          exitCode: 1,
          duration,
        });
      });
    });
  }

  private async executeDemoCommand(command: string, startTime: number): Promise<PowerShellResult> {
    const duration = Date.now() - startTime + Math.random() * 500; // Simulate execution time
    
    // Demo responses for common commands
    if (command.includes('Get-Module')) {
      return {
        output: `
ModuleType Version    Name                                ExportedCommands
---------- -------    ----                                ----------------
Script     3.0.0      ExchangeOnlineManagement           {Add-DistributionGroupMember...}
Script     1.0.0      Microsoft.Graph.Places             {Get-MgPlaceRoom, New-MgPlace...}
Script     2.1.0      Microsoft.Places.PowerShell        {Get-PlaceV3, New-Place...}
`.trim(),
        exitCode: 0,
        duration,
      };
    }

    if (command.includes('Get-PlaceV3') && command.includes('Building')) {
      return {
        output: `
PlaceId                               DisplayName       Description                    CountryOrRegion State City    Street                    PostalCode
-------                               -----------       -----------                    --------------- ----- ----    ------                    ----------
2b0b9b4b-525d-4718-a1b6-75c8ab3c8f56 ThoughtsWin       ThoughtsWin Systems            CA              BC    Surrey  9900 King George Blvd    V3T 0K7
3c1c8c5c-636e-5829-b2c7-86d9bc4d9g67 VancouverHouse    Vancouver House                CA              BC    Vancouver 3301-1480 Howe St    V6Z 0G5
`.trim(),
        exitCode: 0,
        duration,
      };
    }

    if (command.includes('Get-PlaceV3') && command.includes('Floor')) {
      return {
        output: `
PlaceId                               DisplayName       Description                    ParentId
-------                               -----------       -----------                    --------
31d81535-c9f1-410b-a723-bf0a5c7f7485 Main              Main Floor- 204                2b0b9b4b-525d-4718-a1b6-75c8ab3c8f56
42e92646-d0e2-521c-c834-97eacd5e8g96 Ground            Ground Floor                   3c1c8c5c-636e-5829-b2c7-86d9bc4d9g67
`.trim(),
        exitCode: 0,
        duration,
      };
    }

    if (command.includes('Get-PlaceV3') && command.includes('Section')) {
      return {
        output: `
PlaceId                               DisplayName       Description                    ParentId
-------                               -----------       -----------                    --------
53f03757-e1f3-632d-d945-a8fbde6f9ha7 Foyer             Customer Service               31d81535-c9f1-410b-a723-bf0a5c7f7485
64g14868-f2g4-743e-ea56-b9gcef7g0ib8 Offices           Office Spaces                 31d81535-c9f1-410b-a723-bf0a5c7f7485
`.trim(),
        exitCode: 0,
        duration,
      };
    }

    if (command.includes('Get-PlaceV3') && command.includes('Desk')) {
      return {
        output: `
PlaceId                               DisplayName       Type       ParentId                             EmailAddress                        Capacity IsBookable
-------                               -----------       ----       --------                             ------------                        -------- ----------
75h25979-g3h5-854f-fb67-cahdg8h1jc9  Desks A           Desk       53f03757-e1f3-632d-d945-a8fbde6f9ha7 desksa.foyer.thoughtswin@...        1        True
86i3608a-h4i6-965g-gc78-dbieg9i2kd0  404-Cloud         Workspace  64g14868-f2g4-743e-ea56-b9gcef7g0ib8 404cloud.offices.thoughtswin@...    4        True
`.trim(),
        exitCode: 0,
        duration,
      };
    }

    if (command.includes('Connect-ExchangeOnline')) {
      return {
        output: 'Successfully connected to Exchange Online. Authentication completed.',
        exitCode: 0,
        duration,
      };
    }

    if (command.includes('New-Place')) {
      return {
        output: `Successfully created new place with ID: ${this.generateGuid()}`,
        exitCode: 0,
        duration,
      };
    }

    // Handle specific PowerShell commands in demo mode
    if (command.toLowerCase().includes('get-command')) {
      return {
        output: `
CommandType     Name                                               Version    Source
-----------     ----                                               -------    ------
Cmdlet          Connect-ExchangeOnline                             3.0.0      ExchangeOnlineManagement
Cmdlet          Get-PlaceV3                                        2.1.0      Microsoft.Places.PowerShell
Cmdlet          New-Place                                          2.1.0      Microsoft.Places.PowerShell
`.trim(),
        exitCode: 0,
        duration,
      };
    }

    if (command.toLowerCase().includes('get-help') || command.toLowerCase().includes('help')) {
      return {
        output: `
Available Commands in Demo Mode:
- Connect-ExchangeOnline -UserPrincipalName user@domain.com
- Get-PlaceV3 -Type Building
- Get-PlaceV3 -Type Floor
- Get-PlaceV3 -Type Section  
- Get-PlaceV3 -Type Desk
- Get-Module -ListAvailable
- New-Place -Name "Room Name" -Type Room

Deploy to Windows for full PowerShell functionality.
`.trim(),
        exitCode: 0,
        duration,
      };
    }

    if (command.toLowerCase().includes('get-location') || command.toLowerCase().includes('pwd')) {
      return {
        output: 'C:\\Users\\Administrator\\Documents',
        exitCode: 0,
        duration,
      };
    }

    // Default demo response for unrecognized commands
    return {
      output: `[DEMO MODE] Executed: ${command}\n\nDemo mode simulates PowerShell responses.\nDeploy to Windows for real PowerShell execution.\n\nTry: Get-Help for available commands`,
      exitCode: 0,
      duration,
    };
  }

  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async checkModuleInstalled(moduleName: string): Promise<ModuleInfo> {
    // Demo mode for non-Windows environments (unless forced to real mode)
    if (this.isInDemoMode()) {
      // Simulate module availability in demo mode
      const moduleVersions: Record<string, string> = {
        'ExchangeOnlineManagement': '3.0.0',
        'Microsoft.Graph.Places': '1.0.0',
        'Microsoft.Places.PowerShell': '2.1.0',
      };

      return {
        name: moduleName,
        version: moduleVersions[moduleName] || '1.0.0',
        status: 'installed',
      };
    }

    try {
      const result = await this.executeCommand(
        `Get-Module -ListAvailable -Name "${moduleName}" | Select-Object Name, Version | ConvertTo-Json`
      );

      if (result.exitCode === 0 && result.output) {
        try {
          const moduleData = JSON.parse(result.output);
          return {
            name: moduleName,
            version: moduleData.Version || 'Unknown',
            status: 'installed',
          };
        } catch {
          // If JSON parsing fails but command succeeded, module might be installed
          return {
            name: moduleName,
            version: 'Unknown',
            status: result.output.includes(moduleName) ? 'installed' : 'not_installed',
          };
        }
      }

      return {
        name: moduleName,
        status: 'not_installed',
      };
    } catch (error) {
      return {
        name: moduleName,
        status: 'error',
      };
    }
  }

  async installModule(moduleName: string): Promise<PowerShellResult> {
    // Demo mode for non-Windows environments (unless forced to real mode)
    if (this.isInDemoMode()) {
      return {
        output: `Successfully installed module ${moduleName}`,
        exitCode: 0,
        duration: 2000 + Math.random() * 1000,
      };
    }
    const command = `Install-Module -Name "${moduleName}" -Force -AllowClobber -Scope CurrentUser`;
    return this.executeCommand(command, 120000); // 2 minutes timeout for installation
  }

  async connectExchangeOnline(tenantDomain?: string): Promise<PowerShellResult> {
    // Demo mode for non-Windows environments (unless forced to real mode)
    if (this.isInDemoMode()) {
      return {
        output: `Successfully connected to Exchange Online${tenantDomain ? ` for ${tenantDomain}` : ''}`,
        exitCode: 0,
        duration: 3000 + Math.random() * 2000,
      };
    }
    
    // Use correct Exchange Online connection syntax
    let command = 'Connect-ExchangeOnline';
    if (tenantDomain) {
      // Use UserPrincipalName if it looks like an email, otherwise use Organization parameter
      if (tenantDomain.includes('@')) {
        command += ` -UserPrincipalName "${tenantDomain}"`;
      } else {
        // For tenant domains like "contoso.onmicrosoft.com"
        command += ` -Organization "${tenantDomain}"`;
      }
    }
    
    return this.executeCommand(command, 120000); // 2 minute timeout for connection
  }

  async getPlaces(type?: string): Promise<PowerShellResult> {
    let command = 'Get-PlaceV3';
    if (type) {
      command += ` -Type ${type}`;
    }
    return this.executeCommand(command);
  }

  async createPlace(
    type: string,
    name: string,
    description?: string,
    parentId?: string,
    additionalParams?: Record<string, string>
  ): Promise<PowerShellResult> {
    let command = `New-Place -Type ${type} -Name "${name}"`;
    
    if (description) {
      command += ` -Description "${description}"`;
    }
    
    if (parentId) {
      command += ` -ParentId "${parentId}"`;
    }

    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) => {
        command += ` -${key} "${value}"`;
      });
    }

    return this.executeCommand(command);
  }

  async parsePlacesOutput(output: string): Promise<any[]> {
    // Demo mode for non-Windows environments - return structured data
    if (this.isInDemoMode()) {
      // Return demo data based on place type in output
      if (output.includes('Building')) {
        return [
          {
            PlaceId: '2b0b9b4b-525d-4718-a1b6-75c8ab3c8f56',
            DisplayName: 'ThoughtsWin',
            Description: 'ThoughtsWin Systems',
            CountryOrRegion: 'CA',
            State: 'BC',
            City: 'Surrey',
            Street: '9900 King George Blvd',
            PostalCode: 'V3T 0K7'
          },
          {
            PlaceId: '3c1c8c5c-636e-5829-b2c7-86d9bc4d9g67',
            DisplayName: 'VancouverHouse',
            Description: 'Vancouver House',
            CountryOrRegion: 'CA',
            State: 'BC',
            City: 'Vancouver',
            Street: '3301-1480 Howe St',
            PostalCode: 'V6Z 0G5'
          }
        ];
      }
      
      if (output.includes('Floor')) {
        return [
          {
            PlaceId: '31d81535-c9f1-410b-a723-bf0a5c7f7485',
            DisplayName: 'Main',
            Description: 'Main Floor- 204',
            ParentId: '2b0b9b4b-525d-4718-a1b6-75c8ab3c8f56'
          },
          {
            PlaceId: '42e92646-d0e2-521c-c834-97eacd5e8g96',
            DisplayName: 'Ground',
            Description: 'Ground Floor',
            ParentId: '3c1c8c5c-636e-5829-b2c7-86d9bc4d9g67'
          }
        ];
      }

      if (output.includes('Section')) {
        return [
          {
            PlaceId: '53f03757-e1f3-632d-d945-a8fbde6f9ha7',
            DisplayName: 'Foyer',
            Description: 'Customer Service',
            ParentId: '31d81535-c9f1-410b-a723-bf0a5c7f7485'
          },
          {
            PlaceId: '64g14868-f2g4-743e-ea56-b9gcef7g0ib8',
            DisplayName: 'Offices',
            Description: 'Office Spaces',
            ParentId: '31d81535-c9f1-410b-a723-bf0a5c7f7485'
          }
        ];
      }

      if (output.includes('Desk')) {
        return [
          {
            PlaceId: '75h25979-g3h5-854f-fb67-cahdgf8h1jc9',
            DisplayName: 'Desk-001',
            Type: 'Desk',
            ParentId: '53f03757-e1f3-632d-d945-a8fbde6f9ha7',
            EmailAddress: 'desk001@thoughtswin.com',
            Capacity: 1,
            IsBookable: true
          },
          {
            PlaceId: '86i36080-h4i6-965g-gc78-dbiegf9i2kd0',
            DisplayName: 'Conference-A',
            Type: 'Room',
            ParentId: '64g14868-f2g4-743e-ea56-b9gcef7g0ib8',
            EmailAddress: 'conferencea@thoughtswin.com',
            Capacity: 8,
            IsBookable: true
          }
        ];
      }

      return [];
    }

    try {
      // Try to parse as JSON first
      return JSON.parse(output);
    } catch {
      // If not JSON, try to parse PowerShell object format
      const places: any[] = [];
      const lines = output.split('\n');
      let currentPlace: any = {};

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.includes(':')) {
          const [key, ...valueParts] = trimmed.split(':');
          const value = valueParts.join(':').trim();
          const cleanKey = key.trim();

          if (cleanKey === 'DisplayName' && Object.keys(currentPlace).length > 0) {
            // New place starting
            places.push(currentPlace);
            currentPlace = {};
          }

          currentPlace[cleanKey] = value;
        }
      }

      if (Object.keys(currentPlace).length > 0) {
        places.push(currentPlace);
      }

      return places;
    }
  }

  cleanup(): void {
    if (this.psProcess) {
      this.psProcess.kill();
      this.psProcess = null;
    }
    this.isInitialized = false;
  }
}

export const powerShellService = PowerShellService.getInstance();
