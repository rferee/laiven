import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { words, wordAttributeValues, wordRelations, attributes, wordDerivatives, derivativeTypes } from '../../db/schema/index.js';
import { requireProjectAccess } from '../../middleware/auth.js';
import { redis } from '../../db/redis.js';

interface SearchCondition {
  type: 'attribute' | 'derivative' | 'text';
  field?: string;
  operator?: string;
  value?: unknown;
  children?: SearchCondition[];
  logic?: 'AND' | 'OR' | 'NOT';
}

interface SearchQuery {
  text?: string;
  conditions?: SearchCondition;
  sort?: { field: string; order: 'asc' | 'desc' };
  cursor?: string;
  limit?: number;
}

export async function searchRoutes(app: FastifyInstance) {
  const projectPrefix = '/api/v1/projects/:projectId';

  app.post(`${projectPrefix}/words/search`, {
    schema: { tags: ['Search'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    const query = request.body as SearchQuery;
    const limit = Math.min(query.limit || 50, 100);

    // Try cache first
    const cacheKey = `search:${projectId}:${JSON.stringify(query)}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      request.log.warn({ err }, 'Search cache read failed, proceeding without cache');
    }

    // Get all non-deleted words for this project
    const allWords = await db.select()
      .from(words)
      .where(and(eq(words.projectId, projectId), isNull(words.deletedAt)))
      .orderBy(desc(words.createdAt));

    // Load all attribute values in bulk
    const wordIds = allWords.map(w => w.id);
    if (wordIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    // Batch-load all data in 4 queries instead of N+1 per word
    const [allAttrValues, allAttrs, allRelations, allDerivs] = await Promise.all([
      db.select().from(wordAttributeValues).where(inArray(wordAttributeValues.wordId, wordIds)),
      db.select().from(attributes).where(and(eq(attributes.projectId, projectId), isNull(attributes.deletedAt))),
      db.select().from(wordRelations).where(inArray(wordRelations.wordId, wordIds)),
      db.select({
        wordId: wordDerivatives.wordId,
        identifier: derivativeTypes.identifier,
        value: wordDerivatives.value,
      })
        .from(wordDerivatives)
        .innerJoin(derivativeTypes, eq(wordDerivatives.derivativeTypeId, derivativeTypes.id))
        .where(inArray(wordDerivatives.wordId, wordIds)),
    ]);

    // Index attributes by id for fast lookup
    const attrById = new Map(allAttrs.map(a => [a.id, a]));

    // Group attribute values by wordId
    const attrValuesByWordId = new Map<string, Map<string, unknown>>();
    for (const val of allAttrValues) {
      const attr = attrById.get(val.attributeId);
      if (!attr) continue;

      let wordMap = attrValuesByWordId.get(val.wordId);
      if (!wordMap) {
        wordMap = new Map();
        attrValuesByWordId.set(val.wordId, wordMap);
      }

      let value: unknown;
      switch (attr.type) {
        case 'string': value = val.stringValue; break;
        case 'one_of': value = val.oneOfValue; break;
        case 'integer': value = val.integerValue; break;
        case 'boolean': value = val.booleanValue; break;
        default: value = val.stringValue;
      }
      wordMap.set(attr.identifier, value);
    }

    // Group relations by wordId
    for (const rel of allRelations) {
      const attr = attrById.get(rel.attributeId);
      if (!attr) continue;

      let wordMap = attrValuesByWordId.get(rel.wordId);
      if (!wordMap) {
        wordMap = new Map();
        attrValuesByWordId.set(rel.wordId, wordMap);
      }

      if (attr.type === 'single_relation') {
        wordMap.set(attr.identifier, rel.relatedWordId);
      } else if (attr.type === 'multiple_relation') {
        const existing = (wordMap.get(attr.identifier) as string[]) || [];
        existing.push(rel.relatedWordId);
        wordMap.set(attr.identifier, existing);
      }
    }

    // Group derivatives by wordId
    const derivsByWordId = new Map<string, Record<string, string | null>>();
    for (const d of allDerivs) {
      let derivMap = derivsByWordId.get(d.wordId);
      if (!derivMap) {
        derivMap = {};
        derivsByWordId.set(d.wordId, derivMap);
      }
      derivMap[d.identifier] = d.value;
    }

    // Build enriched words from the pre-loaded maps
    const enrichedWords = allWords.map((word) => {
      const wordAttrMap = attrValuesByWordId.get(word.id);
      const attributeValues: Record<string, unknown> = wordAttrMap
        ? Object.fromEntries(wordAttrMap)
        : {};
      const derivativeValues: Record<string, string | null> = derivsByWordId.get(word.id) ?? {};
      return { ...word, attributeValues, derivativeValues };
    });

    // Apply filters
    let filtered = enrichedWords;

    // Text search
    if (query.text) {
      const searchText = query.text.toLowerCase();
      filtered = filtered.filter(word => {
        return Object.values(word.attributeValues).some(val =>
          val != null && String(val).toLowerCase().includes(searchText)
        );
      });
    }

    // Advanced conditions
    if (query.conditions) {
      filtered = filtered.filter(word => evaluateCondition(word, query.conditions!));
    }

    // Sort
    if (query.sort) {
      const { field, order } = query.sort;
      filtered.sort((a, b) => {
        let aVal: unknown, bVal: unknown;

        if (field === 'createdAt') {
          aVal = a.createdAt; bVal = b.createdAt;
        } else if (field === 'updatedAt') {
          aVal = a.updatedAt; bVal = b.updatedAt;
        } else if (field.startsWith('derivative:')) {
          const dKey = field.replace('derivative:', '');
          aVal = a.derivativeValues[dKey]; bVal = b.derivativeValues[dKey];
        } else {
          aVal = a.attributeValues[field]; bVal = b.attributeValues[field];
        }

        const cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''));
        return order === 'asc' ? cmp : -cmp;
      });
    }

    // Pagination
    let startIdx = 0;
    if (query.cursor) {
      const cursorIdx = filtered.findIndex(w => w.id === query.cursor);
      if (cursorIdx >= 0) startIdx = cursorIdx + 1;
    }

    const pageItems = filtered.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + limit < filtered.length;

    const result = {
      items: pageItems,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id : null,
      total: filtered.length,
    };

    // Cache for 30 seconds
    try {
      await redis.setex(cacheKey, 30, JSON.stringify(result));
    } catch (err) {
      request.log.warn({ err }, 'Search cache write failed, continuing without caching');
    }

    return result;
  });
}

function evaluateCondition(
  word: { attributeValues: Record<string, unknown>; derivativeValues: Record<string, string | null> },
  condition: SearchCondition,
): boolean {
  // Logical group
  if (condition.logic && condition.children) {
    switch (condition.logic) {
      case 'AND':
        return condition.children.every(c => evaluateCondition(word, c));
      case 'OR':
        return condition.children.some(c => evaluateCondition(word, c));
      case 'NOT':
        return !condition.children.some(c => evaluateCondition(word, c));
    }
  }

  // Leaf condition
  let fieldValue: unknown;
  if (condition.type === 'attribute') {
    fieldValue = word.attributeValues[condition.field!];
  } else if (condition.type === 'derivative') {
    fieldValue = word.derivativeValues[condition.field!];
  } else {
    return false;
  }

  const compareValue = condition.value;

  switch (condition.operator) {
    case 'equals':
      return String(fieldValue ?? '') === String(compareValue ?? '');
    case 'not_equals':
      return String(fieldValue ?? '') !== String(compareValue ?? '');
    case 'contains':
      return String(fieldValue ?? '').toLowerCase().includes(String(compareValue ?? '').toLowerCase());
    case 'not_contains':
      return !String(fieldValue ?? '').toLowerCase().includes(String(compareValue ?? '').toLowerCase());
    case 'starts_with':
      return String(fieldValue ?? '').toLowerCase().startsWith(String(compareValue ?? '').toLowerCase());
    case 'ends_with':
      return String(fieldValue ?? '').toLowerCase().endsWith(String(compareValue ?? '').toLowerCase());
    case 'is_empty':
      return fieldValue === null || fieldValue === undefined || fieldValue === '';
    case 'is_not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
    case 'greater_than':
      return Number(fieldValue) > Number(compareValue);
    case 'less_than':
      return Number(fieldValue) < Number(compareValue);
    case 'between': {
      const [min, max] = compareValue as [number, number];
      const val = Number(fieldValue);
      return val >= min && val <= max;
    }
    case 'is_one_of':
      return (compareValue as unknown[]).includes(fieldValue);
    case 'is_not_one_of':
      return !(compareValue as unknown[]).includes(fieldValue);
    case 'count_equals':
      return Array.isArray(fieldValue) && fieldValue.length === Number(compareValue);
    case 'count_greater_than':
      return Array.isArray(fieldValue) && fieldValue.length > Number(compareValue);
    case 'count_less_than':
      return Array.isArray(fieldValue) && fieldValue.length < Number(compareValue);
    default:
      return false;
  }
}
