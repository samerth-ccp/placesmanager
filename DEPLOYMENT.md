# Deployment Instructions

## Pushing Code to GitHub

Since this Replit environment has git restrictions, follow these steps to push the code to your GitHub repository:

### 1. Download the Project Files
Download all project files from this Replit environment or copy them to your local machine.

### 2. Local Git Setup
```bash
# Clone your existing repository
git clone https://github.com/samerth-ccp/placesmanager.git
cd placesmanager

# Copy all files from Replit to this directory
# (Replace existing files)

# Add all files
git add .

# Commit changes
git commit -m "Add Microsoft Places Admin Tool with PowerShell integration

- Complete React/TypeScript frontend with modern UI
- Express.js backend with PowerShell service integration
- Automatic platform detection (demo mode on non-Windows)
- Module installation and connection management
- Interactive PowerShell console with command history
- Places hierarchy viewer with expandable tree structure
- Cross-platform development support"

# Push to GitHub
git push origin main
```

## Windows Deployment Steps

### 1. Clone and Setup
```bash
git clone https://github.com/samerth-ccp/placesmanager.git
cd placesmanager
npm install
```

### 2. PowerShell Configuration
Run PowerShell as Administrator and execute:
```powershell
# Set execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install required modules (the app will also do this automatically)
Install-Module -Name ExchangeOnlineManagement -Force -AllowClobber
Install-Module -Name Microsoft.Graph.Places -Force -AllowClobber
Install-Module -Name Microsoft.Places.PowerShell -Force -AllowClobber
```

### 3. Run the Application
```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

### 4. Access the Application
Open your browser to `http://localhost:5000`

## Key Differences: Demo vs Live Mode

### Demo Mode (Non-Windows)
- Shows simulated PowerShell responses
- Displays sample Places hierarchy data
- All UI functionality works for testing
- Demo mode indicator in sidebar

### Live Mode (Windows)
- Executes real PowerShell commands
- Connects to actual Microsoft 365 services
- Manages real Places data
- Full production functionality

## Authentication Requirements

When running on Windows, you'll need:
- Microsoft 365 Global Administrator account
- Exchange Administrator permissions
- Places Administrator role (if available)

The application will prompt for authentication when connecting to Exchange Online.

## File Structure Ready for GitHub

All files are properly organized and ready for deployment:

```
microsoft-places-admin/
├── client/                 # React frontend
├── server/                 # Express backend  
├── shared/                 # Shared schemas
├── package.json           # Dependencies
├── README.md              # Complete documentation
├── DEPLOYMENT.md          # This file
├── replit.md              # Project architecture
└── ... (config files)
```

The complete application is ready for Windows deployment with full Microsoft Places integration.