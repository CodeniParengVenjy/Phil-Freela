// Page transitions: when another page opens, a band in the person's accent
// color sweeps across and uncovers the new page. The user picked this "Accent
// Wipe" (choice 4 of PLAN-opening-transitions.md); styles/transitions.css
// draws it.
//
// How it works: React's <ViewTransition> (React 19.3) asks the browser for a
// picture of the old page and one of the new page, and transitions.css moves
// the two pictures. React Router already makes every page change a React
// transition, so no link has to do anything special. A browser that can't do
// this just swaps the page, like before.
//
//   <ScreenTransition>   main.jsx: the whole screen, between the parts of the
//                        site (homepage, sign-in pages, dashboard, admin panel)
//   <PageTransition>     the dashboard and admin layouts: only their page area,
//                        so the top bar and the side menu stay still
import { ViewTransition, useEffect } from "react";
import { useLocation } from "react-router-dom";

// One key per page: a new key means a new page, so the band sweeps. Inside a
// page nothing sweeps: search words and tabs only change the "?..." part of
// the address, and every chat shares one key, so moving between chats stays calm.
function pageKeyOf(pathname) {
  if (pathname.startsWith("/dashboard/chat")) return "/dashboard/chat";
  return pathname;
}

// One key per part of the site. The dashboard home has its own address but
// belongs to the dashboard; the admin sign-in pages are not the admin panel.
const ADMIN_SIGN_IN_PAGES = ["/admin/login", "/admin/setup", "/admin/forgot-password"];
function sectionOf(pathname) {
  if (pathname === "/dashboard-freelancer" || pathname === "/dashboard-client" || pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return "dashboard";
  }
  if ((pathname === "/admin" || pathname.startsWith("/admin/")) && !ADMIN_SIGN_IN_PAGES.includes(pathname)) {
    return "admin";
  }
  return pathname;
}

// The old and the new page carry the same name, so the browser treats them as
// one pair ("share") and transitions.css plays the wipe on that pair (its class
// is "pf-wipe"). Nothing plays when only something inside the page changes
// (update), or when the part comes or goes with no partner (enter, exit),
// unless a layout asks for an "enter".
function Wipe({ name, pageKey, enter, children }) {
  return (
    <ViewTransition key={pageKey} name={name} share="pf-wipe" enter={enter} exit="none" update="none">
      {children}
    </ViewTransition>
  );
}

// A layout's page area (it wraps the <main> that holds the page).
export default function PageTransition({ enter = "none", children }) {
  const { pathname } = useLocation();
  return (
    <Wipe name="pf-page" pageKey={pageKeyOf(pathname)} enter={enter}>
      {children}
    </Wipe>
  );
}

// The color behind an element: the first background above it that isn't
// see-through.
function colorBehind(element) {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    const seeThrough = color === "transparent" || (color.startsWith("rgba(") && color.replace(/ /g, "").endsWith(",0)"));
    if (!seeThrough) return color;
  }
  return "";
}

// Right before each page change (a click), a few colors are copied to <html>,
// because the browser draws the two pictures on <html>'s own layer, which
// can't see what is on <body>:
// - the band's colors (the role's color, or the one picked in Settings >
//   Appearance, which live on <body>);
// - the color behind the page area and behind the whole page: a see-through
//   page (like the admin panel's) is drawn on it, so the band can't show
//   through the page itself.
//
// The browser's Back and Forward buttons switch pages at once: React handles
// them immediately, outside a transition, so the browser can put the page back
// where it was scrolled.
function prepareWipe() {
  const root = document.documentElement;
  const look = getComputedStyle(document.body);
  const colors = {
    "--pf-wipe-a": look.getPropertyValue("--accent-role").trim(),
    "--pf-wipe-b": look.getPropertyValue("--accent-role-2").trim(),
    "--pf-wipe-gradient": look.getPropertyValue("--accent-gradient").trim(),
    "--pf-page-ground": colorBehind(document.querySelector("main")),
    "--pf-screen-ground": colorBehind(document.getElementById("root")?.firstElementChild)
  };
  for (const [name, value] of Object.entries(colors)) {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
}

// The whole screen (main.jsx wraps the whole site in this).
export function ScreenTransition({ children }) {
  const location = useLocation();

  useEffect(() => {
    // Capture: runs before the link's own click handler starts the page change.
    document.addEventListener("click", prepareWipe, true);
    return () => document.removeEventListener("click", prepareWipe, true);
  }, []);

  return (
    <Wipe name="pf-screen" pageKey={sectionOf(location.pathname)} enter="none">
      {children}
    </Wipe>
  );
}
