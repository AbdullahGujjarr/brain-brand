import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { Character, CHAR_STATUS, REL_TYPES, Story, Turn } from '../models.js';
import { describeRejected, foldMemory, lockStory, nextColor, rewind, setRelationship, unlockStory, writeScene } from '../engine.js';
import { requireUser } from './auth.js';

const router = Router();
router.use(requireUser);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You are going very fast. Wait a moment and try again.' },
});

const text = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
const isId = (id) => mongoose.isValidObjectId(id);
const FREEDOM = ['strict', 'balanced', 'free'];
const LENGTHS = ['short', 'medium', 'long'];

const fail = (res, status, error) => res.status(status).json({ error });
const readCastIds = (value) => (Array.isArray(value) ? value.filter(isId).slice(0, 50) : []);

router.param('id', async (req, res, next, id) => {
  if (!isId(id)) return fail(res, 404, 'Story not found.');
  req.story = await Story.findOne({ _id: id, owner: req.user._id });
  if (!req.story) return fail(res, 404, 'Story not found.');
  next();
});

const castOf = (story) => Character.find({ story: story._id }).sort('createdAt');

/** Runs AI work under the story lock and always releases it afterwards. */
async function withLock(req, res, work) {
  const story = await lockStory(req.params.id, req.user._id);
  try {
    res.json(await work(story));
    foldMemory(story._id);
  } finally {
    await unlockStory(story._id);
  }
}

router.get('/', async (req, res) => {
  const stories = await Story.find({ owner: req.user._id })
    .sort('-updatedAt')
    .select('title premise genre status chapter nextIndex updatedAt')
    .lean();
  const counts = await Character.aggregate([
    { $match: { story: { $in: stories.map((s) => s._id) } } },
    { $group: { _id: '$story', count: { $sum: 1 } } },
  ]);
  const byStory = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({ stories: stories.map((s) => ({ ...s, castCount: byStory.get(String(s._id)) ?? 0 })) });
});

router.post('/', aiLimiter, async (req, res) => {
  const premise = text(req.body.premise);
  if (!premise) return fail(res, 400, 'Write a few lines about your story first.');

  const story = await Story.create({
    owner: req.user._id,
    premise,
    title: text(req.body.title, 120) || 'Untitled story',
    genre: text(req.body.genre, 60),
    freedom: FREEDOM.includes(req.body.freedom) ? req.body.freedom : 'balanced',
    length: LENGTHS.includes(req.body.length) ? req.body.length : 'medium',
  });
  const manual = Array.isArray(req.body.characters) ? req.body.characters.slice(0, 20) : [];
  const named = manual.filter((c) => text(c?.name));
  await Character.insertMany(
    named.map((c, i) => ({
      story: story._id,
      name: text(c.name, 80),
      role: text(c.role, 120),
      color: nextColor(i),
      source: 'user',
    })),
  );

  try {
    const { turn, characters } = await writeScene({ story, mode: 'opening' });
    res.status(201).json({ story, characters, turn });
  } catch (err) {
    // Nothing half-made stays behind, and the form keeps the user's text.
    await Promise.all([Character.deleteMany({ story: story._id }), Story.deleteOne({ _id: story._id })]);
    throw err;
  }
});

router.get('/:id', async (req, res) => {
  const limit = 40;
  const before = Number(req.query.before);
  const filter = { story: req.story._id, ...(Number.isFinite(before) ? { index: { $lt: before } } : {}) };
  const turns = (await Turn.find(filter).sort('-index').limit(limit + 1).lean()).reverse();
  const hasMore = turns.length > limit;
  res.json({
    story: req.story,
    characters: await castOf(req.story),
    turns: hasMore ? turns.slice(1) : turns,
    hasMore,
  });
});

router.patch('/:id', async (req, res) => {
  const { title, freedom, length } = req.body;
  if (title !== undefined && text(title, 120)) req.story.title = text(title, 120);
  if (FREEDOM.includes(freedom)) req.story.freedom = freedom;
  if (LENGTHS.includes(length)) req.story.length = length;
  await req.story.save();
  res.json({ story: req.story });
});

router.delete('/:id', async (req, res) => {
  const id = req.story._id;
  await Promise.all([Turn.deleteMany({ story: id }), Character.deleteMany({ story: id }), Story.deleteOne({ _id: id })]);
  res.json({ ok: true });
});

/* ---------- scenes ---------- */

