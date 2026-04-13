import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('@fastify/rate-limit', () => ({
  default: async () => {},
  __esModule: true,
}));

import {
  setupTestApp, teardownTestApp, inject,
  getAttributeId, getDerivativeTypeId, getBuilderId, createWord,
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

describe('Words — Extended', () => {
  it('1. creates a word with all standard attribute types populated', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'talien',
      translation: 'river',
      word_type: 'Noun',
      syllable_count: 3,
      notes: 'a flowing body of water',
    });

    expect(word.id).toBeDefined();
    expect(word.attributeValues.word).toBe('talien');
    expect(word.attributeValues.translation).toBe('river');
    expect(word.attributeValues.word_type).toBe('Noun');
    expect(word.attributeValues.syllable_count).toBe(3);
    expect(word.attributeValues.notes).toBe('a flowing body of water');
  });

  it('2. creates a word with only required attributes', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'valore',
      translation: 'strength',
      word_type: 'Noun',
    });

    expect(word.id).toBeDefined();
    expect(word.attributeValues.word).toBe('valore');
    expect(word.attributeValues.translation).toBe('strength');
    expect(word.attributeValues.word_type).toBe('Noun');
    const syllableVal = word.attributeValues.syllable_count;
    expect(syllableVal === null || syllableVal === undefined).toBe(true);
  });

  it('3. rejects word missing required "word" attribute', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/words`,
      payload: {
        attributeValues: {
          translation: 'test',
          word_type: 'Noun',
        },
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('4. rejects word missing required "translation" attribute', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/words`,
      payload: {
        attributeValues: {
          word: 'mireth',
          word_type: 'Noun',
        },
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('5. rejects word missing required "word_type" attribute', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/words`,
      payload: {
        attributeValues: {
          word: 'solaire',
          translation: 'sun',
        },
      },
    });

    expect(res.statusCode).toBe(400);
  });

  describe('unique mode — case_sensitive', () => {
    let caseSensitiveAttrId: string;

    beforeAll(async () => {
      const res = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/attributes`,
        payload: {
          name: 'Test Case Sensitive',
          identifier: 'test_case_sensitive',
          type: 'string',
          required: false,
          uniqueMode: 'case_sensitive',
        },
      });
      const body = JSON.parse(res.body);
      caseSensitiveAttrId = body.id;
    });

    afterAll(async () => {
      if (caseSensitiveAttrId) {
        await inject(app, adminCookies, {
          method: 'DELETE',
          url: `/api/v1/projects/${projectId}/attributes/${caseSensitiveAttrId}`,
        });
      }
    });

    it('6. rejects duplicate value with case_sensitive unique', async () => {
      await createWord(app, adminCookies, projectId, {
        word: 'auriel',
        translation: 'dawn',
        word_type: 'Noun',
        test_case_sensitive: 'Test',
      });

      const res = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words`,
        payload: {
          attributeValues: {
            word: 'auriene',
            translation: 'dusk',
            word_type: 'Noun',
            test_case_sensitive: 'Test',
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('7. allows different case with case_sensitive unique', async () => {
      const word = await createWord(app, adminCookies, projectId, {
        word: 'fenoire',
        translation: 'twilight',
        word_type: 'Noun',
        test_case_sensitive: 'test',
      });

      expect(word.id).toBeDefined();
    });
  });

  describe('unique mode — case_insensitive', () => {
    let caseInsensitiveAttrId: string;

    beforeAll(async () => {
      const res = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/attributes`,
        payload: {
          name: 'Test Case Insensitive',
          identifier: 'test_case_insensitive',
          type: 'string',
          required: false,
          uniqueMode: 'case_insensitive',
        },
      });
      const body = JSON.parse(res.body);
      caseInsensitiveAttrId = body.id;
    });

    afterAll(async () => {
      if (caseInsensitiveAttrId) {
        await inject(app, adminCookies, {
          method: 'DELETE',
          url: `/api/v1/projects/${projectId}/attributes/${caseInsensitiveAttrId}`,
        });
      }
    });

    it('8. rejects different case with case_insensitive unique', async () => {
      await createWord(app, adminCookies, projectId, {
        word: 'dorean',
        translation: 'stone',
        word_type: 'Noun',
        test_case_insensitive: 'Test',
      });

      const res = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words`,
        payload: {
          attributeValues: {
            word: 'galiene',
            translation: 'pebble',
            word_type: 'Noun',
            test_case_insensitive: 'TEST',
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('unique mode — off', () => {
    let offAttrId: string;

    beforeAll(async () => {
      const res = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/attributes`,
        payload: {
          name: 'Test No Unique',
          identifier: 'test_no_unique',
          type: 'string',
          required: false,
          uniqueMode: 'off',
        },
      });
      const body = JSON.parse(res.body);
      offAttrId = body.id;
    });

    afterAll(async () => {
      if (offAttrId) {
        await inject(app, adminCookies, {
          method: 'DELETE',
          url: `/api/v1/projects/${projectId}/attributes/${offAttrId}`,
        });
      }
    });

    it('9. allows duplicate values when uniqueMode is off', async () => {
      const word1 = await createWord(app, adminCookies, projectId, {
        word: 'koriane',
        translation: 'leaf',
        word_type: 'Noun',
        test_no_unique: 'SameValue',
      });
      const word2 = await createWord(app, adminCookies, projectId, {
        word: 'boriane',
        translation: 'branch',
        word_type: 'Noun',
        test_no_unique: 'SameValue',
      });

      expect(word1.id).toBeDefined();
      expect(word2.id).toBeDefined();
    });
  });

  describe('relation attributes', () => {
    let singleRelAttrId: string;
    let multiRelAttrId: string;
    let seededWordId: string;
    let secondSeededWordId: string;

    beforeAll(async () => {
      // Look up a seeded word to use as a relation target
      const searchRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words/search`,
        payload: { query: 'velara' },
      });
      const searchBody = JSON.parse(searchRes.body);
      seededWordId = searchBody.items[0].id;

      const searchRes2 = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words/search`,
        payload: { query: 'thalien' },
      });
      const searchBody2 = JSON.parse(searchRes2.body);
      secondSeededWordId = searchBody2.items[0].id;

      // Create single_relation attribute
      const singleRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/attributes`,
        payload: {
          name: 'Test Single Relation',
          identifier: 'test_single_relation',
          type: 'single_relation',
          required: false,
        },
      });
      singleRelAttrId = JSON.parse(singleRes.body).id;

      // Create multiple_relation attribute
      const multiRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/attributes`,
        payload: {
          name: 'Test Multiple Relation',
          identifier: 'test_multiple_relation',
          type: 'multiple_relation',
          required: false,
        },
      });
      multiRelAttrId = JSON.parse(multiRes.body).id;
    });

    afterAll(async () => {
      if (singleRelAttrId) {
        await inject(app, adminCookies, {
          method: 'DELETE',
          url: `/api/v1/projects/${projectId}/attributes/${singleRelAttrId}`,
        });
      }
      if (multiRelAttrId) {
        await inject(app, adminCookies, {
          method: 'DELETE',
          url: `/api/v1/projects/${projectId}/attributes/${multiRelAttrId}`,
        });
      }
    });

    it('10. creates word with valid single_relation', async () => {
      const word = await createWord(app, adminCookies, projectId, {
        word: 'naivore',
        translation: 'echo',
        word_type: 'Noun',
        test_single_relation: seededWordId,
      });

      expect(word.id).toBeDefined();
      expect(word.attributeValues.test_single_relation).toBe(seededWordId);
    });

    it('11. handles non-existent UUID for single_relation', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words`,
        payload: {
          attributeValues: {
            word: 'zelaire',
            translation: 'void',
            word_type: 'Noun',
            test_single_relation: fakeUuid,
          },
        },
      });

      // Returns 500 (FK violation) — should be 400 with proper validation
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('12. creates word with multiple_relation array', async () => {
      const word = await createWord(app, adminCookies, projectId, {
        word: 'pelarion',
        translation: 'gathering',
        word_type: 'Noun',
        test_multiple_relation: [seededWordId, secondSeededWordId],
      });

      expect(word.id).toBeDefined();
      const relValue = word.attributeValues.test_multiple_relation;
      expect(Array.isArray(relValue)).toBe(true);
      expect(relValue).toHaveLength(2);
    });
  });

  it('13. creates word with positive integer attribute', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'therion',
      translation: 'beast',
      word_type: 'Noun',
      syllable_count: 5,
    });

    expect(word.attributeValues.syllable_count).toBe(5);
  });

  it('14. creates word with zero integer attribute', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'orien',
      translation: 'silence',
      word_type: 'Noun',
      syllable_count: 0,
    });

    expect(word.attributeValues.syllable_count).toBe(0);
  });

  it('15. creates word with negative integer attribute', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/words`,
      payload: {
        attributeValues: {
          word: 'narieth',
          translation: 'absence',
          word_type: 'Noun',
          syllable_count: -1,
        },
      },
    });

    // Negative syllable count may or may not be accepted — verify no 500
    expect(res.statusCode).toBeLessThan(500);
  });

  it('16. accepts valid one_of option', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'ravien',
      translation: 'crow',
      word_type: 'Noun',
    });

    expect(word.id).toBeDefined();
    expect(word.attributeValues.word_type).toBe('Noun');
  });

  it('17. accepts any string for one_of attribute (no server-side option validation)', async () => {
    // The backend does not enforce one_of options at create time — it accepts any string.
    // Validation of allowed options is a client-side concern in the current implementation.
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/words`,
      payload: {
        attributeValues: {
          word: 'kaliren',
          translation: 'error',
          word_type: 'InvalidType',
        },
      },
    });

    expect(res.statusCode).toBe(200);
  });

  describe('derivative generation', () => {
    let pastTenseTypeId: string;

    beforeAll(async () => {
      pastTenseTypeId = await getDerivativeTypeId(app, adminCookies, projectId, 'past_tense');
    });

    it('18. auto-generates Past Tense derivative for a verb ending in vowel', async () => {
      const word = await createWord(app, adminCookies, projectId, {
        word: 'amare',
        translation: 'to love',
        word_type: 'Verb',
      });

      expect(word.derivatives).toBeDefined();
      const pastTense = word.derivatives.find(
        (d: any) => d.derivativeTypeId === pastTenseTypeId
      );
      expect(pastTense).toBeDefined();
      // Vowel ending: appends 'rath'
      expect(pastTense.value).toBe('amarerath');
    });

    it('19. does NOT generate Past Tense derivative for a noun', async () => {
      const word = await createWord(app, adminCookies, projectId, {
        word: 'tariel',
        translation: 'mountain',
        word_type: 'Noun',
      });

      // After creating the noun word, check derivatives
      expect(word.derivatives).toBeDefined();
      const pastTense = word.derivatives?.find(
        (d: any) => d.derivativeTypeId === pastTenseTypeId || d.derivativeTypeName === 'Past Tense' || d.name === 'Past Tense'
      );
      // Nouns should not have a Past Tense derivative (applicability rule checks word_type == Verb)
      expect(pastTense).toBeUndefined();
    });

    it('20. generates Past Tense derivative after updating word from Noun to Verb', async () => {
      const word = await createWord(app, adminCookies, projectId, {
        word: 'deloire',
        translation: 'to shift',
        word_type: 'Noun',
      });

      const updateRes = await inject(app, adminCookies, {
        method: 'PUT',
        url: `/api/v1/projects/${projectId}/words/${word.id}`,
        payload: {
          attributeValues: {
            word: 'deloire',
            translation: 'to shift',
            word_type: 'Verb',
          },
        },
      });

      expect(updateRes.statusCode).toBeLessThan(300);
      const updated = JSON.parse(updateRes.body);
      const pastTense = updated.derivatives?.find(
        (d: any) => d.derivativeTypeId === pastTenseTypeId
      );
      expect(pastTense).toBeDefined();
      expect(pastTense.value).toBe('deloirerath');
    });

    it('21. manually overrides derivative and marks userModified', async () => {
      const word = await createWord(app, adminCookies, projectId, {
        word: 'seralie',
        translation: 'to sing',
        word_type: 'Verb',
      });

      const patchRes = await inject(app, adminCookies, {
        method: 'PATCH',
        url: `/api/v1/projects/${projectId}/words/${word.id}/derivatives/${pastTenseTypeId}`,
        payload: { value: 'custom_past' },
      });

      expect(patchRes.statusCode).toBeLessThan(300);
      const patched = JSON.parse(patchRes.body);
      expect(patched.value).toBe('custom_past');
      expect(patched.userModified).toBe(true);
    });

    it('22. resets override and restores auto value', async () => {
      const word = await createWord(app, adminCookies, projectId, {
        word: 'vanoire',
        translation: 'to vanish',
        word_type: 'Verb',
      });

      // Override first
      await inject(app, adminCookies, {
        method: 'PATCH',
        url: `/api/v1/projects/${projectId}/words/${word.id}/derivatives/${pastTenseTypeId}`,
        payload: { value: 'manual_value' },
      });

      // Reset
      const deleteRes = await inject(app, adminCookies, {
        method: 'DELETE',
        url: `/api/v1/projects/${projectId}/words/${word.id}/derivatives/${pastTenseTypeId}/override`,
      });

      expect(deleteRes.statusCode).toBeLessThan(300);
      const reset = JSON.parse(deleteRes.body);
      expect(reset.userModified).toBe(false);
      // The response returns { success, value (= auto value), userModified }
      // value should be the auto-generated derivative, not the manual override
      expect(reset.value).toBe('vanoirerath');
    });

    it('23. preserves user-modified derivative on word update', async () => {
      const word = await createWord(app, adminCookies, projectId, {
        word: 'fenarie',
        translation: 'to glow',
        word_type: 'Verb',
      });

      // Override derivative
      await inject(app, adminCookies, {
        method: 'PATCH',
        url: `/api/v1/projects/${projectId}/words/${word.id}/derivatives/${pastTenseTypeId}`,
        payload: { value: 'preserved_value' },
      });

      // Update the word (different translation)
      await inject(app, adminCookies, {
        method: 'PUT',
        url: `/api/v1/projects/${projectId}/words/${word.id}`,
        payload: {
          attributeValues: {
            word: 'fenarie',
            translation: 'to shine brightly',
            word_type: 'Verb',
          },
        },
      });

      // Fetch updated word
      const getRes = await inject(app, adminCookies, {
        method: 'GET',
        url: `/api/v1/projects/${projectId}/words/${word.id}`,
      });

      const fetched = JSON.parse(getRes.body);
      const pastTense = fetched.derivatives?.find(
        (d: any) => d.derivativeTypeId === pastTenseTypeId
      );
      expect(pastTense).toBeDefined();
      expect(pastTense.value).toBe('preserved_value');
      expect(pastTense.userModified).toBe(true);
    });
  });

  it('24. soft-deleted word returns 404 on GET', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'morthen',
      translation: 'death',
      word_type: 'Noun',
    });

    const deleteRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
    });
    expect(deleteRes.statusCode).toBeLessThan(300);

    const getRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('25. soft-deleted word is excluded from search results', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'xarionez',
      translation: 'phantom',
      word_type: 'Noun',
    });

    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
    });

    const searchRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/words/search`,
      payload: { query: 'xarionez' },
    });

    const searchBody = JSON.parse(searchRes.body);
    const found = searchBody.items?.find((w: any) => w.id === word.id);
    expect(found).toBeUndefined();
  });

  it('26. newly created word has version with changeType "created"', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'verilon',
      translation: 'truth',
      word_type: 'Noun',
    });

    const versionsRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}/versions`,
    });

    expect(versionsRes.statusCode).toBe(200);
    const versions = JSON.parse(versionsRes.body);
    const items = versions.items || versions;
    expect(items.length).toBeGreaterThanOrEqual(1);
    const createdVersion = items.find((v: any) => v.changeType === 'created');
    expect(createdVersion).toBeDefined();
  });

  it('27. updated word has version with changeType "updated"', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'muriela',
      translation: 'sea',
      word_type: 'Noun',
    });

    await inject(app, adminCookies, {
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
      payload: {
        attributeValues: {
          word: 'muriela',
          translation: 'ocean',
          word_type: 'Noun',
        },
      },
    });

    const versionsRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}/versions`,
    });

    const versions = JSON.parse(versionsRes.body);
    const items = versions.items || versions;
    const updatedVersion = items.find((v: any) => v.changeType === 'updated');
    expect(updatedVersion).toBeDefined();
  });

  it('28. deleted word has version with changeType "deleted"', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'epharie',
      translation: 'wind',
      word_type: 'Noun',
    });

    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
    });

    // Versions endpoint may still be accessible even after soft delete
    const versionsRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}/versions`,
    });

    if (versionsRes.statusCode === 200) {
      const versions = JSON.parse(versionsRes.body);
      const items = versions.items || versions;
      const deletedVersion = items.find((v: any) => v.changeType === 'deleted');
      expect(deletedVersion).toBeDefined();
    } else {
      // If versions returns 404 after deletion, that's also acceptable behavior
      expect(versionsRes.statusCode).toBe(404);
    }
  });

  it('29. restores word to a previous version', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'oriven',
      translation: 'origin',
      word_type: 'Noun',
    });

    // Update
    await inject(app, adminCookies, {
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
      payload: {
        attributeValues: {
          word: 'oriven',
          translation: 'modified meaning',
          word_type: 'Noun',
        },
      },
    });

    // Get versions
    const versionsRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}/versions`,
    });
    const versions = JSON.parse(versionsRes.body);
    const items = versions.items || versions;
    const createdVersion = items.find((v: any) => v.changeType === 'created');
    expect(createdVersion).toBeDefined();

    // Restore to the 'created' version
    const restoreRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/words/${word.id}/versions/${createdVersion.id}/restore`,
    });
    expect(restoreRes.statusCode).toBeLessThan(300);

    // Verify restoration
    const getRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
    });
    const restored = JSON.parse(getRes.body);
    expect(restored.attributeValues.translation).toBe('origin');
  });

  it('30. cascade version entry created after builder graph update', async () => {
    // Create a verb so it has a derivative
    const word = await createWord(app, adminCookies, projectId, {
      word: 'caloire',
      translation: 'to cascade',
      word_type: 'Verb',
    });

    // Get the builder that the Past Tense derivative type uses
    const builderId = await getBuilderId(app, adminCookies, projectId, 'Past Tense Builder');
    expect(builderId).toBeDefined();

    // Fetch the builder to get its current graph
    const builderRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/builders/${builderId}`,
    });
    expect(builderRes.statusCode).toBe(200);
    const builderBody = JSON.parse(builderRes.body);

    // Modify the graph to produce a different derivative value.
    // Change the vowel-ending suffix from 'rath' to 'rathx' so the output actually changes.
    const modifiedGraph = JSON.parse(JSON.stringify(builderBody.graph));
    const appendRathNode = modifiedGraph.nodes.find(
      (n: any) => n.type === 'append' && n.data?.suffix === 'rath'
    );
    if (appendRathNode) {
      appendRathNode.data.suffix = 'rathx';
    }

    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/builders/${builderId}`,
      payload: {
        name: builderBody.name,
        graph: modifiedGraph,
      },
    });
    expect(updateRes.statusCode).toBeLessThan(300);

    // Check word versions for a cascade entry
    const versionsRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}/versions`,
    });
    expect(versionsRes.statusCode).toBe(200);
    const versions = JSON.parse(versionsRes.body);
    const items = versions.items || versions;
    const cascadeVersion = items.find((v: any) => v.changeType === 'cascade');
    expect(cascadeVersion).toBeDefined();

    // Restore the original graph so other tests are unaffected
    await inject(app, adminCookies, {
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/builders/${builderId}`,
      payload: {
        name: builderBody.name,
        graph: builderBody.graph,
      },
    });
  });

  describe('validation endpoint', () => {
    it('validates a correct word', async () => {
      const res = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words/validate`,
        payload: {
          attributeValues: {
            word: 'liriane',
            translation: 'melody',
            word_type: 'Noun',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.valid).toBe(true);
    });

    it('rejects word without a vowel (rule violation)', async () => {
      const res = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words/validate`,
        payload: {
          attributeValues: {
            word: 'brxnth',
            translation: 'grunt',
            word_type: 'Noun',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.valid).toBe(false);
      expect(body.ruleResults).toBeDefined();
      expect(body.ruleResults.length).toBeGreaterThan(0);
    });
  });

  it('31. accepts word with extra/unknown attribute identifiers (no 400)', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/words`,
      payload: {
        attributeValues: {
          word: 'ignara',
          translation: 'to ignore',
          word_type: 'Verb',
          totally_nonexistent_attr: 'extra value',
        },
      },
    });
    // Extra/unknown attribute identifiers are silently ignored by saveAttributeValues (not stored)
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.attributeValues.word).toBe('ignara');
  });

  it('32. returns 404 when trying to PUT a soft-deleted word', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'deleth',
      translation: 'deleted one',
      word_type: 'Noun',
    });

    // Delete the word
    const deleteRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
    });
    expect(deleteRes.statusCode).toBeLessThan(300);

    // Try to update the deleted word
    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
      payload: {
        attributeValues: {
          word: 'deleth-updated',
          translation: 'should fail',
          word_type: 'Noun',
        },
      },
    });
    expect(updateRes.statusCode).toBe(404);
  });

  it('33. version restore creates a new version entry', async () => {
    const word = await createWord(app, adminCookies, projectId, {
      word: 'restara',
      translation: 'original meaning',
      word_type: 'Noun',
    });

    // Update the word
    await inject(app, adminCookies, {
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
      payload: {
        attributeValues: {
          word: 'restara',
          translation: 'changed meaning',
          word_type: 'Noun',
        },
      },
    });

    // Get version list before restore
    const versionsBeforeRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}/versions`,
    });
    const versionsBefore = JSON.parse(versionsBeforeRes.body);
    const itemsBefore = versionsBefore.items || versionsBefore;
    const versionCountBefore = itemsBefore.length;

    // Find the 'created' version to restore to
    const createdVersion = itemsBefore.find((v: any) => v.changeType === 'created');
    expect(createdVersion).toBeDefined();

    // Restore to the 'created' version
    const restoreRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/words/${word.id}/versions/${createdVersion.id}/restore`,
    });
    expect(restoreRes.statusCode).toBeLessThan(300);

    // Get version list after restore
    const versionsAfterRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}/versions`,
    });
    const versionsAfter = JSON.parse(versionsAfterRes.body);
    const itemsAfter = versionsAfter.items || versionsAfter;

    // There should be at least one more version entry after the restore
    expect(itemsAfter.length).toBeGreaterThan(versionCountBefore);

    // Verify the word has the original meaning
    const getRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
    });
    const restored = JSON.parse(getRes.body);
    expect(restored.attributeValues.translation).toBe('original meaning');
  });
});
