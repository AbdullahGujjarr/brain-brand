import { Link } from 'react-router-dom';

const CONTACT = 'abdullahpkpk91@gmail.com';

export default function Privacy() {
  return (
    <div className="page narrow legal">
      <header className="lib-head">
        <Link className="brand" to="/"><img src="/icon.svg" alt="" width="30" height="30" /> Brain Brand</Link>
      </header>
      <h1>Privacy policy</h1>
      <p className="muted">Last updated 6 November 2026</p>

      <p>Brain Brand is a story-writing app. This page explains what it collects and what happens to it.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name and email address. With email sign-in we store a scrambled form of your password, never the password itself.</li>
        <li><strong>Google sign-in:</strong> if you use it, we receive your name, email address, profile picture and Google account ID. We do not get your Google password, and we do not access your Gmail, Drive or contacts.</li>
        <li><strong>Your stories:</strong> what you write, the scenes the AI writes, and your characters.</li>
      </ul>

      <h2>How we use it</h2>
      <p>We use this information only to sign you in, save your stories and write new scenes. We do not sell it, and we do not show ads.</p>

      <h2>Who else handles it</h2>
      <ul>
        <li><strong>Google Gemini</strong> receives your story text so the AI can write scenes. Because this app uses Gemini's free tier, Google may use that text to improve its products, and people at Google may review it. Do not put private or sensitive information in your stories.</li>
        <li><strong>MongoDB Atlas</strong> stores your account and stories.</li>
        <li><strong>Render</strong> runs the website.</li>
      </ul>

      <h2>Cookies</h2>
      <p>We use one cookie to keep you signed in. We do not use advertising or tracking cookies. The sign-in page loads Google's sign-in button and Google Fonts, so Google can see that you visited it.</p>

      <h2>Keeping and deleting your data</h2>
      <p>Your stories stay until you delete them. You can delete any story inside the app at any time. To delete your whole account, email us and we will remove it.</p>

      <h2>Children</h2>
      <p>Brain Brand is not meant for children under 13.</p>

      <h2>Changes and contact</h2>
      <p>If this policy changes, we will update this page. For questions or to delete your account, email <a className="link" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
    </div>
  );
}
