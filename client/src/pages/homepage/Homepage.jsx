import { Link } from "react-router-dom";
import "./homepage.css";

// Cross-page links below point at the old PHP site's relative paths, since those
// pages (dashboard, etc.) haven't been migrated to React yet.
const LEGACY = "/pages";

export default function Homepage() {
  return (
    <div className="bg-dark text-light">
      <nav className="navbar navbar-expand-lg sticky-top border-bottom border-secondary border-opacity-25" id="mainNavbar">
        <div className="container px-lg-4">
          <div className="d-flex align-items-center gap-3">
            <button className="navbar-toggler text-white border-0 shadow-none p-0" type="button" data-bs-toggle="offcanvas" data-bs-target="#mobileNav" aria-controls="mobileNav" aria-label="Toggle navigation">
              <i className="bi bi-list fs-1 text-warning"></i>
            </button>
            <Link className="navbar-brand d-flex align-items-center gap-2" to="/">
              <img src="/logo-philfreela.svg" alt="PhilFreela" className="logo-img" />
            </Link>
          </div>

          <div className="d-none d-lg-flex align-items-center gap-5">
            <Link to="/login?mode=signup&role=freelancer" className="nav-link text-white hover-orange font-weight-600">Join as Freelancer</Link>
            <Link to="/login?mode=signup&role=client" className="nav-link text-white hover-orange font-weight-600">Become a Client</Link>
            <a href={`${LEGACY}/dashboard/index.html?tab=services`} className="nav-link text-white hover-orange font-weight-600">Services</a>
            <Link to="/login" className="btn btn-gradient-orange px-4 py-2 rounded-pill fw-bold text-white shadow-glow">Sign In</Link>
          </div>
        </div>
      </nav>

      <div className="offcanvas offcanvas-start bg-dark text-white border-end border-secondary border-opacity-25" tabIndex="-1" id="mobileNav" aria-labelledby="mobileNavLabel">
        <div className="offcanvas-header border-bottom border-secondary border-opacity-25">
          <div className="d-flex align-items-center gap-2">
            <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 38 }} />
          </div>
          <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close"></button>
        </div>
        <div className="offcanvas-body d-flex flex-column justify-content-between p-4">
          <div className="d-flex flex-column gap-3">
            <Link to="/login?mode=signup&role=freelancer" className="mobile-nav-item"><i className="bi bi-person-workspace"></i> Join as Freelancer</Link>
            <Link to="/login?mode=signup&role=client" className="mobile-nav-item"><i className="bi bi-briefcase"></i> Become a Client</Link>
            <a href={`${LEGACY}/dashboard/index.html?tab=services`} className="mobile-nav-item"><i className="bi bi-grid"></i> Services</a>
            <a href={`${LEGACY}/dashboard/index.html`} className="mobile-nav-item"><i className="bi bi-speedometer2"></i> Dashboard</a>
          </div>
          <div className="pt-4 border-top border-secondary border-opacity-25">
            <Link to="/login" className="btn btn-gradient-orange w-100 py-3 rounded-3 fw-bold text-white shadow-glow text-center d-block text-decoration-none">Sign In to PhilFreela</Link>
          </div>
        </div>
      </div>

      <section className="hero">
        <div className="hero-bg">
          <div className="slide s1"></div>
          <div className="slide s2"></div>
          <div className="slide s3"></div>
          <div className="slide s4"></div>
        </div>

        <div className="hero-overlay-content container text-center">
          <div className="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill glass-pill mb-4 border border-warning border-opacity-25">
            <span className="pulse-dot"></span>
            <span className="fs-7 text-uppercase fw-bold text-amber">Welcome to PhilFreela</span>
          </div>
          <h1 className="welcome-heading fw-bold text-white mb-4">Where Filipino talent meets <span className="text-gradient-orange">global opportunity</span></h1>
          <p className="text-secondary fs-5 mx-auto mb-0" style={{ maxWidth: 640 }}>
            Connect with skilled Filipino freelancers or find the right client for your next project — all in one place.
          </p>
        </div>
      </section>

      <section className="pt-3 pb-5 position-relative">
        <div className="container cards-container py-2">
          <div className="row g-4">
            <div className="col-lg-6">
              <div className="pathway-card glass-card p-4 p-md-5 rounded-4 h-100 position-relative overflow-hidden border border-secondary border-opacity-25 hover-lift" style={{ animationDelay: "0s" }}>
                <div className="pathway-glow pathway-glow-orange"></div>
                <div className="d-flex justify-content-between align-items-start mb-4">
                  <div className="icon-box icon-box-lg bg-orange-subtle text-orange rounded-3">
                    <i className="bi bi-person-badge fs-2"></i>
                  </div>
                  <span className="badge bg-orange-subtle text-orange px-3 py-2 rounded-pill fw-semibold">FOR FREELANCERS</span>
                </div>

                <h2 className="pathway-title fw-bold text-white mb-3">Become One Of Us</h2>
                <p className="text-secondary fs-5 mb-4">
                  Showcase your skills, set your rates, connect with verified clients, and build your digital reputation in a high-growth platform.
                </p>

                <ul className="list-unstyled text-light-50 d-flex flex-column gap-2 mb-4">
                  <li><i className="bi bi-check-circle-fill text-orange me-2"></i> 0% platform hidden charges</li>
                  <li><i className="bi bi-check-circle-fill text-orange me-2"></i> Instant direct messaging with clients</li>
                  <li><i className="bi bi-check-circle-fill text-orange me-2"></i> Portfolio showcase with watermark protection</li>
                </ul>

                <Link to="/login?mode=signup&role=freelancer" className="btn btn-outline-warning btn-lg rounded-pill w-100 fw-bold hover-bg-orange">
                  Join as Freelancer <i className="bi bi-arrow-up-right ms-1"></i>
                </Link>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="pathway-card glass-card p-4 p-md-5 rounded-4 h-100 position-relative overflow-hidden border border-secondary border-opacity-25 hover-lift" style={{ animationDelay: "0.15s" }}>
                <div className="pathway-glow pathway-glow-cyan"></div>
                <div className="d-flex justify-content-between align-items-start mb-4">
                  <div className="icon-box icon-box-lg bg-cyan-subtle text-cyan rounded-3">
                    <i className="bi bi-briefcase fs-2"></i>
                  </div>
                  <span className="badge bg-cyan-subtle text-cyan px-3 py-2 rounded-pill fw-semibold">FOR CLIENTS</span>
                </div>

                <h2 className="pathway-title fw-bold text-white mb-3">Find A Talent</h2>
                <p className="text-secondary fs-5 mb-4">
                  Post job listings, review real portfolios, hire top-tier Filipino video editors, web developers, and designers with ease.
                </p>

                <ul className="list-unstyled text-light-50 d-flex flex-column gap-2 mb-4">
                  <li><i className="bi bi-check-circle-fill text-cyan me-2"></i> Verified talent profiles</li>
                  <li><i className="bi bi-check-circle-fill text-cyan me-2"></i> Real-time project tracking</li>
                  <li><i className="bi bi-check-circle-fill text-cyan me-2"></i> Easy resume &amp; pitch submissions</li>
                </ul>

                <Link to="/login?mode=signup&role=client" className="btn btn-outline-info btn-lg rounded-pill w-100 fw-bold hover-bg-cyan">
                  Become a Client <i className="bi bi-arrow-up-right ms-1"></i>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-5">
        <div className="container">
          <div className="text-center mb-4">
            <h2 className="display-6 fw-bold text-white mb-2">Explore Categories</h2>
            <p className="text-secondary mb-0">Find the right skillset for your next project.</p>
          </div>

          <div className="row g-4">
            <div className="col-6 col-lg-3">
              <a href={`${LEGACY}/dashboard/index.html?tab=services&category=video-editing`} className="category-tile glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift d-flex flex-column align-items-center text-center text-decoration-none" style={{ animationDelay: "0s" }}>
                <div className="category-icon orange mb-3">
                  <i className="bi bi-camera-reels-fill fs-4"></i>
                </div>
                <h6 className="text-white fw-bold mb-0">Video Editing</h6>
              </a>
            </div>

            <div className="col-6 col-lg-3">
              <a href={`${LEGACY}/dashboard/index.html?tab=services&category=graphic-design`} className="category-tile glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift d-flex flex-column align-items-center text-center text-decoration-none" style={{ animationDelay: "0.1s" }}>
                <div className="category-icon cyan mb-3">
                  <i className="bi bi-palette-fill fs-4"></i>
                </div>
                <h6 className="text-white fw-bold mb-0">Graphic Design</h6>
              </a>
            </div>

            <div className="col-6 col-lg-3">
              <a href={`${LEGACY}/dashboard/index.html?tab=services&category=web-development`} className="category-tile glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift d-flex flex-column align-items-center text-center text-decoration-none" style={{ animationDelay: "0.2s" }}>
                <div className="category-icon amber mb-3">
                  <i className="bi bi-code-slash fs-4"></i>
                </div>
                <h6 className="text-white fw-bold mb-0">Web Development</h6>
              </a>
            </div>

            <div className="col-6 col-lg-3">
              <a href={`${LEGACY}/dashboard/index.html?tab=services&category=copywriting`} className="category-tile glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift d-flex flex-column align-items-center text-center text-decoration-none" style={{ animationDelay: "0.3s" }}>
                <div className="category-icon emerald mb-3">
                  <i className="bi bi-pencil-fill fs-4"></i>
                </div>
                <h6 className="text-white fw-bold mb-0">Copywriting</h6>
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-top border-secondary border-opacity-25 bg-black py-5">
        <div className="container">
          <div className="row g-4 mb-4">
            <div className="col-lg-4">
              <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 42 }} className="mb-3" />
              <p className="text-secondary fs-7">
                PhilFreela is the leading freelance platform designed specifically to empower Filipino digital creators, freelancers, and businesses worldwide.
              </p>
              <div className="d-flex gap-3 text-secondary fs-5">
                <a href="#" className="text-secondary hover-orange"><i className="bi bi-facebook"></i></a>
                <a href="#" className="text-secondary hover-orange"><i className="bi bi-twitter-x"></i></a>
                <a href="#" className="text-secondary hover-orange"><i className="bi bi-linkedin"></i></a>
                <a href="#" className="text-secondary hover-orange"><i className="bi bi-instagram"></i></a>
              </div>
            </div>

            <div className="col-6 col-lg-2">
              <h6 className="text-white fw-bold mb-3">For Freelancers</h6>
              <ul className="list-unstyled d-flex flex-column gap-2 fs-7 text-secondary">
                <li><a href={`${LEGACY}/dashboard/index.html?tab=services`} className="text-secondary text-decoration-none hover-orange">Find Projects</a></li>
                <li><a href={`${LEGACY}/dashboard/index.html?tab=services`} className="text-secondary text-decoration-none hover-orange">Create Service</a></li>
                <li><a href={`${LEGACY}/dashboard/index.html?tab=profile`} className="text-secondary text-decoration-none hover-orange">Portfolio Builder</a></li>
                <li><a href="#" className="text-secondary text-decoration-none hover-orange">Freelance Guide</a></li>
              </ul>
            </div>

            <div className="col-6 col-lg-2">
              <h6 className="text-white fw-bold mb-3">For Clients</h6>
              <ul className="list-unstyled d-flex flex-column gap-2 fs-7 text-secondary">
                <li><a href={`${LEGACY}/dashboard/index.html?tab=messages`} className="text-secondary text-decoration-none hover-orange">Post a Job</a></li>
                <li><a href={`${LEGACY}/dashboard/index.html?tab=messages`} className="text-secondary text-decoration-none hover-orange">Browse Talents</a></li>
                <li><a href={`${LEGACY}/dashboard/index.html?tab=projects`} className="text-secondary text-decoration-none hover-orange">Manage Projects</a></li>
                <li><a href="#" className="text-secondary text-decoration-none hover-orange">Enterprise</a></li>
              </ul>
            </div>

            <div className="col-lg-4">
              <h6 className="text-white fw-bold mb-3">Stay Connected</h6>
              <p className="text-secondary fs-7">Subscribe to receive top job alerts &amp; freelance tips.</p>
              <div className="input-group">
                <input type="email" className="form-control bg-dark border-secondary border-opacity-50 text-white placeholder-muted fs-7" placeholder="Enter your email" />
                <button className="btn btn-gradient-orange px-3 text-white fw-bold fs-7">Subscribe</button>
              </div>
            </div>
          </div>

          <div className="d-flex flex-column flex-md-row justify-content-between align-items-center pt-4 border-top border-secondary border-opacity-25 fs-7 text-secondary">
            <p className="mb-2 mb-md-0">© 2026 PhilFreela. All rights reserved. Built for Filipino freelancers and global clients.</p>
            <div className="d-flex gap-4">
              <a href="#" className="text-secondary text-decoration-none hover-orange">Terms of Service</a>
              <a href="#" className="text-secondary text-decoration-none hover-orange">Privacy Policy</a>
              <a href="#" className="text-secondary text-decoration-none hover-orange">Security</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
