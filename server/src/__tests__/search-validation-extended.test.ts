import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('@fastify/rate-limit', () => ({
  default: async () => {},
  __esModule: true,
}));

import {
  setupTestApp, teardownTestApp, inject,
  getAttributeId, getRuleId, createWord,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let app: FastifyInstance;
let adminCookies: string;
let projectId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  app = ctx.app;
  adminCookies = ctx.adminCookies;
  projectId = ctx.eldarianProjectId;
}, 60000);

afterAll(async () => {
  await teardownTestApp(ctx);
}, 30000);

/* ------------------------------------------------------------------ */
/*  Word Validation — Extended                                        */
/* ------------------------------------------------------------------ */
describe('Word Validation — Extended', () => {
  const validateUrl = () => `/api/v1/projects/${projectId}/words/validate`;

  it('1. validates with valid data', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: validateUrl(),
      payload: {
        attributeValues: {
          word: 'talien',
          translation: 'test',
          word_type: 'Noun',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.ruleResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pass: true }),
      ]),
    );
  });

  it('2. rejects missing required word attribute', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: validateUrl(),
      payload: {
        attributeValues: {
          word: '',
          translation: 'test',
          word_type: 'Noun',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('3. rejects missing required translation', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: validateUrl(),
      payload: {
        attributeValues: {
          word: 'talien',
          translation: '',
          word_type: 'Noun',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
  });

  it('4. rejects missing required word_type', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: validateUrl(),
      payload: {
        attributeValues: {
          word: 'talien',
          translation: 'test',
          word_type: '',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
  });

  it('5. rejects duplicate value on unique attribute', async () => {
    // Create a unique attribute
    const createAttrRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/attributes`,
      payload: {
        name: 'Unique Code',
        type: 'string',
        required: false,
        uniqueMode: 'case_sensitive',
      },
    });
    expect(createAttrRes.statusCode).toBe(200);
    const attr = createAttrRes.json();

    // Create a word with the unique value
    const word = await createWord(app, adminCookies, projectId, {
      word: 'uniquetest',
      translation: 'unique test',
      word_type: 'Noun',
      unique_code: 'UniqueVal',
    });

    // Validate another word with the same unique value
    const valRes = await inject(app, adminCookies, {
      method: 'POST',
      url: validateUrl(),
      payload: {
        attributeValues: {
          word: 'anotherword',
          translation: 'another',
          word_type: 'Noun',
          unique_code: 'UniqueVal',
        },
      },
    });
    expect(valRes.statusCode).toBe(200);
    const valBody = valRes.json();
    expect(valBody.valid).toBe(false);

    // Clean up: delete the word and attribute
    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
    });
    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/attributes/${attr.id}`,
    });
  });

  it('6. passes all linked rules when word contains a vowel', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: validateUrl(),
      payload: {
        attributeValues: {
          word: 'talien',
          translation: 'test',
          word_type: 'Noun',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
    for (const rule of body.ruleResults) {
      expect(rule.pass).toBe(true);
    }
  });

  it('7. fails required rule when word has no vowels', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: validateUrl(),
      payload: {
        attributeValues: {
          word: 'bcd',
          translation: 'test',
          word_type: 'Noun',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    const failedRequired = body.ruleResults.find(
      (r: any) => r.pass === false && r.required === true,
    );
    expect(failedRequired).toBeDefined();
  });

  it('8. optional rule failure still results in valid:true (warning)', async () => {
    // Create a simple rule
    const ruleRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/rules`,
      payload: {
        name: 'Optional test rule',
        graph: {
          nodes: [
            {
              id: 'ret',
              type: 'return_rule',
              position: { x: 0, y: 0 },
              data: { pass: false },
            },
          ],
          edges: [],
        },
      },
    });
    expect(ruleRes.statusCode).toBe(200);
    const rule = ruleRes.json();

    // Link it as optional
    const linkRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/word-rules`,
      payload: {
        ruleId: rule.id,
        required: false,
      },
    });
    expect(linkRes.statusCode).toBe(200);
    const link = linkRes.json();

    // Validate — the optional rule should fail but valid is still true
    const valRes = await inject(app, adminCookies, {
      method: 'POST',
      url: validateUrl(),
      payload: {
        attributeValues: {
          word: 'talien',
          translation: 'test',
          word_type: 'Noun',
        },
      },
    });
    expect(valRes.statusCode).toBe(200);
    const valBody = valRes.json();
    expect(valBody.valid).toBe(true);
    const optionalResult = valBody.ruleResults.find(
      (r: any) => r.ruleId === rule.id,
    );
    expect(optionalResult).toBeDefined();
    expect(optionalResult.pass).toBe(false);
    expect(optionalResult.required).toBe(false);

    // Clean up
    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/word-rules/${link.id}`,
    });
    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/rules/${rule.id}`,
    });
  });

  it('9. returns ALL rule results (does not stop at first failure)', async () => {
    // Create two rules that always fail
    const makeFailRule = async (name: string) => {
      const res = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/rules`,
        payload: {
          name,
          graph: {
            nodes: [
              {
                id: 'ret',
                type: 'return_rule',
                position: { x: 0, y: 0 },
                data: { pass: false },
              },
            ],
            edges: [],
          },
        },
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    };

    const rule1 = await makeFailRule('Fail rule A');
    const rule2 = await makeFailRule('Fail rule B');

    const link1Res = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/word-rules`,
      payload: { ruleId: rule1.id, required: false },
    });
    const link2Res = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/word-rules`,
      payload: { ruleId: rule2.id, required: false },
    });
    expect(link1Res.statusCode).toBe(200);
    expect(link2Res.statusCode).toBe(200);
    const link1 = link1Res.json();
    const link2 = link2Res.json();

    const valRes = await inject(app, adminCookies, {
      method: 'POST',
      url: validateUrl(),
      payload: {
        attributeValues: {
          word: 'talien',
          translation: 'test',
          word_type: 'Noun',
        },
      },
    });
    expect(valRes.statusCode).toBe(200);
    const valBody = valRes.json();

    const result1 = valBody.ruleResults.find((r: any) => r.ruleId === rule1.id);
    const result2 = valBody.ruleResults.find((r: any) => r.ruleId === rule2.id);
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
    expect(result1.pass).toBe(false);
    expect(result2.pass).toBe(false);

    // Clean up
    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/word-rules/${link1.id}`,
    });
    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/word-rules/${link2.id}`,
    });
    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/rules/${rule1.id}`,
    });
    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/rules/${rule2.id}`,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Search — Extended                                                  */
/* ------------------------------------------------------------------ */
describe('Search — Extended', () => {
  const searchUrl = () => `/api/v1/projects/${projectId}/words/search`;

  /* ---------- Text search ---------- */

  it('10. text search "velara" finds the seeded word', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: { text: 'velara' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('velara');
  });

  it('11. text search "xyznotfound" returns empty', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: { text: 'xyznotfound' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('12. text search "to" finds velara and shendara via translation', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: { text: 'to' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('velara');
    expect(words).toContain('shendara');
  });

  /* ---------- Attribute operators ---------- */

  it('13. attribute equals: word_type=Verb returns velara, shendara', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'word_type',
          operator: 'equals',
          value: 'Verb',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('velara');
    expect(words).toContain('shendara');
    expect(words).not.toContain('thalien');
  });

  it('14. attribute not_equals: word_type!=Verb returns non-verbs', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'word_type',
          operator: 'not_equals',
          value: 'Verb',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).not.toContain('velara');
    expect(words).not.toContain('shendara');
    expect(words.length).toBeGreaterThanOrEqual(2);
  });

  it('15. attribute contains: word contains "ara" → velara, shendara', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'word',
          operator: 'contains',
          value: 'ara',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('velara');
    expect(words).toContain('shendara');
  });

  it('16. attribute starts_with: word starts with "th" → thalien', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'word',
          operator: 'starts_with',
          value: 'th',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('thalien');
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('17. attribute ends_with: word ends with "en" → thalien, lorien', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'word',
          operator: 'ends_with',
          value: 'en',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('thalien');
    expect(words).toContain('lorien');
  });

  it('18. attribute is_empty: notes is empty for most seeded words', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'notes',
          operator: 'is_empty',
          value: null,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('19. integer equals: syllable_count=2 → thalien', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'syllable_count',
          operator: 'equals',
          value: 2,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('thalien');
    expect(body.items.length).toBe(1);
  });

  it('20. integer greater_than: syllable_count > 2', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'syllable_count',
          operator: 'greater_than',
          value: 2,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    // All returned items should have syllable_count > 2
    for (const item of body.items) {
      const sc = item.attributeValues?.syllable_count ?? item.syllable_count;
      expect(Number(sc)).toBeGreaterThan(2);
    }
  });

  it('21. integer less_than: syllable_count < 3 → thalien', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'syllable_count',
          operator: 'less_than',
          value: 3,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('thalien');
  });

  it('22. is_one_of: word_type in [Noun, Adjective] → thalien, mirael, lorien', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'word_type',
          operator: 'is_one_of',
          value: ['Noun', 'Adjective'],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('thalien');
    expect(words).toContain('mirael');
    expect(words).toContain('lorien');
    expect(words).not.toContain('velara');
    expect(words).not.toContain('shendara');
  });

  it('23. is_not_one_of: word_type not in [Noun, Adjective] → verbs only', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'attribute',
          field: 'word_type',
          operator: 'is_not_one_of',
          value: ['Noun', 'Adjective'],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('velara');
    expect(words).toContain('shendara');
    expect(words).not.toContain('thalien');
    expect(words).not.toContain('mirael');
    expect(words).not.toContain('lorien');
  });

  /* ---------- Group logic ---------- */

  it('24. AND group: word_type=Verb AND word contains "vel" → velara', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          logic: 'AND',
          children: [
            { type: 'attribute', field: 'word_type', operator: 'equals', value: 'Verb' },
            { type: 'attribute', field: 'word', operator: 'contains', value: 'vel' },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('velara');
    expect(body.items.length).toBe(1);
  });

  it('25. OR group: word_type=Noun OR word_type=Adjective → thalien, mirael, lorien', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          logic: 'OR',
          children: [
            { type: 'attribute', field: 'word_type', operator: 'equals', value: 'Noun' },
            { type: 'attribute', field: 'word_type', operator: 'equals', value: 'Adjective' },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('thalien');
    expect(words).toContain('mirael');
    expect(words).toContain('lorien');
    expect(body.items.length).toBe(3);
  });

  it('26. NOT group: NOT word_type=Verb → non-verbs', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          logic: 'NOT',
          children: [
            { type: 'attribute', field: 'word_type', operator: 'equals', value: 'Verb' },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).not.toContain('velara');
    expect(words).not.toContain('shendara');
    expect(words.length).toBeGreaterThanOrEqual(2);
  });

  it('27. nested: AND(word_type=Verb, NOT(word contains "vel")) → shendara', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          logic: 'AND',
          children: [
            { type: 'attribute', field: 'word_type', operator: 'equals', value: 'Verb' },
            {
              logic: 'NOT',
              children: [
                { type: 'attribute', field: 'word', operator: 'contains', value: 'vel' },
              ],
            },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    expect(words).toContain('shendara');
    expect(words).not.toContain('velara');
  });

  /* ---------- Derivative search ---------- */

  it('28. derivative search: past_tense contains some substring', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        conditions: {
          type: 'derivative',
          field: 'past_tense',
          operator: 'is_not_empty',
          value: null,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Only verb words have past_tense derivatives
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    for (const w of words) {
      expect(['velara', 'shendara']).toContain(w);
    }
  });

  /* ---------- Sorting ---------- */

  it('29. sort by word ascending → alphabetical order', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        sort: { field: 'word', order: 'asc' },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    const sorted = [...words].sort((a: string, b: string) => a.localeCompare(b));
    expect(words).toEqual(sorted);
  });

  it('30. sort by word descending → reverse alphabetical', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        sort: { field: 'word', order: 'desc' },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const words = body.items.map((i: any) => i.attributeValues?.word ?? i.word);
    const sorted = [...words].sort((a: string, b: string) => b.localeCompare(a));
    expect(words).toEqual(sorted);
  });

  // Note: sort uses string localeCompare, not numeric sort. Works for single-digit values only.
  it('31. sort by syllable_count ascending', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {
        sort: { field: 'syllable_count', order: 'asc' },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const counts = body.items.map(
      (i: any) => Number(i.attributeValues?.syllable_count ?? i.syllable_count),
    );
    for (let idx = 1; idx < counts.length; idx++) {
      expect(counts[idx]).toBeGreaterThanOrEqual(counts[idx - 1]);
    }
  });

  /* ---------- Pagination ---------- */

  it('32. pagination: limit 2 returns 2 items and a cursor', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: { limit: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(2);
    expect(body.total).toBeGreaterThanOrEqual(5);
    expect(body.nextCursor).toBeDefined();
  });

  it('33. pagination: second page via cursor has no duplicates', async () => {
    const firstRes = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: { limit: 2 },
    });
    expect(firstRes.statusCode).toBe(200);
    const firstBody = firstRes.json();
    const firstIds = firstBody.items.map((i: any) => i.id);

    const secondRes = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: { limit: 2, cursor: firstBody.nextCursor },
    });
    expect(secondRes.statusCode).toBe(200);
    const secondBody = secondRes.json();
    const secondIds = secondBody.items.map((i: any) => i.id);

    // No overlap between pages
    for (const id of secondIds) {
      expect(firstIds).not.toContain(id);
    }
  });

  it('34. empty search returns all words with total >= 5', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: searchUrl(),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThanOrEqual(5);
    expect(body.items.length).toBeGreaterThanOrEqual(5);
  });
});
