import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const buildingSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  countryOrRegion: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  street: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
});

const floorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  buildingId: z.number().min(1, "Building is required"),
});

const sectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  buildingId: z.number().min(1, "Building is required"),
  floorId: z.number().min(1, "Floor is required"),
});

const deskSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["Desk", "Workspace"]),
  buildingId: z.number().min(1, "Building is required"),
  floorId: z.number().min(1, "Floor is required"),
  sectionId: z.number().min(1, "Section is required"),
  emailAddress: z.string().email().optional().or(z.literal("")),
  capacity: z.number().min(1).optional(),
  isBookable: z.boolean().default(true),
});

const roomSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.literal("Room"),
  buildingId: z.number().min(1, "Building is required"),
  floorId: z.number().min(1, "Floor is required"),
  sectionId: z.number().optional(),
  emailAddress: z.string().email().optional().or(z.literal("")),
  capacity: z.number().min(1).optional(),
  isBookable: z.boolean().default(true),
});

type PlaceType = "building" | "floor" | "section" | "desk" | "room";

interface PlaceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: PlaceType;
  editData?: any;
  parentData?: { buildings?: any[], floors?: any[], sections?: any[] };
}

export function PlaceFormDialog({ 
  open, 
  onOpenChange, 
  type, 
  editData,
  parentData 
}: PlaceFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getSchema = () => {
    switch (type) {
      case "building": return buildingSchema;
      case "floor": return floorSchema;
      case "section": return sectionSchema;
      case "desk": return deskSchema;
      case "room": return roomSchema;
      default: return buildingSchema;
    }
  };

  const form = useForm({
    resolver: zodResolver(getSchema()),
    defaultValues: getDefaultValues(),
    mode: "onChange"
  });

  // Update form values when editData changes
  useEffect(() => {
    if (editData) {
      form.reset(getDefaultValues());
    }
  }, [editData]);

  function getDefaultValues() {
    if (editData) {
      // Return edit data with proper field mapping for prepopulation
      return {
        ...editData,
        // Ensure proper ID mapping for dropdowns
        buildingId: editData.buildingId || parentData?.buildings?.[0]?.id || 0,
        floorId: editData.floorId || parentData?.floors?.[0]?.id || 0,
        sectionId: editData.sectionId || parentData?.sections?.[0]?.id || 0,
      };
    }

    switch (type) {
      case "building":
        return { name: "", description: "", countryOrRegion: "", state: "", city: "", street: "", postalCode: "", phone: "" };
      case "floor":
        return { name: "", description: "", buildingId: 0 };
      case "section":
        return { name: "", description: "", buildingId: 0, floorId: 0 };
      case "desk":
        return { name: "", type: "Desk", buildingId: 0, floorId: 0, sectionId: 0, emailAddress: "", capacity: 1, isBookable: true };
      case "room":
        return { name: "", type: "Room", buildingId: 0, floorId: 0, emailAddress: "", capacity: 1, isBookable: true };
      default:
        return {};
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: any) => {
      if (editData) {
        return apiRequest('PUT', `/api/places/${type}/${editData.id}`, data);
      } else {
        return apiRequest('POST', `/api/places/${type}`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/places/hierarchy'] });
      toast({
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} ${editData ? 'Updated' : 'Created'}`,
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} has been ${editData ? 'updated' : 'created'} successfully`,
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.response?.data?.message || `Failed to ${editData ? 'update' : 'create'} ${type}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: any) => {
    console.log('Form data being submitted:', data);
    createMutation.mutate(data);
  };

  const renderBuildingFields = () => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input {...form.register("name")} placeholder="Building name" />
          {form.formState.errors.name && (
            <p className="text-sm text-red-500 mt-1">{form.formState.errors.name.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input {...form.register("phone")} placeholder="+1 234 567 8900" />
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea {...form.register("description")} placeholder="Building description" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="countryOrRegion">Country/Region</Label>
          <Input {...form.register("countryOrRegion")} placeholder="CA, US, etc." />
        </div>
        <div>
          <Label htmlFor="state">State/Province</Label>
          <Input {...form.register("state")} placeholder="BC, CA, etc." />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="city">City</Label>
          <Input {...form.register("city")} placeholder="Vancouver" />
        </div>
        <div>
          <Label htmlFor="postalCode">Postal Code</Label>
          <Input {...form.register("postalCode")} placeholder="V6Z 0G5" />
        </div>
      </div>
      <div>
        <Label htmlFor="street">Street Address</Label>
        <Input {...form.register("street")} placeholder="1480 Howe St" />
      </div>
    </>
  );

  const renderFloorFields = () => (
    <>
      <div>
        <Label htmlFor="buildingId">Building *</Label>
        <Select onValueChange={(value) => form.setValue("buildingId", parseInt(value))}>
          <SelectTrigger>
            <SelectValue placeholder="Select building" />
          </SelectTrigger>
          <SelectContent>
            {parentData?.buildings?.map((building) => (
              <SelectItem key={building.id} value={building.id.toString()}>
                {building.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.buildingId && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.buildingId.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input {...form.register("name")} placeholder="Floor name (e.g., Ground Floor, 2nd Floor)" />
        {form.formState.errors.name && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea {...form.register("description")} placeholder="Floor description" />
      </div>
    </>
  );

  const renderSectionFields = () => (
    <>
      <div>
        <Label htmlFor="buildingId">Building *</Label>
        <Select 
          value={form.watch("buildingId")?.toString()}
          onValueChange={(value) => form.setValue("buildingId", parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select building" />
          </SelectTrigger>
          <SelectContent>
            {parentData?.buildings?.map((building) => (
              <SelectItem key={building.id} value={building.id.toString()}>
                {building.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.buildingId && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.buildingId.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="floorId">Floor *</Label>
        <Select 
          value={form.watch("floorId")?.toString()}
          onValueChange={(value) => form.setValue("floorId", parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select floor" />
          </SelectTrigger>
          <SelectContent>
            {parentData?.floors?.filter((floor: any) => 
              !form.watch("buildingId") || floor.buildingId === form.watch("buildingId")
            ).map((floor: any) => (
              <SelectItem key={floor.id} value={floor.id.toString()}>
                {floor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.floorId && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.floorId.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input {...form.register("name")} placeholder="Section name (e.g., North Wing, Reception Area)" />
        {form.formState.errors.name && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea {...form.register("description")} placeholder="Section description" />
      </div>
    </>
  );

  const renderDeskFields = () => (
    <>
      <div>
        <Label htmlFor="buildingId">Building *</Label>
        <Select 
          value={form.watch("buildingId")?.toString()}
          onValueChange={(value) => form.setValue("buildingId", parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select building" />
          </SelectTrigger>
          <SelectContent>
            {parentData?.buildings?.map((building: any) => (
              <SelectItem key={building.id} value={building.id.toString()}>
                {building.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.buildingId && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.buildingId.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="floorId">Floor *</Label>
        <Select 
          value={form.watch("floorId")?.toString()}
          onValueChange={(value) => form.setValue("floorId", parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select floor" />
          </SelectTrigger>
          <SelectContent>
            {parentData?.floors?.filter((floor: any) => 
              !form.watch("buildingId") || floor.buildingId === form.watch("buildingId")
            ).map((floor: any) => (
              <SelectItem key={floor.id} value={floor.id.toString()}>
                {floor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.floorId && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.floorId.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="sectionId">Section *</Label>
        <Select 
          value={form.watch("sectionId")?.toString()}
          onValueChange={(value) => form.setValue("sectionId", parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select section" />
          </SelectTrigger>
          <SelectContent>
            {parentData?.sections?.filter((section: any) => 
              !form.watch("floorId") || section.floorId === form.watch("floorId")
            ).map((section: any) => (
              <SelectItem key={section.id} value={section.id.toString()}>
                {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.sectionId && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.sectionId.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input {...form.register("name")} placeholder="Desk name" />
          {form.formState.errors.name && (
            <p className="text-sm text-red-500 mt-1">{form.formState.errors.name.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="type">Type *</Label>
          <Select onValueChange={(value) => form.setValue("type", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Desk">Desk</SelectItem>
              <SelectItem value="Workspace">Workspace</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="capacity">Capacity</Label>
          <Input 
            type="number" 
            {...form.register("capacity", { valueAsNumber: true })} 
            placeholder="1" 
          />
        </div>
        <div className="flex items-center space-x-2 pt-6">
          <input 
            type="checkbox" 
            {...form.register("isBookable")} 
            id="isBookable"
            className="rounded"
          />
          <Label htmlFor="isBookable">Bookable</Label>
        </div>
      </div>
      <div>
        <Label htmlFor="emailAddress">Email Address</Label>
        <Input {...form.register("emailAddress")} placeholder="desk@company.com" />
        {form.formState.errors.emailAddress && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.emailAddress.message}</p>
        )}
      </div>
    </>
  );

  const renderRoomFields = () => (
    <>
      <div>
        <Label htmlFor="buildingId">Building *</Label>
        <Select 
          value={form.watch("buildingId")?.toString()}
          onValueChange={(value) => form.setValue("buildingId", parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select building" />
          </SelectTrigger>
          <SelectContent>
            {parentData?.buildings?.map((building: any) => (
              <SelectItem key={building.id} value={building.id.toString()}>
                {building.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.buildingId && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.buildingId.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="floorId">Floor *</Label>
        <Select 
          value={form.watch("floorId")?.toString()}
          onValueChange={(value) => form.setValue("floorId", parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select floor" />
          </SelectTrigger>
          <SelectContent>
            {parentData?.floors?.filter((floor: any) => 
              !form.watch("buildingId") || floor.buildingId === form.watch("buildingId")
            ).map((floor: any) => (
              <SelectItem key={floor.id} value={floor.id.toString()}>
                {floor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.floorId && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.floorId.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="sectionId">Section</Label>
        <Select 
          value={form.watch("sectionId")?.toString() || "none"}
          onValueChange={(value) => form.setValue("sectionId", value === "none" ? undefined : parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select section (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Section</SelectItem>
            {parentData?.sections?.filter((section: any) => 
              !form.watch("floorId") || section.floorId === form.watch("floorId")
            ).map((section: any) => (
              <SelectItem key={section.id} value={section.id.toString()}>
                {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input {...form.register("name")} placeholder="Room name" />
        {form.formState.errors.name && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="capacity">Capacity</Label>
          <Input 
            type="number" 
            {...form.register("capacity", { valueAsNumber: true })} 
            placeholder="1" 
          />
        </div>
        <div className="flex items-center space-x-2 pt-6">
          <input 
            type="checkbox" 
            {...form.register("isBookable")} 
            id="isBookable"
            className="rounded"
          />
          <Label htmlFor="isBookable">Bookable</Label>
        </div>
      </div>
      <div>
        <Label htmlFor="emailAddress">Email Address</Label>
        <Input {...form.register("emailAddress")} placeholder="room@company.com" />
        {form.formState.errors.emailAddress && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.emailAddress.message}</p>
        )}
      </div>
    </>
  );

  const renderFields = () => {
    switch (type) {
      case "building": return renderBuildingFields();
      case "floor": return renderFloorFields();
      case "section": return renderSectionFields();
      case "desk": return renderDeskFields();
      case "room": return renderRoomFields();
      default: return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editData ? 'Edit' : 'Add'} {type.charAt(0).toUpperCase() + type.slice(1)}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {renderFields()}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : (editData ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </form>

      </DialogContent>
    </Dialog>
  );
}