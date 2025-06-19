import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building,
  Layers,
  Grid3x3,
  Dock,
  Users,
  ChevronDown,
  ChevronRight,
  Search,
  RefreshCw,
  Plus,
  Edit,
  Map,
  Trash2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { HierarchyNode } from "@/lib/types";
import { PlaceFormDialog } from "./place-form-dialog";

export function PlacesTree() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"building" | "floor" | "section" | "desk" | "room">("building");
  const [editData, setEditData] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: hierarchy, isLoading, error } = useQuery<any[]>({
    queryKey: ['/api/places/hierarchy'],
  });

  const refreshPlacesMutation = useMutation({
    mutationFn: () => apiRequest('GET', '/api/places/refresh'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/places/hierarchy'] });
      toast({
        title: "Places Refreshed",
        description: "Configuration has been updated from Microsoft 365",
      });
    },
    onError: (error: any) => {
      const errorData = error?.response?.data;
      if (errorData?.requiresConnection) {
        toast({
          title: "Connection Required",
          description: "Please connect to Exchange Online first",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Refresh Failed",
          description: errorData?.error || "Failed to refresh places configuration",
          variant: "destructive",
        });
      }
    },
  });

  const toggleExpanded = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'building':
        return <Building className="text-primary" size={16} />;
      case 'floor':
        return <Layers className="text-blue-500" size={16} />;
      case 'section':
        return <Grid3x3 className="text-orange-500" size={16} />;
      case 'desk':
        return <Dock className="text-green-500" size={16} />;
      case 'workspace':
        return <Users className="text-orange-500" size={16} />;
      case 'room':
        return <Grid3x3 className="text-gray-500" size={16} />;
      default:
        return <Grid3x3 className="text-gray-500" size={16} />;
    }
  };

  const renderDeskNode = (desk: any) => (
    <div
      key={desk.id}
      className="flex items-center justify-between p-2 ml-4 rounded-lg hover:bg-neutral-50"
    >
      <div className="flex items-center space-x-3">
        {getTypeIcon(desk.type)}
        <div>
          <div className="font-medium text-neutral-800 text-sm">{desk.name}</div>
          {desk.emailAddress && (
            <div className="text-xs text-muted-foreground">{desk.emailAddress}</div>
          )}
          {desk.capacity && (
            <div className="text-xs text-muted-foreground">Capacity: {desk.capacity}</div>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {desk.isBookable && (
          <Badge className="bg-green-100 text-green-800">Bookable</Badge>
        )}
        {desk.type === 'Workspace' && (
          <Badge className="bg-blue-100 text-blue-800">Workspace</Badge>
        )}
        <Button variant="ghost" size="sm">
          <Edit size={12} />
        </Button>
      </div>
    </div>
  );

  const renderSectionNode = (section: any) => {
    const sectionId = `section-${section.id}`;
    const isExpanded = expandedNodes.has(sectionId);
    const hasDesks = section.desks && section.desks.length > 0;

    return (
      <div key={section.id} className="tree-item rounded-lg border border-neutral-200 ml-4">
        <div
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-neutral-50"
          onClick={() => hasDesks && toggleExpanded(sectionId)}
        >
          <div className="flex items-center space-x-3">
            {hasDesks ? (
              isExpanded ? (
                <ChevronDown className="text-neutral-400" size={16} />
              ) : (
                <ChevronRight className="text-neutral-400" size={16} />
              )
            ) : (
              <div className="w-4 h-4" />
            )}
            {getTypeIcon('section')}
            <div>
              <div className="font-medium text-neutral-800">{section.name}</div>
              <div className="text-sm text-muted-foreground">
                {section.description} · {section.desks?.length || 0} items
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            <Edit size={12} />
          </Button>
        </div>

        {hasDesks && isExpanded && (
          <div className="pl-8 pb-3 space-y-1">
            {section.desks.map(renderDeskNode)}
          </div>
        )}
      </div>
    );
  };

  const renderRoomNode = (room: any) => (
    <div
      key={room.id}
      className="flex items-center justify-between p-2 ml-4 rounded-lg hover:bg-neutral-50"
    >
      <div className="flex items-center space-x-3">
        {getTypeIcon('room')}
        <div>
          <div className="font-medium text-neutral-800 text-sm">{room.name}</div>
          {room.emailAddress && (
            <div className="text-xs text-muted-foreground">{room.emailAddress}</div>
          )}
          {room.capacity && (
            <div className="text-xs text-muted-foreground">Capacity: {room.capacity}</div>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {room.isBookable && (
          <Badge className="bg-green-100 text-green-800">Bookable</Badge>
        )}
        <Button variant="ghost" size="sm">
          <Edit size={12} />
        </Button>
      </div>
    </div>
  );

  const renderFloorNode = (floor: any) => {
    const floorId = `floor-${floor.id}`;
    const isExpanded = expandedNodes.has(floorId);
    const hasSections = floor.sections && floor.sections.length > 0;
    const hasRooms = floor.rooms && floor.rooms.length > 0;

    return (
      <div key={floor.id} className="tree-item rounded-lg border border-neutral-200 ml-4">
        <div
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-neutral-50"
          onClick={() => (hasSections || hasRooms) && toggleExpanded(floorId)}
        >
          <div className="flex items-center space-x-3">
            {(hasSections || hasRooms) ? (
              isExpanded ? (
                <ChevronDown className="text-neutral-400" size={16} />
              ) : (
                <ChevronRight className="text-neutral-400" size={16} />
              )
            ) : (
              <div className="w-4 h-4" />
            )}
            {getTypeIcon('floor')}
            <div>
              <div className="font-medium text-neutral-800">{floor.name}</div>
              <div className="text-sm text-muted-foreground">
                Floor · {floor.sections?.length || 0} sections · {floor.rooms?.length || 0} rooms
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            <Edit size={12} />
          </Button>
        </div>

        {(hasSections || hasRooms) && isExpanded && (
          <div className="pl-8 pb-4 space-y-2">
            {floor.sections.map(renderSectionNode)}
            {floor.rooms && floor.rooms.map(renderRoomNode)}
          </div>
        )}
      </div>
    );
  };

  const renderBuildingNode = (building: HierarchyNode) => {
    const buildingId = `building-${building.id}`;
    const isExpanded = expandedNodes.has(buildingId);
    const hasFloors = building.floors && building.floors.length > 0;

    return (
      <div key={building.id} className="tree-item rounded-lg border border-neutral-200">
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-neutral-50"
          onClick={() => hasFloors && toggleExpanded(buildingId)}
        >
          <div className="flex items-center space-x-3">
            {hasFloors ? (
              isExpanded ? (
                <ChevronDown className="text-neutral-400" size={16} />
              ) : (
                <ChevronRight className="text-neutral-400" size={16} />
              )
            ) : (
              <div className="w-4 h-4" />
            )}
            {getTypeIcon('building')}
            <div>
              <div className="font-medium text-neutral-800">{building.name}</div>
              <div className="text-sm text-muted-foreground">{building.description}</div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className="bg-green-100 text-green-800">Active</Badge>
            <Button variant="ghost" size="sm">
              <Edit size={12} />
            </Button>
          </div>
        </div>

        {hasFloors && isExpanded && (
          <div className="pl-8 pb-4 space-y-2">
            {(building.floors || []).map(renderFloorNode)}
          </div>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="text-red-500 mb-2">Failed to load places hierarchy</div>
            <Button onClick={() => refreshPlacesMutation.mutate()}>
              <RefreshCw size={16} className="mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Map className="text-white" size={16} />
            </div>
            <CardTitle>Places Hierarchy</CardTitle>
          </div>
          <Button
            onClick={() => refreshPlacesMutation.mutate()}
            disabled={refreshPlacesMutation.isPending}
          >
            <RefreshCw 
              size={16} 
              className={`mr-2 ${refreshPlacesMutation.isPending ? 'animate-spin' : ''}`} 
            />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search and Filter */}
        <div className="flex space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 text-muted-foreground" size={16} />
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              placeholder="Search places..."
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="building">Buildings</SelectItem>
              <SelectItem value="floor">Floors</SelectItem>
              <SelectItem value="section">Sections</SelectItem>
              <SelectItem value="desk">Desks</SelectItem>
              <SelectItem value="room">Rooms</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Hierarchy Tree */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-neutral-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : hierarchy && Array.isArray(hierarchy) && hierarchy.length > 0 ? (
          <div className="space-y-2">
            {hierarchy.map(renderBuildingNode)}
          </div>
        ) : (
          <div className="text-center py-8">
            <Building className="mx-auto text-muted-foreground mb-4" size={48} />
            <div className="text-lg font-medium text-neutral-800 mb-2">No Places Found</div>
            <div className="text-muted-foreground mb-4">
              Connect to Exchange Online and refresh to load your Places configuration
            </div>
            <Button
              onClick={() => refreshPlacesMutation.mutate()}
              disabled={refreshPlacesMutation.isPending}
            >
              <RefreshCw 
                size={16} 
                className={`mr-2 ${refreshPlacesMutation.isPending ? 'animate-spin' : ''}`} 
              />
              Load Places
            </Button>
          </div>
        )}

        {/* Add New Items */}
        {hierarchy && hierarchy.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-4 border-t">
            <Button variant="default">
              <Plus size={16} className="mr-2" />
              Add Building
            </Button>
            <Button variant="outline">
              <Plus size={16} className="mr-2" />
              Add Floor
            </Button>
            <Button variant="outline">
              <Plus size={16} className="mr-2" />
              Add Section
            </Button>
            <Button variant="outline">
              <Plus size={16} className="mr-2" />
              Add Dock/Room
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
