import { Link } from "react-router-dom";
import "./homepage.css";

// Cross-page links below point at the old PHP site's relative paths, since those
// pages (dashboard, etc.) haven't been migrated to React yet. Only /login is an
// in-app route so far.
const LEGACY = "/pages";

export default function Homepage() {
  return (
    <div className="bg-dark text-light">
      <nav className="navbar navbar-expand-lg sticky-top border-bottom border-secondary border-opacity-25" id="mainNavbar">
        <div className="container-fluid px-lg-5">
          <div className="d-flex align-items-center gap-3">
            <button className="navbar-toggler text-white border-0 shadow-none p-0" type="button" data-bs-toggle="offcanvas" data-bs-target="#mobileNav" aria-controls="mobileNav" aria-label="Toggle navigation">
              <i className="bi bi-list fs-1 text-warning"></i>
            </button>
            <Link className="navbar-brand d-flex align-items-center gap-2" to="/">
              <img src="/logo-philfreela.svg" alt="PhilFreela" className="logo-img" />
            </Link>
          </div>

          <div className="d-none d-lg-flex mx-auto search-nav-box position-relative" style={{ maxWidth: 480, width: "100%" }}>
            <i className="bi bi-search search-icon"></i>
            <input type="search" id="topNavSearch" className="form-control nav-search-input" placeholder="Search services, skills, or projects..." />
          </div>

          <div className="d-none d-lg-flex align-items-center gap-4">
            <a href={`${LEGACY}/dashboard/index.html?tab=services`} className="nav-link text-white hover-orange font-weight-600">Join as Freelancer</a>
            <a href={`${LEGACY}/dashboard/index.html?tab=messages`} className="nav-link text-white hover-orange font-weight-600">Become a Client</a>
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
            <div className="position-relative mb-2">
              <i className="bi bi-search search-icon"></i>
              <input type="search" className="form-control nav-search-input" placeholder="Search talents..." />
            </div>
            <a href={`${LEGACY}/dashboard/index.html?tab=services`} className="mobile-nav-item"><i className="bi bi-person-workspace"></i> Join as Freelancer</a>
            <a href={`${LEGACY}/dashboard/index.html?tab=messages`} className="mobile-nav-item"><i className="bi bi-briefcase"></i> Become a Client</a>
            <a href={`${LEGACY}/dashboard/index.html?tab=services`} className="mobile-nav-item"><i className="bi bi-grid"></i> Services</a>
            <a href={`${LEGACY}/dashboard/index.html`} className="mobile-nav-item"><i className="bi bi-speedometer2"></i> Dashboard</a>
          </div>
          <div className="pt-4 border-top border-secondary border-opacity-25">
            <Link to="/login" className="btn btn-gradient-orange w-100 py-3 rounded-3 fw-bold text-white shadow-glow text-center d-block text-decoration-none">Sign In to PhilFreela</Link>
          </div>
        </div>
      </div>

      <section className="hero-wrapper position-relative d-flex align-items-center justify-content-center text-center">
        <div className="hero-bg-overlay"></div>

        <div className="container position-relative z-2 py-5">
          <div className="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill glass-pill mb-4 border border-warning border-opacity-25 animate-pop">
            <span className="pulse-dot"></span>
            <span className="fs-7 text-uppercase tracking-wider fw-bold text-amber">The #1 Filipino Freelancers Hub</span>
          </div>

          <h1 className="hero-title display-2 fw-black text-white mb-3">
            Enhance your talent and <br />
            <span className="text-gradient-orange">earn with your services</span>
          </h1>

          <p className="hero-subtitle lead text-light-50 max-w-700 mx-auto mb-5">
            Connect top Filipino digital talents with ambitious clients worldwide. Showcase your portfolio, pitch for projects, and scale your creative career.
          </p>

          <div className="search-hero-card mx-auto p-2 rounded-4 glass-card shadow-2xl mb-5 max-w-750">
            <form className="d-flex flex-column flex-md-row gap-2" action={`${LEGACY}/dashboard/index.html`} method="GET">
              <div className="input-group input-group-lg border-0 bg-transparent">
                <span className="input-group-text bg-transparent border-0 text-white-50"><i className="bi bi-search fs-4"></i></span>
                <input type="text" name="search" className="form-control bg-transparent border-0 text-white placeholder-muted shadow-none" placeholder="Try 'Logo Designer', 'Video Editor', 'Web Developer'..." />
              </div>
              <button type="submit" className="btn btn-gradient-orange btn-lg px-4 rounded-3 text-nowrap font-weight-700 text-white d-flex align-items-center justify-content-center gap-2">
                <span>Provide a portfolio</span>
                <i className="bi bi-arrow-right"></i>
              </button>
            </form>
          </div>

          <div className="d-flex flex-wrap justify-content-center align-items-center gap-2">
            <span className="text-white-50 fs-7 me-2">Popular:</span>
            <a href={`${LEGACY}/dashboard/index.html?role=video-editor`} className="category-chip"><i className="bi bi-camera-video me-1"></i> Video Editing</a>
            <a href={`${LEGACY}/dashboard/index.html?role=graphic-designer`} className="category-chip"><i className="bi bi-palette me-1"></i> Graphic Design</a>
            <a href={`${LEGACY}/dashboard/index.html?role=web-developer`} className="category-chip"><i className="bi bi-code-slash me-1"></i> Web Development</a>
            <a href={`${LEGACY}/dashboard/index.html?role=copywriting`} className="category-chip"><i className="bi bi-pen me-1"></i> Copywriting</a>
          </div>
        </div>
      </section>

      <section className="py-5 position-relative">
        <div className="container py-4">
          <div className="row g-4">
            <div className="col-lg-6">
              <div className="pathway-card glass-card p-4 p-md-5 rounded-4 h-100 position-relative overflow-hidden border border-secondary border-opacity-25 hover-lift">
                <div className="pathway-glow pathway-glow-orange"></div>
                <div className="d-flex justify-content-between align-items-start mb-4">
                  <div className="icon-box icon-box-lg bg-orange-subtle text-orange rounded-3">
                    <i className="bi bi-person-badge fs-2"></i>
                  </div>
                  <span className="badge bg-orange-subtle text-orange px-3 py-2 rounded-pill fw-semibold">FOR FREELANCERS</span>
                </div>

                <h2 className="display-6 fw-bold text-white mb-3">Become One Of Us</h2>
                <p className="text-secondary fs-5 mb-4">
                  Showcase your skills, set your rates, connect with verified clients, and build your digital reputation in a high-growth platform.
                </p>

                <ul className="list-unstyled text-light-50 d-flex flex-column gap-2 mb-4">
                  <li><i className="bi bi-check-circle-fill text-orange me-2"></i> 0% platform hidden charges</li>
                  <li><i className="bi bi-check-circle-fill text-orange me-2"></i> Instant direct messaging with clients</li>
                  <li><i className="bi bi-check-circle-fill text-orange me-2"></i> Portfolio showcase with watermark protection</li>
                </ul>

                <a href={`${LEGACY}/dashboard/index.html?tab=services`} className="btn btn-outline-warning btn-lg rounded-pill w-100 fw-bold hover-bg-orange">
                  Join as Freelancer <i className="bi bi-arrow-up-right ms-1"></i>
                </a>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="pathway-card glass-card p-4 p-md-5 rounded-4 h-100 position-relative overflow-hidden border border-secondary border-opacity-25 hover-lift">
                <div className="pathway-glow pathway-glow-cyan"></div>
                <div className="d-flex justify-content-between align-items-start mb-4">
                  <div className="icon-box icon-box-lg bg-cyan-subtle text-cyan rounded-3">
                    <i className="bi bi-briefcase fs-2"></i>
                  </div>
                  <span className="badge bg-cyan-subtle text-cyan px-3 py-2 rounded-pill fw-semibold">FOR CLIENTS</span>
                </div>

                <h2 className="display-6 fw-bold text-white mb-3">Find A Talent</h2>
                <p className="text-secondary fs-5 mb-4">
                  Post job listings, review real portfolios, hire top-tier Filipino video editors, web developers, and designers with ease.
                </p>

                <ul className="list-unstyled text-light-50 d-flex flex-column gap-2 mb-4">
                  <li><i className="bi bi-check-circle-fill text-cyan me-2"></i> Verified talent profiles &amp; ratings</li>
                  <li><i className="bi bi-check-circle-fill text-cyan me-2"></i> Real-time project tracking</li>
                  <li><i className="bi bi-check-circle-fill text-cyan me-2"></i> Easy resume &amp; pitch submissions</li>
                </ul>

                <a href={`${LEGACY}/dashboard/index.html?tab=messages`} className="btn btn-outline-info btn-lg rounded-pill w-100 fw-bold hover-bg-cyan">
                  Become a Client <i className="bi bi-arrow-up-right ms-1"></i>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-4 border-top border-bottom border-secondary border-opacity-25 bg-dark-subtle">
        <div className="container">
          <div className="row text-center g-4">
            <div className="col-6 col-md-3">
              <h2 className="display-5 fw-extrabold text-orange mb-0 counter" data-target="15000">15,000+</h2>
              <p className="text-secondary mb-0 fw-medium">Active Freelancers</p>
            </div>
            <div className="col-6 col-md-3">
              <h2 className="display-5 fw-extrabold text-white mb-0 counter" data-target="8200">8,200+</h2>
              <p className="text-secondary mb-0 fw-medium">Completed Projects</p>
            </div>
            <div className="col-6 col-md-3">
              <h2 className="display-5 fw-extrabold text-warning mb-0 counter" data-target="99">99.4%</h2>
              <p className="text-secondary mb-0 fw-medium">Client Satisfaction</p>
            </div>
            <div className="col-6 col-md-3">
              <h2 className="display-5 fw-extrabold text-info mb-0 counter" data-target="4.9">4.9 / 5</h2>
              <p className="text-secondary mb-0 fw-medium">Average Rating</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-5">
        <div className="container py-4">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end mb-4">
            <div>
              <span className="text-orange fw-bold text-uppercase tracking-wider fs-7">Top Skillsets</span>
              <h2 className="display-6 fw-bold text-white mb-0">Explore Trending Services</h2>
            </div>
            <a href={`${LEGACY}/dashboard/index.html?tab=services`} className="btn btn-link text-warning text-decoration-none fw-semibold p-0 mt-2 mt-md-0">
              View All Services <i className="bi bi-arrow-right ms-1"></i>
            </a>
          </div>

          <div className="row g-4">
            <div className="col-md-6 col-lg-4">
              <div className="glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift">
                <div className="d-flex align-items-center gap-3 mb-3">
                  <div className="avatar-box rounded-circle bg-orange text-white fw-bold d-flex align-items-center justify-content-center" style={{ width: 48, height: 48 }}>
                    KO
                  </div>
                  <div>
                    <h5 className="text-white mb-0 fw-bold">Keanne Obias</h5>
                    <small className="text-warning"><i className="bi bi-star-fill"></i> 4.9 (67 reviews)</small>
                  </div>
                </div>
                <h6 className="text-light fw-semibold mb-2">Pro Video Editing &amp; Motion Graphics</h6>
                <p className="text-secondary fs-7 mb-3">High-converting YouTube videos, Reels, TikTok edits with custom motion design.</p>
                <div className="d-flex flex-wrap gap-1 mb-3">
                  <span className="badge bg-secondary bg-opacity-50 text-light fw-normal fs-8">Video Editor</span>
                  <span className="badge bg-secondary bg-opacity-50 text-light fw-normal fs-8">Graphic Designer</span>
                </div>
                <div className="d-flex justify-content-between align-items-center pt-3 border-top border-secondary border-opacity-25">
                  <span className="text-secondary fs-8">Starting at</span>
                  <span className="fs-5 fw-bold text-orange">₱3,500</span>
                </div>
              </div>
            </div>

            <div className="col-md-6 col-lg-4">
              <div className="glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift">
                <div className="d-flex align-items-center gap-3 mb-3">
                  <div className="avatar-box rounded-circle bg-info text-white fw-bold d-flex align-items-center justify-content-center" style={{ width: 48, height: 48 }}>
                    JC
                  </div>
                  <div>
                    <h5 className="text-white mb-0 fw-bold">Juan Cruz</h5>
                    <small className="text-warning"><i className="bi bi-star-fill"></i> 5.0 (42 reviews)</small>
                  </div>
                </div>
                <h6 className="text-light fw-semibold mb-2">Modern Web Development &amp; React Apps</h6>
                <p className="text-secondary fs-7 mb-3">Responsive web design, custom landing pages, e-commerce, and full-stack solutions.</p>
                <div className="d-flex flex-wrap gap-1 mb-3">
                  <span className="badge bg-secondary bg-opacity-50 text-light fw-normal fs-8">Web Developer</span>
                  <span className="badge bg-secondary bg-opacity-50 text-light fw-normal fs-8">UI/UX</span>
                </div>
                <div className="d-flex justify-content-between align-items-center pt-3 border-top border-secondary border-opacity-25">
                  <span className="text-secondary fs-8">Starting at</span>
                  <span className="fs-5 fw-bold text-info">₱8,000</span>
                </div>
              </div>
            </div>

            <div className="col-md-6 col-lg-4">
              <div className="glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift">
                <div className="d-flex align-items-center gap-3 mb-3">
                  <div className="avatar-box rounded-circle bg-success text-white fw-bold d-flex align-items-center justify-content-center" style={{ width: 48, height: 48 }}>
                    JD
                  </div>
                  <div>
                    <h5 className="text-white mb-0 fw-bold">Jack Doe</h5>
                    <small className="text-warning"><i className="bi bi-star-fill"></i> 5.0 (89 reviews)</small>
                  </div>
                </div>
                <h6 className="text-light fw-semibold mb-2">Brand Identity &amp; Cafe/Business Logo Design</h6>
                <p className="text-secondary fs-7 mb-3">Unique vector logo creation, brand guidelines, cafe billboard poster graphics.</p>
                <div className="d-flex flex-wrap gap-1 mb-3">
                  <span className="badge bg-secondary bg-opacity-50 text-light fw-normal fs-8">Graphic Designer</span>
                  <span className="badge bg-secondary bg-opacity-50 text-light fw-normal fs-8">Branding</span>
                </div>
                <div className="d-flex justify-content-between align-items-center pt-3 border-top border-secondary border-opacity-25">
                  <span className="text-secondary fs-8">Starting at</span>
                  <span className="fs-5 fw-bold text-success">₱2,800</span>
                </div>
              </div>
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
