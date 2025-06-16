# Microsoft Places Administration Tool

A comprehensive web-based administration interface for managing Microsoft Places through PowerShell integration. This tool provides a modern, intuitive interface for managing buildings, floors, sections, and desk/room configurations within your Microsoft 365 environment.

## Features

- **Automated Module Management**: Install and manage required PowerShell modules
- **Connection Management**: Connect to Exchange Online and Microsoft Places services
- **Interactive PowerShell Console**: Execute commands directly from the web interface
- **Places Hierarchy Viewer**: Visual tree structure of buildings, floors, sections, and desks
- **Real-time Status Monitoring**: Live connection and module status indicators
- **Cross-platform Development**: Demo mode for development on non-Windows systems

## Architecture

### Frontend
- React 18 with TypeScript
- Shadcn/ui components with Tailwind CSS
- TanStack Query for state management
- Wouter for routing

### Backend
- Node.js with Express.js
- TypeScript with ES modules
- PowerShell integration service
- In-memory storage for development

## Requirements

### Development Environment
- Node.js 20 or higher
- npm or yarn package manager

### Production Environment (Windows)
- Windows 10/11 or Windows Server
- PowerShell 5.1 or PowerShell Core
- Microsoft 365 administrator credentials

### Required PowerShell Modules
- ExchangeOnlineManagement
- Microsoft.Graph.Places
- Microsoft.Places.PowerShell

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd microsoft-places-admin
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Access the application**
   Open your browser to `http://localhost:5000`

## Usage

### Development Mode (Demo)
When running on non-Windows systems, the application operates in demo mode with:
- Simulated PowerShell responses
- Sample Places hierarchy data
- Mock module installations
- Realistic command execution examples

### Production Mode (Windows)
When deployed on Windows, the application automatically switches to live mode:
- Real PowerShell command execution
- Actual Microsoft 365 service connections
- Live Places data management
- Module installation and management

### Getting Started

1. **Setup & Connect Tab**
   - Install required PowerShell modules
   - Configure tenant domain settings
   - Establish connections to Exchange Online

2. **Places Hierarchy Tab**
   - View your current Places configuration
   - Navigate through buildings, floors, sections, and desks
   - Refresh data from Microsoft services

3. **PowerShell Console Tab**
   - Execute PowerShell commands directly
   - View command history and outputs
   - Use quick command shortcuts

## PowerShell Commands Examples

### View Buildings
```powershell
Get-PlaceV3 -Type Building
```

### Create a New Building
```powershell
New-Place -Type Building -Name 'Office Building' -Description 'Main Office' -CountryOrRegion 'US' -State 'CA' -City 'San Francisco' -Street '123 Main St' -PostalCode '94102'
```

### Create a Floor
```powershell
New-Place -DisplayName "First Floor" -Type Floor -Parent "<building-place-id>" -Description "Ground Floor"
```

### Create a Section
```powershell
New-Place -DisplayName "Open Office" -Description "Open workspace area" -Type Section -ParentId "<floor-place-id>"
```

### Create a Desk
```powershell
New-Place -Type Desk -Name "Desk 001" -ParentId "<section-place-id>"
```

## Configuration

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (for production database)
- `NODE_ENV`: Environment setting (development/production)

### Tenant Configuration
Configure your Microsoft 365 tenant domain in the Setup & Connect section:
- Tenant Domain: `your-tenant.onmicrosoft.com`
- Authentication Method: Interactive Login (recommended)

## Deployment

### Local Windows Deployment
1. Ensure PowerShell execution policy allows module installation:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. Install the application and run:
   ```bash
   npm install
   npm run build
   npm start
   ```

### Production Deployment
1. Build the application:
   ```bash
   npm run build
   ```

2. Deploy the built files to your Windows server
3. Install Node.js on the target system
4. Run the production server:
   ```bash
   npm start
   ```

## Security Considerations

- Run the application on a secure Windows environment
- Ensure PowerShell modules are installed from trusted sources
- Use service accounts with appropriate Microsoft 365 permissions
- Implement network security measures for web interface access
- Regular security updates for all dependencies

## Troubleshooting

### Module Installation Issues
- Verify PowerShell execution policy settings
- Check internet connectivity for module downloads
- Ensure PowerShell Gallery access is not blocked

### Connection Problems
- Verify Microsoft 365 administrator credentials
- Check network connectivity to Microsoft services
- Ensure required PowerShell modules are properly installed

### Command Execution Errors
- Review PowerShell error messages in the console
- Verify user permissions for Places management
- Check command syntax against Microsoft documentation

## Development

### Project Structure
```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Application pages
│   │   └── lib/           # Utilities and types
├── server/                # Express backend
│   ├── services/          # PowerShell integration
│   ├── routes.ts          # API endpoints
│   └── storage.ts         # Data management
└── shared/                # Shared schemas and types
```

### Adding New Features
1. Define data models in `shared/schema.ts`
2. Implement backend logic in `server/`
3. Create UI components in `client/src/components/`
4. Add API endpoints in `server/routes.ts`

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Review the troubleshooting section above
- Check PowerShell module documentation
- Consult Microsoft 365 Places documentation
- Open an issue in the repository

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Note**: This tool requires appropriate Microsoft 365 administrator permissions and should be used in compliance with your organization's IT policies and procedures.