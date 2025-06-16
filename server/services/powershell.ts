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

  async executeCommand(command: string, timeoutMs: number = 30000): Promise<PowerShellResult> {
    const startTime = Date.now();

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
        reject(error);
      });
    });
  }

  async checkModuleInstalled(moduleName: string): Promise<ModuleInfo> {
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
    const command = `Install-Module -Name "${moduleName}" -Force -AllowClobber -Scope CurrentUser`;
    return this.executeCommand(command, 120000); // 2 minutes timeout for installation
  }

  async connectExchangeOnline(tenantDomain?: string): Promise<PowerShellResult> {
    let command = 'Connect-ExchangeOnline';
    if (tenantDomain) {
      command += ` -DomainName "${tenantDomain}"`;
    }
    return this.executeCommand(command, 60000); // 1 minute timeout for connection
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
