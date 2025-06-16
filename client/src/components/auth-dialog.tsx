import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, User, Building2, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const [tenantDomain, setTenantDomain] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const connectMutation = useMutation({
    mutationFn: async (domain?: string) => {
      const response = await fetch('/api/connect/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantDomain: domain }),
      });
      if (!response.ok) throw new Error('Connection failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connections'] });
      toast({
        title: "Connection Successful",
        description: "Connected to Exchange Online successfully",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect to Exchange Online",
        variant: "destructive",
      });
    }
  });

  const handleConnect = () => {
    connectMutation.mutate(tenantDomain || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="text-white" size={20} />
            </div>
            <div>
              <DialogTitle>Connect to Exchange Online</DialogTitle>
              <DialogDescription>
                Authenticate with your Microsoft 365 tenant
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <User size={16} />
                  <span>Microsoft 365 Admin Account Required</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Building2 size={16} />
                  <span>Places Administrator Permissions</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="tenant">Tenant Domain (Optional)</Label>
            <Input
              id="tenant"
              placeholder="contoso.onmicrosoft.com"
              value={tenantDomain}
              onChange={(e) => setTenantDomain(e.target.value)}
              disabled={connectMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use your default tenant
            </p>
          </div>

          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={connectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConnect}
              className="flex-1"
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Connect
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}