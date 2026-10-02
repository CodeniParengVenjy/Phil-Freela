import { Link } from "react-router-dom";

// Shared look for the Terms of Service and Privacy Policy pages: a slim
// header (so these work for a visitor who isn't signed in yet), the content
// in a card, and a note that this is a capstone project, not a company.
export default function LegalLayout({ title, updated, children }) {
  return (
    <div className="bg-dark min-vh-100 text-white">
      <nav className="navbar border-bottom border-secondary border-opacity-25">
        <div className="container py-2">
          <Link to="/" className="navbar-brand d-flex align-items-center gap-2 m-0">
            <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 32 }} />
          </Link>
        </div>
      </nav>

      <div className="container py-5" style={{ maxWidth: 820 }}>
        <Link to="/" className="text-secondary text-decoration-none fs-7"><i className="bi bi-arrow-left me-1"></i> Back to PhilFreela</Link>

        <h1 className="fw-bold mt-3 mb-1">{title}</h1>
        <p className="text-secondary fs-7 mb-4">Last updated {updated}</p>

        <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 fs-7">
          {children}
        </div>

        <p className="text-secondary fs-8 mt-4">
          PhilFreela is a student capstone project, not a registered company. This page explains, in plain language, how the
          platform actually handles your information while you try it out.
        </p>
      </div>
    </div>
  );
}
