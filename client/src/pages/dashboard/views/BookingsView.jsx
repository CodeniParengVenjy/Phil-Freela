import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { acceptBooking, bookingStatuses, cancelBooking, declineBooking, getMyBookings } from "../../../lib/bookings";
import { formatDay, personName, todayInManila } from "../../../lib/projects";
import { profilePath } from "../../../lib/profileStats";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import Avatar from "../../../components/Avatar";
import VerifiedBadge from "../../../components/VerifiedBadge";
import DeleteConfirmDialog from "../components/DeleteConfirmDialog";

// One booking: the other person, the service, the note, the date needed and
// the status. The buttons depend on who is looking and on the status:
//  - freelancer, pending: Accept (starts a project) or Decline
//  - client, pending: Cancel booking
//  - accepted: Open project
function BookingCard({ booking, isFreelancer, today, verified, working, onMessage, onAccept, onDecline, onCancel }) {
  // The other person on the booking.
  const other = isFreelancer ? booking.client : booking.freelancer;
  const otherName = personName(other, isFreelancer ? "Client" : "Freelancer");
  const status = bookingStatuses[booking.status];
  const isPending = booking.status === "pending";
  // A pending booking whose date has already gone by can't be accepted any more.
  const datePassed = isPending && booking.due_date < today;

  return (
    <div className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25">
      <div className="d-flex align-items-start gap-3 mb-2">
        <Avatar path={other?.avatar_path} name={otherName} size={48} />
        <div className="flex-grow-1 overflow-hidden">
          <h6 className="text-white fw-bold mb-1 text-break">{booking.title}</h6>
          <p className="text-white-50 fs-7 mb-0 text-break">
            {isFreelancer ? "Client" : "Freelancer"}:{" "}
            {/* Both have a public page: a freelancer's portfolio, a client's record. */}
            {other?.id ? (
              <Link to={profilePath(isFreelancer ? "client" : "freelancer", other.id)} className="text-white fw-semibold text-decoration-none hover-role">{otherName}</Link>
            ) : (
              <strong className="text-white">{otherName}</strong>
            )}
            <VerifiedBadge verified={verified} />
          </p>
        </div>
        <span className={`badge rounded-pill px-3 py-2 flex-shrink-0 ${status.className}`}>{status.label}</span>
      </div>

      {booking.note && (
        <p className="text-light-50 fs-7 fst-italic mb-2 text-break" style={{ whiteSpace: "pre-wrap" }}>"{booking.note}"</p>
      )}

      <p className="text-white-50 fs-8 mb-3">
        <i className="bi bi-calendar-event text-info me-1"></i>
        Needed by <strong className={datePassed ? "text-danger" : "text-white"}>{formatDay(booking.due_date)}</strong>
        {datePassed && <span className="text-danger"> (date passed)</span>}
        {" "}• sent {new Date(booking.created_at).toLocaleDateString()}
      </p>

      <div className="d-flex flex-wrap gap-2">
        {/* An accepted booking started a project: it carries on there. */}
        {booking.status === "accepted" && booking.project && (
          <Link to={`/dashboard/project-details/${booking.project.id}`} className="btn btn-dark border border-success text-success rounded-pill px-3 fs-7 fw-bold">
            <i className="bi bi-check-circle-fill me-1"></i> Accepted • Open project
          </Link>
        )}
        {/* The freelancer answers a request. Accept is off once the date has passed. */}
        {isPending && isFreelancer && (
          <>
            <button
              type="button"
              className="btn btn-gradient-role text-white rounded-pill px-3 fs-7 fw-bold"
              disabled={working || datePassed}
              title={datePassed ? "The date needed has passed. Message the client to book again." : undefined}
              onClick={() => onAccept(booking)}
            >
              <i className="bi bi-check-lg me-1"></i> Accept
            </button>
            <button type="button" className="btn btn-dark border border-danger text-danger rounded-pill px-3 fs-7 fw-bold" disabled={working} onClick={() => onDecline(booking)}>
              <i className="bi bi-x-lg me-1"></i> Decline
            </button>
          </>
        )}
        {/* The client can take back a booking nobody answered yet. */}
        {isPending && !isFreelancer && (
          <button type="button" className="btn btn-dark border border-danger text-danger rounded-pill px-3 fs-7 fw-bold" disabled={working} onClick={() => onCancel(booking)}>
            <i className="bi bi-x-circle me-1"></i> Cancel booking
          </button>
        )}
        <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-7 fw-bold" onClick={() => onMessage(other?.id)}>
          <i className="bi bi-chat-dots-fill me-1"></i> Message
        </button>
      </div>
    </div>
  );
}

