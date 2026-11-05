# Brain Brand

Write living stories with a whole cast of AI characters at once. You type a few lines of direction, and Gemini turns them into a full scene: narration, dialogue, fights and each character's own motives. Keep going for as long as you like, then end the story when you decide to.

Works on phones, tablets and desktops, and can be installed to a phone's home screen.

## What it does

- **Sign in** with Google, or with email and password.
- **Start from a few lines.** The AI creates the people you name, and builds the story around what you wrote.
- **Direct or play.** Direct the scene and let the AI play everyone, or speak as one character. Send an empty box and the AI continues by itself.
- **Play it like a game.** Characters have power, ranks, reputation, bonds and secrets, and every scene changes them. Legends glow, and only two or more fighters, or the next rank, can bring down the strongest.
- **Tap any character** to open their file: stats, relationships and full record.
- **Automatic chapters.** Long chapters close at a turning point, and each chapter is its own page.
- **Choose who is in a scene.** Tick two or three characters and the AI leaves everyone else out, unless you name them in your direction.
- **Add people by typing.** "My uncle Tariq bursts in" adds Tariq to the cast with his relationship.
- **Control the cast.** Open a character to change their motive, group, condition, relationships, and whether the AI or only you decide what they do. Add characters by hand, or group several into an alliance or make them enemies.
- **Don't like it? Change it.** Tap a line to edit or delete it. Use Try again on a scene to rewrite it, with a new direction if you want. Characters and relationships from removed scenes are undone.
- **Long stories.** Chapters, plus a memory that keeps older events in mind as the story grows.
- **Your language.** The AI writes in the language you write in, including Roman Urdu.

## Run it

You need Node.js 20 or newer, a MongoDB database, and a Gemini API key.

```bash
npm install
cp .env.example .env
```

Fill in `.env`, then:

```bash
npm run build
npm start
```

Open http://localhost:3000. For development with live reload, use `npm run dev` and open http://localhost:5173.

Run the tests with `npm test`.

## Settings

| Name | What it is |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. If the `mongodb+srv://` form times out on DNS, use the direct `mongodb://` form with your three host names. |
| `MONGODB_DB` | Database name. |
| `JWT_SECRET` | Long random string that signs login sessions. |
| `GEMINI_API_KEY` | Key from [Google AI Studio](https://aistudio.google.com/apikey). |
| `GEMINI_MODELS` | Models to try, in order, separated by commas. A busy model moves on to the next one. |
| `GOOGLE_CLIENT_ID` | OAuth web client ID. Leave empty to hide the Google button. |
| `PORT` | Server port. |
| `NODE_ENV` | Set to `production` when hosted over HTTPS. |

## Going live

Deploy to any Node host with `npm install && npm run build` as the build command and `npm start` as the start command, and set the settings above as environment variables. Then:

1. Allow the host's IP address in MongoDB Atlas under Network Access.
2. Add your site's address to the OAuth client's Authorized JavaScript origins in Google Cloud.
3. Add a homepage and privacy policy address on the Branding page, then publish the app on the Audience page. Until then, only listed test users can use Google sign-in.

## How it is built

- `server/`: Express, MongoDB through Mongoose, and the Gemini engine. `src/prompts.js` holds the storytelling instructions and `src/engine.js` applies each scene to the cast.
- `client/`: React and Vite.
