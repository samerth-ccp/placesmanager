import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ConnectionStatus as ConnectionStatusType } from "@/lib/types";

interface ConnectionStatusProps {
  connections: ConnectionStatusType[];
}

export function ConnectionStatus({ connections }: ConnectionStatusProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const refreshConnectionMutation = useMutation({
    mutationFn: async (serviceName: string) => {
      if (serviceName === 'Exchange Online') {
        const response = await fetch('/api/connections/exchange/status');
        if (!response.ok) {
          throw new Error('Failed to refresh Exchange Online connection status');
        }
        return response.json();
      } else {
        const response = await fetch('/api/connections');
        if (!response.ok) {
          throw new Error('Failed to refresh connection status');
        }
        return response.json();
      }
    },
    onSuccess: (data, serviceName) => {
      if (serviceName === 'Exchange Online') {
        toast({
          title: "Connection Status Updated",
          description: `Exchange Online connection status has been refreshed.`,
        });
      } else {
        toast({
          title: "Connection Status Updated",
          description: `Connection status has been refreshed.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
    onError: (error) => {
      toast({
        title: "Refresh Failed",
        description: error instanceof Error ? error.message : "Failed to refresh connection status",
        variant: "destructive",
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />;
      case 'connecting':
        return <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />;
      case 'error':
        return <div className="w-2 h-2 bg-red-500 rounded-full" />;
      default:
        return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-600';
      case 'connecting':
        return 'text-orange-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Error';
      default:
        return 'Disconnected';
    }
  };

  const handleRefresh = (serviceName: string) => {
    refreshConnectionMutation.mutate(serviceName);
  };

  return (
    <div className="space-y-2">
      {connections.map((connection) => (
        <div
          key={connection.serviceName}
          className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
        >
          <div className="flex items-center space-x-2">
            {getStatusIcon(connection.status)}
            <span className="text-sm font-medium">{String(connection.serviceName || '')}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-medium ${getStatusColor(connection.status)}`}>
              {getStatusText(connection.status)}
            </span>
            {connection.serviceName === 'Exchange Online' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRefresh(connection.serviceName)}
                disabled={refreshConnectionMutation.isPending}
                className="h-6 w-6 p-0"
              >
                <RefreshCw className={`h-3 w-3 ${refreshConnectionMutation.isPending ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
