import { Character, REL_TYPES, CHAR_STATUS, Story, Turn } from './models.js';
import { AiError, generate, turnSchema } from './gemini.js';
import { MEMORY_SYSTEM, SYSTEM_PROMPT, buildMemoryPrompt, buildTurnPrompt, turnToText } from './prompts.js';

const COLORS = ['#b4532a', '#2f6f73', '#7a4a9e', '#3f7d3a', '#b0304a', '#2d5fa8', '#a67a12', '#8a5a44', '#c2407e', '#4b6b8a'];
const RECENT_TURNS = 14; // scenes sent word for word
const FOLD_BATCH = 8; // scenes folded into memory at a time
const LOCK_MS = 3 * 60 * 1000;

export const nextColor = (count) => COLORS[count % COLORS.length];

const norm = (s) => String(s || '').trim().toLowerCase();

/** Finds a character by full name, then by a unique first-word or partial match. */
export function findCharacter(characters, name) {
  const n = norm(name);
  if (!n) return null;
  const exact = characters.find((c) => norm(c.name) === n);
  if (exact) return exact;
  const partial = characters.filter((c) => {
    const cn = norm(c.name);
    return cn.split(/\s+/).includes(n) || n.split(/\s+/).includes(cn);
  });
  return partial.length === 1 ? partial[0] : null;
}

/** Stops two generations running on one story at once, for example after a double tap. */
export async function lockStory(storyId, ownerId) {
  const story = await Story.findOneAndUpdate(
    {
      _id: storyId,
      owner: ownerId,
      $or: [{ generatingSince: null }, { generatingSince: { $lt: new Date(Date.now() - LOCK_MS) } }],
    },
    { generatingSince: new Date() },
    { new: true },
  );
  if (story) return story;
  const exists = await Story.exists({ _id: storyId, owner: ownerId });
  throw new AiError(exists ? 'The AI is still writing this story.' : 'Story not found.', exists ? 409 : 404);
}

export const unlockStory = (storyId) => Story.updateOne({ _id: storyId }, { generatingSince: null });

const snapshot = (c) => ({
  character: c._id,
  status: c.status,
  faction: c.faction,
  motive: c.motive,
  relationships: c.relationships.map((r) => ({ target: r.target, type: r.type, label: r.label })),
});

export function setRelationship(a, b, type, label = '', reverseLabel = '') {
  const put = (from, to, text) => {
    const existing = from.relationships.find((r) => String(r.target) === String(to._id));
    if (existing) {
      existing.type = type;
      if (text) existing.label = text;
    } else {
      from.relationships.push({ target: to._id, type, label: text });
    }
  };
  put(a, b, label);
  put(b, a, reverseLabel);
}

/** Saves one AI scene: new cast, changed bonds and beats, plus the data needed to undo it. */
async function applyResult({ story, characters, result, base }) {
  const before = new Map();
  const touch = (c) => {
    if (!c.isNew && !before.has(String(c._id))) before.set(String(c._id), snapshot(c));
  };
  const created = [];
  const addCharacter = (data) => {
    const c = new Character({
      story: story._id,
      name: String(data.name).trim().slice(0, 80),
      role: data.role || '',
      description: data.description || '',
      personality: data.personality || '',
      motive: data.motive || '',
      faction: data.faction || '',
      control: data.isUser ? 'user' : 'ai',
      color: nextColor(characters.length),
      source: 'ai',
    });
    characters.push(c);
    created.push(c);
    return c;
  };

  for (const data of result.newCharacters ?? []) {
    if (data?.name?.trim() && !findCharacter(characters, data.name)) addCharacter(data);
  }

  const beats = [];
  for (const b of result.beats ?? []) {
    let text = String(b.text || '').trim();
    if (!text) continue;
    let speaker = b.speaker?.trim() ?? '';
    // Smaller models sometimes write "Ali: words" instead of filling in the speaker.
    const prefix = !speaker && b.type !== 'narration' && /^([^:\n]{1,40}):\s+(.+)$/s.exec(text);
    if (prefix && findCharacter(characters, prefix[1])) [, speaker, text] = prefix;

    let character = null;
    if (b.type !== 'narration' && speaker) {
      character = findCharacter(characters, speaker) ?? addCharacter({ name: speaker, role: 'Minor character' });
    }
    // A line with no known speaker still reads correctly as narration.
    if (!character && b.type === 'dialogue') text = `"${text}"`;
    beats.push({
      type: character ? b.type : 'narration',
      speaker: character?.name ?? '',
      character: character?._id ?? null,
      text,
    });
  }
  if (!beats.length) throw new AiError('The AI returned an empty scene. Please try again.', 503);

  for (const r of result.relationshipChanges ?? []) {
    const a = findCharacter(characters, r.from);
    const b = findCharacter(characters, r.to);
    if (!a || !b || a === b || !REL_TYPES.includes(r.type)) continue;
    touch(a);
    touch(b);
    setRelationship(a, b, r.type, r.label || '', r.reverseLabel || '');
  }

  for (const ch of result.characterChanges ?? []) {
    const c = findCharacter(characters, ch.name);
    if (!c) continue;
    touch(c);
    if (CHAR_STATUS.includes(ch.status)) c.status = ch.status;
    if (ch.faction) c.faction = ch.faction;
    if (ch.motive) c.motive = ch.motive;
  }

  await Promise.all(characters.filter((c) => c.isNew || c.isModified()).map((c) => c.save()));

  const turn = await Turn.create({
    ...base,
    story: story._id,
    index: story.nextIndex,
    chapter: story.chapter,
    heading: String(result.heading ?? '').trim().slice(0, 80),
    beats,
    suggestions: (result.suggestions ?? []).slice(0, 3),
    createdCharacters: created.map((c) => c._id),
    before: [...before.values()],
  });
  return turn;
}

