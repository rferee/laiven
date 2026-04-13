import { eq, and, isNull, asc, ne, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  attributes, rules, wordRuleLinks, derivativeTypes, derivativeTypeDependencies,
  derivativeTypeRuleLinks, builders, wordDerivatives,
  variables, variableItems, wordAttributeValues, wordRelations,
  words,
} from '../../db/schema/index.js';
import type { NodeGraph } from '../../db/schema/index.js';
import { executeRule, executeBuilder } from '../node-engine/index.js';
import type { ExecutionContext } from '../node-engine/types.js';
import { createVersion } from '../versioning/service.js';

export type Attribute = typeof attributes.$inferSelect;

async function findUniqueConflict(
  projectId: string,
  attr: typeof attributes.$inferSelect,
  value: unknown,
  excludeWordId?: string,
): Promise<boolean> {
  // Build a query that matches any non-deleted word in the same project
  // with the same value for this attribute.
  const conditions = [
    eq(wordAttributeValues.attributeId, attr.id),
    isNull(words.deletedAt),
    eq(words.projectId, projectId),
  ];

  if (excludeWordId) {
    conditions.push(ne(wordAttributeValues.wordId, excludeWordId));
  }

  // Choose the right value column based on attribute type
  switch (attr.type) {
    case 'string': {
      const str = String(value);
      if (attr.uniqueMode === 'case_insensitive') {
        conditions.push(sql`lower(${wordAttributeValues.stringValue}) = lower(${str})`);
      } else {
        conditions.push(eq(wordAttributeValues.stringValue, str));
      }
      break;
    }
    case 'one_of':
      conditions.push(eq(wordAttributeValues.oneOfValue, String(value)));
      break;
    case 'integer':
      conditions.push(eq(wordAttributeValues.integerValue, Number(value)));
      break;
    case 'boolean':
      conditions.push(eq(wordAttributeValues.booleanValue, Boolean(value)));
      break;
    default:
      // Unique is not supported for relations
      return false;
  }

  const rows = await db
    .select({ wordId: wordAttributeValues.wordId })
    .from(wordAttributeValues)
    .innerJoin(words, eq(wordAttributeValues.wordId, words.id))
    .where(and(...conditions))
    .limit(1);

  return rows.length > 0;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  pass: boolean;
  required: boolean;
  message?: string;
  touchedAttributes: string[];
}

export interface ValidationIssue {
  ruleId?: string;
  ruleName: string;
  message?: string;
  required: boolean;
  touchedAttributes: string[];
  // Present for field-level issues (required/unique) that originate from an
  // attribute directly rather than from a rule.
  attributeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  ruleResults: RuleEvaluationResult[];
}

export interface VariableContext {
  kind: 'constant' | 'array';
  dataType: string;
  items: unknown[];
}

export async function loadVariablesMap(projectId: string): Promise<Record<string, VariableContext>> {
  const vars = await db.select().from(variables)
    .where(and(eq(variables.projectId, projectId), isNull(variables.deletedAt)));

  if (vars.length === 0) return {};

  // Batch-load all variable items in one query instead of N individual queries
  const varIds = vars.map(v => v.id);
  const allItems = await db.select().from(variableItems)
    .where(inArray(variableItems.variableId, varIds))
    .orderBy(asc(variableItems.displayOrder));

  // Group items by variableId in memory
  const itemsByVariableId = new Map<string, typeof allItems>();
  for (const item of allItems) {
    let group = itemsByVariableId.get(item.variableId);
    if (!group) {
      group = [];
      itemsByVariableId.set(item.variableId, group);
    }
    group.push(item);
  }

  const map: Record<string, VariableContext> = {};
  for (const v of vars) {
    const items = itemsByVariableId.get(v.id) ?? [];
    map[v.name] = {
      kind: v.kind,
      dataType: v.dataType,
      items: items.map(i => i.value),
    };
  }
  return map;
}

/** The authoritative word validation routine. Used at save time AND by the
 * live validation endpoint so the two can never diverge. */