async function resolveSpeaker(story, speakerId) {
  if (!speakerId) return null;
  return isId(speakerId) ? Character.findOne({ _id: speakerId, story: story._id }) : null;
}

router.post('/:id/turns', aiLimiter, async (req, res) => {
  if (req.story.status === 'ended') return fail(res, 400, 'This story has ended. Reopen it to continue.');
  const input = text(req.body.input);
  const speaker = await resolveSpeaker(req.story, req.body.speakerId);
  if (req.body.speakerId && !speaker) return fail(res, 400, 'That character is no longer in the story.');
  if (speaker && !input) return fail(res, 400, `Write what ${speaker.name} says or does.`);
  const mode = speaker ? 'speak' : input ? 'direct' : 'continue';

  await withLock(req, res, async (story) => {
    const meta = { prevStatus: story.status, prevChapter: story.chapter };
    const castIds = readCastIds(req.body.castIds);
    const { turn, characters } = await writeScene({ story, mode, input, speaker, castIds, meta });
    return { story, turn, characters };
  });
});

router.post('/:id/chapters', aiLimiter, async (req, res) => {
  if (req.story.status === 'ended') return fail(res, 400, 'This story has ended. Reopen it to continue.');
  const input = text(req.body.input);
  const chapterTitle = text(req.body.title, 120);

  await withLock(req, res, async (story) => {
    const meta = { prevStatus: story.status, prevChapter: story.chapter };
    const previous = { chapter: story.chapter, titles: [...story.chapterTitles] };
    story.chapterTitles[story.chapter] = chapterTitle;
    story.chapter += 1;
    try {
      const { turn, characters } = await writeScene({ story, mode: 'chapter', input, chapterTitle, meta });
      return { story, turn, characters };
    } catch (err) {
      story.chapter = previous.chapter;
      story.chapterTitles = previous.titles;
      throw err;
    }
  });
});

router.post('/:id/end', aiLimiter, async (req, res) => {
  if (req.story.status === 'ended') return fail(res, 400, 'This story has already ended.');
  const input = text(req.body.input);

  await withLock(req, res, async (story) => {
    const meta = { prevStatus: story.status, prevChapter: story.chapter };
    const { turn, characters } = await writeScene({ story, mode: 'ending', input, meta });
    story.status = 'ended';
    await story.save();
    return { story, turn, characters };
  });
});

router.post('/:id/reopen', async (req, res) => {
  req.story.status = 'active';
  await req.story.save();
  res.json({ story: req.story });
});

async function findTurn(req, res) {
  if (!isId(req.params.turnId)) {
    fail(res, 404, 'Scene not found.');
    return null;
  }
  const turn = await Turn.findOne({ _id: req.params.turnId, story: req.story._id });
  if (!turn) fail(res, 404, 'Scene not found.');
  return turn;
}

// Replaces a scene, and anything after it, with a new attempt.
router.post('/:id/turns/:turnId/retry', aiLimiter, async (req, res) => {
  const old = await findTurn(req, res);
  if (!old) return;

  await withLock(req, res, async (story) => {
    const speaker = await resolveSpeaker(story, old.speaker);
    const input = req.body.input === undefined ? old.input : text(req.body.input);
    const rejected = describeRejected(old);
    const chapterTitle = old.mode === 'chapter' ? story.chapterTitles[old.chapter - 1] ?? '' : '';
    await rewind(story, old.index);

    let mode = old.mode;
    if (mode === 'direct' || mode === 'continue') mode = input ? 'direct' : 'continue';
    if (mode === 'speak' && !speaker) mode = 'direct';
    if (mode === 'opening' && input) story.premise = `${story.premise}\n\nThe user also wants: ${input}`;

    const meta = { prevStatus: story.status, prevChapter: story.chapter };
    if (mode === 'chapter') {
      story.chapterTitles[story.chapter] = chapterTitle;
      story.chapter += 1;
    }
    const { turn, characters } = await writeScene({
      story,
      mode,
      input: mode === 'opening' ? '' : input,
      speaker: mode === 'speak' ? speaker : null,
      chapterTitle,
      retryNote: rejected,
      castIds: ['direct', 'continue', 'speak'].includes(mode)
        ? readCastIds(req.body.castIds ?? old.sceneCast.map(String))
        : [],
      meta,
    });
    if (mode === 'ending') {
      story.status = 'ended';
      await story.save();
    }
    return { story, turn, characters, removedFrom: old.index };
  });
});

