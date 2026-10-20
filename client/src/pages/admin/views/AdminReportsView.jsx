import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { removeListing } from "../../../lib/adminListings";
import { loadRequests, newestBy, requestText, sendRequest } from "../../../lib/adminRequests";
import { SLIDES_SELECT, itemSlides } from "../../../lib/slides";
import { useWholePages } from "../../../lib/wholePages";
import { avatarUrl, coverUrl } from "../../../lib/avatar";
import { getScreenshotLinks, removeReportedPicture, reportListingTables, reportPictureKinds, reportReasonLabel, reportTargetLabels } from "../../../lib/reports";
import { messageSummary } from "../../../lib/reportMessages";
import { blockedBadges, saveSuspension, suspensionStatus } from "../../../lib/suspensions";
import { buildPenalty, emptyViolationFields, getViolation } from "../../../lib/violations";
import ViolationFields from "../components/ViolationFields";

const statusTabs = [
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" }
];

// Text for the action pop-up. "penalty" = Suspend / Ban, which use the
// violation dropdown (ViolationFields) instead of the note box.
const actionText = {
  resolve: { title: "Resolve report", button: "Resolve", noteLabel: "Note (optional)", buttonClass: "btn-success" },
  dismiss: { title: "Dismiss report", button: "Dismiss", noteLabel: "Why is it being dismissed? (optional)", buttonClass: "btn-secondary" },
  remove: { title: "Remove listing", button: "Remove Listing", noteLabel: "Note (optional)", buttonClass: "btn-danger" },
  remove_picture: { title: "Remove picture", button: "Remove Picture", noteLabel: "Note (optional)", buttonClass: "btn-danger" },
  suspend: { title: "Suspend user", button: "Suspend User", buttonClass: "btn-warning", penalty: true },
  ban: { title: "Ban user", button: "Ban User", buttonClass: "btn-danger", penalty: true }
};

// Key for looking up what a report points at, e.g. "service:<id>".
const targetKey = (type, id) => `${type}:${id}`;

// "Project" for a reported portfolio project, "Comment" for a comment on an
// offer, "Listing" for a service or job post, so the Remove button and its
// pop-up use the right word.
const removeWord = (report) => (report.target_type === "portfolio_item" ? "Project" : report.target_type === "service_review" ? "Comment" : "Listing");

// What the Remove pop-up says will happen (a comment has no files).
const removeText = (report) => (report.target_type === "service_review"
  ? "The comment will be deleted, and this report marked resolved."
  : `The ${removeWord(report).toLowerCase()} (and its files) will be deleted, and this report marked resolved.`);