export async function runWordValidation(
  projectId: string,
  attrValues: Record<string, unknown>,
  excludeWordId?: string,
): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    ruleResults: [],
  };

  // Check required attributes
  const allAttrs = await db.select()
    .from(attributes)
    .where(and(eq(attributes.projectId, projectId), isNull(attributes.deletedAt)));

  for (const attr of allAttrs) {
    if (attr.required) {
      const value = attrValues[attr.identifier];
      if (value === null || value === undefined || value === '') {
        result.valid = false;
        result.errors.push({
          attributeId: attr.id,
          ruleName: 'Required',
          message: `${attr.name} is required`,
          required: true,
          touchedAttributes: [attr.identifier],
        });
      }
    }
  }

  // Check uniqueness constraints
  for (const attr of allAttrs) {
    if (attr.uniqueMode === 'off') continue;
    const value = attrValues[attr.identifier];
    if (value === null || value === undefined || value === '') continue;

    const conflict = await findUniqueConflict(
      projectId,
      attr,
      value,
      excludeWordId,
    );
    if (conflict) {
      result.valid = false;
      result.errors.push({
        attributeId: attr.id,
        ruleName: 'Unique',
        message: `Another word already has this ${attr.name}`,
        required: true,
        touchedAttributes: [attr.identifier],
      });
    }
  }

  // Run rules via the word_rule_links join. Enabled rules only, ordered by
  // the link's displayOrder. Note: we intentionally DO NOT break on the first
  // required failure — the caller wants to see every rule result at once so
  // the live validation panel is exhaustive.
  const linkedRules = await db
    .select({
      ruleId: rules.id,
      ruleName: rules.name,
      ruleGraph: rules.graph,
      required: wordRuleLinks.required,
      displayOrder: wordRuleLinks.displayOrder,
    })
    .from(wordRuleLinks)
    .innerJoin(rules, eq(wordRuleLinks.ruleId, rules.id))
    .where(and(
      eq(wordRuleLinks.projectId, projectId),
      isNull(rules.deletedAt),
      eq(rules.enabled, true),
    ))
    .orderBy(asc(wordRuleLinks.displayOrder));

  const variablesMap = await loadVariablesMap(projectId);

  const context: ExecutionContext = {
    attributeValues: attrValues,
    variables: variablesMap,
  };

  for (const linked of linkedRules) {
    const ruleResult = executeRule(linked.ruleGraph as NodeGraph, context);

    result.ruleResults.push({
      ruleId: linked.ruleId,
      ruleName: linked.ruleName,
      pass: ruleResult.pass,
      required: linked.required,
      message: ruleResult.message,
      touchedAttributes: ruleResult.touchedAttributes,
    });

    if (!ruleResult.pass) {
      const issue: ValidationIssue = {
        ruleId: linked.ruleId,
        ruleName: linked.ruleName,
        message: ruleResult.message,
        required: linked.required,
        touchedAttributes: ruleResult.touchedAttributes,
      };
      if (linked.required) {
        result.valid = false;
        result.errors.push(issue);
      } else {
        result.warnings.push(issue);
      }
    }
  }

  return result;
}

