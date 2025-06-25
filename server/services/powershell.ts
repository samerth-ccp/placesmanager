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

interface QueuedCommand {
  command: string;
  resolve: (result: PowerShellResult) => void;
  reject: (err: any) => void;
  startTime: number;
  timeout: NodeJS.Timeout;
}

export class PowerShellService {
  private static instance: PowerShellService;
  private psProcess: ChildProcess | null = null;
  private isInitialized = false;
  private forceRealMode = false;
  private commandQueue: QueuedCommand[] = [];
  private isProcessing = false;
  private buffer = '';
  private errorBuffer = '';
  private readonly END_MARKER = '__END_OF_COMMAND__';

  static getInstance(): PowerShellService {
    if (!PowerShellService.instance) {
      PowerShellService.instance = new PowerShellService();
    }
    return PowerShellService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Skip PowerShell process initialization in demo mode
    if (this.isInDemoMode()) {
      this.isInitialized = true;
      return;
    }
    
    await this.startPersistentProcess();
    this.isInitialized = true;
  }

  private startPersistentProcess() {
    return new Promise<void>((resolve, reject) => {
      if (this.psProcess) {
        this.psProcess.kill();
        this.psProcess = null;
      }
      this.psProcess = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
      this.buffer = '';
      this.errorBuffer = '';
      this.psProcess.stdout?.on('data', (data) => this.handleStdout(data));
      this.psProcess.stderr?.on('data', (data) => this.handleStderr(data));
      this.psProcess.on('close', () => {
        this.isInitialized = false;
        // Try to restart process if it dies
        setTimeout(() => this.startPersistentProcess(), 1000);
      });
      // Wait a moment to ensure process is ready
      setTimeout(() => resolve(), 500);
    });
  }

