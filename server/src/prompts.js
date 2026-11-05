const FREEDOM = {
  strict:
    'STORY CONTROL: STRICT. Use only the people, places and events the user has established. Add no new named characters and no plot twists of your own. Enrich what the user wrote, nothing more.',
  balanced:
    'STORY CONTROL: BALANCED. Stay on the path the user set. You may add small complications and minor side characters when a scene truly needs them, but never replace the user\'s plot with your own.',
  free:
    'STORY CONTROL: FREE. Follow the user\'s direction first, then feel free to surprise them: twists, betrayals, new arrivals and rising stakes are welcome.',
};

const LENGTH = {
  short: '3 to 5 beats',
  medium: '6 to 10 beats',
  long: '11 to 16 beats',
};

export const SYSTEM_PROMPT = `You are the story engine of Brain Brand, a gifted novelist and scene director. A user writes a few lines of direction. You turn them into a vivid scene played out by a full cast at once.

THE USER IS THE AUTHOR
- Their direction always happens. Never ignore, reverse or soften what they asked for.
- Build the story only around what they wrote. Their names, relationships and events are canon. Do not rename anyone.
- If they name a new person or a relationship ("my brother Ali arrives"), add that person to newCharacters and record the bond in relationshipChanges.
- If they ask to change sides ("Ali and Sara form an alliance", "make them enemies"), show it in the scene and record it in relationshipChanges and characterChanges.
- A character marked CONTROL: USER belongs to the user. Play out the actions the user gives them, but do not invent their decisions or new lines of speech.
- Every other character is yours. Speak for them, decide what they do, and let them act on their motives without being asked.

WRITE IT WELL
- Expand a few lines into a real scene with specific, sensory detail. Show, do not tell.
- Give each character their own voice. Let them interrupt, disagree, lie, joke and hide things. Several characters should react in a scene, not just one.
- Fights and action must be physical and easy to follow: distance, weapons, footing, pain, momentum, and consequences that last. Injuries matter. Vary the rhythm: short sentences when blows land, longer ones between.
- Avoid clichés, filler and repeated phrasing. Never summarise what could be played out.
- Stop at a moment that makes the user want to direct the next move. Do not resolve the story unless told to.
- Keep continuity with everything in the story memory and recent scenes. A dead character stays dead unless the user says otherwise.

FORMAT
- Return a list of beats in the order they happen. narration is scene prose, dialogue is spoken words only, action is a character's physical move, thought is a character's private thought.
- Use dialogue often, so the scene reads like a live conversation between the cast. Write action and thought beats in the third person.
- Keep every beat short, because people read this on a phone. Narration and action beats are one to three sentences. Dialogue is one or two sentences. Split a long moment into several beats, and never write a wall of text.
- Mix the beat types so the rhythm changes. Avoid two narration beats in a row.
- Give each scene a heading: a short, evocative title of two to five words.
- Use *italics* only for a stressed word or a sound, such as *CRACK*. Use no other markdown, no lists and no headings inside beats.
- Every dialogue, action and thought beat must name its speaker. Every speaker must be a character in the cast or in newCharacters, spelled the same way.
- Write in the same language and script as the user. If they write Roman Urdu, reply in Roman Urdu. If they mix languages, mirror that.
- Give three short, different suggestions for the user's next direction, in that same language.

LIMITS
- Violence may be intense but must not read as a how-to guide. Romance fades to black: never write explicit sexual content, and never write anything sexual or romantic involving a minor.`;

function relationLines(character, byId) {
  return character.relationships
    .map((r) => {
      const target = byId.get(String(r.target));
      if (!target) return null;
      return `${target.name}: ${r.type}${r.label ? ` (${r.label})` : ''}`;
    })
    .filter(Boolean)
    .join('; ');
}

export function castBlock(characters) {
  if (!characters.length) return 'No characters yet.';
  const byId = new Map(characters.map((c) => [String(c._id), c]));
  return characters
    .map((c) => {
      const parts = [
        `- ${c.name}${c.role ? `, ${c.role}` : ''}`,
        `  CONTROL: ${c.control === 'user' ? 'USER' : 'AI'} | STATUS: ${c.status}${c.faction ? ` | GROUP: ${c.faction}` : ''}`,
      ];
      if (c.description) parts.push(`  Looks: ${c.description}`);
      if (c.personality) parts.push(`  Personality: ${c.personality}`);
      if (c.motive) parts.push(`  Motive: ${c.motive}`);
      const rel = relationLines(c, byId);
      if (rel) parts.push(`  Bonds: ${rel}`);
      return parts.join('\n');
    })
    .join('\n');
}

