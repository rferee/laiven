import { db, closeDatabase } from '../connection.js';
import {
  users,
  projects,
  projectMembers,
  attributes,
  variables,
  variableItems,
  rules,
  wordRuleLinks,
  builders,
  derivativeTypes,
  derivativeTypeRuleLinks,
  derivativeTypeDependencies,
  words,
  wordAttributeValues,
  wordRelations,
  wordDerivatives,
  versions,
  apiKeys,
} from '../schema/index.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

function uid(): string {
  return crypto.randomUUID();
}

export async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed script must not be run in production');
  }

  console.log('--- Laiven seed: starting ---');

  // ── 1. Clear existing data (FK-safe order) ──────────────────────────
  console.log('Clearing existing data...');
  await db.delete(versions);
  await db.delete(wordDerivatives);
  await db.delete(wordRelations);
  await db.delete(wordAttributeValues);
  await db.delete(words);
  await db.delete(derivativeTypeRuleLinks);
  await db.delete(derivativeTypeDependencies);
  await db.delete(derivativeTypes);
  await db.delete(builders);
  await db.delete(wordRuleLinks);
  await db.delete(rules);
  await db.delete(variableItems);
  await db.delete(variables);
  await db.delete(attributes);
  await db.delete(apiKeys);
  await db.delete(projectMembers);
  await db.delete(projects);
  await db.delete(users);
  console.log('  Done.');

  // ── 2. Admin user ───────────────────────────────────────────────────
  console.log('Creating admin user...');
  const adminId = uid();
  const passwordHash = await bcrypt.hash('admin123!', 12);
  await db.insert(users).values({
    id: adminId,
    email: 'admin@laiven.local',
    displayName: 'Admin',
    passwordHash,
    role: 'instance_admin',
  });
  console.log('  Admin user created (admin@laiven.local).');

  // ── 3. Project ──────────────────────────────────────────────────────
  console.log('Creating project "Eldarian"...');
  const projectId = uid();
  await db.insert(projects).values({
    id: projectId,
    name: 'Eldarian',
    description: 'A flowing, musical constructed language',
    createdBy: adminId,
  });

  await db.insert(projectMembers).values({
    id: uid(),
    projectId,
    userId: adminId,
    role: 'project_admin',
  });
  console.log('  Project created.');

  // ── 4. Attributes ──────────────────────────────────────────────────
  console.log('Creating attributes...');
  const attrWordId = uid();
  const attrTranslationId = uid();
  const attrWordTypeId = uid();
  const attrSyllableCountId = uid();
  const attrNotesId = uid();

  await db.insert(attributes).values([
    {
      id: attrWordId,
      projectId,
      name: 'Word',
      identifier: 'word',
      type: 'string',
      required: true,
      displayOrder: 0,
    },
    {
      id: attrTranslationId,
      projectId,
      name: 'Translation',
      identifier: 'translation',
      type: 'string',
      required: true,
      displayOrder: 1,
    },
    {
      id: attrWordTypeId,
      projectId,
      name: 'Word Type',
      identifier: 'word_type',
      type: 'one_of',
      required: true,
      displayOrder: 2,
      options: ['Noun', 'Verb', 'Adjective', 'Adverb', 'Preposition'],
    },
    {
      id: attrSyllableCountId,
      projectId,
      name: 'Syllable Count',
      identifier: 'syllable_count',
      type: 'integer',
      required: false,
      displayOrder: 3,
    },
    {
      id: attrNotesId,
      projectId,
      name: 'Notes',
      identifier: 'notes',
      type: 'string',
      required: false,
      displayOrder: 4,
    },
  ]);
  console.log('  5 attributes created.');

  // ── 5. Variables ────────────────────────────────────────────────────
  console.log('Creating variables...');
  const vsVowelsId = uid();
  const vsConsonantsId = uid();
  const vsVerbSuffixesId = uid();

  await db.insert(variables).values([
    { id: vsVowelsId, projectId, name: 'Vowels', kind: 'array', dataType: 'string' },
    { id: vsConsonantsId, projectId, name: 'Consonants', kind: 'array', dataType: 'string' },
    { id: vsVerbSuffixesId, projectId, name: 'Verb Suffixes', kind: 'array', dataType: 'string' },
  ]);

  const vowelItems = ['a', 'e', 'i', 'o', 'u', 'ae', 'ei'];
  const consonantItems = ['l', 'm', 'n', 'r', 's', 't', 'd', 'v', 'th', 'sh', 'k'];
  const verbSuffixItems = ['ara', 'iel', 'oth', 'enn'];

  await db.insert(variableItems).values([
    ...vowelItems.map((v, i) => ({
      id: uid(),
      variableId: vsVowelsId,
      value: v,
      displayOrder: i,
    })),
    ...consonantItems.map((v, i) => ({
      id: uid(),
      variableId: vsConsonantsId,
      value: v,
      displayOrder: i,
    })),
    ...verbSuffixItems.map((v, i) => ({
      id: uid(),
      variableId: vsVerbSuffixesId,
      value: v,
      displayOrder: i,
    })),
  ]);
  console.log('  3 variables created with items.');

  // ── 6. Rule: "Word must contain a vowel" ────────────────────────────
  console.log('Creating rule "Word must contain a vowel"...');
  const ruleId = uid();

  const ruleNodeAttrInput = 'rule-n-attr-input';
  const ruleNodeVsRef = 'rule-n-vs-ref';
  const ruleNodeContains = 'rule-n-contains';
  const ruleNodeReturn = 'rule-n-return';

  const ruleGraph = {
    nodes: [
      {
        id: ruleNodeAttrInput,
        type: 'attribute_input',
        position: { x: 50, y: 100 },
        data: { attributeId: attrWordId, attributeIdentifier: 'word' },
      },
      {
        id: ruleNodeVsRef,
        type: 'variable_reference',
        position: { x: 50, y: 250 },
        data: { variableId: vsVowelsId, variableName: 'Vowels' },
      },
      {
        id: ruleNodeContains,
        type: 'contains_one_of',
        position: { x: 350, y: 150 },
        data: {},
      },
      {
        id: ruleNodeReturn,
        type: 'return_rule',
        position: { x: 650, y: 150 },
        data: {
          passMessage: 'Word contains a vowel',
          failMessage: 'Word must contain at least one vowel',
        },
      },
    ],
    edges: [
      {
        id: 'rule-e-1',
        source: ruleNodeAttrInput,
        sourceHandle: 'output',
        target: ruleNodeContains,
        targetHandle: 'input',
      },
      {
        id: 'rule-e-2',
        source: ruleNodeVsRef,
        sourceHandle: 'output',
        target: ruleNodeContains,
        targetHandle: 'items',
      },
      {
        id: 'rule-e-3',
        source: ruleNodeContains,
        sourceHandle: 'output',
        target: ruleNodeReturn,
        targetHandle: 'pass',
      },
    ],
  };

  await db.insert(rules).values({
    id: ruleId,
    projectId,
    name: 'Word must contain a vowel',
    description: 'Requires every word to contain at least one vowel character.',
    enabled: true,
    graph: ruleGraph,
  });

  // Link the rule as a global word rule
  await db.insert(wordRuleLinks).values({
    id: uid(),
    projectId,
    ruleId,
    required: true,
    displayOrder: 0,
  });
  console.log('  Rule created and linked as word rule.');

  // ── 7. Builder: "Past Tense Builder" ────────────────────────────────
  console.log('Creating builder "Past Tense Builder"...');
  const builderId = uid();

  const bNodeAttrInput = 'build-n-attr-input';
  const bNodeGetLast = 'build-n-get-last';
  const bNodeVsRef = 'build-n-vs-ref';
  const bNodeContains = 'build-n-contains';
  const bNodeIfBranch = 'build-n-if-branch';
  const bNodeAppendRath = 'build-n-append-rath';
  const bNodeAppendArath = 'build-n-append-arath';
  const bNodeReturnYes = 'build-n-return-yes';
  const bNodeReturnNo = 'build-n-return-no';

  const builderGraph = {
    nodes: [
      {
        id: bNodeAttrInput,
        type: 'attribute_input',
        position: { x: 50, y: 150 },
        data: { attributeId: attrWordId, attributeIdentifier: 'word' },
      },
      {
        id: bNodeGetLast,
        type: 'get_last_n',
        position: { x: 300, y: 50 },
        data: { n: 1 },
      },
      {
        id: bNodeVsRef,
        type: 'variable_reference',
        position: { x: 300, y: 250 },
        data: { variableId: vsVowelsId, variableName: 'Vowels' },
      },
      {
        id: bNodeContains,
        type: 'contains_one_of',
        position: { x: 550, y: 100 },
        data: {},
      },
      {
        id: bNodeIfBranch,
        type: 'if_branch',
        position: { x: 800, y: 100 },
        data: {},
      },
      {
        id: bNodeAppendRath,
        type: 'append',
        position: { x: 1050, y: 0 },
        data: { suffix: 'rath' },
      },
      {
        id: bNodeAppendArath,
        type: 'append',
        position: { x: 1050, y: 250 },
        data: { suffix: 'arath' },
      },
      {
        id: bNodeReturnYes,
        type: 'return_builder',
        position: { x: 1300, y: 0 },
        data: {},
      },
      {
        id: bNodeReturnNo,
        type: 'return_builder',
        position: { x: 1300, y: 250 },
        data: {},
      },
    ],
    edges: [
      {
        id: 'build-e-1',
        source: bNodeAttrInput,
        sourceHandle: 'output',
        target: bNodeGetLast,
        targetHandle: 'input',
      },
      {
        id: 'build-e-1b',
        source: bNodeAttrInput,
        sourceHandle: 'output',
        target: bNodeIfBranch,
        targetHandle: 'value',
      },
      {
        id: 'build-e-2',
        source: bNodeGetLast,
        sourceHandle: 'output',
        target: bNodeContains,
        targetHandle: 'input',
      },
      {
        id: 'build-e-3',
        source: bNodeVsRef,
        sourceHandle: 'output',
        target: bNodeContains,
        targetHandle: 'items',
      },
      {
        id: 'build-e-4',
        source: bNodeContains,
        sourceHandle: 'output',
        target: bNodeIfBranch,
        targetHandle: 'condition',
      },
      {
        id: 'build-e-5',
        source: bNodeIfBranch,
        sourceHandle: 'true',
        target: bNodeAppendRath,
        targetHandle: 'input',
      },
      {
        id: 'build-e-6',
        source: bNodeIfBranch,
        sourceHandle: 'false',
        target: bNodeAppendArath,
        targetHandle: 'input',
      },
      {
        id: 'build-e-9',
        source: bNodeAppendRath,
        sourceHandle: 'output',
        target: bNodeReturnYes,
        targetHandle: 'value',
      },
      {
        id: 'build-e-10',
        source: bNodeAppendArath,
        sourceHandle: 'output',
        target: bNodeReturnNo,
        targetHandle: 'value',
      },
    ],
  };

  await db.insert(builders).values({
    id: builderId,
    projectId,
    name: 'Past Tense Builder',
    graph: builderGraph,
  });
  console.log('  Builder created.');

  // ── 8. Derivative Type: "Past Tense" ────────────────────────────────
  console.log('Creating derivative type "Past Tense"...');
  const derivTypeId = uid();

  await db.insert(derivativeTypes).values({
    id: derivTypeId,
    projectId,
    name: 'Past Tense',
    identifier: 'past_tense',
    required: false,
    builderId,
    displayOrder: 0,
  });

  // Applicability rule: only applies when word_type == "Verb"
  const appRuleNodeAttrInput = 'app-n-attr-input';
  const appRuleNodeConst = 'app-n-const';
  const appRuleNodeEquals = 'app-n-equals';
  const appRuleNodeReturn = 'app-n-return';

  const applicabilityGraph = {
    nodes: [
      {
        id: appRuleNodeAttrInput,
        type: 'attribute_input',
        position: { x: 50, y: 100 },
        data: { attributeId: attrWordTypeId, attributeIdentifier: 'word_type' },
      },
      {
        id: appRuleNodeConst,
        type: 'literal_value',
        position: { x: 50, y: 250 },
        data: { value: 'Verb', valueType: 'string' },
      },
      {
        id: appRuleNodeEquals,
        type: 'equals',
        position: { x: 350, y: 150 },
        data: {},
      },
      {
        id: appRuleNodeReturn,
        type: 'return_rule',
        position: { x: 650, y: 150 },
        data: {
          passMessage: 'Word is a verb',
          failMessage: 'Word is not a verb',
        },
      },
    ],
    edges: [
      {
        id: 'app-e-1',
        source: appRuleNodeAttrInput,
        sourceHandle: 'output',
        target: appRuleNodeEquals,
        targetHandle: 'a',
      },
      {
        id: 'app-e-2',
        source: appRuleNodeConst,
        sourceHandle: 'output',
        target: appRuleNodeEquals,
        targetHandle: 'b',
      },
      {
        id: 'app-e-3',
        source: appRuleNodeEquals,
        sourceHandle: 'output',
        target: appRuleNodeReturn,
        targetHandle: 'pass',
      },
    ],
  };

  // The applicability rule is a first-class entry in the rules library now,
  // linked to the derivative type via derivative_type_rule_links.
  const appRuleId = uid();
  await db.insert(rules).values({
    id: appRuleId,
    projectId,
    name: 'Word is a verb',
    description: 'Passes when the word_type attribute equals "Verb". Used as an applicability rule for the Past Tense derivative.',
    enabled: true,
    graph: applicabilityGraph,
  });
  await db.insert(derivativeTypeRuleLinks).values({
    id: uid(),
    derivativeTypeId: derivTypeId,
    ruleId: appRuleId,
    required: true,
    displayOrder: 0,
  });
  console.log('  Derivative type created with applicability rule linked from library.');

  // ── 9. Sample words ─────────────────────────────────────────────────
  console.log('Creating sample words...');

  interface WordSeed {
    word: string;
    translation: string;
    wordType: string;
    syllableCount: number;
    notes?: string;
  }

  const sampleWords: WordSeed[] = [
    { word: 'velara', translation: 'to speak', wordType: 'Verb', syllableCount: 3 },
    { word: 'thalien', translation: 'star', wordType: 'Noun', syllableCount: 2 },
    { word: 'mirael', translation: 'beautiful', wordType: 'Adjective', syllableCount: 3 },
    { word: 'shendara', translation: 'to dream', wordType: 'Verb', syllableCount: 3 },
    { word: 'lorien', translation: 'ancient', wordType: 'Adjective', syllableCount: 3 },
  ];

  // Helper to compute the past-tense auto value using the builder logic
  function computePastTense(word: string): string {
    const lastChar = word.slice(-1);
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    if (vowels.includes(lastChar)) {
      return word + 'rath';
    }
    return word + 'arath';
  }

  for (const sw of sampleWords) {
    const wordId = uid();

    // Insert word record
    await db.insert(words).values({
      id: wordId,
      projectId,
      createdBy: adminId,
    });

    // Insert attribute values
    await db.insert(wordAttributeValues).values([
      {
        id: uid(),
        wordId,
        attributeId: attrWordId,
        stringValue: sw.word,
      },
      {
        id: uid(),
        wordId,
        attributeId: attrTranslationId,
        stringValue: sw.translation,
      },
      {
        id: uid(),
        wordId,
        attributeId: attrWordTypeId,
        oneOfValue: sw.wordType,
      },
      {
        id: uid(),
        wordId,
        attributeId: attrSyllableCountId,
        integerValue: sw.syllableCount,
      },
    ]);

    // For verbs, insert past tense derivative
    let derivativesSnapshot: Array<Record<string, unknown>> = [];
    if (sw.wordType === 'Verb') {
      const autoValue = computePastTense(sw.word);
      const derivRow = {
        id: uid(),
        wordId,
        derivativeTypeId: derivTypeId,
        value: autoValue,
        autoValue,
        userModified: false,
      };
      await db.insert(wordDerivatives).values(derivRow);
      derivativesSnapshot = [derivRow];
    }

    // Seed an initial "created" version record so the history drawer is
    // never empty for seeded words.
    await db.insert(versions).values({
      id: uid(),
      entityType: 'word',
      entityId: wordId,
      versionNumber: 1,
      userId: adminId,
      changeType: 'created',
      snapshot: {
        id: wordId,
        projectId,
        createdBy: adminId,
        attributeValues: {
          word: sw.word,
          translation: sw.translation,
          word_type: sw.wordType,
          syllable_count: sw.syllableCount,
        },
        derivatives: derivativesSnapshot,
      },
    });

    console.log(`  Word "${sw.word}" (${sw.wordType}) created.`);
  }

  console.log('--- Laiven seed: complete ---');
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('/seeds/seed.ts') ||
    process.argv[1].endsWith('/seeds/seed.js'));

if (isDirectRun) {
  main()
    .then(async () => {
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await closeDatabase();
      process.exit(1);
    });
}
