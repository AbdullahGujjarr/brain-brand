// The game layer of a story: power, rank, reputation, bonds and secrets.
// Everything here works on plain fields so it can run on documents or in tests.

export const APEX_POWER = 80; // the top character at or above this is the apex
export const TRUST_SCORE = 70; // bond score that makes two characters Trusted
export const NEMESIS_SCORE = -70;

const clamp = (n, min, max) => Math.max(min, Math.min(max, Math.round(Number(n) || 0)));
const norm = (s) => String(s || '').trim().toLowerCase();

const START_SCORE = { ally: 30, friend: 40, family: 50, love: 60, trusted: 75, enemy: -50, rival: -25, nemesis: -75, neutral: 0 };
const START_REPUTATION = { hero: 35, villain: -35, grey: 12, unknown: 0 };
// Family and love stay what they are, whatever happens to the score.
const SHIFTING_TYPES = ['neutral', 'ally', 'friend', 'rival', 'enemy', 'trusted', 'nemesis'];

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

/** True when the user's own words name this character. */
export function namedIn(input, name) {
  const words = norm(input).split(/[^\p{L}\p{N}]+/u);
  return norm(name).split(/\s+/).some((part) => words.includes(part));
}

export function deriveAlignment(reputation) {
  if (reputation >= 30) return 'hero';
  if (reputation <= -30) return 'villain';
  return Math.abs(reputation) >= 10 ? 'grey' : 'unknown';
}

/** Strongest first. Dead and concealed characters are not ranked. */
export function rankCast(characters) {
  return characters
    .filter((c) => c.status !== 'dead' && !c.concealed)
    .sort((a, b) => b.power - a.power);
}

export function apexOf(ranked) {
  return ranked[0]?.power >= APEX_POWER ? ranked[0] : null;
}

/** Rank words from the prompt are not titles. */
function cleanTitle(title) {
  const text = String(title ?? '').trim().slice(0, 60);
  return /^(the )?(apex|rank|legend|hero|villain)$/i.test(text) ? '' : text;
}

export function startingStats(data) {
  const alignment = ['hero', 'villain', 'grey'].includes(data.alignment) ? data.alignment : 'unknown';
  const reputation = START_REPUTATION[alignment];
  return {
    power: clamp(data.power ?? 40, 5, 95),
    reputation,
    alignment: deriveAlignment(reputation),
    title: cleanTitle(data.title),
    voice: String(data.voice ?? '').slice(0, 300),
    secret: String(data.secret ?? '').slice(0, 500),
    concealed: Boolean(data.concealed),
  };
}

export function setRelationship(a, b, type, label = '', reverseLabel = '') {
  const put = (from, to, text) => {
    const existing = from.relationships.find((r) => String(r.target) === String(to._id));
    if (existing) {
      if (existing.type !== type) existing.score = START_SCORE[type] ?? 0;
      existing.type = type;
      if (text) existing.label = text;
    } else {
      from.relationships.push({ target: to._id, type, label: text, score: START_SCORE[type] ?? 0 });
    }
  };
  put(a, b, label);
  put(b, a, reverseLabel);
}

/** Moves the bond between two characters and returns a message if it changed level. */
export function shiftBond(a, b, delta) {
  if (!a.relationships.some((r) => String(r.target) === String(b._id))) setRelationship(a, b, 'neutral');
  if (!b.relationships.some((r) => String(r.target) === String(a._id))) setRelationship(b, a, 'neutral');
  let message = '';
  for (const [from, to] of [[a, b], [b, a]]) {
    const r = from.relationships.find((x) => String(x.target) === String(to._id));
    r.score = clamp((r.score ?? 0) + delta, -100, 100);
    if (!SHIFTING_TYPES.includes(r.type)) continue;
    let next = r.type;
    if (r.score >= TRUST_SCORE) next = 'trusted';
    else if (r.score <= NEMESIS_SCORE) next = 'nemesis';
    else if (r.type === 'trusted' && r.score < 50) next = 'ally';
    else if (r.type === 'nemesis' && r.score > -50) next = 'enemy';
    if (next !== r.type) {
      r.type = next;
      if (next === 'trusted') message = `${a.name} and ${b.name} are now Trusted`;
      if (next === 'nemesis') message = `${a.name} and ${b.name} are now Nemesis`;
      if (next === 'ally') message = `${a.name} and ${b.name} lost their trust`;
      if (next === 'enemy') message = `${a.name} and ${b.name} are no longer Nemesis`;
    }
  }
  return message;
}

function adjust(c, { power = 0, reputation = 0 }) {
  c.power = clamp(c.power + power, 0, 100);
  c.reputation = clamp(c.reputation + reputation, -100, 100);
  c.alignment = deriveAlignment(c.reputation);
}

function remember(c, text, chapter) {
  if (!text) return;
  c.history.push({ chapter, text: String(text).slice(0, 200) });
  while (c.history.length > 40) c.history.shift();
}

/**
 * Applies one fight. The apex can only fall to two or more fighters, to the
 * character ranked just below them, or because the user said so in their direction.
 */
