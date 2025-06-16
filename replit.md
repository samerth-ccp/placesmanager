# Microsoft Places Administration Tool

## Overview

This application is a Microsoft Places administration tool that provides a web-based interface for managing Microsoft Places hierarchy through PowerShell integration. It allows administrators to view, manage, and configure buildings, floors, sections, and desks/rooms within their Microsoft 365 environment.

The system is built as a full-stack web application with a React frontend and Express.js backend, utilizing PostgreSQL for data persistence and PowerShell for Microsoft Places API integration.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for client-side routing
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API with JSON communication
- **PowerShell Integration**: Child process spawning for PowerShell command execution
- **Session Management**: Express sessions with PostgreSQL store

### Database Architecture
- **Database**: PostgreSQL 16
- **ORM**: Drizzle ORM with Neon Database serverless driver
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection**: Serverless-first approach using Neon Database

## Key Components

### PowerShell Integration Service
- **Purpose**: Execute PowerShell commands for Microsoft Places management
- **Implementation**: Singleton service managing PowerShell process lifecycle
- **Features**: Command execution, module installation checking, timeout handling
- **Platform Support**: Cross-platform (Windows PowerShell, PowerShell Core)

### Places Hierarchy Management
- **Data Model**: Four-tier hierarchy (Building → Floor → Section → Desk/Room)
- **Synchronization**: Bidirectional sync between PowerShell APIs and local database
- **Relationships**: Foreign key relationships maintaining hierarchical integrity

### Module Management System
- **Required Modules**: ExchangeOnlineManagement, Microsoft.Graph.Places, Microsoft.Places.PowerShell
- **Status Tracking**: Real-time module installation and connection status monitoring
- **Auto-Installation**: Automated PowerShell module installation workflow

### Real-time Terminal Interface
- **Features**: Interactive PowerShell command execution from web interface
- **History**: Command history persistence and retrieval
- **Output**: Real-time command output streaming with error handling

## Data Flow

1. **User Interaction**: User interacts with React frontend components
2. **API Requests**: Frontend makes REST API calls to Express backend
3. **PowerShell Execution**: Backend spawns PowerShell processes for Microsoft Places operations
4. **Data Persistence**: Results are stored in PostgreSQL database via Drizzle ORM
5. **Real-time Updates**: TanStack Query provides automatic data synchronization and caching

## External Dependencies

### Microsoft Services
- **Microsoft Places API**: Core service for managing workplace locations
- **Exchange Online**: Required for desk booking functionality and mailbox management
- **Microsoft Graph**: Additional Places API access and authentication

### Database Service
- **Neon Database**: Serverless PostgreSQL provider
- **Connection**: Environment variable `DATABASE_URL` for database connection

### PowerShell Modules
- **ExchangeOnlineManagement**: Exchange Online operations and mailbox management
- **Microsoft.Graph.Places**: Microsoft Graph Places API integration
- **Microsoft.Places.PowerShell**: Direct PowerShell cmdlets for Places management

## Deployment Strategy

### Development Environment
- **Command**: `npm run dev` - Runs development server with hot reloading
- **Port**: Application runs on port 5000
- **Database**: Requires PostgreSQL connection via `DATABASE_URL`

### Production Build
- **Frontend Build**: Vite builds React application to `dist/public`
- **Backend Build**: ESBuild bundles server code to `dist/index.js`
- **Start Command**: `npm run start` - Runs production server

### Replit Configuration
- **Modules**: nodejs-20, web, postgresql-16
- **Deployment**: Autoscale deployment target
- **Port Forwarding**: Internal port 5000 mapped to external port 80

### Database Operations
- **Schema Management**: `npm run db:push` - Applies schema changes to database
- **Migration Strategy**: Drizzle Kit handles schema versioning and migration

## Changelog
- June 16, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.