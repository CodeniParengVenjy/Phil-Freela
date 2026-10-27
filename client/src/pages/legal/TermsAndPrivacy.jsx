import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import LegalLayout from "./LegalLayout";

// One page for both legal documents. /terms opens at the top and /privacy
// opens scrolled to Part 2, so every old link (homepage footer, sign-up box,
// Settings) keeps working without changing.
export default function TermsAndPrivacy() {
  const { pathname } = useLocation();

  // The app keeps the old scroll position when a link opens a new page (the
  // homepage footer is far down), so set it here. "instant" skips Bootstrap's
  // smooth scrolling, which would otherwise glide across the page on arrival.
  useEffect(() => {
    if (pathname === "/privacy") document.getElementById("privacy-policy")?.scrollIntoView({ behavior: "instant" });
    else window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <LegalLayout title="Terms of Service and Privacy Policy" updated="October 2026">
      <div className="d-flex flex-wrap gap-4 fs-7">
        <a href="#terms-of-service" className="hover-orange text-decoration-none"><i className="bi bi-arrow-down-circle me-1"></i> Part 1: Terms of Service</a>
        <a href="#privacy-policy" className="hover-orange text-decoration-none"><i className="bi bi-arrow-down-circle me-1"></i> Part 2: Privacy Policy</a>
      </div>

      <hr className="border-secondary border-opacity-25 my-4" />
      <TermsOfService />

      <hr className="border-secondary border-opacity-25 my-5" />
      <PrivacyPolicy />
    </LegalLayout>
  );
}

// Practical rules matching what the platform actually enforces (watermarking,
// verification, suspensions), not generic boilerplate.
function TermsOfService() {
  return (
    <section>
      <h2 id="terms-of-service" className="text-white fw-bold fs-4 mb-3" style={{ scrollMarginTop: 24 }}>Part 1: Terms of Service</h2>
      <p className="text-secondary">
        These are the rules for using PhilFreela. By creating an account, you agree to them and to the Privacy Policy in Part 2.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">What PhilFreela is</h5>
      <p className="text-secondary">
        PhilFreela is a platform for Filipino freelancers and clients to find each other, message, and arrange work
        directly. <strong className="text-white">PhilFreela never holds, moves or guarantees the money between clients and freelancers.</strong> Clients pay
        freelancers directly, in their own GCash app, outside the platform. PhilFreela only keeps a record of those
        payments (see "Payments" below) and never takes a cut of them. It only charges for its own extras: Featured
        posts, Premium and sponsored billboards (see "PhilFreela's own fees" below).
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Your account</h5>
      <ul className="text-secondary">
        <li>You're responsible for the accuracy of your profile and for keeping your login secure.</li>
        <li>Freelancers must pass identity verification before posting a service, and clients before posting a project or job, so both sides know they're dealing with a real person.</li>
        <li>One account per person. Your face scan is checked against the other accounts, and a face already used on another account is flagged to an admin.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Your name</h5>
      <ul className="text-secondary">
        <li>Every account must have a name, and it should be your real name. Other people see it on your profile, jobs, services and messages.</li>
        <li>A name is 2 to 50 characters long and uses letters, spaces and . , ' - only. No numbers, emoji, symbols, email addresses or links.</li>
        <li>You can change your name once every 7 days in Settings.</li>
        <li>If your account has no name, PhilFreela asks you to add one before you can carry on using the dashboard.</li>
        <li>A name that pretends to be another person, or is meant to mislead or advertise, can get your account suspended.</li>
        <li>A name or username with a bad word in it is not accepted.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Posting and messaging</h5>
      <ul className="text-secondary">
        <li>Don't post spam, scams, or content that isn't yours to post.</li>
        <li>Be respectful in messages and calls. Harassment, threats, or abuse can get your account suspended or banned.</li>
        <li>Bad words are hidden automatically in messages, posts, reviews and notes: they are saved and shown as a strip of tape with stars. The original word is not kept.</li>
        <li>Violations are reviewed by an admin, and a suspension or ban can be appealed.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Your work and ownership</h5>
      <p className="text-secondary">
        Photos, videos, and documents you upload stay yours. To help prove that, PhilFreela automatically adds an
        invisible mark to everything you post, which our Check Ownership tool can read back later if your work is found
        elsewhere. Work found to be copied from another freelancer on PhilFreela is flagged for review and can be
        removed.
      </p>
      <p className="text-secondary">
        Only post work that is yours. Posting someone else's work as your own, from PhilFreela or from anywhere else, is
        not allowed and can get your account suspended. If you see work that isn't the poster's own, use the Report
        button on the project, service, or profile, pick "Stolen work / plagiarism", and tell us where the original is.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Payments</h5>
      <ul className="text-secondary">
        <li>
          A freelancer can save a GCash number and the name on the GCash account in Settings. A client sees the number
          and only the initials of the name, and only on the page of a project with that freelancer or on the payment
          card the freelancer sends in a chat. They are not on the public profile.
        </li>
        <li>
          The client pays in their own GCash app, then records the payment on PhilFreela: the amount, the 13-digit GCash
          reference number and a screenshot of the receipt. The freelancer checks their own GCash and answers Confirm
          received or Not received. PhilFreela cannot see GCash, so it cannot check, hold, refund or guarantee any
          payment. The receipt is the client's proof on record, not a check by PhilFreela.
        </li>
        <li>Only confirm a payment when the money is in your GCash. Only pay people you trust, and check that the name GCash shows is the name on the payment card.</li>
        <li>
          A verified freelancer can ask a person to pay in a chat. Both can see the payment card there, and only the two of
          them can open the receipt.
        </li>
        <li>
          A payment answered Not received can be sent with a report, so an admin can see the amount, the reference and the
          receipt. Admins can't read anyone's payments otherwise. Sending a fake or edited receipt, confirming a payment
          that didn't arrive, or asking for payment for work you won't do can get your account suspended or banned.
        </li>
        <li>Payments made outside a project or a chat request are not recorded and are not covered by PhilFreela in any way.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">PhilFreela's own fees</h5>
      <ul className="text-secondary">
        <li>
          <strong className="text-white">Featured post:</strong> the owner of an offer or an open job post can pay to show it in a
          separate row marked "Featured" at the top of Browse Services or Find Jobs, for 3, 7 or 14 days. It is paid in your
          own GCash app to PhilFreela's GCash number shown on the page, and you send the reference number and a receipt
          screenshot. An admin checks PhilFreela's GCash and approves it, or rejects it with a reason; you are told either
          way. If a payment you really sent is rejected, send it again with the right details, or ask an admin to return it.
        </li>
        <li>
          <strong className="text-white">Premium (clients and freelancers):</strong> 30 days of a Premium badge by your name,
          half-price Featured posts and one free 3-day Featured post every 30 days, counts of how many people opened your
          posts and your profile (never who), chat files up to 50 MB, the two-color look and, for freelancers, up to 15
          offers instead of 3 and more watermark choices. It is paid on the checkout page of Xendit, a payment company,
          with GCash, Maya or QR Ph, and it starts by itself once Xendit confirms the payment. Paying again before it ends
          adds the days after the current end. When Premium ends, what you already have stays (your offers, a saved look),
          but you can't add more than the free limits. While PhilFreela is a student project, Premium runs in Xendit's test
          mode: no real money is charged.
        </li>
        <li><strong className="text-white">Sponsored billboards:</strong> businesses arrange these with PhilFreela directly. They are always marked "Sponsored by ...".</li>
        <li>Paying for any of these never changes the "Recommended for you" order, which stays based on ratings, completed projects and response time.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Ratings</h5>
      <p className="text-secondary">
        Once a project is marked done, both sides can rate each other once, within 14 days. Ratings are blind: your
        rating stays hidden from the other person, and from everyone else, until they have rated you too or the 14 days
        are over. After that, ratings are shown publicly on profiles. They can't be edited or removed, since they're
        meant to reflect real completed work.
      </p>
      <p className="text-secondary">
        A client can also rate and comment on a freelancer's offer, but only one they booked, and only once the project
        from that booking is marked done. That rating shows on the offer's page right away. Each client rates an offer
        once, and can remove their own rating and write a new one.
      </p>
      <p className="text-secondary">
        A profile also shows a track record other people can see: how many projects were marked done, how many of
        those were delivered by the due date, the title, finish date and other person of each completed project, and how
        quickly you usually reply in chats. The notes, files and links of a project stay private to the two people on it.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Ending your account</h5>
      <p className="text-secondary">
        You can delete your account at any time in Settings. We may suspend or ban an account that breaks these rules; a
        banned account is permanently deleted after 100 days. An admin may also archive an account: it is kept but
        can't be used, and it is permanently deleted after 100 days unless an admin restores it.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">No warranty</h5>
      <p className="text-secondary mb-0">
        PhilFreela is a student capstone project built to demonstrate these features, not a commercial service with a
        guaranteed uptime or support team. It's provided as-is, and the project isn't liable for disputes between
        freelancers and clients, who are responsible for arranging and reviewing their own work and payment. Because
        PhilFreela never holds the money, it cannot recover or refund a payment.
      </p>
    </section>
  );
}

// Written to match the five RA 10173 principles in
// PhilFreela-System-Functions.md's Feature 6, and to describe what the
// platform actually does (checked against the real database rules and AI
// service), not generic boilerplate.
function PrivacyPolicy() {
  return (
    <section>
      <h2 id="privacy-policy" className="text-white fw-bold fs-4 mb-3" style={{ scrollMarginTop: 24 }}>Part 2: Privacy Policy</h2>
      <p className="text-secondary">
        PhilFreela connects Filipino freelancers and clients. This part explains what information we collect, why, and the
        choices you have, following the Philippine Data Privacy Act of 2012 (RA 10173).
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">What we collect</h5>
      <ul className="text-secondary">
        <li>Account info: your name, username, email, gender, and the password you set (stored by our login provider in hashed form -- we never see or store it as plain text).</li>
        <li>Profile info you choose to add: a profile description, a profile picture, and, for freelancers, your portfolio and services.</li>
        <li>
          Identity verification (freelancers and clients): a government ID and a short face scan, used only to confirm you're a real
          person. This counts as sensitive personal information under RA 10173, so it's kept in a storage area no one but
          our review system can open, and never shown to other users -- they only see whether you're verified.
        </li>
        <li>Messages you send to other users, and files or portfolio work you upload (which carry an invisible, automatic ownership mark -- see "Your work and ownership" in Part 1).</li>
        <li>
          Messages you choose to send with a report. Admins can't read anyone's chats, so if you report someone from a
          chat, you tick the messages that show the problem. Only the ones you tick are copied, and only our admins can
          read them: the person you report can't, and neither can anyone else.
        </li>
        <li>
          GCash payment details (freelancers): the GCash number and the name on the account, saved in Settings. Only you
          can read your own name. A client sees only your number and the initials of your name, on the page of a project
          with you or on a payment card you send in a chat, so they can pay you. They are never on your public profile.
        </li>
        <li>
          Payment records: for a payment made through a project or a chat, the amount, the GCash reference number, the
          receipt screenshot, and when it was recorded and answered. Only the two people on a payment can read it. The
          receipt picture is kept in private storage. Admins can read a payment, and open its receipt, only when one of the
          two people sends it with a report.
        </li>
        <li>
          Fees you pay PhilFreela: for a Featured post, the amount, the GCash reference number and the receipt screenshot
          (only you and PhilFreela's admins can open the receipt); for Premium, the amount, when you paid, and
          Xendit's payment number. The GCash, Maya or QR Ph details you use for Premium are typed on Xendit's own page, and
          PhilFreela never sees them.
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
        PhilFreela does not process, hold or move the money between clients and freelancers: clients pay freelancers in
        the GCash app, and PhilFreela only records the payments people tell it about, so both sides can see what was sent
        and what was received. The only money PhilFreela takes is its own fees (see "PhilFreela's own fees" in Part 1).
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Consent and transparency</h5>
      <p className="text-secondary">
        Creating an account means you've agreed to this policy and to the Terms of Service in Part 1. Identity verification is
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
        features (search, recommendations, moodboard matching, and identity verification). When you pay for
        Premium, you pay on the page of Xendit, a payment company registered with the Bangko Sentral ng Pilipinas: PhilFreela
        sends Xendit only the amount and a payment number of its own, never your name or email, and what you type on
        Xendit's page is covered by Xendit's own privacy policy. We'd only share information with authorities if
        required by law.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">How long we keep it</h5>
      <p className="text-secondary">
        Your data stays while your account is active. If an account is banned, it's automatically and permanently
        deleted 100 days later (sooner if you successfully appeal), unless an appeal is still pending. If an admin
        archives an account, its data is kept but the account can't be used, and it is permanently deleted 100 days
        later unless an admin restores it. A report you sent, with any chat messages you sent along with it, is
        removed if you delete your account. Your GCash details are removed with your account, and so are the payment
        records of the payments you were on, and the records of the fees you paid PhilFreela. The receipt picture files
        stay in private storage, where nobody can open them once the record they belong to is gone.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Your rights</h5>
      <p className="text-secondary">
        You can:
      </p>
      <ul className="text-secondary">
        <li><strong className="text-white">Review</strong> what's stored about you on your own Profile, Settings and dashboard pages. If you want a copy of it, ask the project's developer (see Questions below).</li>
        <li><strong className="text-white">Update</strong> your profile information yourself, whenever you like.</li>
        <li><strong className="text-white">Delete</strong> your account in Settings, under Privacy &amp; Notifications, which removes your profile, posts, portfolio, and messages permanently. This can't be undone.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Questions</h5>
      <p className="text-secondary mb-0">
        PhilFreela is a capstone project built for a school requirement. If you have a question about your data, reach
        out to the project's developer through the contact details given alongside this project.
      </p>
    </section>
  );
}
