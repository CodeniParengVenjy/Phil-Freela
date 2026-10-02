import LegalLayout from "./LegalLayout";

// Practical rules matching what the platform actually enforces (watermarking,
// verification, suspensions), not generic boilerplate.
export default function TermsOfService() {
  return (
    <LegalLayout title="Terms of Service" updated="October 2026">
      <p className="text-secondary">
        These are the rules for using PhilFreela. By creating an account, you agree to them.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">What PhilFreela is</h5>
      <p className="text-secondary">
        PhilFreela is a platform for Filipino freelancers and clients to find each other, message, and arrange work
        directly. <strong className="text-white">PhilFreela does not process payments or transactions of any kind</strong> --
        any payment for work is arranged entirely between the freelancer and client, outside the platform.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Your account</h5>
      <ul className="text-secondary">
        <li>You're responsible for the accuracy of your profile and for keeping your login secure.</li>
        <li>Freelancers must pass identity verification before posting a service, so clients know they're dealing with a real person.</li>
        <li>One account per person. Accounts found to be fake are banned.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Posting and messaging</h5>
      <ul className="text-secondary">
        <li>Don't post spam, scams, or content that isn't yours to post.</li>
        <li>Be respectful in messages and calls. Harassment, threats, or abuse can get your account suspended or banned.</li>
        <li>Violations are reviewed by an admin, and a suspension or ban can be appealed.</li>
      </ul>

      <h5 className="text-white fw-bold mt-4 mb-2">Your work and ownership</h5>
      <p className="text-secondary">
        Photos, videos, and documents you upload stay yours. To help prove that, PhilFreela automatically adds an
        invisible mark to everything you post, which our Check Ownership tool can read back later if your work is found
        elsewhere. Work found to be copied from another freelancer on PhilFreela is flagged for review and can be
        removed.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Ratings</h5>
      <p className="text-secondary">
        Once a project is marked done, both sides can rate each other once. Ratings are shown publicly on profiles and
        can't be edited or removed afterward, since they're meant to reflect real completed work.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">Ending your account</h5>
      <p className="text-secondary">
        You can delete your account at any time in Settings. We may suspend or ban an account that breaks these rules; a
        banned account is permanently deleted after 100 days.
      </p>

      <h5 className="text-white fw-bold mt-4 mb-2">No warranty</h5>
      <p className="text-secondary mb-0">
        PhilFreela is a student capstone project built to demonstrate these features, not a commercial service with a
        guaranteed uptime or support team. It's provided as-is, and the project isn't liable for disputes between
        freelancers and clients, who are responsible for arranging and reviewing their own work and payment.
      </p>
    </LegalLayout>
  );
}
