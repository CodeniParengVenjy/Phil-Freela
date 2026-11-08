import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { resolvePostAuthRoute } from "../../lib/profile";
import "./homepage.css";
import OpeningIntro from "../../components/OpeningIntro";

export default function Homepage() {
  // Where the logo goes: "/" for visitors, or the signed-in user's own
  // dashboard (freelancer, client, or admin) so they never land back here.
  const [logoHref, setLogoHref] = useState("/");
  // A sponsor back from paying for a billboard on Xendit's page (the payment
  // link the super admin sent them, PLAN-premium.md): ?sponsor=paid or canceled.
  const [searchParams, setSearchParams] = useSearchParams();
  const sponsor = searchParams.get("sponsor");
  // The opening (components/OpeningIntro.jsx) brings these in at its end: the
  // whole page, and the top bar's logo, where its flying logo lands.
  const pageRef = useRef(null);
  const logoRef = useRef(null);
  // The phone menu (Bootstrap's offcanvas, below).
  const mobileNavRef = useRef(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active || !session) return;
      try {
        const destination = await resolvePostAuthRoute(session.user);
        if (active) setLogoHref(destination);
      } catch {
        // The account checks failed, so the logo stays on "/".
      }
    });
    return () => { active = false; };
  }, []);

  // The phone menu stops the page from scrolling while it is open, and Bootstrap
  // lets the page scroll again when the menu closes. Its links (Sign In, Join as
  // Freelancer, Become a Client) open another page while the menu is still open,
  // so the homepage was gone before that could happen, and the sign-in page then
  // couldn't be scrolled on a phone: a phone held sideways couldn't reach its
  // Sign In button (2026-11-08). Closing the menu when the homepage goes (also
  // after the browser's Back button) lets Bootstrap undo the lock.
  useEffect(() => {
    const menu = mobileNavRef.current;
    return () => window.bootstrap?.Offcanvas.getInstance(menu)?.hide();
  }, []);

  // Links that open "the app": a signed-in person goes to their own dashboard,
  // a visitor to the sign-in page (every dashboard page needs an account). These
  // are plain links, not router links, so the next page opens at its top.
  const dashboardHref = logoHref === "/" ? "/login" : logoHref;

  return (
    <div className="bg-dark text-light" ref={pageRef}>
      {/* The opening, the first time in a visit (not when back from a sponsor
          payment, whose message has to show at once). */}
      <OpeningIntro pageRef={pageRef} logoRef={logoRef} skip={sponsor === "paid" || sponsor === "canceled"} />

      <nav className="navbar navbar-expand-lg sticky-top border-bottom border-secondary border-opacity-25" id="mainNavbar">
        <div className="container px-lg-4">
          <div className="d-flex align-items-center gap-3">
            <button className="navbar-toggler text-white border-0 shadow-none p-0" type="button" data-bs-toggle="offcanvas" data-bs-target="#mobileNav" aria-controls="mobileNav" aria-label="Toggle navigation">
              <i className="bi bi-list fs-1 text-warning"></i>
            </button>
            <Link className="navbar-brand d-flex align-items-center gap-2" to={logoHref}>
              <img ref={logoRef} src="/logo-philfreela.svg" alt="PhilFreela" className="logo-img" />
            </Link>
          </div>

          <div className="d-none d-lg-flex align-items-center gap-5">
            <Link to="/login?mode=signup&role=freelancer" className="nav-link text-white hover-orange font-weight-600">Join as Freelancer</Link>
            <Link to="/login?mode=signup&role=client" className="nav-link text-white hover-orange font-weight-600">Become a Client</Link>
            <a href={dashboardHref} className="nav-link text-white hover-orange font-weight-600">Services</a>
            <Link to="/login" className="btn btn-gradient-orange px-4 py-2 rounded-pill fw-bold text-white shadow-glow">Sign In</Link>
          </div>
        </div>
      </nav>

      {(sponsor === "paid" || sponsor === "canceled") && (
        <div className="container px-lg-4 pt-3">
          <div className={`alert ${sponsor === "paid" ? "alert-success" : "alert-warning"} d-flex align-items-start gap-2 mb-0`} role="status">
            <i className={`bi ${sponsor === "paid" ? "bi-check-circle-fill" : "bi-info-circle-fill"} mt-1`}></i>
            <div className="flex-grow-1">
              {sponsor === "paid"
                ? "Thank you for sponsoring PhilFreela! Once Xendit confirms your payment, your billboard shows on the dashboards from its first day."
                : "The payment wasn't finished, so nothing was paid. You can try the link again, or ask PhilFreela for a new one."}
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={() => setSearchParams({}, { replace: true })}></button>
          </div>
        </div>
      )}

      <div ref={mobileNavRef} className="offcanvas offcanvas-start bg-dark text-white border-end border-secondary border-opacity-25" tabIndex="-1" id="mobileNav" aria-labelledby="mobileNavLabel">
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
            <a href={dashboardHref} className="mobile-nav-item"><i className="bi bi-grid"></i> Services</a>
            <a href={dashboardHref} className="mobile-nav-item"><i className="bi bi-speedometer2"></i> Dashboard</a>
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
          <p className="hero-subtext fs-5 mx-auto mb-0" style={{ maxWidth: 720 }}>
            Get discovered by clients who value your craft, or hire Filipino creatives who bring your ideas to life.
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
              <a href={dashboardHref} className="category-tile glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift d-flex flex-column align-items-center text-center text-decoration-none" style={{ animationDelay: "0s" }}>
                <div className="category-icon orange mb-3">
                  <i className="bi bi-camera-reels-fill fs-4"></i>
                </div>
                <h6 className="text-white fw-bold mb-0">Video Editing</h6>
              </a>
            </div>

            <div className="col-6 col-lg-3">
              <a href={dashboardHref} className="category-tile glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift d-flex flex-column align-items-center text-center text-decoration-none" style={{ animationDelay: "0.1s" }}>
                <div className="category-icon cyan mb-3">
                  <i className="bi bi-palette-fill fs-4"></i>
                </div>
                <h6 className="text-white fw-bold mb-0">Graphic Design</h6>
              </a>
            </div>

            <div className="col-6 col-lg-3">
              <a href={dashboardHref} className="category-tile glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift d-flex flex-column align-items-center text-center text-decoration-none" style={{ animationDelay: "0.2s" }}>
                <div className="category-icon amber mb-3">
                  <i className="bi bi-code-slash fs-4"></i>
                </div>
                <h6 className="text-white fw-bold mb-0">Web Development</h6>
              </a>
            </div>

            <div className="col-6 col-lg-3">
              <a href={dashboardHref} className="category-tile glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 hover-lift d-flex flex-column align-items-center text-center text-decoration-none" style={{ animationDelay: "0.3s" }}>
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
            <div className="col-lg-6">
              <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 42 }} className="mb-3" />
              <p className="text-secondary fs-7">
                PhilFreela is the leading freelance platform designed specifically to empower Filipino digital creators, freelancers, and businesses worldwide.
              </p>
            </div>

            <div className="col-6 col-lg-3">
              <h6 className="text-white fw-bold mb-3">For Freelancers</h6>
              <ul className="list-unstyled d-flex flex-column gap-2 fs-7 text-secondary">
                <li><a href="/dashboard/find-jobs" className="text-secondary text-decoration-none hover-orange">Find Projects</a></li>
                <li><a href="/dashboard/services" className="text-secondary text-decoration-none hover-orange">Create Service</a></li>
                <li><a href="/dashboard/profile" className="text-secondary text-decoration-none hover-orange">Portfolio Builder</a></li>
              </ul>
            </div>

            <div className="col-6 col-lg-3">
              <h6 className="text-white fw-bold mb-3">For Clients</h6>
              <ul className="list-unstyled d-flex flex-column gap-2 fs-7 text-secondary">
                <li><a href="/dashboard/post-need" className="text-secondary text-decoration-none hover-orange">Post a Job</a></li>
                <li><a href={dashboardHref} className="text-secondary text-decoration-none hover-orange">Browse Talents</a></li>
                <li><a href="/dashboard/projects" className="text-secondary text-decoration-none hover-orange">Manage Projects</a></li>
              </ul>
            </div>
          </div>

          <div className="d-flex flex-column flex-md-row justify-content-between align-items-center pt-4 border-top border-secondary border-opacity-25 fs-7 text-secondary">
            <p className="mb-2 mb-md-0">© 2026 PhilFreela. All rights reserved. Built for Filipino freelancers and global clients.</p>
            <div className="d-flex gap-4">
              <Link to="/terms" className="text-secondary text-decoration-none hover-orange">Terms of Service</Link>
              <Link to="/privacy" className="text-secondary text-decoration-none hover-orange">Privacy Policy</Link>
              <Link to="/security" className="text-secondary text-decoration-none hover-orange">Security</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