export function resolveCombat({ winners, loser, killed }, ranked, input, chapter) {
  const apex = apexOf(ranked);
  const blocked = loser === apex
    && winners.length < 2
    && !winners.includes(ranked[1])
    && !namedIn(input, loser.name);

  if (blocked) {
    for (const w of winners) adjust(w, { power: 3 });
    adjust(loser, { power: -2 });
    remember(loser, `Withstood an attack from ${winners[0].name}`, chapter);
    return [{ kind: 'combat', text: `${loser.name} withstood ${winners[0].name}. Only two or more, or the next rank, can bring them down` }];
  }

  const effects = [];
  for (const w of winners) {
    const upset = (loser.power - w.power) / 3;
    const gain = clamp((killed ? 8 : 5) + upset / Math.max(winners.length, 1), 2, 20);
    let reputation = 0;
    if (loser.alignment === 'villain') {
      reputation = killed ? 20 : 10;
      w.villainsSlain += killed ? 1 : 0;
    } else if (loser.alignment === 'hero') reputation = killed ? -30 : -8;
    else if (killed) reputation = -15;
    w.kills += killed ? 1 : 0;
    adjust(w, { power: gain, reputation });
    remember(w, `${killed ? 'Killed' : 'Defeated'} ${loser.name}`, chapter);
    if (!w.concealed) effects.push({ kind: 'power', text: `${w.name} power +${gain}` });
  }
  const names = winners.map((w) => w.name).join(' and ');
  effects.unshift({ kind: killed ? 'kill' : 'combat', text: `${names} ${killed ? 'killed' : 'defeated'} ${loser.name}` });

  if (killed) {
    loser.status = 'dead';
  } else {
    loser.status = 'injured';
    const loss = clamp(8 + (winners.length - 1) * 3, 8, 25);
    adjust(loser, { power: -loss });
    if (!loser.concealed) effects.push({ kind: 'loss', text: `${loser.name} power -${loss}` });
  }
  remember(loser, killed ? `Killed by ${names}` : `Defeated by ${names}`, chapter);
  return effects;
}

/** Applies the AI's scene results to the cast and returns what the player should see. */
export function applyGameResult({ result, characters, inScene, touch, input, chapter }) {
  const effects = [];
  const before = rankCast(characters)[0];
  const alignments = new Map(characters.map((c) => [c, c.alignment]));
  const ready = (name) => {
    const c = findCharacter(characters, name);
    if (!c || !inScene(c.name)) return null;
    touch(c);
    return c;
  };

  for (const r of result.relationshipChanges ?? []) {
    const a = ready(r.from);
    const b = ready(r.to);
    if (!a || !b || a === b) continue;
    if (r.type) setRelationship(a, b, r.type, r.label || '', r.reverseLabel || '');
    const message = shiftBond(a, b, clamp(r.scoreChange, -40, 40));
    if (message) {
      effects.push({ kind: 'bond', text: message });
      remember(a, message, chapter);
      remember(b, message, chapter);
    }
  }

  const fought = new Set();
  for (const f of result.combat ?? []) {
    const loser = ready(f.loser);
    const winners = (f.winners ?? []).map(ready).filter((w) => w && w !== loser);
    if (!loser || !winners.length || loser.status === 'dead') continue;
    effects.push(...resolveCombat({ winners, loser, killed: Boolean(f.killed) }, rankCast(characters), input, chapter));
    [loser, ...winners].forEach((c) => fought.add(c));
  }

  for (const ch of result.characterChanges ?? []) {
    const c = ready(ch.name);
    if (!c) continue;
    if (['active', 'injured', 'captured', 'missing', 'dead'].includes(ch.status)) c.status = ch.status;
    if (ch.faction) c.faction = ch.faction;
    if (ch.motive) c.motive = ch.motive;
    if (ch.role) c.role = String(ch.role).slice(0, 120);
    if (cleanTitle(ch.title) && ch.title !== c.title) {
      c.title = cleanTitle(ch.title);
      effects.push({ kind: 'title', text: `${c.name} earned the title "${c.title}"` });
    }
    // A fight already moved this character's power, so it must not count twice.
    const power = fought.has(c) ? 0 : clamp(ch.powerChange, -20, 20);
    const reputation = clamp(ch.reputationChange, -25, 25);
    adjust(c, { power, reputation });
    if (Math.abs(power) >= 3 && !c.concealed) {
      effects.push({ kind: power > 0 ? 'power' : 'loss', text: `${c.name} power ${power > 0 ? '+' : ''}${power}` });
    }
    if (Math.abs(reputation) >= 5) {
      effects.push({ kind: 'fame', text: `${c.name} reputation ${reputation > 0 ? '+' : ''}${reputation}` });
    }
    remember(c, ch.event, chapter);
    if (ch.secretRevealed && (c.secret || c.concealed) && !c.secretRevealed) {
      c.secretRevealed = true;
      c.concealed = false;
      effects.push({ kind: 'secret', text: c.secret ? `${c.name}'s secret is out: ${c.secret}` : `${c.name} showed their true power` });
      remember(c, 'Their secret was revealed', chapter);
    }
  }

  for (const c of characters) {
    if (alignments.has(c) && alignments.get(c) !== c.alignment && ['hero', 'villain'].includes(c.alignment)) {
      effects.push({ kind: 'align', text: `${c.name} is now seen as a ${c.alignment}` });
    }
  }
  const after = rankCast(characters)[0];
  if (after && after !== before) effects.push({ kind: 'rank', text: `${after.name} is now the most dominant` });
  return effects.slice(0, 12);
}
