import LegalLayout from "./LegalLayout";

// Written to match the five RA 10173 principles in
// PhilFreela-System-Functions.md's Feature 6, and to describe what the
// platform actually does (checked against the real database rules and AI
// service), not generic boilerplate.
export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" updated="October 2026">
      <p className="text-secondary">
        PhilFreela connects Filipino freelancers and clients. This page explains what information we collect, why, and the
        choices you have, following the Philippine Data Privacy Act of 2012 (RA 10173).
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">What we collect</h5>
      <ul className="text-secondary">
        <li>Account info: your name, username, email, gender, and the password you set (stored by our login provider in hashed form -- we never see or store it as plain text).</li>
        <li>Profile info you choose to add: a profile description, a profile picture, and, for freelancers, your portfolio and services.</li>
        <li>
          Identity verification (freelancers): a government ID and a short face scan, used only to confirm you're a real
          person. This counts as sensitive personal information under RA 10173, so it's kept in a storage area no one but
          our review system can open, and never shown to other users -- they only see whether you're verified.
        </li>
        <li>Messages you send to other users, and files or portfolio work you upload (which carry an invisible, automatic ownership mark -- see our Terms of Service).</li>
        <li>
          Messages you choose to send with a report. Admins can't read anyone's chats, so if you report someone from a
          chat, you tick the messages that show the problem. Only the ones you tick are copied, and only our admins can
          read them: the person you report can't, and neither can anyone else.
        </li>
        <li>
          GCash payment details (freelancers): the GCash number, the name on the account and, if you add one, a QR picture,
          saved in Settings. Only you can read your own row. A client sees it only on the page of a project with you, or on
          a payment card you send in a chat, so they can pay you. It is never on your public profile.
        </li>
        <li>
          Payment records: for a payment made through a project or a chat, the amount, the GCash reference number, the
          receipt screenshot, and when it was recorded and answered. Only the two people on a payment can read it. The
          receipt picture is kept in private storage. Admins can read a payment, and open its receipt, only when one of the
          two people sends it with a report.
        </li>
        <li>Basic usage information needed to run features like search and "Recommended for you" (for example, which posts you've viewed or messaged about).</li>
        <li>
          Your track record on PhilFreela: the projects you complete (title, finish date, who it was with, and the ratings),
          how quickly you usually reply in chats, and when you joined. It's shown on your public profile so people can judge
          how reliable you are. The notes, files and links of a project, and the text of your messages, are never part of it.
        </li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Legitimate purpose</h5>
      <p className="text-secondary">
        We only process your data to run the platform: showing your profile and posts to other users, matching you with
        relevant freelancers or jobs, verifying identities, and keeping the community safe (reviewing reports and
        enforcing suspensions or bans). Other signed-in users can find your profile by searching for your name or
        username; the search only shows your name, username, role (freelancer or client) and profile picture.
        PhilFreela does not process, hold or move any money: clients pay freelancers in the GCash app. PhilFreela only
        records the payments people tell it about, so both sides can see what was sent and what was received.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Consent and transparency</h5>
      <p className="text-secondary">
        Creating an account means you've agreed to this policy and our Terms of Service. Identity verification is
        optional for clients and only required of freelancers before they can post a service, and you're shown exactly
        what's being captured (your ID and a few seconds of face scan) before you submit anything.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Data minimization</h5>
      <p className="text-secondary">
        We only ask for what a feature actually needs. For example, identity verification reads your ID and face scan
        once to confirm a match, and doesn't keep running checks on you afterward; a profile description is entirely
        optional.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Limited sharing</h5>
      <p className="text-secondary">
        We don't sell or share your data with outside companies. Your information is only handled by the services that
        run PhilFreela itself: our database and file storage provider, and the separate service that runs our AI
        features (search, recommendations, moodboard matching, and identity verification). We'd only share information
        with authorities if required by law.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">How long we keep it</h5>
      <p className="text-secondary">
        Your data stays while your account is active. If an account is banned, it's automatically and permanently
        deleted 100 days later (sooner if you successfully appeal), unless an appeal is still pending. If an admin
        archives an account, its data is kept but the account can't be used, and it is permanently deleted 100 days
        later unless an admin restores it. A report you sent, with any chat messages you sent along with it, is
        removed if you delete your account. Your GCash details are removed with your account, and so are the payment
        records of the payments you were on. The receipt and QR picture files stay in private storage, where nobody
        can open them once the record they belong to is gone.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Your rights</h5>
      <p className="text-secondary">
        In Settings, under Privacy &amp; Notifications, you can:
      </p>
      <ul className="text-secondary">
        <li><strong className="text-white">Review</strong> what's stored about you, and <strong className="text-white">download</strong> a copy of it at any time. The copy includes your payment records and GCash details, but not the receipt pictures.</li>
        <li><strong className="text-white">Update</strong> your profile information yourself, whenever you like.</li>
        <li><strong className="text-white">Delete</strong> your account, which removes your profile, posts, portfolio, and messages permanently. This can't be undone.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Questions</h5>
      <p className="text-secondary mb-0">
        PhilFreela is a capstone project built for a school requirement. If you have a question about your data, reach
        out to the project's developer through the contact details given alongside this project.
      </p>
    </LegalLayout>
  );
}
