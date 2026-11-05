import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export const REL_TYPES = ['ally', 'enemy', 'family', 'friend', 'love', 'rival', 'neutral'];
export const CHAR_STATUS = ['active', 'injured', 'captured', 'missing', 'dead'];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: String,
    googleId: { type: String, index: true, sparse: true },
    avatar: String,
  },
  { timestamps: true },
);

const storySchema = new Schema(
  {
    owner: { type: ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'Untitled story', trim: true },
    premise: { type: String, required: true },
    genre: { type: String, default: '' },
    setting: { type: String, default: '' },
    status: { type: String, enum: ['active', 'ended'], default: 'active' },
    chapter: { type: Number, default: 1 },
    chapterTitles: { type: [String], default: [] },
    // strict: only what the user wrote. balanced: small extras. free: AI drives twists.
    freedom: { type: String, enum: ['strict', 'balanced', 'free'], default: 'balanced' },
    length: { type: String, enum: ['short', 'medium', 'long'], default: 'medium' },
    // Long stories: older turns are folded into `memory`, recent turns stay verbatim.
    memory: { type: String, default: '' },
    memoryThrough: { type: Number, default: -1 },
    memoryHistory: { type: [{ through: Number, memory: String, _id: false }], default: [] },
    nextIndex: { type: Number, default: 0 },
    generatingSince: { type: Date, default: null },
  },
  { timestamps: true },
);

const characterSchema = new Schema(
  {
    story: { type: ObjectId, ref: 'Story', required: true, index: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, default: '' },
    description: { type: String, default: '' },
    personality: { type: String, default: '' },
    motive: { type: String, default: '' },
    faction: { type: String, default: '', trim: true },
    status: { type: String, enum: CHAR_STATUS, default: 'active' },
    // ai: the AI writes this character freely. user: the AI only follows the user's lead.
    control: { type: String, enum: ['ai', 'user'], default: 'ai' },
    color: { type: String, default: '#b4532a' },
    source: { type: String, enum: ['ai', 'user'], default: 'ai' },
    relationships: {
      type: [
        {
          target: { type: ObjectId, ref: 'Character', required: true },
          type: { type: String, enum: REL_TYPES, default: 'neutral' },
          label: { type: String, default: '' },
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

const beatSchema = new Schema({
  type: { type: String, enum: ['narration', 'dialogue', 'action', 'thought'], required: true },
  speaker: { type: String, default: '' },
  character: { type: ObjectId, ref: 'Character', default: null },
  text: { type: String, required: true },
});

const turnSchema = new Schema(
  {
    story: { type: ObjectId, ref: 'Story', required: true },
    index: { type: Number, required: true },
    chapter: { type: Number, default: 1 },
    mode: {
      type: String,
      enum: ['opening', 'direct', 'speak', 'continue', 'chapter', 'ending'],
      default: 'direct',
    },
    input: { type: String, default: '' },
    speaker: { type: ObjectId, ref: 'Character', default: null },
    speakerName: { type: String, default: '' },
    heading: { type: String, default: '' },
    // Characters the user limited this scene to. Empty means everyone.
    sceneCast: { type: [ObjectId], default: [] },
    beats: { type: [beatSchema], default: [] },
    suggestions: { type: [String], default: [] },
    // Undo data, so Retry and Delete put the cast back exactly as it was.
    createdCharacters: { type: [ObjectId], default: [] },
    before: {
      type: [
        {
          character: ObjectId,
          status: String,
          faction: String,
          motive: String,
          relationships: Schema.Types.Mixed,
          _id: false,
        },
      ],
      default: [],
    },
    prevStatus: { type: String, default: 'active' },
    prevChapter: { type: Number, default: 1 },
  },
  { timestamps: true },
);
turnSchema.index({ story: 1, index: 1 }, { unique: true });

export const User = model('User', userSchema);
export const Story = model('Story', storySchema);
export const Character = model('Character', characterSchema);
export const Turn = model('Turn', turnSchema);
