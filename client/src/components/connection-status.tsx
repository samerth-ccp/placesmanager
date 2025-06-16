import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Wifi, WifiOff, Clock, AlertCircle } from "lucide-react";
import type { ConnectionStatus as ConnectionStatusType } from "@/lib/types";

interface ConnectionStatusProps {
  connections: ConnectionStatusType[];
}

export function ConnectionStatus({ connections }: ConnectionStatusProps) {
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

  return (
    <div className="space-y-2">
      {connections.map((connection) => (
        <div
          key={connection.serviceName}
          className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
        >
          <div className="flex items-center space-x-2">
            {getStatusIcon(connection.status)}
            <span className="text-sm font-medium">{connection.serviceName}</span>
          </div>
          <span className={`text-xs font-medium ${getStatusColor(connection.status)}`}>
            {getStatusText(connection.status)}
          </span>
        </div>
      ))}
    </div>
  );
}
