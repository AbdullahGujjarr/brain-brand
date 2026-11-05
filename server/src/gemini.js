import { GoogleGenAI, HarmBlockThreshold, HarmCategory, Type } from '@google/genai';
import { config } from './config.js';

export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

let client;
function ai() {
  if (!config.geminiKey) throw new AiError('The AI is not set up yet: GEMINI_API_KEY is missing.', 503);
  client ||= new GoogleGenAI({ apiKey: config.geminiKey });
  return client;
}

// Fights and danger are part of fiction, so only the most severe content is blocked.
// The sexual-content filter stays at Google's stricter setting.
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const str = (description) => ({ type: Type.STRING, description });

const newCharacter = {
  type: Type.OBJECT,
  properties: {
    name: str('Name exactly as the user wrote it, or an invented name for a new extra.'),
    role: str('Short role, such as "Zara\'s older brother" or "captain of the guard".'),
    description: str('One or two sentences on looks and presence.'),
    personality: str('How they think and talk.'),
    motive: str('What they secretly or openly want right now.'),
    faction: str('Group or alliance name, or empty.'),
    isUser: { type: Type.BOOLEAN, description: 'True only if this is the user writing as "I" or "me".' },
  },
  required: ['name', 'role', 'description', 'personality', 'motive'],
};

const relationship = {
  type: Type.OBJECT,
  properties: {
    from: str('Character name.'),
    to: str('Character name.'),
    type: { type: Type.STRING, enum: ['ally', 'enemy', 'family', 'friend', 'love', 'rival', 'neutral'] },
    label: str('What "from" is to "to", such as "brother" or "sworn enemy".'),
    reverseLabel: str('What "to" is to "from", such as "sister".'),
  },
  required: ['from', 'to', 'type'],
};

export const turnSchema = {
  type: Type.OBJECT,
  properties: {
    title: str('Short story title of two to five words, with no chapter name. Only needed for the opening scene.'),
    setting: str('World and place in one or two sentences. Only needed for the opening scene.'),
    newCharacters: { type: Type.ARRAY, items: newCharacter },
    beats: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ['narration', 'dialogue', 'action', 'thought'] },
          speaker: str('Character name for dialogue, action and thought. Empty for narration.'),
          text: str('The prose. For dialogue, only the spoken words, with no quotation marks.'),
        },
        required: ['type', 'speaker', 'text'],
      },
    },
    relationshipChanges: { type: Type.ARRAY, items: relationship },
    characterChanges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: str('Character name.'),
          status: { type: Type.STRING, enum: ['active', 'injured', 'captured', 'missing', 'dead'] },
          faction: str('New group or alliance, only if it changed.'),
          motive: str('New motive, only if it changed.'),
        },
        required: ['name'],
      },
    },
    suggestions: {
      type: Type.ARRAY,
      description: 'Three short, different ideas for what the user could direct next.',
      items: { type: Type.STRING },
    },
  },
  required: ['beats', 'suggestions'],
};

function friendlyError(err) {
  if (err instanceof AiError) return err;
  const code = err?.status ?? err?.code;
  if (code === 429) return new AiError('The AI is at its usage limit right now. Wait a minute and try again.', 429);
  if (code === 400 || code === 401 || code === 403) {
    console.error('Gemini rejected the request:', err.message);
    return new AiError('The AI rejected the request. Check the Gemini key and model settings.', 502);
  }
  console.error('Gemini error:', err?.message);
  return new AiError('The AI is busy right now. Please try again.', 503);
}

async function callOnce(model, { system, prompt, schema, temperature }) {
  const res = await ai().models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: system,
      temperature,
      maxOutputTokens: 16384,
      safetySettings,
      httpOptions: { timeout: 45000 },
      ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
    },
  });
  const reason = res.candidates?.[0]?.finishReason;
  if (res.promptFeedback?.blockReason || reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT') {
    throw new AiError('The AI refused this scene for safety reasons. Try wording it differently.', 422);
  }
  const text = res.text;
  if (!text) throw Object.assign(new Error('Empty AI response'), { status: 503 });
  return schema ? JSON.parse(text) : text.trim();
}

/**
 * Tries each configured model in order. Individual Gemini models are often
 * overloaded or out of quota, so a busy model moves straight on to the next one.
 */
export async function generate(request) {
  let last;
  for (const model of config.geminiModels) {
    try {
      return await callOnce(model, request);
    } catch (err) {
      if (err instanceof AiError) throw err;
      last = err;
      const code = err?.status ?? err?.code;
      if (code === 401 || code === 403) break;
      console.warn(`Gemini model ${model} failed (${code ?? err.name}), trying the next one.`);
    }
  }
  throw friendlyError(last);
}
