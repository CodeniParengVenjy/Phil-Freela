import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { dashboardRouteFor } from "../../../lib/profile";
import { fetchMyLink, switchToOtherAccount } from "../../../lib/accountSwitch";
import { PICTURE_TYPES, checkPicture } from "../../../lib/pictureSearch";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import VerifiedBadge from "../../../components/VerifiedBadge";
import Avatar from "../../../components/Avatar";
import AccentLogo from "./AccentLogo";
import PictureSearchDialog from "./PictureSearchDialog";
import SwitchToAdminDialog from "./SwitchToAdminDialog";

// Identical between the freelancer and client dashboards -- brand, search,
// the three quick links, and the account dropdown -- so both layouts share
// this instead of each keeping their own copy.
export default function DashboardTopNav({ displayName, avatarPath, accountType, currentUserId, onToggleSidebar, onSignOut, onSwitchRole, showToast, openChat }) {
  const isVerified = useVerifiedIds([currentUserId]).has(currentUserId);
  const switchLabel = accountType === "client" ? "Switch to Freelancer" : "Switch to Client";
  const switchHref = accountType === "client" ? "/dashboard-freelancer" : "/dashboard-client";
  // The logo takes a signed-in user back to their own dashboard home, not the public homepage.
  const homeHref = dashboardRouteFor(accountType);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Only an account that is linked to an admin (an admin's own user account)
  // gets "Switch to admin" in the menu; everyone else gets null here and sees
  // nothing (lib/accountSwitch.js). askAdminLogin opens the one-time password popup.
  const [adminLink, setAdminLink] = useState(null);
  const [askAdminLogin, setAskAdminLogin] = useState(false);
  useEffect(() => {
    if (!currentUserId) return undefined;
    let active = true;
    fetchMyLink().then((link) => {
      if (active) setAdminLink(link?.side === "user" ? link : null);
    });
    return () => { active = false; };
  }, [currentUserId]);

  const handleSwitchToAdmin = async (event) => {
    event.preventDefault();
    const result = await switchToOtherAccount(adminLink);
    if (result.needsPassword) setAskAdminLogin(true);
    else if (result.error) showToast(result.error);
  };

  // The AI search box (Hybrid recommendation system, content-based
  // filtering): Enter opens the Search page with the typed words. That page
  // also finds people by their name or @username.
  const handleSearch = (event) => {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("q") || "").trim();
    if (text) navigate(`/dashboard/search?q=${encodeURIComponent(text)}`);
  };

  // Search by picture (AI Moodboard Matching, feature 2): a client drops a
  // picture anywhere on this top bar, or picks one with the camera button, and
  // a popup scans it over the page they are on (PictureSearchDialog.jsx).
  // Moodboard matching finds freelancers, so it is for clients; a freelancer
  // who drops a picture is told so.
  const canScanPictures = accountType === "client";
  // The picture being scanned (null = popup closed). Each picture gets a new
  // ticket, which is the popup's key, so a second picture starts it fresh.
  const [scan, setScan] = useState(null);
  // True while a file is being dragged over the bar (the search box lights up).
  const [dropping, setDropping] = useState(false);
  const pictureInputRef = useRef(null);

  const scanPicture = (file) => {
    if (!file) return;
    if (!canScanPictures) {
      showToast("Searching by picture is for clients: it finds freelancers whose work matches the picture.");
      return;
    }
    const problem = checkPicture(file);
    if (problem) {
      showToast(problem);
      return;
    }
    setScan({ file, ticket: Date.now() });
  };

  // Only files count: dragging text or a link over the bar does nothing.
  const carriesFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");

  const handleDragOver = (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault(); // lets the bar take the drop (the browser would open the file instead)
    setDropping(true);
  };

  const handleDrop = (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    setDropping(false);
    scanPicture(event.dataTransfer.files?.[0]);
  };

  const handlePicturePick = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = ""; // so choosing the same picture again still counts
    scanPicture(picked);
  };

  // Already on the dashboard home: reload the page instead. The role is read
  // again from the database, so it stays the same.
  const handleLogoClick = (event) => {
    if (pathname === homeHref) {
      event.preventDefault();
      window.location.reload();
    }
  };

  return (
    <nav
      className="navbar navbar-expand-lg fixed-top border-bottom border-secondary border-opacity-25"
      id="topNavbar"
      onDragOver={handleDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={handleDrop}
    >
      <div className="container-fluid px-3 px-lg-4">
        <div className="d-flex align-items-center gap-3">
          <button
            className="btn btn-outline-secondary text-white border-0 shadow-none p-1"
            type="button"
            aria-label="Toggle Sidebar"
            onClick={onToggleSidebar}
          >
            <i className="bi bi-list fs-2 topbar-burger"></i>
          </button>
          <NavLink to={homeHref} onClick={handleLogoClick} className="navbar-brand d-flex align-items-center gap-2 m-0">
            <AccentLogo className="logo-img" />
          </NavLink>
        </div>

        <form className={`d-none d-md-flex mx-auto position-relative search-nav-box${dropping ? " is-dropping" : ""}`} style={{ width: 380 }} role="search" onSubmit={handleSearch}>
          <i className="bi bi-search search-icon text-secondary"></i>
          <input
            name="q"
            type="search"
            className={`form-control nav-search-input${canScanPictures ? " has-scan-button" : ""}`}
            placeholder={dropping && canScanPictures ? "Drop the picture here to scan it" : canScanPictures ? "Search, or drop a picture to scan..." : "Search people, services and jobs..."}
            aria-label="Search people, services and jobs"
            maxLength={200}
          />
          {canScanPictures && (
            <>
              <input ref={pictureInputRef} type="file" className="d-none" accept={PICTURE_TYPES.join(",")} onChange={handlePicturePick} />
              <button type="button" className="search-scan-button" title="Search by picture" aria-label="Search by picture" onClick={() => pictureInputRef.current?.click()}>
                <i className="bi bi-camera"></i>
              </button>
            </>
          )}
        </form>

        <div className="d-flex align-items-center gap-3">
          {/* Phones have no room for the box: this opens the Search page. */}
          <NavLink to="/dashboard/search" className="nav-link text-white-50 hover-orange d-md-none" aria-label="Search" title="Search">
            <i className="bi bi-search fs-5"></i>
          </NavLink>
          {accountType !== "freelancer" && (
            <a href="/dashboard-freelancer" className="nav-link text-white-50 hover-orange d-none d-lg-block fw-semibold fs-7" onClick={(event) => onSwitchRole(event, "freelancer")}>Join as Freelancer</a>
          )}
          {accountType !== "client" && (
            <a href="/dashboard-client" className="nav-link text-white-50 hover-orange d-none d-lg-block fw-semibold fs-7" onClick={(event) => onSwitchRole(event, "client")}>Become a Client</a>
          )}
          <NavLink to="/dashboard/services" className="nav-link text-white-50 hover-orange d-none d-lg-block fw-semibold fs-7">Services</NavLink>

          {/* Only for an admin's own user account (linked in the admin's My Profile):
              a button in plain sight on big screens, and an item in the menu below
              for phones. Everyone else has no adminLink and sees neither. */}
          {adminLink && (
            <button type="button" className="btn btn-outline-warning btn-sm rounded-pill fw-semibold d-none d-md-inline-flex align-items-center gap-1" onClick={handleSwitchToAdmin}>
              <i className="bi bi-shield-lock"></i> Switch to admin
            </button>
          )}

          <div className="dropdown">
            <button className="btn btn-dark border border-secondary border-opacity-50 rounded-pill d-flex align-items-center gap-2 px-3 py-1 dropdown-toggle text-white" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              <Avatar path={avatarPath} name={displayName} size={32} />
              <span className="fw-semibold fs-7 text-truncate d-none d-sm-inline">
                {displayName}
                <VerifiedBadge verified={isVerified} />
              </span>
            </button>
            <ul className="dropdown-menu dropdown-menu-end dropdown-menu-dark border border-secondary border-opacity-25 shadow-lg p-2">
              <li><NavLink className="dropdown-item rounded-2 text-white" to="/dashboard/profile"><i className="bi bi-person me-2 text-orange"></i> My Profile</NavLink></li>
              <li><NavLink className="dropdown-item rounded-2 text-white" to="/dashboard/settings"><i className="bi bi-gear me-2 text-info"></i> Account Settings</NavLink></li>
              <li><a className="dropdown-item rounded-2 text-white" href={switchHref} onClick={onSwitchRole}><i className="bi bi-arrow-left-right me-2 text-warning"></i> {switchLabel}</a></li>
              {adminLink && (
                <li><a className="dropdown-item rounded-2 text-white" href="/admin" onClick={handleSwitchToAdmin}><i className="bi bi-shield-lock me-2 text-orange"></i> Switch to admin</a></li>
              )}
              <li><hr className="dropdown-divider border-secondary border-opacity-25" /></li>
              <li><a className="dropdown-item rounded-2 text-danger" href="/login" onClick={onSignOut}><i className="bi bi-box-arrow-right me-2"></i> Sign out</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* The popup covers the whole screen, but React still counts it as part
          of this bar: a picture dropped on the open popup is scanned too. */}
      <PictureSearchDialog
        key={scan?.ticket}
        picture={scan?.file || null}
        onClose={() => setScan(null)}
        currentUserId={currentUserId}
        openChat={openChat}
        showToast={showToast}
      />

      <SwitchToAdminDialog open={askAdminLogin} link={adminLink} onClose={() => setAskAdminLogin(false)} />
    </nav>
  );
}