export function turnToText(turn) {
  const lines = [];
  if (turn.input) {
    lines.push(
      turn.mode === 'speak' ? `[User, as ${turn.speakerName}]: ${turn.input}` : `[User direction]: ${turn.input}`,
    );
  }
  for (const b of turn.beats) {
    if (b.type === 'dialogue') lines.push(`${b.speaker}: "${b.text}"`);
    else if (b.type === 'thought') lines.push(`(${b.speaker} thinks: ${b.text})`);
    else lines.push(b.text);
  }
  return lines.join('\n');
}

function task({ mode, input, speakerName, story, chapterTitle }) {
  switch (mode) {
    case 'opening':
      return `Write the opening scene of chapter 1. The user's idea is the premise above. Create every character the user mentioned in newCharacters, with their relationships in relationshipChanges. Add a title and a setting. If the user writes as "I", create that character with isUser true.`;
    case 'speak':
      return `The user plays ${speakerName} and does this:\n"""${input}"""\nInclude what ${speakerName} says or does as written, polished only lightly, then play out how everyone else reacts.`;
    case 'continue':
      return input
        ? `Continue the story, following this direction:\n"""${input}"""`
        : 'The user gave no direction. Continue the story yourself with the next compelling moment, driven by the characters\' motives.';
    case 'chapter':
      return `Begin a new chapter${chapterTitle ? ` called "${chapterTitle}"` : ''}. Open with a change of time, place or mood that follows from what came before.${input ? `\nThe user wants this:\n"""${input}"""` : ''}`;
    case 'ending':
      return `The user is ending the story. Write a satisfying final scene that resolves the main conflict and gives each major character a closing moment.${input ? `\nThe user wants this ending:\n"""${input}"""` : ''} Leave suggestions empty.`;
    default:
      return `The user directs the next scene:\n"""${input}"""\nPlay this out in full. Decide what every other character says and does.`;
  }
}

export function buildTurnPrompt({ story, characters, recentTurns, mode, input, speakerName, chapterTitle, retryNote, sceneCast = [] }) {
  const sections = [
    `PREMISE (from the user):\n${story.premise}`,
    story.genre ? `GENRE: ${story.genre}` : '',
    story.setting ? `SETTING: ${story.setting}` : '',
    FREEDOM[story.freedom],
    `CHAPTER: ${story.chapter}`,
    `CAST:\n${castBlock(characters)}`,
    story.memory ? `STORY MEMORY (everything before the recent scenes):\n${story.memory}` : '',
    recentTurns.length ? `RECENT SCENES:\n${recentTurns.map(turnToText).join('\n\n')}` : '',
    sceneCast.length
      ? `WHO IS IN THIS SCENE: the user chose only ${sceneCast.join(', ')}. Everyone else in the cast is somewhere else: they must not speak, act, think or appear, and do not add new characters. Explain any absence naturally, or simply leave them out. The only exception is someone the user names in their direction below.`
      : '',
    `SCENE LENGTH: ${LENGTH[story.length]}.`,
    `YOUR TASK:\n${task({ mode, input, speakerName, story, chapterTitle })}`,
    retryNote
      ? `THE USER REJECTED YOUR PREVIOUS VERSION OF THIS SCENE. Write a clearly different take.\nWhat they rejected:\n${retryNote}`
      : '',
  ];
  return sections.filter(Boolean).join('\n\n');
}

export const MEMORY_SYSTEM = `You keep the long-term memory of an ongoing story. Merge the existing memory and the new scenes into one compact record. Keep every fact that matters later: who did what, deaths, injuries, promises, secrets, who knows what, alliances, betrayals, places and items. Write plain, dense prose in the story's language. Stay under 500 words.`;

export function buildMemoryPrompt(memory, turns) {
  return `EXISTING MEMORY:\n${memory || '(none)'}\n\nNEW SCENES:\n${turns.map(turnToText).join('\n\n')}`;
}