// The picture that was reported, shown from its own saved file (not from the
// person's profile as it is now, which may have changed). Click it to open it
// full size. A reported file is kept while its report is waiting, so it is
// only gone for an old report.
function ReportedPicture({ report }) {
  const [failed, setFailed] = useState(false);
  const isCover = report.target_type === "cover_photo";
  const url = isCover ? coverUrl(report.reported_path) : avatarUrl(report.reported_path);
  if (!url || failed) return <p className="fs-8 text-white-50 fst-italic mb-2">(the reported picture's file is gone)</p>;

  return (
    <div className="mb-2">
      <p className="fs-8 text-white-50 mb-1">What was reported:</p>
      <a href={url} target="_blank" rel="noreferrer" title="Open full size">
        <img
          src={url}
          alt={isCover ? "Reported cover photo" : "Reported profile picture"}
          className="d-block rounded-3 border border-warning border-opacity-50"
          style={{ maxWidth: isCover ? 420 : 140, maxHeight: 200, width: "100%", objectFit: "contain" }}
          onError={() => setFailed(true)}
        />
      </a>
    </div>
  );
}

// Up to 4 small pictures of a reported service's or project's files (its
// photos, and the first page of each PDF), so the admin can compare them with
// the reporter's proof, for example in a "Stolen work" report. A PDF's page is
// the WHOLE page from the private bucket, because the public one is blurred
// below the top (document previews); like in Flagged Content, an older PDF with
// no private copy shows its public page. Click one to open it full size.
function ReportedFiles({ item }) {
  const pictures = itemSlides(item)
    .flatMap((slide) => (slide.mediaType === "image"
      ? [{ key: slide.url, url: slide.url }]
      : (slide.pagePaths || []).slice(0, 1).map((path) => ({ key: path, path }))))
    .slice(0, 4);
  const wholePage = useWholePages(pictures.filter((picture) => picture.path).map((picture) => picture.path));
  if (!pictures.length) return null;

  return (
    <div className="mb-2">
      <p className="fs-8 text-white-50 mb-1">What was reported:</p>
      <div className="d-flex flex-wrap gap-2">
        {pictures.map((picture, index) => {
          const url = picture.url || wholePage(picture.path);
          return url ? (
            <a key={picture.key} href={url} target="_blank" rel="noreferrer" title={`Open file ${index + 1}`}>
              <img
                src={url}
                alt={`Reported file ${index + 1}`}
                className="rounded-3 border border-warning border-opacity-50"
                style={{ width: 88, height: 88, objectFit: "cover", objectPosition: picture.path ? "top" : undefined }}
              />
            </a>
          ) : (
            <span key={picture.key} className="rounded-3 border border-warning border-opacity-50 d-flex align-items-center justify-content-center text-center text-white-50 fs-9" style={{ width: 88, height: 88 }}>
              Loading page
            </span>
          );
        })}
      </div>
    </div>
  );
}

// The chat messages the reporter ticked to send with a report about a person,
// oldest first like in the chat. Admins can't read chats, so this is all they
// see of it: copies made when the report was sent, so they stay even if the
// message is unsent later (database/supabase_report_messages_schema.sql). A
// photo, video, voice message or file shows only as a label. When the reporter
// right-clicked one message ("Report Message"), that one is marked (flagged).
function ReportedChat({ messages, reporterName, reportedName }) {
  return (
    <div className="mb-2">
      <p className="fs-8 text-white-50 mb-1">
        <i className="bi bi-chat-left-text me-1"></i>
        Chat messages the reporter picked ({messages.length}):
      </p>
      <div
        className="rounded-3 border border-secondary border-opacity-50 p-2 d-flex flex-column gap-2"
        style={{ maxHeight: 300, overflowY: "auto" }}
        role="log"
        aria-label="Chat messages sent with this report"
        tabIndex={0}
      >
        {messages.map((m) => {
          const { icon, label, text } = messageSummary(m);
          return (
            <div key={m.id} className={`fs-7${m.flagged ? " border-start border-3 border-warning ps-2" : ""}`}>
              <div className="fs-8">
                <strong className={m.from_reporter ? "text-white-50" : "text-warning"}>{m.from_reporter ? reporterName : reportedName}</strong>
                <span className="text-white-50">
                  {" · "}{new Date(m.sent_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  {m.edited && " · edited"}
                </span>
                {m.flagged && <span className="badge bg-warning text-dark ms-2 align-middle">Reported message</span>}
              </div>
              {label && <div className="text-white-50"><i className={`bi ${icon} me-1`}></i>{label}</div>}
              {text && (
                <div className="text-white admin-description" style={{ whiteSpace: "pre-wrap" }}>
                  {!label && icon && <i className={`bi ${icon} me-1 text-white-50`}></i>}{text}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// "During a video call · Sep 29, 2026, 3:10 PM · 4 min" for a report sent
// from a call. The length counts from when it was answered.
function callSummary(call) {
  const when = new Date(call.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  let length = "not answered";
  if (call.answered_at && call.ended_at) {
    const seconds = Math.round((new Date(call.ended_at) - new Date(call.answered_at)) / 1000);
    length = seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
  } else if (call.answered_at) {
    length = "still going";
  }
  return `During a ${call.kind} call · ${when} · ${length}`;
}

export default function AdminReportsView() {
  const { adminId, isSuperAdmin, refreshPendingReports } = useOutletContext();
  const [reports, setReports] = useState(null);
  // report id -> the newest request about it that is still waiting or was
  // declined (see lib/adminRequests.js). A regular admin's action is a request
  // a super admin has to approve.
  const [requests, setRequests] = useState({});
  // targetKey -> { name, ownerId, ownerName, item } for everything reported.
  // A missing entry means the user/listing was deleted after being reported.
  const [targets, setTargets] = useState({});
  // user id -> "banned" or "suspended", only for bans/suspensions still in effect.
  const [blockedStatus, setBlockedStatus] = useState({});
  // call id -> { kind, created_at, answered_at, ended_at } for reports sent
  // from a call, and screenshot path -> a link that opens it.
  const [calls, setCalls] = useState({});
  const [screenshotLinks, setScreenshotLinks] = useState({});
  const [loadError, setLoadError] = useState("");
  const [activeStatus, setActiveStatus] = useState("pending");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The open action pop-up: { kind, report } (null = closed).
  const [action, setAction] = useState(null);
  const [note, setNote] = useState("");
  // What the admin picked in the Suspend / Ban pop-up (see ViolationFields).
  const [fields, setFields] = useState(emptyViolationFields);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const [reportsResult, suspensionsResult, requestsResult] = await Promise.all([
        supabase
          .from("reports")
          // report_messages: the chat messages the reporter ticked (empty for most reports).
          // target_title / target_owner_id: a copy of the reported post's title and owner, kept for when the post is gone.
          .select("id, reporter_id, target_type, target_id, target_title, target_owner_id, reason, details, status, admin_note, reviewed_at, created_at, call_id, evidence_paths, reported_path, report_messages(id, from_reporter, body, attachment_type, attachment_name, is_call, edited, flagged, sent_at), reporter:profiles!reports_reporter_id_fkey(full_name, username), reviewer:admins!reports_reviewed_by_fkey(full_name)")
          .order("created_at", { ascending: false })
          .order("sent_at", { referencedTable: "report_messages", ascending: true }),
        supabase.from("user_suspensions").select("user_id, ends_at"),
        loadRequests(["pending", "declined"])
      ]);

      if (!active) return;
      if (reportsResult.error || suspensionsResult.error || requestsResult.error) {
        setLoadError("Failed to load reports.");
        return;
      }
      setRequests(newestBy(requestsResult.data, (request) => request.report_id));

      // Look up everything that was reported, grouped by kind, so each
      // report card can show the name/title and the owner.
      const idsOf = (type) => [...new Set(reportsResult.data.filter((r) => r.target_type === type).map((r) => r.target_id))];
      const callIds = [...new Set(reportsResult.data.map((r) => r.call_id).filter(Boolean))];
      // A service or job post the owner took down after it was reported: the
      // report still has its title and owner (the database copied them when the
      // report was sent), so the owner's profile is looked up too.
      const postReports = reportsResult.data.filter((r) => (r.target_type === "service" || r.target_type === "job_post") && r.target_owner_id);
      const [usersResult, servicesResult, jobsResult, projectsResult, reviewsResult, callsResult, links] = await Promise.all([
        // A reported picture points at its owner, so their profile is looked up
        // too (with where their picture and cover are now).
        supabase.from("profiles").select("id, full_name, username, avatar_path, cover_path").in("id", [...new Set([...idsOf("user"), ...idsOf("profile_picture"), ...idsOf("cover_photo"), ...postReports.map((r) => r.target_owner_id)])]),
        // The slides are only needed so Remove can delete the service's files too.
        supabase.from("services").select(`id, title, image_url, freelancer_id, owner:profiles!services_freelancer_id_fkey(full_name, username), ${SLIDES_SELECT}`).in("id", idsOf("service")),
        supabase.from("job_posts").select("id, title, client_id, owner:profiles!job_posts_client_id_fkey(full_name, username)").in("id", idsOf("job_post")),
        // Reported portfolio projects, with their slides for the same reason as services.
        supabase.from("portfolio_items").select(`id, title, freelancer_id, owner:profiles!portfolio_items_freelancer_id_fkey(full_name, username), ${SLIDES_SELECT}`).in("id", idsOf("portfolio_item")),
        // Reported comments on offers: who wrote them, and on which offer.
        supabase.from("service_reviews").select("id, stars, comment, created_at, author_id, author:profiles!service_reviews_author_id_fkey(full_name, username), service:services(title)").in("id", idsOf("service_review")),
        // Admins can't read the calls table, only this summary (no IP addresses).
        callIds.length ? supabase.rpc("admin_report_calls", { call_ids: callIds }) : { data: [] },
        getScreenshotLinks(reportsResult.data.flatMap((r) => r.evidence_paths || []))
      ]);

      if (!active) return;
      setCalls(Object.fromEntries((callsResult.data || []).map((c) => [c.id, c])));
      setScreenshotLinks(links);

      const found = {};
      (usersResult.data || []).forEach((u) => {
        found[targetKey("user", u.id)] = { name: `${u.full_name} (@${u.username})`, ownerId: u.id, ownerName: u.full_name };
        // currentPath: the file they have now, so Remove only shows while it
        // is still the reported one.
        found[targetKey("profile_picture", u.id)] = { name: `${u.full_name}'s profile picture`, ownerId: u.id, ownerName: u.full_name, currentPath: u.avatar_path };
        found[targetKey("cover_photo", u.id)] = { name: `${u.full_name}'s cover photo`, ownerId: u.id, ownerName: u.full_name, currentPath: u.cover_path };
      });
      (servicesResult.data || []).forEach((s) => {
        found[targetKey("service", s.id)] = { name: s.title, ownerId: s.freelancer_id, ownerName: s.owner?.full_name, item: s };
      });
      (jobsResult.data || []).forEach((j) => {
        found[targetKey("job_post", j.id)] = { name: j.title, ownerId: j.client_id, ownerName: j.owner?.full_name, item: j };
      });
      (projectsResult.data || []).forEach((p) => {
        found[targetKey("portfolio_item", p.id)] = { name: p.title, ownerId: p.freelancer_id, ownerName: p.owner?.full_name, item: p };
      });
      // A post that is gone: its saved title and owner. No `item` (nothing left
      // to remove or show), so only Suspend / Ban on the owner, Resolve and Dismiss are offered.
      postReports.forEach((r) => {
        const key = targetKey(r.target_type, r.target_id);
        if (found[key] || !r.target_title) return;
        const owner = (usersResult.data || []).find((u) => u.id === r.target_owner_id);
        found[key] = { name: r.target_title, gone: true, ownerId: owner ? owner.id : null, ownerName: owner?.full_name };
      });
      // The author of a comment is its "owner" (Suspend / Ban apply to them); review keeps the comment to show.
      (reviewsResult.data || []).forEach((r) => {
        found[targetKey("service_review", r.id)] = {
          name: `Comment on "${r.service?.title || "a deleted offer"}"`,
          ownerId: r.author_id, ownerName: r.author?.full_name, item: { id: r.id }, review: r
        };
      });

      setTargets(found);
      setBlockedStatus(Object.fromEntries(
        suspensionsResult.data.map((s) => [s.user_id, suspensionStatus(s)]).filter(([, status]) => status)
      ));
      setReports(reportsResult.data);
    })();

    return () => { active = false; };
  }, []);

  const countFor = (status) => (reports || []).filter((r) => r.status === status).length;
  const visibleReports = (reports || []).filter((r) => r.status === activeStatus);

  const openAction = (kind, report) => {
    const target = targets[targetKey(report.target_type, report.target_id)];
    setAction({ kind, report, target });
    setNote("");
    // Start with the violation the user was reported for (the report reasons
    // and violations share the same values), unless it's ban only and this
    // is a suspension.
    const reported = getViolation(report.reason);
    const fits = reported && (kind === "ban" || !reported.banOnly);
    setFields({ ...emptyViolationFields, violation: fits ? reported.value : "" });
    setMessage({ text: "", type: "" });
  };

  // Marks a report resolved/dismissed. The "admins can review reports"
  // database rule only allows this for admins, recorded as themselves.
  const markReviewed = async (report, status, adminNote) => {
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase
      .from("reports")
      .update({ status, admin_note: adminNote || null, reviewed_by: adminId, reviewed_at: reviewedAt })
      .eq("id", report.id);
    if (error) throw new Error("Couldn't update the report.");

    setReports((prev) => prev.map((r) => (r.id === report.id
      ? { ...r, status, admin_note: adminNote || null, reviewed_at: reviewedAt, reviewer: { full_name: "You" } }
      : r)));
    // Update the number on the sidebar's Reports link.
    await refreshPendingReports();
  };

  const confirmAction = async (event) => {
    event.preventDefault();
    const { kind, report, target } = action;
    const text = note.trim();
    // For Suspend / Ban: the length and what's blocked, from the penalty chart.
    const penalty = actionText[kind].penalty ? buildPenalty(kind, fields) : null;
    if (actionText[kind].penalty && !penalty) return;

    // A regular admin doesn't do the action: they send it to a super admin,
    // who approves or declines it on the Approvals page.
    if (!isSuperAdmin) {
      setBusy(true);
      const { data, error } = await sendRequest({
        adminId,
        kind: kind === "remove" ? "remove_listing" : kind,
        reportId: report.id,
        targetUserId: penalty || kind === "remove_picture" ? target.ownerId : null,
        listingTable: kind === "remove" ? reportListingTables[report.target_type] : null,
        listingId: kind === "remove" ? target.item.id : null,
        // For Suspend / Ban the pop-up choices are kept, and the penalty is
        // worked out again when a super admin approves.
        details: penalty ? { fields } : { note: text }
      });
      setBusy(false);
      setAction(null);
      if (error) {
        setMessage({ text: error, type: "error" });
        return;
      }
      setRequests((prev) => ({ ...prev, [report.id]: data }));
      setMessage({ text: "Sent to a super admin. Nothing happens until they approve it.", type: "success" });
      return;
    }

    setBusy(true);
    try {
      if (kind === "remove") {
        // Same Remove as the Listings page (deletes the files too).
        const word = removeWord(report);
        if (!(await removeListing(reportListingTables[report.target_type], target.item))) throw new Error(`Couldn't remove the ${word.toLowerCase()}.`);
        setTargets((prev) => {
          const next = { ...prev };
          delete next[targetKey(report.target_type, report.target_id)];
          return next;
        });
        await markReviewed(report, "resolved", `${word} removed.${text ? ` ${text}` : ""}`);
        setMessage({ text: `${word} removed and report resolved.`, type: "success" });
      } else if (kind === "remove_picture") {
        // The database clears it only if it is still the reported file; then the file is deleted.
        const label = reportPictureKinds[report.target_type].label;
        const { removed, error } = await removeReportedPicture(report);
        if (error) throw new Error(`Couldn't remove the ${label}.`);
        const key = targetKey(report.target_type, report.target_id);
        setTargets((prev) => ({ ...prev, [key]: { ...prev[key], currentPath: removed ? null : prev[key].currentPath } }));
        await markReviewed(report, "resolved", removed ? `Removed the ${label}.${text ? ` ${text}` : ""}` : "The picture had already been changed or removed.");
        setMessage({
          text: removed ? `The ${label} was removed and the report resolved.` : "That picture had already been changed or removed, so nothing was removed. The report is resolved.",
          type: "success"
        });
      } else if (penalty) {
        // Same Suspend / Ban as the Users page.
        const done = kind === "ban" ? "banned" : "suspended";
        const { error } = await saveSuspension({ userId: target.ownerId, adminId, penalty });
        if (error) throw new Error(`Couldn't ${kind} the user.`);
        setBlockedStatus((prev) => ({ ...prev, [target.ownerId]: done }));
        await markReviewed(report, "resolved", kind === "ban" ? `Banned: ${penalty.reason}` : `Suspended ${penalty.days} days: ${penalty.reason}`);
        setMessage({ text: `${target.ownerName} was ${done} and the report resolved.`, type: "success" });
      } else {
        await markReviewed(report, kind === "resolve" ? "resolved" : "dismissed", text);
        setMessage({ text: kind === "resolve" ? "Report resolved." : "Report dismissed.", type: "success" });
      }
      setAction(null);
    } catch (error) {
      setMessage({ text: error.message, type: "error" });
      setAction(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-3">Reports</h1>

      <div className="d-flex flex-wrap gap-2 mb-3">
        {statusTabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm rounded-pill px-3 fw-bold ${activeStatus === t.key ? "btn-admin-orange" : "btn-outline-light"}`}
            onClick={() => { setActiveStatus(t.key); setMessage({ text: "", type: "" }); }}
          >
            {t.label} <span className="ms-1 opacity-75">({reports ? countFor(t.key) : "…"})</span>
          </button>
        ))}
      </div>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      {loadError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{loadError}</div>}
      {!loadError && reports === null && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading reports...</div>}
      {!loadError && reports !== null && visibleReports.length === 0 && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50">
          <i className="bi bi-flag fs-1 d-block mb-2"></i>
          No {activeStatus} reports.
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {visibleReports.map((report) => {
          const target = targets[targetKey(report.target_type, report.target_id)];
          // A reported picture is about a person, but, like a listing, it has an owner.
          const isPicture = Boolean(reportPictureKinds[report.target_type]);
          const isListing = !isPicture && report.target_type !== "user";
          const hasOwnerLine = isListing || isPicture;
          // True while the person still has the picture that was reported.
          const stillThere = isPicture && target && target.currentPath === report.reported_path;
          // "banned", "suspended", or undefined for the reported user / listing owner.
          const ownerStatus = target && blockedStatus[target.ownerId];
          // Suspend / Ban need an owner account (a post that is gone may also have lost its owner).
          const canPenalize = Boolean(target?.ownerId);
          const ownerBadge = ownerStatus && (
            <span className={`badge ${blockedBadges[ownerStatus].className} fw-normal`}>{blockedBadges[ownerStatus].label}</span>
          );

          return (
            <div key={report.id} className="admin-card rounded-4 p-3 p-md-4">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span className="badge admin-badge-orange fw-normal">{reportTargetLabels[report.target_type]}</span>
                <span className="badge bg-danger bg-opacity-75 fw-normal">{reportReasonLabel(report.reason)}</span>
                <span className="text-white-50 fs-8 ms-auto">{new Date(report.created_at).toLocaleString()}</span>
              </div>

              <h2 className="h6 fw-bold text-white mb-1 admin-title-cell">
                {target ? target.name : <span className="text-white-50 fst-italic">(deleted)</span>}
                {target?.gone && <span className="badge bg-secondary fw-normal ms-2 align-middle">Deleted</span>}
              </h2>

              {hasOwnerLine && target && (
                <p className="fs-7 text-white-50 mb-1">
                  {isPicture ? "Belongs to" : "Posted by"} {target.ownerName || "Unknown"}
                  {ownerBadge && <span className="ms-2">{ownerBadge}</span>}
                </p>
              )}
              {target?.gone && (
                <p className="fs-8 text-white-50 fst-italic mb-1">
                  This post is no longer there. Its title and owner were saved when it was reported.
                </p>
              )}
              {!hasOwnerLine && ownerBadge && <div className="mb-1">{ownerBadge}</div>}

              <p className="fs-7 text-white-50 mb-2">
                Reported by {report.reporter?.full_name || "a deleted user"}
                {report.reporter?.username && ` (@${report.reporter.username})`}
              </p>

              {report.call_id && calls[report.call_id] && (
                <p className="fs-8 text-warning mb-2">
                  <i className={`bi ${calls[report.call_id].kind === "video" ? "bi-camera-video-fill" : "bi-telephone-fill"} me-1`}></i>
                  {callSummary(calls[report.call_id])}
                </p>
              )}

              {report.details && <p className="fs-7 text-white mb-2 admin-description">"{report.details}"</p>}

              {/* A report from a chat: the messages the reporter picked. */}
              {report.report_messages?.length > 0 && (
                <ReportedChat
                  messages={report.report_messages}
                  reporterName={report.reporter?.full_name || "The reporter"}
                  reportedName={target?.ownerName || "The reported person"}
                />
              )}

              {/* The reported picture or cover, as it was when it was reported. */}
              {isPicture && <ReportedPicture report={report} />}
              {isPicture && target && !stillThere && report.status === "pending" && (
                <p className="fs-8 text-warning mb-2">
                  <i className="bi bi-info-circle me-1"></i>
                  They have changed or removed this picture since it was reported.
                </p>
              )}

              {/* A reported comment: its stars and words, as they are now. */}
              {report.target_type === "service_review" && target?.review && (
                <div className="mb-2">
                  <p className="fs-8 text-white-50 mb-1">What was reported:</p>
                  <div className="rounded-3 border border-warning border-opacity-50 p-2">
                    <span className="text-warning" aria-label={`${target.review.stars} out of 5 stars`}>
                      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={`bi ${n <= target.review.stars ? "bi-star-fill" : "bi-star"}`}></i>)}
                    </span>
                    <span className="fs-8 text-white-50"> · {new Date(target.review.created_at).toLocaleDateString()}</span>
                    {target.review.comment
                      ? <p className="fs-7 text-white mb-0 mt-1 admin-description" style={{ whiteSpace: "pre-wrap" }}>{target.review.comment}</p>
                      : <p className="fs-8 text-white-50 fst-italic mb-0 mt-1">(stars only, no comment)</p>}
                  </div>
                </div>
              )}

              {/* The reported service's or project's own pictures; click one to open it full size. */}
              {isListing && target && !target.gone && <ReportedFiles item={target.item} />}
              {report.evidence_paths?.length > 0 && <p className="fs-8 text-white-50 mb-1">The reporter's screenshots:</p>}

              {/* The reporter's screenshots; click one to open it full size. */}
              {report.evidence_paths?.length > 0 && (
                <div className="d-flex flex-wrap gap-2 mb-2">
                  {report.evidence_paths.map((path, index) => (screenshotLinks[path] ? (
                    <a key={path} href={screenshotLinks[path]} target="_blank" rel="noreferrer" title={`Open screenshot ${index + 1}`}>
                      <img src={screenshotLinks[path]} alt={`Screenshot ${index + 1}`} className="rounded-3 border border-secondary border-opacity-50" style={{ width: 88, height: 88, objectFit: "cover" }} />
                    </a>
                  ) : (
                    <span key={path} className="fs-8 text-white-50 fst-italic">(screenshot {index + 1} missing)</span>
                  )))}
                </div>
              )}

              {report.status !== "pending" && (
                <p className="fs-8 text-white-50 mb-0">
                  <i className={`bi ${report.status === "resolved" ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-secondary"} me-1`}></i>
                  {report.status === "resolved" ? "Resolved" : "Dismissed"} by {report.reviewer?.full_name || "an admin"}
                  {report.reviewed_at && ` on ${new Date(report.reviewed_at).toLocaleDateString()}`}
                  {report.admin_note && ` — ${report.admin_note}`}
                </p>
              )}

              {/* A request about this report: waiting for a super admin, or declined
                  (then the actions come back so another one can be picked). */}
              {report.status === "pending" && requests[report.id]?.status === "pending" && (
                <p className="fs-8 text-warning mb-0 mt-2">
                  <i className="bi bi-hourglass-split me-1"></i>
                  {isSuperAdmin
                    ? `${requests[report.id].requested_by_name || "An admin"} asked to ${requestText(requests[report.id]).toLowerCase()}. Decide on the Approvals page.`
                    : `Waiting for a super admin: ${requestText(requests[report.id])}`}
                </p>
              )}
              {report.status === "pending" && requests[report.id]?.status === "declined" && (
                <p className="fs-8 text-white-50 mb-0 mt-2">
                  <i className="bi bi-x-circle me-1"></i>
                  {requestText(requests[report.id])} request declined by {requests[report.id].decider?.full_name || "a super admin"}
                  {requests[report.id].decision_note && ` — ${requests[report.id].decision_note}`}
                </p>
              )}

              {report.status === "pending" && requests[report.id]?.status !== "pending" && (
                <div className="d-flex flex-wrap gap-2 mt-3">
                  {isListing && target && !target.gone && (
                    <button className="btn btn-outline-danger btn-sm" onClick={() => openAction("remove", report)}>
                      <i className="bi bi-trash"></i> Remove {removeWord(report)}
                    </button>
                  )}
                  {stillThere && (
                    <button className="btn btn-outline-danger btn-sm" onClick={() => openAction("remove_picture", report)}>
                      <i className="bi bi-trash"></i> Remove Picture
                    </button>
                  )}
                  {canPenalize && !ownerStatus && (
                    <button className="btn btn-outline-warning btn-sm" onClick={() => openAction("suspend", report)}>
                      <i className="bi bi-slash-circle"></i> Suspend {hasOwnerLine ? "Owner" : "User"}
                    </button>
                  )}
                  {/* A suspended user can still be banned; that replaces the suspension. */}
                  {canPenalize && ownerStatus !== "banned" && (
                    <button className="btn btn-outline-danger btn-sm" onClick={() => openAction("ban", report)}>
                      <i className="bi bi-ban"></i> Ban {hasOwnerLine ? "Owner" : "User"}
                    </button>
                  )}
                  <button className="btn btn-outline-success btn-sm" onClick={() => openAction("resolve", report)}>
                    <i className="bi bi-check-lg"></i> Resolve
                  </button>
                  <button className="btn btn-outline-light btn-sm" onClick={() => openAction("dismiss", report)}>
                    <i className="bi bi-x-lg"></i> Dismiss
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* One pop-up for every action; the text changes with the action. */}
      {action && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setAction(null)}>
          <form className="admin-card admin-modal rounded-4 p-4" onClick={(e) => e.stopPropagation()} onSubmit={confirmAction}>
            <h2 className="h5 fw-bold text-white mb-1">
              {action.kind === "remove" ? `Remove ${removeWord(action.report).toLowerCase()}` : actionText[action.kind].title}
              {actionText[action.kind].penalty && action.target && ` — ${action.target.ownerName}`}
            </h2>
            <p className="text-secondary fs-7 mb-3">
              {action.kind === "remove" && removeText(action.report)}
              {action.kind === "remove_picture" && "The picture is taken off their profile (they go back to the first-letter circle or the plain banner) and its file is deleted. This report will be marked resolved."}
              {action.kind === "suspend" && "The violation decides how long it lasts and what they can't do. This report will be marked resolved."}
              {action.kind === "ban" && "They will be signed out and can't log in until an admin unbans them. This report will be marked resolved."}
              {action.kind === "resolve" && "Use this when the problem has been handled."}
              {action.kind === "dismiss" && "Use this when the report isn't a real problem."}
            </p>
            {!isSuperAdmin && (
              <p className="fs-8 text-warning mb-3">
                <i className="bi bi-shield-check me-1"></i>
                This is sent to a super admin. Nothing happens until they approve it.
              </p>
            )}
            {actionText[action.kind].penalty ? (
              <ViolationFields kind={action.kind} fields={fields} setFields={setFields} />
            ) : (
              <>
                <label htmlFor="actionNote" className="form-label text-white-50 fs-7 mb-1">{actionText[action.kind].noteLabel}</label>
                <textarea
                  id="actionNote"
                  className="form-control admin-input mb-3"
                  rows={3}
                  // Kept short enough that "Listing removed. ..." still fits the
                  // 500-character admin_note limit.
                  maxLength={400}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                />
              </>
            )}
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => setAction(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${actionText[action.kind].buttonClass} btn-sm rounded-pill px-3 fw-bold`}
                disabled={busy || (actionText[action.kind].penalty && !buildPenalty(action.kind, fields))}
              >
                {!isSuperAdmin ? "Send for approval" : action.kind === "remove" ? `Remove ${removeWord(action.report)}` : actionText[action.kind].button}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