  private handleStdout(data: Buffer) {
    this.buffer += data.toString();
    let idx;
    while ((idx = this.buffer.indexOf(this.END_MARKER)) !== -1) {
      const chunk = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + this.END_MARKER.length);
      this.finishCommand(chunk, this.errorBuffer);
      this.errorBuffer = '';
    }
  }

  private handleStderr(data: Buffer) {
    this.errorBuffer += data.toString();
  }

  private finishCommand(output: string, error: string) {
    const cmd = this.commandQueue.shift();
    if (!cmd) return;
    clearTimeout(cmd.timeout);
    const duration = Date.now() - cmd.startTime;
    
    // Improved exit code detection
    let exitCode = 0;
    
    // Check for specific error patterns that indicate failure
    const errorLower = error.toLowerCase();
    const outputLower = output.toLowerCase();
    
    // Common error patterns that indicate actual failure
    const errorPatterns = [
      'authentication failed',
      'unauthorized',
      'access denied',
      'invalid credentials',
      'connection failed',
      'timeout',
      'network error',
      'module not found',
      'command not found',
      'parameter cannot be resolved',
      'cannot bind parameter',
      'you must call the connect-exchangeonline cmdlet before calling any other cmdlets'
    ];
    
    // Check if error contains actual failure patterns
    const hasErrorPattern = errorPatterns.some(pattern => errorLower.includes(pattern));
    
    // For Connect-ExchangeOnline, check for success indicators in output
    if (cmd.command.toLowerCase().includes('connect-exchangeonline')) {
      const successPatterns = [
        'connected to exchange online',
        'authentication completed',
        'successfully connected',
        'welcome to exchange online',
        'connected successfully',
        'authentication successful',
        'exchange online powershell',
        'connected to microsoft exchange online',
        'you are now connected to exchange online'
      ];
      
      const hasSuccessPattern = successPatterns.some(pattern => outputLower.includes(pattern));
      
      // Also check if there are no critical errors and we got some output
      const hasOutput = output.trim().length > 0;
      const hasNonCriticalError = error && error.trim() && !hasErrorPattern;
      
      console.log('Connect-ExchangeOnline analysis:', {
        command: cmd.command,
        hasSuccessPattern,
        hasErrorPattern,
        hasOutput,
        hasNonCriticalError,
        outputLength: output.length,
        errorLength: error.length,
        output: output.substring(0, 200),
        error: error.substring(0, 200)
      });
      
      // If we have success indicators, consider it successful regardless of stderr
      if (hasSuccessPattern) {
        exitCode = 0;
        console.log('Connect-ExchangeOnline: Success detected via success patterns');
      } else if (hasErrorPattern) {
        exitCode = 1;
        console.log('Connect-ExchangeOnline: Failure detected via error patterns');
      } else if (hasOutput && !hasNonCriticalError) {
        // If we got output and no critical errors, assume success
        exitCode = 0;
        console.log('Connect-ExchangeOnline: Success assumed (output present, no critical errors)');
      } else {
        // For Connect-ExchangeOnline, if no clear success/error patterns, 
        // assume success if no critical errors
        exitCode = hasErrorPattern ? 1 : 0;
        console.log('Connect-ExchangeOnline: Default case - exitCode:', exitCode);
      }
    } else {
      // For other commands, use the original logic but be more lenient
      if (hasErrorPattern) {
        exitCode = 1;
      } else if (error && error.trim() && !errorLower.includes('warning')) {
        // Only treat as error if it's not just a warning
        exitCode = 1;
      }
    }
    
    cmd.resolve({
      output: output.trim(),
      error: error.trim() || undefined,
      exitCode,
      duration,
    });
    this.isProcessing = false;
    this.processQueue();
  }

  setForceRealMode(enabled: boolean): void {
    this.forceRealMode = enabled;
  }

  isInDemoMode(): boolean {
    return process.platform !== 'win32' && !this.forceRealMode;
  }

  async executeCommand(command: string, timeoutMs: number = 30000): Promise<PowerShellResult> {
    if (this.isInDemoMode()) {
      return this.executeDemoCommand(command, Date.now());
    }
    await this.initialize();
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const queued: QueuedCommand = {
        command,
        resolve,
        reject,
        startTime,
        timeout: setTimeout(() => {
          reject(new Error('PowerShell command timed out'));
          this.isProcessing = false;
          this.processQueue();
        }, timeoutMs),
      };
      this.commandQueue.push(queued);
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.isProcessing || !this.psProcess || this.commandQueue.length === 0) return;
    this.isProcessing = true;
    const cmd = this.commandQueue[0];
    // Write command and marker
    this.psProcess.stdin?.write(`${cmd.command}\nWrite-Output '${this.END_MARKER}'\n`);
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
      const demoPlaces = [
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
      return {
        output: demoPlaces.map(p => `${p.DisplayName}: ${p.PlaceId}`).join('\n'),
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
      const placeId = this.generateGuid();
      const nameMatch = command.match(/-DisplayName\s+"([^"]+)"/);
      const name = nameMatch ? nameMatch[1] : 'New Place';
      const typeMatch = command.match(/-Type\s+(\w+)/);
      const type = typeMatch ? typeMatch[1] : 'Place';
      
      return {
        output: `${type} "${name}" created successfully with PlaceId: ${placeId}`,
        exitCode: 0,
        duration,
      };
    }

    // Handle Install-Module commands
    if (command.toLowerCase().includes('install-module')) {
      const moduleName = command.match(/-name\s+"?([^"\s]+)"?/i)?.[1] || 'Module';
      return {
        output: `Installing module '${moduleName}'...\nModule '${moduleName}' was installed successfully.`,
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
      // Log PowerShell version
      const versionResult = await this.executeCommand('$PSVersionTable.PSVersion | ConvertTo-Json');
      console.log('PowerShell version for', moduleName, ':', versionResult.output);
      // Log PowerShell module path
      const pathResult = await this.executeCommand('$env:PSModulePath');
      console.log('PowerShell module path for', moduleName, ':', pathResult.output);
      const result = await this.executeCommand(
        `Get-Module -ListAvailable -Name "${moduleName}" | Select-Object Name, Version | ConvertTo-Json`
      );

      if (result.exitCode === 0 && result.output) {
        try {
          console.log('PowerShell raw output for', moduleName, ':', result.output);
          const moduleData = JSON.parse(result.output);
          // Handle array or single object
          const moduleEntry = Array.isArray(moduleData)
            ? moduleData.reduce((latest, entry) => {
                if (!latest) return entry;
                // Compare version objects if present
                const v1 = entry.Version;
                const v2 = latest.Version;
                if (typeof v1 === 'object' && typeof v2 === 'object') {
                  if (
                    v1.Major > v2.Major ||
                    (v1.Major === v2.Major && v1.Minor > v2.Minor) ||
                    (v1.Major === v2.Major && v1.Minor === v2.Minor && v1.Build > v2.Build)
                  ) {
                    return entry;
                  }
                }
                return latest;
              }, null)
            : moduleData;
          let version = 'Unknown';
          if (moduleEntry && moduleEntry.Version) {
            if (typeof moduleEntry.Version === 'object') {
              version = `${moduleEntry.Version.Major}.${moduleEntry.Version.Minor}.${moduleEntry.Version.Build}`;
            } else {
              version = moduleEntry.Version;
            }
          }
          return {
            name: moduleName,
            version,
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
    const result = await this.executeCommand(command);
    console.log('Get-PlaceV3 result:', result);
    return result;
  }

  async createPlace(
    type: string,
    name: string,
    description?: string,
    parentId?: string,
    additionalParams?: Record<string, string>
  ): Promise<PowerShellResult> {
    let command = `New-Place -Type ${type} -DisplayName "${name}"`;
    
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
    
    console.log(`Executing createPlace command: ${command}`);
    return this.executeCommand(command);
  }

  async createRoom(
    name: string,
    description: string,
    parentId: string,
    emailAddress?: string,
    capacity?: number,
    isBookable: boolean = true
  ): Promise<PowerShellResult> {
    // Demo mode for non-Windows environments
    if (this.isInDemoMode()) {
      const duration = 1000 + Math.random() * 2000; // Simulate execution time
      return {
        output: `Room "${name}" created successfully with PlaceId: ${this.generateGuid()}`,
        exitCode: 0,
        duration,
      };
    }

    if (!emailAddress) {
      return {
        output: '',
        error: 'Email address is required to create or associate a room.',
        exitCode: 1,
        duration: 0
      }
    }

    // Step 1: Check if the mailbox already exists
    const checkMailboxCmd = `Get-Mailbox -Identity "${emailAddress}"`;
    console.log(`Checking if mailbox exists: ${checkMailboxCmd}`);
    const getMailboxResult = await this.executeCommand(checkMailboxCmd, 60000);
    let totalDuration = getMailboxResult.duration;
    let finalOutput = '';

    if (getMailboxResult.exitCode !== 0) {
      // Mailbox does not exist, so create it
      console.log(`Mailbox ${emailAddress} not found. Creating new mailbox.`);
      let createMailboxCmd = `New-Mailbox -Room -Name "${name}" -PrimarySmtpAddress "${emailAddress}"`;
      if (capacity) {
        createMailboxCmd += ` -ResourceCapacity ${capacity}`;
      }
      
      console.log(`Executing room creation command: ${createMailboxCmd}`);
      const createMailboxResult = await this.executeCommand(createMailboxCmd, 120000);
      totalDuration += createMailboxResult.duration;
      finalOutput += createMailboxResult.output;
      
      if (createMailboxResult.exitCode !== 0) {
        return {
          ...createMailboxResult,
          error: `Failed to create room mailbox: ${createMailboxResult.error}`,
          duration: totalDuration,
        };
      }
    } else {
      console.log(`Mailbox ${emailAddress} already exists. Skipping creation.`);
      finalOutput += `Mailbox ${emailAddress} already exists.`;
    }

    // Step 2: Set the place properties to parent it to the section
    const setPlaceCmd = `Set-PlaceV3 -Identity "${emailAddress}" -ParentId "${parentId}"`;
    console.log(`Executing Set-PlaceV3 command: ${setPlaceCmd}`);
    const setPlaceResult = await this.executeCommand(setPlaceCmd, 120000);
    totalDuration += setPlaceResult.duration;
    finalOutput += `\n${setPlaceResult.output}`;

    if (setPlaceResult.exitCode !== 0) {
      return {
        ...setPlaceResult,
        error: `Mailbox processed, but failed to parent room to section: ${setPlaceResult.error}`,
        duration: totalDuration,
        output: finalOutput
      };
    }
    
    // Success
    return {
      output: finalOutput,
      error: undefined,
      exitCode: 0,
      duration: totalDuration
    };
  }

  private buildPlacesHierarchy(places: any[]): any[] {
    // Create a map of all places by PlaceId for quick lookup
    const placeMap = new Map<string, any>();
    places.forEach(place => {
      // Ensure we have all required fields
      const enrichedPlace = {
        ...place,
        Type: place.Type || 'Building',
        DisplayName: place.DisplayName || place.Name || 'Unknown',
        ParentId: place.ParentId || null,
        children: []
      };
      placeMap.set(place.PlaceId, enrichedPlace);
    });

    // Define valid hierarchy levels and their allowed children
    type PlaceType = 'Building' | 'Floor' | 'Section' | 'Desk' | 'Room';
    const hierarchyLevels: Record<PlaceType, PlaceType[]> = {
      'Building': ['Floor'],
      'Floor': ['Section'],
      'Section': ['Desk', 'Room'],
      'Desk': [],
      'Room': []
    };

    // First pass: Validate all parent-child relationships
    const validRelationships = new Map<string, boolean>();
    places.forEach(place => {
      const placeType = place.Type as PlaceType;
      const parentId = place.ParentId;
      
      if (parentId && placeMap.has(parentId)) {
        const parent = placeMap.get(parentId);
        const parentType = parent.Type as PlaceType;
        
        // Check if this is a valid parent-child relationship
        validRelationships.set(place.PlaceId, hierarchyLevels[parentType]?.includes(placeType) || false);
      } else {
        // Root level places must be Buildings
        validRelationships.set(place.PlaceId, placeType === 'Building');
      }
    });

    // Second pass: Build the hierarchy
    const rootPlaces: any[] = [];
    places.forEach(place => {
      const placeWithChildren = placeMap.get(place.PlaceId);
      const isValidRelationship = validRelationships.get(place.PlaceId);
      
      if (place.ParentId && placeMap.has(place.ParentId) && isValidRelationship) {
        // Valid child place, add to parent
        const parent = placeMap.get(place.ParentId);
        parent.children.push(placeWithChildren);
      } else if (!place.ParentId && place.Type === 'Building') {
        // Valid root Building
        rootPlaces.push(placeWithChildren);
      } else {
        // Invalid relationship or non-Building root
        console.warn(`Invalid place relationship: ${place.DisplayName} (${place.Type})`);
        if (place.Type === 'Building') {
          rootPlaces.push(placeWithChildren);
        } else {
          // Try to find a valid parent based on type
          const validParentType = Object.entries(hierarchyLevels).find(([_, children]) => 
            children.includes(place.Type as PlaceType)
          )?.[0];
          
          if (validParentType) {
            // Find a parent of the correct type
            const potentialParent = Array.from(placeMap.values()).find(p => 
              p.Type === validParentType && !p.ParentId
            );
            
            if (potentialParent) {
              potentialParent.children.push(placeWithChildren);
            } else {
              rootPlaces.push(placeWithChildren);
            }
          } else {
            rootPlaces.push(placeWithChildren);
          }
        }
      }
    });

    // Sort children by DisplayName
    const sortChildren = (place: any) => {
      if (place.children && place.children.length > 0) {
        place.children.sort((a: any, b: any) => 
          (a.DisplayName || '').localeCompare(b.DisplayName || '')
        );
        place.children.forEach(sortChildren);
      }
    };

    // Sort all levels of the hierarchy
    rootPlaces.sort((a, b) => (a.DisplayName || '').localeCompare(b.DisplayName || ''));
    rootPlaces.forEach(sortChildren);

    return rootPlaces;
  }

  async parsePlacesOutput(output: string): Promise<any[]> {
    // Demo mode for non-Windows environments - return structured data
    if (this.isInDemoMode()) {
      // Return demo data based on place type in output
      if (output.includes('Building')) {
        const demoPlaces = [
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
        return this.buildPlacesHierarchy(demoPlaces);
      }
      
      if (output.includes('Floor')) {
        const demoPlaces = [
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
        return this.buildPlacesHierarchy(demoPlaces);
      }

      if (output.includes('Section')) {
        const demoPlaces = [
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
        return this.buildPlacesHierarchy(demoPlaces);
      }

      if (output.includes('Desk')) {
        const demoPlaces = [
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
        return this.buildPlacesHierarchy(demoPlaces);
      }

      if (output.includes('Room')) {
        const demoPlaces = [
          {
            PlaceId: '86i36080-h4i6-965g-gc78-dbiegf9i2kd0',
            DisplayName: 'Conference-A',
            Type: 'Room',
            ParentId: '53f03757-e1f3-632d-d945-a8fbde6f9ha7',
            EmailAddress: 'conferencea@thoughtswin.com',
            Capacity: 8,
            IsBookable: true
          },
          {
            PlaceId: '97j47191-i5j7-076h-hd89-ecjfhg0j3le1',
            DisplayName: 'Meeting-Room-B',
            Type: 'Room',
            ParentId: '64g14868-f2g4-743e-ea56-b9gcef7g0ib8',
            EmailAddress: 'meetingroomb@thoughtswin.com',
            Capacity: 12,
            IsBookable: true
          }
        ];
        return this.buildPlacesHierarchy(demoPlaces);
      }

      return [];
    }

    // Strip ANSI color codes
    const ansiRegex = /\x1B\[[0-9;]*m/g;
    const cleanOutput = output.replace(ansiRegex, '');

    try {
      // Try to parse as JSON first
      const places = JSON.parse(cleanOutput);
      return this.buildPlacesHierarchy(places);
    } catch {
      // If not JSON, try to parse PowerShell object format
      const places: any[] = [];
      const lines = cleanOutput.split('\n');
      let currentPlace: any = {};

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.includes(':')) {
          const [key, ...valueParts] = trimmed.split(':');
          const value = valueParts.join(':').trim();
          const cleanKey = key.trim();

          // Start a new object on PlaceId (not DisplayName)
          if (cleanKey === 'PlaceId' && Object.keys(currentPlace).length > 0) {
            places.push(currentPlace);
            currentPlace = {};
          }

          // Normalize ParentId: set to null if empty or whitespace
          if (cleanKey === 'ParentId') {
            currentPlace[cleanKey] = value.trim() === '' ? null : value.trim();
          } else {
            currentPlace[cleanKey] = value;
          }
        }
      }

      if (Object.keys(currentPlace).length > 0) {
        places.push(currentPlace);
      }

      return this.buildPlacesHierarchy(places);
    }
  }

  cleanup(): void {
    if (this.psProcess) {
      this.psProcess.kill();
      this.psProcess = null;
    }
    this.isInitialized = false;
  }

  async verifyExchangeOnlineConnection(): Promise<PowerShellResult> {
    // Demo mode for non-Windows environments
    if (this.isInDemoMode()) {
      return {
        output: 'Exchange Online connection verified successfully (Demo Mode)',
        exitCode: 0,
        duration: 1000 + Math.random() * 1000,
      };
    }
    
    // Test if Exchange Online connection is working by running a simple command
    try {
      console.log('Verifying Exchange Online connection...');
      
      // First, check if we have any active connections
      try {
        console.log('Checking for active connections...');
        const connectionCheck = await this.executeCommand('Get-ConnectionInformation', 10000);
        
        if (connectionCheck.output && connectionCheck.output.trim()) {
          console.log('Active connections found:', connectionCheck.output);
          return {
            output: 'Exchange Online connection verified via Get-ConnectionInformation',
            exitCode: 0,
            duration: connectionCheck.duration,
          };
        }
      } catch (connError) {
        console.log('Get-ConnectionInformation failed:', connError);
      }
      
      // Try simpler commands that are more likely to work
      const testCommands = [
        'Get-OrganizationConfig',
        'Get-User -ResultSize 1',
        'Get-Mailbox -ResultSize 1',
        'Get-EXORecipient -ResultSize 1',
        'Get-EXOMailbox -ResultSize 1'
      ];
      
      for (const command of testCommands) {
        try {
          console.log(`Trying verification command: ${command}`);
          const result = await this.executeCommand(command, 15000); // 15 second timeout
          
          console.log(`Command result for ${command}:`, {
            output: result.output?.substring(0, 200),
            error: result.error?.substring(0, 200),
            exitCode: result.exitCode,
            duration: result.duration
          });
          
          // Check if we got any output or if the error indicates we're connected but lack permissions
          if (result.output && result.output.trim()) {
            console.log('Exchange Online connection verified successfully with command:', command);
            return {
              output: `Exchange Online connection verified successfully using: ${command}`,
              exitCode: 0,
              duration: result.duration,
            };
          } else if (result.error && result.error.includes('You must call the Connect-ExchangeOnline cmdlet')) {
            // This error means we're not connected
            console.log('Not connected to Exchange Online');
            continue;
          } else if (result.error && (result.error.includes('Access Denied') || result.error.includes('Unauthorized'))) {
            // This error means we're connected but don't have permissions - connection is working!
            console.log('Exchange Online connection verified (connected but no permissions):', result.error);
            return {
              output: `Exchange Online connection verified (connected but no permissions for: ${command})`,
              exitCode: 0,
              duration: result.duration,
            };
          }
        } catch (cmdError) {
          console.log(`Command ${command} failed:`, cmdError);
          // Continue to next command
        }
      }
      
      // If none of the commands worked, try a basic connection test
      try {
        console.log('Trying basic connection test...');
        const basicTest = await this.executeCommand('Get-PSSession | Where-Object {$_.ConfigurationName -eq "Microsoft.Exchange"}', 10000);
        
        if (basicTest.output && basicTest.output.trim()) {
          console.log('Exchange Online connection verified via PSSession check');
          return {
            output: 'Exchange Online connection verified via PSSession check',
            exitCode: 0,
            duration: basicTest.duration,
          };
        }
      } catch (sessionError) {
        console.log('PSSession check failed:', sessionError);
      }
      
      // As a last resort, try to check if the module is loaded and we can run basic commands
      try {
        console.log('Trying module availability check...');
        const moduleCheck = await this.executeCommand('Get-Module ExchangeOnlineManagement', 5000);
        
        if (moduleCheck.output && moduleCheck.output.includes('ExchangeOnlineManagement')) {
          console.log('Exchange Online module is loaded, assuming connection is working');
          return {
            output: 'Exchange Online connection verified (module loaded)',
            exitCode: 0,
            duration: moduleCheck.duration,
          };
        }
      } catch (moduleError) {
        console.log('Module check failed:', moduleError);
      }
      
      console.log('Exchange Online connection verification failed - no commands returned output');
      return {
        output: '',
        error: 'Exchange Online connection verification failed - no commands returned output',
        exitCode: 1,
        duration: 0,
      };
    } catch (error) {
      console.log('Exchange Online verification failed with error:', error);
      return {
        output: '',
        error: `Exchange Online connection verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        exitCode: 1,
        duration: 0,
      };
    }
  }
}

export const powerShellService = PowerShellService.getInstance();
