import { NavLink } from "react-router-dom";

// Identical between the freelancer and client dashboards -- brand, search,
// the three quick links, and the account dropdown -- so both layouts share
// this instead of each keeping their own copy.
export default function DashboardTopNav({ displayName, accountType, onToggleSidebar, onSignOut, onSwitchRole }) {
  const switchLabel = accountType === "client" ? "Switch to Freelancer" : "Switch to Client";
  const switchHref = accountType === "client" ? "/dashboard-freelancer" : "/dashboard-client";
  return (
    <nav className="navbar navbar-expand-lg fixed-top border-bottom border-secondary border-opacity-25" id="topNavbar">
      <div className="container-fluid px-3 px-lg-4">
        <div className="d-flex align-items-center gap-3">
          <button
            className="btn btn-outline-secondary text-white border-0 shadow-none p-1"
            type="button"
            aria-label="Toggle Sidebar"
            onClick={onToggleSidebar}
          >
            <i className="bi bi-list fs-2 text-warning"></i>
          </button>
          <NavLink to="/" className="navbar-brand d-flex align-items-center gap-2 m-0">
            <img src="/logo-philfreela.svg" alt="PhilFreela" className="logo-img" />
          </NavLink>
        </div>

        <div className="d-none d-md-flex mx-auto position-relative search-nav-box" style={{ width: 380 }}>
          <i className="bi bi-search search-icon text-secondary"></i>
          <input type="search" className="form-control nav-search-input" placeholder="Search profiles, jobs, inbox..." />
        </div>

        <div className="d-flex align-items-center gap-3">
          {accountType !== "freelancer" && (
            <a href="/dashboard-freelancer" className="nav-link text-white-50 hover-orange d-none d-lg-block fw-semibold fs-7" onClick={(event) => onSwitchRole(event, "freelancer")}>Join as Freelancer</a>
          )}
          {accountType !== "client" && (
            <a href="/dashboard-client" className="nav-link text-white-50 hover-orange d-none d-lg-block fw-semibold fs-7" onClick={(event) => onSwitchRole(event, "client")}>Become a Client</a>
          )}
          <NavLink to="/dashboard/services" className="nav-link text-white-50 hover-orange d-none d-lg-block fw-semibold fs-7">Services</NavLink>

          <div className="dropdown">
            <button className="btn btn-dark border border-secondary border-opacity-50 rounded-pill d-flex align-items-center gap-2 px-3 py-1 dropdown-toggle text-white" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              <span className="avatar-circle-sm bg-orange text-white fw-bold">{displayName.charAt(0).toUpperCase()}</span>
              <span className="fw-semibold fs-7 text-truncate d-none d-sm-inline">{displayName}</span>
            </button>
            <ul className="dropdown-menu dropdown-menu-end dropdown-menu-dark border border-secondary border-opacity-25 shadow-lg p-2">
              <li><NavLink className="dropdown-item rounded-2 text-white" to="/dashboard/profile"><i className="bi bi-person me-2 text-orange"></i> My Profile</NavLink></li>
              <li><NavLink className="dropdown-item rounded-2 text-white" to="/dashboard/settings"><i className="bi bi-gear me-2 text-info"></i> Account Settings</NavLink></li>
              <li><a className="dropdown-item rounded-2 text-white" href={switchHref} onClick={onSwitchRole}><i className="bi bi-arrow-left-right me-2 text-warning"></i> {switchLabel}</a></li>
              <li><hr className="dropdown-divider border-secondary border-opacity-25" /></li>
              <li><a className="dropdown-item rounded-2 text-danger" href="/login" onClick={onSignOut}><i className="bi bi-box-arrow-right me-2"></i> Sign out</a></li>
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
}
