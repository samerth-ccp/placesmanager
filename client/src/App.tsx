import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/sidebar";
import SetupPage from "@/pages/setup";
import PlacesHierarchyPage from "@/pages/places-hierarchy";
import { PowerShellTerminal } from "@/components/powershell-terminal";
import NotFound from "@/pages/not-found";

function Router() {
  const [currentView, setCurrentView] = useState("setup");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      setLastUpdated(new Date().toLocaleTimeString());
    };
    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const getPageTitle = (view: string) => {
    switch (view) {
      case 'setup':
        return 'Setup & Connection';
      case 'places':
        return 'Places Hierarchy';
      case 'commands':
        return 'PowerShell Console';
      case 'logs':
        return 'Activity Logs';
      default:
        return 'Places Admin';
    }
  };

  const getPageDescription = (view: string) => {
    switch (view) {
      case 'setup':
        return 'Configure PowerShell modules and establish connections';
      case 'places':
        return 'View and manage your Microsoft Places configuration';
      case 'commands':
        return 'Execute PowerShell commands directly';
      case 'logs':
        return 'View system activity and command history';
      default:
        return 'Microsoft Places Management';
    }
  };

  const handleRefreshConfig = () => {
    queryClient.invalidateQueries();
    setLastUpdated(new Date().toLocaleTimeString());
  };

  const handleExportConfig = () => {
    // Export functionality would be implemented here
    console.log('Export configuration');
  };

  const renderContent = () => {
    switch (currentView) {
      case 'setup':
        return <SetupPage />;
      case 'places':
        return <PlacesHierarchyPage />;
      case 'commands':
        return <PowerShellTerminal />;
      case 'logs':
        return (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <h3 className="text-lg font-medium text-neutral-800 mb-2">Activity Logs</h3>
              <p className="text-muted-foreground">This feature will be implemented in the next phase</p>
            </div>
          </div>
        );
      default:
        return <SetupPage />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        onRefreshConfig={handleRefreshConfig}
        onExportConfig={handleExportConfig}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="bg-white border-b border-neutral-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-neutral-800">
                {getPageTitle(currentView)}
              </h2>
              <p className="text-sm text-muted-foreground">
                {getPageDescription(currentView)}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-sm text-muted-foreground">
                Last Updated: <span className="font-medium">{lastUpdated}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
