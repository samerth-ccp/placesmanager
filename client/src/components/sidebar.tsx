import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Building, 
  Settings, 
  Map, 
  Terminal, 
  FileText, 
  RefreshCw,
  Download,
  Phone,
  Wifi,
  WifiOff,
  Clock
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConnectionStatus } from "./connection-status";
import { SystemMode } from "@/lib/types";

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onRefreshConfig: () => void;
  onExportConfig: () => void;
}

export function Sidebar({ 
  currentView, 
  onViewChange, 
  onRefreshConfig, 
  onExportConfig 
}: SidebarProps) {
  const queryClient = useQueryClient();

  const { data: connections } = useQuery({
    queryKey: ['/api/connections'],
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const { data: systemMode } = useQuery<SystemMode>({
    queryKey: ['/api/system/mode'],
    refetchInterval: 10000,
  });

  const toggleModeMutation = useMutation({
    mutationFn: async (forceReal: boolean) => {
      const response = await fetch('/api/system/mode/toggle', {
        method: 'POST',
        body: JSON.stringify({ forceReal }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to toggle mode');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/system/mode'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules'] });
      queryClient.invalidateQueries({ queryKey: ['/api/connections'] });
    }
  });

  const navigationItems = [
    {
      id: 'setup',
      label: 'Setup & Connect',
      icon: Settings,
      active: currentView === 'setup',
    },
    {
      id: 'places',
      label: 'Places Hierarchy',
      icon: Map,
      active: currentView === 'places',
    },
    {
      id: 'commands',
      label: 'PowerShell Console',
      icon: Terminal,
      active: currentView === 'commands',
    },
    {
      id: 'logs',
      label: 'Activity Logs',
      icon: FileText,
      active: currentView === 'logs',
    },
  ];

  return (
    <div className="w-80 bg-white border-r border-neutral-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-neutral-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Building className="text-white" size={20} />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-neutral-800">Places Admin</h1>
            <p className="text-sm text-neutral-600">Microsoft Places Management</p>
          </div>
        </div>
        {/* System Mode Indicator */}
        {systemMode && (
          <div className={`mt-3 px-3 py-2 border rounded-lg ${
            systemMode.isDemo 
              ? 'bg-orange-50 border-orange-200' 
              : 'bg-green-50 border-green-200'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  systemMode.isDemo 
                    ? 'bg-orange-500 animate-pulse' 
                    : 'bg-green-500'
                }`}></div>
                <span className={`text-xs font-medium ${
                  systemMode.isDemo 
                    ? 'text-orange-700' 
                    : 'text-green-700'
                }`}>
                  {systemMode.isDemo ? 'Demo Mode' : 'Live Mode'}
                </span>
              </div>
              {systemMode.canForceReal && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-2 text-xs"
                  onClick={() => toggleModeMutation.mutate(!systemMode.isDemo)}
                  disabled={toggleModeMutation.isPending}
                >
                  Switch
                </Button>
              )}
            </div>
            <p className={`text-xs ${
              systemMode.isDemo 
                ? 'text-orange-600' 
                : 'text-green-600'
            }`}>
              {systemMode.isDemo 
                ? 'Using simulated responses for testing'
                : 'Connected to real PowerShell environment'
              }
            </p>
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div className="p-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-800 mb-3">Connection Status</h3>
        <ConnectionStatus connections={Array.isArray(connections) ? connections : []} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={item.active ? "default" : "ghost"}
                className={`w-full justify-start space-x-3 ${
                  item.active 
                    ? "bg-primary text-primary-foreground" 
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
                onClick={() => onViewChange(item.id)}
              >
                <Icon size={16} />
                <span className="font-medium">{item.label}</span>
              </Button>
            );
          })}
        </div>
      </nav>

      {/* Quick Actions */}
      <div className="p-4 border-t border-neutral-200">
        <h4 className="text-sm font-medium text-neutral-800 mb-3">Quick Actions</h4>
        <div className="space-y-2">
          <Button 
            className="w-full justify-start"
            onClick={onRefreshConfig}
          >
            <RefreshCw size={16} className="mr-2" />
            Refresh Configuration
          </Button>
          <Button 
            variant="outline" 
            className="w-full justify-start"
            onClick={onExportConfig}
          >
            <Download size={16} className="mr-2" />
            Export Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}
