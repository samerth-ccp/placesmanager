import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const buildings = pgTable("buildings", {
  id: serial("id").primaryKey(),
  placeId: text("place_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  countryOrRegion: text("country_or_region"),
  state: text("state"),
  city: text("city"),
  street: text("street"),
  postalCode: text("postal_code"),
  phone: text("phone"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const floors = pgTable("floors", {
  id: serial("id").primaryKey(),
  placeId: text("place_id").notNull().unique(),
  buildingId: integer("building_id").references(() => buildings.id),
  parentPlaceId: text("parent_place_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sections = pgTable("sections", {
  id: serial("id").primaryKey(),
  placeId: text("place_id").notNull().unique(),
  floorId: integer("floor_id").references(() => floors.id),
  parentPlaceId: text("parent_place_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const desks = pgTable("desks", {
  id: serial("id").primaryKey(),
  placeId: text("place_id").notNull().unique(),
  sectionId: integer("section_id").references(() => sections.id),
  parentPlaceId: text("parent_place_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'Desk' or 'Room' or 'Workspace'
  emailAddress: text("email_address"),
  capacity: integer("capacity"),
  isBookable: boolean("is_bookable").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const moduleStatus = pgTable("module_status", {
  id: serial("id").primaryKey(),
  moduleName: text("module_name").notNull().unique(),
  status: text("status").notNull(), // 'installed', 'installing', 'not_installed', 'error'
  version: text("version"),
  lastChecked: timestamp("last_checked").defaultNow(),
});

export const connectionStatus = pgTable("connection_status", {
  id: serial("id").primaryKey(),
  serviceName: text("service_name").notNull().unique(),
  status: text("status").notNull(), // 'connected', 'connecting', 'disconnected', 'error'
  lastConnected: timestamp("last_connected"),
  errorMessage: text("error_message"),
});

export const commandHistory = pgTable("command_history", {
  id: serial("id").primaryKey(),
  command: text("command").notNull(),
  output: text("output"),
  status: text("status").notNull(), // 'success', 'error'
  executedAt: timestamp("executed_at").defaultNow(),
});

// Insert schemas
export const insertBuildingSchema = createInsertSchema(buildings).omit({
  id: true,
  createdAt: true,
});

export const insertFloorSchema = createInsertSchema(floors).omit({
  id: true,
  createdAt: true,
});

export const insertSectionSchema = createInsertSchema(sections).omit({
  id: true,
  createdAt: true,
});

export const insertDeskSchema = createInsertSchema(desks).omit({
  id: true,
  createdAt: true,
});

export const insertModuleStatusSchema = createInsertSchema(moduleStatus).omit({
  id: true,
  lastChecked: true,
});

export const insertConnectionStatusSchema = createInsertSchema(connectionStatus).omit({
  id: true,
  lastConnected: true,
});

export const insertCommandHistorySchema = createInsertSchema(commandHistory).omit({
  id: true,
  executedAt: true,
});

// Types
export type Building = typeof buildings.$inferSelect;
export type Floor = typeof floors.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Desk = typeof desks.$inferSelect;
export type ModuleStatus = typeof moduleStatus.$inferSelect;
export type ConnectionStatus = typeof connectionStatus.$inferSelect;
export type CommandHistory = typeof commandHistory.$inferSelect;

export type InsertBuilding = z.infer<typeof insertBuildingSchema>;
export type InsertFloor = z.infer<typeof insertFloorSchema>;
export type InsertSection = z.infer<typeof insertSectionSchema>;
export type InsertDesk = z.infer<typeof insertDeskSchema>;
export type InsertModuleStatus = z.infer<typeof insertModuleStatusSchema>;
export type InsertConnectionStatus = z.infer<typeof insertConnectionStatusSchema>;
export type InsertCommandHistory = z.infer<typeof insertCommandHistorySchema>;

// User schema for existing authentication
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
