import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['instance_admin', 'user']);

export const projectRoleEnum = pgEnum('project_role', ['project_admin', 'editor', 'viewer']);

export const attributeTypeEnum = pgEnum('attribute_type', [
  'string',
  'one_of',
  'integer',
  'boolean',
  'single_relation',
  'multiple_relation',
]);

export const uniqueModeEnum = pgEnum('unique_mode', [
  'off',
  'case_sensitive',
  'case_insensitive',
]);

export const variableDataTypeEnum = pgEnum('variable_data_type', ['string', 'one_of', 'integer', 'boolean']);
export const variableKindEnum = pgEnum('variable_kind', ['constant', 'array']);

export const entityTypeEnum = pgEnum('entity_type', [
  'word',
  'attribute',
  'variable',
  'rule',
  'builder',
  'derivative_type',
]);

export const changeTypeEnum = pgEnum('change_type', ['created', 'updated', 'deleted', 'cascade']);

export interface NodeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: projectRoleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('pm_project_user_idx').on(table.projectId, table.userId),
  unique('pm_unique').on(table.projectId, table.userId),
]);

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
  keyPrefix: varchar('key_prefix', { length: 10 }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  role: projectRoleEnum('role'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export const attributes = pgTable('attributes', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  type: attributeTypeEnum('type').notNull(),
  required: boolean('required').notNull().default(false),
  uniqueMode: uniqueModeEnum('unique_mode').notNull().default('off'),
  displayOrder: integer('display_order').notNull().default(0),
  description: text('description'),
  options: jsonb('options').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const variables = pgTable('variables', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  kind: variableKindEnum('kind').notNull().default('array'),
  dataType: variableDataTypeEnum('data_type').notNull().default('string'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const variableItems = pgTable('variable_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  variableId: uuid('variable_id').notNull().references(() => variables.id, { onDelete: 'cascade' }),
  value: varchar('value', { length: 1000 }).notNull(),
  displayOrder: integer('display_order').notNull().default(0),
});

export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(true),
  graph: jsonb('graph').notNull().$type<NodeGraph>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// Which rules run during word validation, in what order, required vs warning.
export const wordRuleLinks = pgTable('word_rule_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
  required: boolean('required').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('wrl_project_id_idx').on(table.projectId),
  unique('wrl_unique').on(table.projectId, table.ruleId),
]);

export const builders = pgTable('builders', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  graph: jsonb('graph').notNull().$type<NodeGraph>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const derivativeTypes = pgTable('derivative_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  required: boolean('required').notNull().default(false),
  builderId: uuid('builder_id').references(() => builders.id),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const derivativeTypeDependencies = pgTable('derivative_type_dependencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  derivativeTypeId: uuid('derivative_type_id').notNull().references(() => derivativeTypes.id, { onDelete: 'cascade' }),
  dependsOnId: uuid('depends_on_id').notNull().references(() => derivativeTypes.id, { onDelete: 'cascade' }),
}, (table) => [
  index('dtd_dt_id_idx').on(table.derivativeTypeId),
  unique('dtd_unique').on(table.derivativeTypeId, table.dependsOnId),
]);

// Links a library rule to a derivative type as an applicability check,
// ordered and with required/optional semantics per link.
export const derivativeTypeRuleLinks = pgTable('derivative_type_rule_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  derivativeTypeId: uuid('derivative_type_id').notNull().references(() => derivativeTypes.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
  required: boolean('required').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('dtrl_dt_id_idx').on(table.derivativeTypeId),
  unique('dtrl_unique').on(table.derivativeTypeId, table.ruleId),
]);

export const words = pgTable('words', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const wordAttributeValues = pgTable('word_attribute_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  wordId: uuid('word_id').notNull().references(() => words.id, { onDelete: 'cascade' }),
  attributeId: uuid('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  stringValue: text('string_value'),
  integerValue: integer('integer_value'),
  booleanValue: boolean('boolean_value'),
  oneOfValue: varchar('one_of_value', { length: 500 }),
}, (table) => [
  index('wav_word_id_idx').on(table.wordId),
  unique('wav_word_attr_unique').on(table.wordId, table.attributeId),
]);

export const wordRelations = pgTable('word_relations', {
  id: uuid('id').primaryKey().defaultRandom(),
  wordId: uuid('word_id').notNull().references(() => words.id, { onDelete: 'cascade' }),
  attributeId: uuid('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  relatedWordId: uuid('related_word_id').notNull().references(() => words.id, { onDelete: 'cascade' }),
}, (table) => [
  index('wr_word_id_idx').on(table.wordId),
]);

export const wordDerivatives = pgTable('word_derivatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  wordId: uuid('word_id').notNull().references(() => words.id, { onDelete: 'cascade' }),
  derivativeTypeId: uuid('derivative_type_id').notNull().references(() => derivativeTypes.id, { onDelete: 'cascade' }),
  value: text('value'),
  autoValue: text('auto_value'),
  userModified: boolean('user_modified').notNull().default(false),
}, (table) => [
  index('wd_word_id_idx').on(table.wordId),
  unique('wd_word_dt_unique').on(table.wordId, table.derivativeTypeId),
]);

export const versions = pgTable('versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: entityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  snapshot: jsonb('snapshot').notNull(),
  changeType: changeTypeEnum('change_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('versions_entity_version_idx').on(table.entityType, table.entityId, table.versionNumber),
]);
