import { useEffect } from "react";
import { Link } from "react-router-dom";
import LegalLayout from "./LegalLayout";

// The footer's Security page. Every line here describes something PhilFreela
// really does today (checked against the live database, the storage buckets,
// public/_headers and the code on 2026-11-04). Do not add a promise the
// platform doesn't keep: no "bank-grade", no two-step sign-in, no spam check.
export default function Security() {
  // The footer is far down the homepage, and the app keeps the old scroll
  // position when a link opens a new page, so start at the top.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  return (
    <LegalLayout title="Security at PhilFreela" updated="November 2026">
      <p className="text-secondary">
        This page explains, in plain words, how PhilFreela protects your account, your files and your payment records,
        and what you can do to stay safe. It only lists what the platform does today. For what we collect and why, see
        the <Link to="/privacy" className="text-white hover-orange">Privacy Policy</Link>, and for the rules, the{" "}
        <Link to="/terms" className="text-white hover-orange">Terms of Service</Link>.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Your account</h5>
      <ul className="text-secondary">
        <li>Your password is kept by our login provider in hashed form. We can't see it, and we can't send it to you; if you forget it, you set a new one.</li>
        <li>Admins sign in on their own admin page. A newly added admin must choose their own password before anything in the admin panel opens, and the database itself enforces this, not only the page.</li>
        <li>Important admin actions, such as suspending or banning an account, approving a verification or removing a post, are written to an Activity Log by the database itself, so they can be looked at afterwards.</li>
        <li>A suspended or banned account can't be used, and you can delete your own account at any time in Settings.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Real people</h5>
      <ul className="text-secondary">
        <li>Freelancers verify their identity (a government ID and a short face scan) before posting a service, and clients before posting a project or job.</li>
        <li>One account per person: a face already used on another account is flagged to an admin.</li>
        <li>The Verified mark only means PhilFreela checked a person's ID and face scan. It is not a promise that they will deliver the work or pay, so look at ratings and finished projects too.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Your files and private information</h5>
      <ul className="text-secondary">
        <li>The database decides, record by record, who may read or change what. This is switched on for every table, so it doesn't depend on the website alone.</li>
        <li>
          Private things are kept in private storage that is closed to the public: your ID and face scan, payment
          receipts, chat photos, videos and files, work you deliver to a client, evidence sent with a report, and resumes.
          They open only through short-lived links that stop working after a while.
        </li>
        <li>Your ID and face scan are never shown to other users. They only see whether you are verified.</li>
        <li>Only things meant to be seen are public: profile and cover pictures, offer pictures, ad pictures and the previews of a freelancer's work.</li>
        <li>Admins can't read anyone's chats. If you report someone from a chat, only the messages you choose to send are copied to the admins.</li>
        <li>Photos, videos and documents you post get an invisible ownership mark, so you can show the work is yours if it turns up somewhere else.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Payments</h5>
      <ul className="text-secondary">
        <li>PhilFreela never holds or moves the money between a client and a freelancer. They pay each other in their own GCash app.</li>
        <li>A freelancer's GCash number is shown only to a client who is working with them, with only the initials of the account name, and never on the public profile.</li>
        <li>When you pay PhilFreela for Premium, a Featured post or an ad, you pay on the checkout page of Xendit, a payment company. You type your payment details there, and PhilFreela never sees them.</li>
        <li>Only confirm a payment when the money is really in your GCash, and only pay people you trust. Check that the name GCash shows matches the person.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Keeping the community safe</h5>
      <ul className="text-secondary">
        <li>Every profile, project, service and chat has a Report button. An admin reviews each report, and a suspension or ban can be appealed.</li>
        <li>Bad words in messages, posts, reviews and notes are hidden automatically, and names with a bad word are not accepted.</li>
        <li>Ads on the Community Billboard are read by an admin before they run, and can't contain links.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">The website itself</h5>
      <ul className="text-secondary">
        <li>PhilFreela is served over an encrypted (HTTPS) connection.</li>
        <li>No other website can show PhilFreela inside its own frame, which stops a hidden-button trick (clickjacking).</li>
        <li>Browsers are told not to guess a file's type, so an uploaded picture can never run as a script.</li>
        <li>Only PhilFreela itself can ask for your camera and microphone (face scan, calls, voice messages). Your location is never used.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">What you can do</h5>
      <ul className="text-secondary">
        <li>Use a strong password that you don't use anywhere else, and never share it. PhilFreela will never ask you for it.</li>
        <li>Sign out when you use a shared or public computer.</li>
        <li>Keep chats and payments on PhilFreela, where the record helps if something goes wrong. A report can only include messages that were sent here.</li>
        <li>Be careful with links and files from people you don't know, and report anything that looks like a scam.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Found a problem?</h5>
      <p className="text-secondary">
        If someone is abusing the platform, use the Report button on their profile, post or chat. If you think you found a
        weakness in the website itself, please don't use it or share it. Tell the project's developer through the contact
        details given alongside this project, so it can be fixed.
      </p>

      <p className="text-secondary mb-0">
        PhilFreela is a student capstone project. No website is perfectly secure, so we describe what is in place
        instead of promising more than that, and we keep improving it.
      </p>
    </LegalLayout>
  );
}