/** Writes one scene with the AI and stores it. The caller must already hold the story lock. */
export async function writeScene({ story, mode, input = '', speaker = null, chapterTitle = '', retryNote = '', meta = {} }) {
  const characters = await Character.find({ story: story._id }).sort('createdAt');
  const recentTurns = (await Turn.find({ story: story._id }).sort('-index').limit(RECENT_TURNS).lean())
    .filter((t) => t.index > story.memoryThrough)
    .reverse();

  const prompt = buildTurnPrompt({
    story,
    characters,
    recentTurns,
    mode,
    input,
    speakerName: speaker?.name,
    chapterTitle,
    retryNote,
  });
  const result = await generate({ system: SYSTEM_PROMPT, prompt, schema: turnSchema, temperature: 1 });

  const turn = await applyResult({
    story,
    characters,
    result,
    base: { mode, input, speaker: speaker?._id ?? null, speakerName: speaker?.name ?? '', ...meta },
  });

  story.nextIndex = turn.index + 1;
  if (mode === 'opening') {
    if (result.title?.trim() && story.title === 'Untitled story') story.title = result.title.trim().slice(0, 120);
    if (result.setting?.trim()) story.setting = result.setting.trim();
  }
  await story.save();
  return { turn, characters: await Character.find({ story: story._id }).sort('createdAt') };
}

/**
 * Removes a scene and everything after it, newest first, undoing each scene's
 * cast changes. Returns the removed scenes, oldest first.
 */
export async function rewind(story, fromIndex) {
  const removed = await Turn.find({ story: story._id, index: { $gte: fromIndex } }).sort('-index');
  for (const turn of removed) {
    if (turn.createdCharacters.length) {
      await Character.deleteMany({ _id: { $in: turn.createdCharacters } });
      await Character.updateMany(
        { story: story._id },
        { $pull: { relationships: { target: { $in: turn.createdCharacters } } } },
      );
    }
    for (const b of turn.before) {
      const { character, ...fields } = b.toObject ? b.toObject() : b;
      await Character.updateOne({ _id: character }, { $set: fields });
    }
    story.status = turn.prevStatus;
    story.chapter = turn.prevChapter;
  }
  await Turn.deleteMany({ story: story._id, index: { $gte: fromIndex } });

  story.chapterTitles = story.chapterTitles.slice(0, Math.max(story.chapter - 1, 0));
  story.nextIndex = fromIndex;
  if (story.memoryThrough >= fromIndex) {
    story.memoryHistory = story.memoryHistory.filter((h) => h.through < fromIndex);
    const last = story.memoryHistory.at(-1);
    story.memory = last?.memory ?? '';
    story.memoryThrough = last?.through ?? -1;
  }
  await story.save();
  return removed.reverse();
}

export const describeRejected = (turn) => turnToText({ ...turn.toObject(), input: '' }).slice(0, 1500);

/** Folds the oldest scenes into memory so stories can run for hundreds of scenes. */
export async function foldMemory(storyId) {
  try {
    const story = await Story.findById(storyId);
    if (!story) return;
    const pending = story.nextIndex - 1 - story.memoryThrough;
    if (pending < RECENT_TURNS + FOLD_BATCH) return;

    const turns = await Turn.find({ story: story._id, index: { $gt: story.memoryThrough } })
      .sort('index')
      .limit(FOLD_BATCH)
      .lean();
    if (!turns.length) return;
    const memory = await generate({
      system: MEMORY_SYSTEM,
      prompt: buildMemoryPrompt(story.memory, turns),
      temperature: 0.2,
    });
    const through = turns.at(-1).index;
    await Story.updateOne(
      { _id: story._id, memoryThrough: story.memoryThrough, nextIndex: { $gt: through } },
      { memory, memoryThrough: through, $push: { memoryHistory: { $each: [{ through, memory }], $slice: -40 } } },
    );
  } catch (err) {
    console.error('Memory update failed, will try after the next scene:', err.message);
  }
}
