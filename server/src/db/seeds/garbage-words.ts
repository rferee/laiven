/**
 * One-shot dev helper: generates 1000 garbage words for the seeded Eldarian project.
 * Direct-to-DB to bypass the HTTP rate limit. Not part of the normal seed flow.
 *
 * Run with:  cd server && npx tsx src/db/seeds/garbage-words.ts
 */
import { db, closeDatabase } from '../connection.js';
import {
  projects,
  attributes,
  words,
  wordAttributeValues,
} from '../schema/index.js';
import { and, eq, isNull } from 'drizzle-orm';

const TYPES = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Preposition'] as const;
const CONSONANTS = 'bcdfghjklmnprstvwxz'.split('');
const VOWELS = 'aeiouy'.split('');

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeWord(): { text: string; syllables: number } {
  const syllables = 1 + Math.floor(Math.random() * 4); // 1..4
  let out = '';
  for (let i = 0; i < syllables; i++) {
    out += pick(CONSONANTS) + pick(VOWELS);
    if (Math.random() < 0.2) out += pick(CONSONANTS);
  }
  return { text: out, syllables };
}

async function main() {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.name, 'Eldarian'), isNull(projects.deletedAt)),
  });
  if (!project) throw new Error('Eldarian project not found — did you run the seed?');

  const attrs = await db.select().from(attributes).where(
    and(eq(attributes.projectId, project.id), isNull(attributes.deletedAt)),
  );
  const byId = (ident: string) => {
    const a = attrs.find((x) => x.identifier === ident);
    if (!a) throw new Error(`attribute ${ident} not found`);
    return a.id;
  };
  const wordAttrId = byId('word');
  const translationAttrId = byId('translation');
  const wordTypeAttrId = byId('word_type');
  const syllableAttrId = byId('syllable_count');
  const notesAttrId = byId('notes');

  const COUNT = 1000;
  console.log(`Inserting ${COUNT} garbage words into project ${project.name}…`);

  await db.transaction(async (tx) => {
    for (let i = 0; i < COUNT; i++) {
      const { text, syllables } = makeWord();
      const wordType = pick(TYPES);
      const [row] = await tx.insert(words).values({
        projectId: project.id,
      }).returning();

      await tx.insert(wordAttributeValues).values([
        { wordId: row.id, attributeId: wordAttrId, stringValue: text },
        { wordId: row.id, attributeId: translationAttrId, stringValue: `garbage-${i}` },
        { wordId: row.id, attributeId: wordTypeAttrId, oneOfValue: wordType },
        { wordId: row.id, attributeId: syllableAttrId, integerValue: syllables },
        { wordId: row.id, attributeId: notesAttrId, stringValue: '' },
      ]);

      if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${COUNT}`);
    }
  });

  console.log('Done.');
  await closeDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