export async function generateDerivatives(
  projectId: string,
  wordId: string,
  attrValues: Record<string, unknown>,
  existingDerivatives?: Map<string, { value: string | null; userModified: boolean }>,
) {
  // Wrap the per-type loop in a transaction so a partial failure (bad rule
  // graph, builder throw, DB error mid-loop) rolls back and we don't leave
  // the word in a half-reconciled state with some derivatives stale and
  // others fresh.
  await db.transaction(async (tx) => {
    const types = await tx.select()
      .from(derivativeTypes)
      .where(and(eq(derivativeTypes.projectId, projectId), isNull(derivativeTypes.deletedAt)));

    const variablesMap = await loadVariablesMap(projectId);

    // Build dependency graph to determine execution order
    const deps = await tx.select().from(derivativeTypeDependencies);
    const orderedTypes = topologicalSortDerivatives(types, deps);

    const derivativeValues: Record<string, string | null> = {};

    for (const dtype of orderedTypes) {
      // Check applicability via the library rule link table
      const appRules = await tx
        .select({
          graph: rules.graph,
          required: derivativeTypeRuleLinks.required,
        })
        .from(derivativeTypeRuleLinks)
        .innerJoin(rules, eq(derivativeTypeRuleLinks.ruleId, rules.id))
        .where(and(
          eq(derivativeTypeRuleLinks.derivativeTypeId, dtype.id),
          isNull(rules.deletedAt),
          eq(rules.enabled, true),
        ))
        .orderBy(asc(derivativeTypeRuleLinks.displayOrder));

      let applicable = true;
      if (appRules.length > 0) {
        const context: ExecutionContext = {
          attributeValues: attrValues,
          derivativeValues,
          variables: variablesMap,
        };

        for (const appRule of appRules) {
          const result = executeRule(appRule.graph as NodeGraph, context);
          // Only required links block applicability; optional links are
          // informational and don't prevent the derivative from generating.
          if (!result.pass && appRule.required) {
            applicable = false;
            break;
          }
        }
      }

      if (!applicable) {
        // Remove any existing derivative row for this type — the word is
        // no longer eligible (e.g. applicability rules changed). Without
        // this, stale derivative values persist and the frontend shows
        // them even though the type no longer applies.
        await tx.delete(wordDerivatives)
          .where(and(
            eq(wordDerivatives.wordId, wordId),
            eq(wordDerivatives.derivativeTypeId, dtype.id),
          ));
        continue;
      }

      // Run builder
      let autoValue: string | null = null;
      if (dtype.builderId) {
        const builder = await tx.query.builders.findFirst({
          where: eq(builders.id, dtype.builderId),
        });

        if (builder) {
          const context: ExecutionContext = {
            attributeValues: attrValues,
            derivativeValues,
            variables: variablesMap,
          };

          const result = executeBuilder(builder.graph as NodeGraph, context);
          autoValue = result.value;
        }
      }

      // Check existing derivative
      const existing = existingDerivatives?.get(dtype.id);

      // Look up any existing row for this word+type (may have been deleted
      // during a restore flow, so we can't rely on the map alone).
      const existingDeriv = await tx.query.wordDerivatives.findFirst({
        where: and(
          eq(wordDerivatives.wordId, wordId),
          eq(wordDerivatives.derivativeTypeId, dtype.id),
        ),
      });

      if (existing?.userModified) {
        // Preserve the user-modified value; recompute autoValue for the
        // "suggested" indicator.
        if (existingDeriv) {
          await tx.update(wordDerivatives)
            .set({ value: existing.value, autoValue, userModified: true })
            .where(eq(wordDerivatives.id, existingDeriv.id));
        } else {
          await tx.insert(wordDerivatives).values({
            wordId,
            derivativeTypeId: dtype.id,
            value: existing.value,
            autoValue,
            userModified: true,
          });
        }
        derivativeValues[dtype.identifier] = existing.value;
      } else {
        if (existingDeriv) {
          await tx.update(wordDerivatives)
            .set({ value: autoValue, autoValue, userModified: false })
            .where(eq(wordDerivatives.id, existingDeriv.id));
        } else {
          await tx.insert(wordDerivatives).values({
            wordId,
            derivativeTypeId: dtype.id,
            value: autoValue,
            autoValue,
            userModified: false,
          });
        }
        derivativeValues[dtype.identifier] = autoValue;
      }
    }
  });
}

