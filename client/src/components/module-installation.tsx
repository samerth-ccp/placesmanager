import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Check, Clock, AlertCircle, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ModuleStatus } from "@/lib/types";

export function ModuleInstallation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: modules, isLoading } = useQuery({
    queryKey: ['/api/modules'],
    refetchInterval: 2000, // Poll every 2 seconds during installation
  });

  const checkModulesMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/modules/check'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/modules'] });
      toast({
        title: "Modules Checked",
        description: "Module status has been updated",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to check module status",
        variant: "destructive",
      });
    },
  });

  const installModuleMutation = useMutation({
    mutationFn: (moduleName: string) => 
      apiRequest('POST', '/api/modules/install', { moduleName }),
    onSuccess: (data, moduleName) => {
      queryClient.invalidateQueries({ queryKey: ['/api/modules'] });
      toast({
        title: "Installation Started",
        description: `Installing ${moduleName}...`,
      });
    },
    onError: (error, moduleName) => {
      toast({
        title: "Installation Failed",
        description: `Failed to install ${moduleName}`,
        variant: "destructive",
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'installed':
        return <Check className="text-green-600" size={16} />;
      case 'installing':
        return <Loader2 className="text-orange-600 animate-spin" size={16} />;
      case 'error':
        return <AlertCircle className="text-red-600" size={16} />;
      default:
        return <Clock className="text-gray-400" size={16} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'installed':
        return 'bg-green-100 text-green-800';
      case 'installing':
        return 'bg-orange-100 text-orange-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'installed':
        return 'Installed';
      case 'installing':
        return 'Installing...';
      case 'error':
        return 'Error';
      default:
        return 'Not Installed';
    }
  };

  const hasUninstalledModules = modules?.some((module: ModuleStatus) => 
    module.status === 'not_installed' || module.status === 'error'
  );

  const installAllMissing = () => {
    modules?.forEach((module: ModuleStatus) => {
      if (module.status === 'not_installed' || module.status === 'error') {
        installModuleMutation.mutate(module.moduleName);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Download className="text-white" size={20} />
          </div>
          <div>
            <CardTitle>Module Installation</CardTitle>
            <p className="text-sm text-muted-foreground">Install required PowerShell modules</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg animate-pulse">
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 bg-gray-300 rounded-full" />
                    <div className="w-32 h-4 bg-gray-300 rounded" />
                  </div>
                  <div className="w-16 h-6 bg-gray-300 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            modules?.map((module: ModuleStatus) => (
              <div
                key={module.moduleName}
                className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-5 h-5 flex items-center justify-center">
                    {getStatusIcon(module.status)}
                  </div>
                  <div>
                    <span className="text-sm font-medium">{module.moduleName}</span>
                    {module.version && (
                      <p className="text-xs text-muted-foreground">v{module.version}</p>
                    )}
                  </div>
                </div>
                <Badge className={getStatusColor(module.status)}>
                  {getStatusText(module.status)}
                </Badge>
              </div>
            ))
          )}
        </div>

        <div className="flex space-x-2">
          <Button
            className="flex-1"
            onClick={installAllMissing}
            disabled={!hasUninstalledModules || installModuleMutation.isPending}
          >
            {installModuleMutation.isPending ? (
              <Loader2 className="mr-2 animate-spin" size={16} />
            ) : (
              <Download className="mr-2" size={16} />
            )}
            Install Missing Modules
          </Button>
          <Button
            variant="outline"
            onClick={() => checkModulesMutation.mutate()}
            disabled={checkModulesMutation.isPending}
          >
            {checkModulesMutation.isPending ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              "Check Status"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