// The Bookings page (/dashboard/bookings), for both sides. A client sees the
// services they booked ("My Bookings"); a freelancer sees the requests for
// their services ("Booking Requests"). Pending ones come first.
export default function BookingsView() {
  const { currentUserId, accountType, openChat, showToast, unreadNotifications } = useOutletContext();
  const isFreelancer = accountType === "freelancer";
  // null while loading, then the list.
  const [bookings, setBookings] = useState(null);
  const [failed, setFailed] = useState(false);
  // Goes up when something went wrong (e.g. the other person answered first),
  // so the list reloads and shows what is really there.
  const [reloadKey, setReloadKey] = useState(0);
  // An accept, decline or cancel is being sent (turns the buttons off).
  const [working, setWorking] = useState(false);
  // The Decline (freelancer) or Cancel (client) popup: { action, booking },
  // or null when closed.
  const [confirm, setConfirm] = useState(null);

  // Also loads again when a new notification arrives (the unread count
  // changes), so a new booking request shows up without a refresh.
  useEffect(() => {
    if (!currentUserId) return undefined;
    let active = true;

    getMyBookings(currentUserId, isFreelancer).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setFailed(true);
      } else {
        setFailed(false);
        setBookings(data);
      }
    });

    return () => {
      active = false;
    };
  }, [currentUserId, isFreelancer, unreadNotifications, reloadKey]);

  // The Verified check next to each freelancer's name (a client's list only).
  const verifiedIds = useVerifiedIds(isFreelancer ? [] : (bookings || []).map((b) => b.freelancer?.id));

  // Pending first. Within each group the order stays newest first (the sort keeps it).
  const sorted = useMemo(
    () => [...(bookings || [])].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending")),
    [bookings]
  );
  const pendingCount = sorted.filter((b) => b.status === "pending").length;
  const today = todayInManila();

  // Accept: starts a project, and the card turns into "Open project".
  const handleAccept = async (booking) => {
    setWorking(true);
    const { projectId, error } = await acceptBooking(booking.id);
    setWorking(false);
    if (error) {
      showToast(error);
      setReloadKey((n) => n + 1);
      return;
    }
    setBookings((prev) => prev.map((b) => (
      b.id === booking.id ? { ...b, status: "accepted", responded_at: new Date().toISOString(), project: { id: projectId, status: "started" } } : b
    )));
    showToast(`You accepted "${booking.title}". The project has started.`);
  };

  // Decline (freelancer) or Cancel (client), after the popup's confirm.
  const handleConfirm = async () => {
    const { action, booking } = confirm;
    setWorking(true);
    const problem = action === "decline" ? await declineBooking(booking.id) : await cancelBooking(booking.id);
    setWorking(false);
    setConfirm(null);
    if (problem) {
      showToast(problem);
      setReloadKey((n) => n + 1);
      return;
    }
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: action === "decline" ? "declined" : "cancelled" } : b)));
    showToast(action === "decline" ? `You declined "${booking.title}".` : `Your booking for "${booking.title}" was cancelled.`);
  };

  const popup = confirm?.action === "decline"
    ? {
        title: "Decline this booking?",
        message: `"${confirm.booking.title}" from ${personName(confirm.booking.client, "the client")} will be declined, and they'll be told. You can explain in chat.`,
        confirmLabel: "Decline", busyLabel: "Declining...", cancelLabel: "Not now"
      }
    : {
        title: "Cancel this booking?",
        message: confirm ? `Your request to book "${confirm.booking.title}" will be cancelled, and ${personName(confirm.booking.freelancer, "the freelancer")} will be told.` : "",
        confirmLabel: "Cancel booking", busyLabel: "Cancelling...", cancelLabel: "Keep booking"
      };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 max-w-950 mx-auto">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
          <h3 className="text-white fw-bold mb-0">
            <i className="bi bi-calendar-check-fill text-role me-2"></i> {isFreelancer ? "Booking Requests" : "My Bookings"}
          </h3>
          {isFreelancer && pendingCount > 0 && <span className="badge bg-warning text-dark rounded-pill">{pendingCount} waiting</span>}
        </div>
        <p className="text-secondary fs-7 mb-4">
          {isFreelancer
            ? "Clients who want to book your services. An accepted booking becomes a project."
            : "Services you booked. When the freelancer accepts, it becomes a project."}
        </p>

        {failed && <p className="text-danger fs-7 mb-0">Couldn't load your bookings right now.</p>}
        {!failed && bookings === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}
        {!failed && bookings?.length === 0 && (
          <p className="text-secondary fs-7 mb-0">
            {isFreelancer
              ? "No booking requests yet. When a client books one of your services, it shows here."
              : <>No bookings yet. Find a service you like and tap Book. <Link to="/dashboard-client" className="text-role fw-bold text-decoration-none">Browse services</Link></>}
          </p>
        )}

        <div className="d-flex flex-column gap-3">
          {sorted.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              isFreelancer={isFreelancer}
              today={today}
              verified={verifiedIds.has(b.freelancer?.id)}
              working={working}
              onMessage={openChat}
              onAccept={handleAccept}
              onDecline={(booking) => setConfirm({ action: "decline", booking })}
              onCancel={(booking) => setConfirm({ action: "cancel", booking })}
            />
          ))}
        </div>
      </div>

      <DeleteConfirmDialog
        open={Boolean(confirm)}
        title={popup.title}
        message={popup.message}
        busy={working}
        confirmLabel={popup.confirmLabel}
        busyLabel={popup.busyLabel}
        cancelLabel={popup.cancelLabel}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