// Deletes a scene and anything after it, so the story stays consistent.
router.delete('/:id/turns/:turnId', async (req, res) => {
  const old = await findTurn(req, res);
  if (!old) return;
  if (old.mode === 'opening') return fail(res, 400, 'The opening scene can be retried, but not deleted.');
  await withLock(req, res, async (story) => {
    await rewind(story, old.index);
    return { story, characters: await castOf(story), removedFrom: old.index };
  });
});

router.patch('/:id/turns/:turnId/beats/:beatId', async (req, res) => {
  const turn = await findTurn(req, res);
  if (!turn) return;
  const beat = turn.beats.id(req.params.beatId);
  const value = text(req.body.text);
  if (!beat) return fail(res, 404, 'Line not found.');
  if (!value) return fail(res, 400, 'The line cannot be empty.');
  beat.text = value;
  await turn.save();
  res.json({ turn });
});

router.delete('/:id/turns/:turnId/beats/:beatId', async (req, res) => {
  const turn = await findTurn(req, res);
  if (!turn) return;
  const beat = turn.beats.id(req.params.beatId);
  if (!beat) return fail(res, 404, 'Line not found.');
  beat.deleteOne();
  await turn.save();
  res.json({ turn });
});

/* ---------- characters ---------- */

function applyCharacterFields(character, body) {
  for (const field of ['role', 'description', 'personality', 'motive', 'faction']) {
    if (body[field] !== undefined) character[field] = text(body[field], 1000);
  }
  if (body.name !== undefined && text(body.name, 80)) character.name = text(body.name, 80);
  if (CHAR_STATUS.includes(body.status)) character.status = body.status;
  if (['ai', 'user'].includes(body.control)) character.control = body.control;
}

router.post('/:id/characters', async (req, res) => {
  const name = text(req.body.name, 80);
  if (!name) return fail(res, 400, 'Give the character a name.');
  const count = await Character.countDocuments({ story: req.story._id });
  const character = new Character({ story: req.story._id, name, color: nextColor(count), source: 'user' });
  applyCharacterFields(character, req.body);
  await character.save();
  res.status(201).json({ character });
});

// Groups several characters at once, as allies or as enemies of each other.
router.post('/:id/characters/group', async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter(isId);
  const action = req.body.action;
  const name = text(req.body.name, 60);
  if (!['alliance', 'enemies'].includes(action)) return fail(res, 400, 'Choose alliance or enemies.');
  const members = await Character.find({ _id: { $in: ids }, story: req.story._id });
  if (members.length < 2) return fail(res, 400, 'Choose at least two characters.');
  if (action === 'alliance' && !name) return fail(res, 400, 'Give the alliance a name.');

  for (let i = 0; i < members.length; i += 1) {
    if (action === 'alliance') members[i].faction = name;
    for (let j = i + 1; j < members.length; j += 1) {
      setRelationship(members[i], members[j], action === 'alliance' ? 'ally' : 'enemy');
    }
  }
  await Promise.all(members.map((m) => m.save()));
  res.json({ characters: await castOf(req.story) });
});

router.patch('/:id/characters/:charId', async (req, res) => {
  if (!isId(req.params.charId)) return fail(res, 404, 'Character not found.');
  const cast = await castOf(req.story);
  const character = cast.find((c) => String(c._id) === req.params.charId);
  if (!character) return fail(res, 404, 'Character not found.');
  applyCharacterFields(character, req.body);

  const changed = [character];
  if (req.body.relationship) {
    const { target, type, label } = req.body.relationship;
    const other = cast.find((c) => String(c._id) === String(target));
    if (!other || other === character || !REL_TYPES.includes(type)) return fail(res, 400, 'Invalid relationship.');
    setRelationship(character, other, type, text(label, 80));
    changed.push(other);
  }
  await Promise.all(changed.map((c) => c.save()));
  res.json({ characters: await castOf(req.story) });
});

router.delete('/:id/characters/:charId', async (req, res) => {
  if (!isId(req.params.charId)) return fail(res, 404, 'Character not found.');
  const { deletedCount } = await Character.deleteOne({ _id: req.params.charId, story: req.story._id });
  if (!deletedCount) return fail(res, 404, 'Character not found.');
  await Character.updateMany({ story: req.story._id }, { $pull: { relationships: { target: req.params.charId } } });
  res.json({ characters: await castOf(req.story) });
});

export default router;
