# Microsoft Places Authentication Script
# Run this script in PowerShell to authenticate before using the web application

Write-Host "Microsoft Places Authentication Script" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""

# Check if modules are installed
Write-Host "Checking required modules..." -ForegroundColor Yellow

$exchangeModule = Get-Module -ListAvailable ExchangeOnlineManagement
$placesModule = Get-Module -ListAvailable MicrosoftPlaces

if (-not $exchangeModule) {
    Write-Host "❌ ExchangeOnlineManagement module not found!" -ForegroundColor Red
    Write-Host "Please install it with: Install-Module -Name ExchangeOnlineManagement -Force -AllowClobber -Scope CurrentUser" -ForegroundColor Yellow
    exit 1
}

if (-not $placesModule) {
    Write-Host "❌ MicrosoftPlaces module not found!" -ForegroundColor Red
    Write-Host "Please install it with: Install-Module -Name MicrosoftPlaces -Force -AllowClobber -Scope CurrentUser" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ All required modules are installed" -ForegroundColor Green
Write-Host ""

# Import modules
Write-Host "Importing modules..." -ForegroundColor Yellow
Import-Module ExchangeOnlineManagement -Force
Import-Module MicrosoftPlaces -Force
Write-Host "✅ Modules imported successfully" -ForegroundColor Green
Write-Host ""

# Connect to Exchange Online
Write-Host "Connecting to Exchange Online..." -ForegroundColor Yellow
try {
    Connect-ExchangeOnline -ShowBanner:$false
    Write-Host "✅ Successfully connected to Exchange Online" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to connect to Exchange Online: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please ensure you have the correct permissions and try again." -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Connect to Microsoft Places
Write-Host "Connecting to Microsoft Places..." -ForegroundColor Yellow
try {
    Connect-MicrosoftPlaces
    Write-Host "✅ Successfully connected to Microsoft Places" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to connect to Microsoft Places: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please ensure you have the correct permissions and try again." -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Test the connection
Write-Host "Testing connection..." -ForegroundColor Yellow
try {
    $buildings = Get-PlaceV3 -Type Building
    Write-Host "✅ Successfully retrieved $($buildings.Count) buildings" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 Authentication successful! You can now use the web application." -ForegroundColor Green
    Write-Host "Keep this PowerShell session open while using the web application." -ForegroundColor Yellow
} catch {
    Write-Host "❌ Failed to retrieve places: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please check your permissions and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") 