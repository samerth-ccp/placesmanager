import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Building2, Key, Shield } from "lucide-react";

export function TenantInfo() {
  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
            <Building2 className="text-white" size={20} />
          </div>
          <div>
            <CardTitle>Microsoft 365 Tenant Information</CardTitle>
            <p className="text-sm text-muted-foreground">Understanding your tenant domain and Exchange Online connection</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Key className="text-blue-500" size={16} />
              <h4 className="font-medium">What is a Tenant Domain?</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Your Microsoft 365 tenant domain is your organization's unique identifier in Microsoft's cloud. 
              It usually looks like <code className="bg-gray-100 px-1 rounded">yourcompany.onmicrosoft.com</code>
            </p>
            <div className="space-y-2">
              <p className="text-sm font-medium">Common examples:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• contoso.onmicrosoft.com</li>
                <li>• yourcompany.onmicrosoft.com</li>
                <li>• organization.onmicrosoft.com</li>
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Shield className="text-green-500" size={16} />
              <h4 className="font-medium">Why Exchange Online?</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Microsoft Places data is managed through Exchange Online because it handles:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Room and desk booking systems</li>
              <li>• Calendar integration for spaces</li>
              <li>• Email addresses for bookable locations</li>
              <li>• User permissions and access control</li>
            </ul>
          </div>
        </div>

        <div className="flex items-start space-x-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <AlertCircle className="text-amber-600 mt-0.5" size={16} />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-800">How to Find Your Tenant Domain</p>
            <div className="text-sm text-amber-700 space-y-1">
              <p>1. Go to <strong>Microsoft 365 Admin Center</strong></p>
              <p>2. Look at your browser URL: <code>admin.microsoft.com/AdminPortal/Home#/homepage</code></p>
              <p>3. Or check your organization's email domain (the part after @)</p>
              <p>4. Ask your IT administrator if you're unsure</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3">
          <Badge variant="outline">
            Requires: Microsoft 365 Admin Permissions
          </Badge>
          <Badge variant="outline">
            Role: Places Administrator
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}