function topologicalSortDerivatives(
  types: Array<{ id: string; [key: string]: any }>,
  deps: Array<{ derivativeTypeId: string; dependsOnId: string }>,
) {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const typeMap = new Map(types.map(t => [t.id, t]));

  for (const t of types) {
    inDegree.set(t.id, 0);
    adjacency.set(t.id, []);
  }

  for (const dep of deps) {
    if (typeMap.has(dep.derivativeTypeId) && typeMap.has(dep.dependsOnId)) {
      adjacency.get(dep.dependsOnId)?.push(dep.derivativeTypeId);
      inDegree.set(dep.derivativeTypeId, (inDegree.get(dep.derivativeTypeId) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: typeof types = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(typeMap.get(id)!);

    for (const neighbor of adjacency.get(id) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

export async function getWordAttributeValues(
  wordId: string,
  attributeMap?: Map<string, Attribute>,
): Promise<Record<string, unknown>> {
  const values = await db.select()
    .from(wordAttributeValues)
    .where(eq(wordAttributeValues.wordId, wordId));

  // Batch-load attributes if no pre-built map was provided
  if (!attributeMap) {
    const attrIds = [
      ...new Set(values.map(v => v.attributeId)),
    ];
    if (attrIds.length > 0) {
      const rows = await db.select().from(attributes)
        .where(and(inArray(attributes.id, attrIds), isNull(attributes.deletedAt)));
      attributeMap = new Map(rows.map(a => [a.id, a]));
    } else {
      attributeMap = new Map();
    }
  }

  const attrs = new Map<string, unknown>();
  for (const val of values) {
    const attr = attributeMap.get(val.attributeId);
    if (!attr) continue;

    let value: unknown;
    switch (attr.type) {
      case 'string': value = val.stringValue; break;
      case 'one_of': value = val.oneOfValue; break;
      case 'integer': value = val.integerValue; break;
      case 'boolean': value = val.booleanValue; break;
      default: value = val.stringValue;
    }
    attrs.set(attr.identifier, value);
  }

  // Get relations
  const relations = await db.select()
    .from(wordRelations)
    .where(eq(wordRelations.wordId, wordId));

  // Batch-load relation attributes not already in the map
  const missingRelAttrIds = [
    ...new Set(relations.map(r => r.attributeId).filter(id => !attributeMap!.has(id))),
  ];
  if (missingRelAttrIds.length > 0) {
    const rows = await db.select().from(attributes)
      .where(and(inArray(attributes.id, missingRelAttrIds), isNull(attributes.deletedAt)));
    for (const a of rows) {
      attributeMap.set(a.id, a);
    }
  }

  for (const rel of relations) {
    const attr = attributeMap.get(rel.attributeId);
    if (!attr) continue;

    if (attr.type === 'single_relation') {
      attrs.set(attr.identifier, rel.relatedWordId);
    } else if (attr.type === 'multiple_relation') {
      const existing = (attrs.get(attr.identifier) as string[]) || [];
      existing.push(rel.relatedWordId);
      attrs.set(attr.identifier, existing);
    }
  }

  return Object.fromEntries(attrs);
}

export async function buildWordSnapshot(wordId: string) {
  const word = await db.query.words.findFirst({ where: eq(words.id, wordId) });
  const attrValues = await getWordAttributeValues(wordId);
  const derivs = await db.select().from(wordDerivatives)
    .where(eq(wordDerivatives.wordId, wordId));

  return {
    ...word,
    attributeValues: attrValues,
    derivatives: derivs,
  };
}

/** Regenerate derivatives for every word in a project and record a
 * `cascade` version entry for each word that actually changed. Called
 * when a builder is edited, a derivative type is created/updated, or
 * applicability rules are linked/unlinked. User-modified derivatives
 * are preserved. */
export async function regenerateProjectDerivatives(
  projectId: string,
  userId: string,
) {
  const allWords = await db.select()
    .from(words)
    .where(and(eq(words.projectId, projectId), isNull(words.deletedAt)));

  for (const word of allWords) {
    const attrValues = await getWordAttributeValues(word.id);

    // Preserve user-modified derivatives
    const existingDerivs = await db.select()
      .from(wordDerivatives)
      .where(eq(wordDerivatives.wordId, word.id));
    const derivMap = new Map(
      existingDerivs.map(d => [d.derivativeTypeId, {
        value: d.value,
        userModified: d.userModified,
      }]),
    );

    const beforeSnapshot = await buildWordSnapshot(word.id);

    await generateDerivatives(projectId, word.id, attrValues, derivMap);

    const afterSnapshot = await buildWordSnapshot(word.id);

    // Only version if something actually changed
    if (JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot)) {
      await createVersion('word', word.id, userId, { ...afterSnapshot }, 'cascade');
    }
  }
}
