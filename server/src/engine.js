import { Character, Story, Turn } from './models.js';
import { AiError, generate, turnSchema } from './gemini.js';
import { applyGameResult, findCharacter, namedIn, startingStats } from './game.js';
import { MEMORY_SYSTEM, SYSTEM_PROMPT, buildMemoryPrompt, buildTurnPrompt, turnToText } from './prompts.js';

const COLORS = ['#b4532a', '#2f6f73', '#7a4a9e', '#3f7d3a', '#b0304a', '#2d5fa8', '#a67a12', '#8a5a44', '#c2407e', '#4b6b8a'];
const RECENT_TURNS = 14; // scenes sent word for word
const FOLD_BATCH = 8; // scenes folded into memory at a time
const LOCK_MS = 3 * 60 * 1000;
const CHAPTER_WRAP = 9; // scenes before the AI is asked to close the chapter
const CHAPTER_MIN = 5; // the AI cannot end a chapter sooner than this
const CHAPTER_MAX = 14; // scenes after which a chapter always ends

export { findCharacter, setRelationship } from './game.js';

export const nextColor = (count) => COLORS[count % COLORS.length];

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

const SNAPSHOT_FIELDS = ['status', 'faction', 'motive', 'role', 'power', 'reputation', 'alignment', 'title', 'kills', 'villainsSlain', 'concealed', 'secretRevealed'];

const snapshot = (c) => ({
  character: c._id,
  ...Object.fromEntries(SNAPSHOT_FIELDS.map((key) => [key, c[key]])),
  history: c.history.map((h) => ({ chapter: h.chapter, text: h.text })),
  relationships: c.relationships.map((r) => ({ target: r.target, type: r.type, label: r.label, score: r.score })),
});

/** Stores a chapter title by chapter number. Chapter 1 sits at position 0. */
export function setChapterTitle(story, chapter, title) {
  const titles = [...story.chapterTitles];
  while (titles.length < chapter) titles.push('');
  titles[chapter - 1] = title;
  story.chapterTitles = titles;
}

/** Saves one AI scene: new cast, changed bonds and beats, plus the data needed to undo it. */
async function applyResult({ story, characters, result, base, inScene }) {
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
      ...startingStats(data),
      color: nextColor(characters.length),
      source: 'ai',
    });
    characters.push(c);
    created.push(c);
    return c;
  };

  for (const data of result.newCharacters ?? []) {
    if (!data?.name?.trim() || !inScene(data.name)) continue;
    const existing = findCharacter(characters, data.name);
    if (!existing) {
      addCharacter(data);
    } else if (base.mode === 'opening') {
      // Characters the user added by hand get their stats from the opening too.
      Object.assign(existing, startingStats(data));
      for (const field of ['role', 'description', 'personality', 'motive', 'faction']) {
        existing[field] ||= data[field] ?? '';
      }
    }
  }

  const beats = [];
  for (const b of result.beats ?? []) {
    let text = String(b.text || '').trim();
    if (!text) continue;
    let speaker = b.speaker?.trim() ?? '';
    // Smaller models sometimes write "Ali: words" instead of filling in the speaker.
    const prefix = !speaker && b.type !== 'narration' && /^([^:\n]{1,40}):\s+(.+)$/s.exec(text);
    if (prefix && findCharacter(characters, prefix[1])) [, speaker, text] = prefix;
    // The user chose who is in this scene, so lines from anyone else are dropped.
    if (b.type !== 'narration' && speaker && !inScene(speaker)) continue;

    let character = null;
    if (b.type !== 'narration' && speaker) {
      character = findCharacter(characters, speaker) ?? addCharacter({ name: speaker, role: 'Minor character', power: 25 });
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

  const effects = applyGameResult({ result, characters, inScene, touch, input: base.input, chapter: story.chapter });

  await Promise.all(characters.filter((c) => c.isNew || c.isModified()).map((c) => c.save()));

  const turn = await Turn.create({
    ...base,
    story: story._id,
    index: story.nextIndex,
    chapter: story.chapter,
    heading: String(result.heading ?? '').trim().slice(0, 80),
    beats,
    effects,
    suggestions: (result.suggestions ?? []).slice(0, 3),
    createdCharacters: created.map((c) => c._id),
    before: [...before.values()],
  });
  return turn;
}

/**
 * Decides who may act in a scene. With nobody chosen, everyone may. Otherwise only
 * the chosen characters may, plus anyone the user names in their own direction.
 */
export function sceneFilter(chosen, input) {
  if (!chosen.length) return () => true;
  return (name) => Boolean(findCharacter(chosen, name)) || namedIn(input, name);
}

/** Writes one scene with the AI and stores it. The caller must already hold the story lock. */
export async function writeScene({ story, mode, input = '', speaker = null, chapterTitle = '', retryNote = '', castIds = [], meta = {} }) {
  const characters = await Character.find({ story: story._id }).sort('createdAt');
  const wanted = new Set(castIds.map(String));
  if (wanted.size && speaker) wanted.add(String(speaker._id));
  const chosen = characters.filter((c) => wanted.has(String(c._id)));
  const inScene = sceneFilter(chosen, input);
  const chapterScenes = await Turn.countDocuments({ story: story._id, chapter: story.chapter });
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
    sceneCast: chosen.map((c) => c.name),
    wrapChapter: chapterScenes >= CHAPTER_WRAP && !['chapter', 'ending', 'opening'].includes(mode),
  });
  const request = { system: SYSTEM_PROMPT, prompt, schema: turnSchema, temperature: 1 };
  let result = await generate(request);
  // Without a cast list every character would start with the same empty stats.
  if (mode === 'opening' && !result.newCharacters?.length) result = await generate(request);

  const turn = await applyResult({
    story,
    characters,
    result,
    inScene,
    base: {
      mode,
      input,
      speaker: speaker?._id ?? null,
      speakerName: speaker?.name ?? '',
      sceneCast: chosen.map((c) => c._id),
      ...meta,
    },
  });

  story.nextIndex = turn.index + 1;
  // Long chapters close by themselves, so the next scene opens a new page.
  const scenes = chapterScenes + 1;
  const canTurnPage = !['ending', 'opening'].includes(mode);
  if (canTurnPage && (scenes >= CHAPTER_MAX || (result.endChapter && scenes >= CHAPTER_MIN))) {
    story.chapter += 1;
    setChapterTitle(story, story.chapter, String(result.nextChapterTitle ?? '').trim().slice(0, 120));
    turn.effects.push({ kind: 'chapter', text: `Chapter ${story.chapter - 1} complete. Chapter ${story.chapter} begins next` });
    await turn.save();
  }
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

  story.chapterTitles = story.chapterTitles.slice(0, story.chapter);
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
