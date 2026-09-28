import { useSyncExternalStore } from "react";
import { supabase } from "./supabaseClient";

// Voice and video calls (database/supabase_calls_schema.sql).
//
// WebRTC connects the two browsers directly, so the voice and video never
// pass through our server. Before that, the browsers swap "connection
// details": the caller's go into the call's row (start_call), the other
// person's browser gets them instantly through Supabase Realtime and answers
// with its own (answer_call). Then the browsers connect to each other.

// How long a call rings before it counts as missed.
export const RING_SECONDS = 30;
// During a call both browsers tell the database "still here" this often, so
// a call whose browsers both closed still gets ended (finish_stale_calls).
const KEEP_ALIVE_SECONDS = 20;
// The longest wait for this browser to collect its connection details.
const GATHER_MS = 3000;
// A dropped connection gets this long to come back before the call ends.
const RECONNECT_MS = 10000;
// How long "Call ended", "No answer" and the like stay on screen.
const MESSAGE_MS = 3000;
// Leaving the dashboard ends the call after this long (moving between its
// two layouts restarts the listener sooner, which keeps the call going).
const LEAVE_MS = 3000;

// Free Google STUN servers tell each browser its public address, so the two
// can find each other. A TURN server (optional; set VITE_TURN_URL,
// VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL in Cloudflare) relays the call
// when a strict network, like some school Wi-Fi, blocks direct connections.
const ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
if (import.meta.env.VITE_TURN_URL) {
  ICE_SERVERS.push({
    urls: import.meta.env.VITE_TURN_URL.split(","),
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL
  });
}

const CALL_COLUMNS = "id, conversation_id, caller_id, callee_id, kind, status, offer, answer";
const FINISHED = ["declined", "missed", "ended"];

// ---------------------------------------------------------------------------
// The current call
// ---------------------------------------------------------------------------

// The call this browser tab is in (null = none). It lives here, outside the
// pages, so moving between dashboard pages (even to the home page, which is a
// separate layout) doesn't drop it. Fields:
//   key        a number that changes with every new call
//   id         the calls row (null while it's still being set up)
//   direction  "outgoing" or "incoming"
//   stage      "starting" (turning on the camera) -> "calling" (ringing on
//              their side), or "ringing" (someone is calling you); then
//              "connecting" -> "active"; "ended" shows `message` briefly
//   kind, conversationId, other { id, name, avatarPath }
//   localStream, remoteStream, muted, cameraOff, connectedAt (for the timer)
//   remoteCameraOff  the other person turned their camera off
let call = null;
let nextKey = 1;
let peer = null; // the RTCPeerConnection
let statusChannel = null; // the side channel for "camera off" (see openStatusChannel)
let leaveTimer = null; // see listenForCalls
let timers = []; // timeouts and intervals to stop when the call finishes
let accessToken = ""; // for the "page closed" message below
const listeners = new Set();

function setCall(next) {
  call = next;
  listeners.forEach((listener) => listener());
}

function updateCall(key, changes) {
  if (call?.key === key) setCall({ ...call, ...changes });
}

const isCurrent = (key) => call?.key === key;
// A finished call that's only showing its message doesn't count as a call.
const inCall = () => Boolean(call && call.stage !== "ended");

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// React pages use this to show (and redraw) the current call.
export function useCall() {
  return useSyncExternalStore(subscribe, () => call);
}

function later(key, action, ms) {
  timers.push(setTimeout(() => { if (isCurrent(key)) action(); }, ms));
}

async function rememberToken() {
  const { data: { session } } = await supabase.auth.getSession();
  accessToken = session?.access_token || "";
}

// Tells the database the call is over. (A Supabase request only goes out
// once something waits for it, hence the .then.)
function endInDatabase(callId) {
  return supabase.rpc("end_call", { target_call: callId }).then(() => {}, () => {});
}

// Turns the database's messages (start_call / answer_call raise them) into
// what's shown on screen; anything else gets a general message.
function callError(error, fallback) {
  return error?.code === "P0001" && error.message ? error.message : fallback;
}

// ---------------------------------------------------------------------------
// Camera, microphone and the WebRTC connection
// ---------------------------------------------------------------------------

async function getMedia(kind) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser can't make calls. Try Chrome, Edge or Firefox.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
    });
  } catch (error) {
    if (error.name === "NotAllowedError") {
      throw new Error(kind === "video" ? "Please allow the camera and microphone for video calls." : "Please allow the microphone for calls.");
    }
    if (error.name === "NotFoundError") {
      throw new Error(kind === "video" ? "No camera or microphone was found." : "No microphone was found.");
    }
    if (error.name === "NotReadableError") throw new Error("Your camera or microphone is being used by another app.");
    throw new Error("Couldn't turn on your camera or microphone.");
  }
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

// A small side channel next to the voice and video, also straight between
// the two browsers. It says when a camera is turned off, so the other person
// sees a picture instead of a black screen. The caller opens it; the other
// browser receives it.
function openStatusChannel(key, channel) {
  statusChannel = channel;
  channel.onopen = sendStatus;
  if (channel.readyState === "open") sendStatus(); // already open when received
  channel.onmessage = (event) => {
    try {
      updateCall(key, { remoteCameraOff: Boolean(JSON.parse(event.data).cameraOff) });
    } catch {
      // Not a message from our own code; ignore it.
    }
  };
}

function sendStatus() {
  if (call && statusChannel?.readyState === "open") {
    statusChannel.send(JSON.stringify({ cameraOff: call.cameraOff }));
  }
}

function createPeer(key, localStream, isCaller) {
  const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));

  if (isCaller) openStatusChannel(key, connection.createDataChannel("status"));
  else connection.ondatachannel = (event) => openStatusChannel(key, event.channel);

  // The other person's voice and video.
  connection.ontrack = (event) => {
    updateCall(key, { remoteStream: event.streams[0] || new MediaStream([event.track]) });
  };

  let reconnectTimer = null;
  connection.onconnectionstatechange = () => {
    const state = connection.connectionState;
    if (state === "connected") {
      clearTimeout(reconnectTimer);
      if (call?.key === key && call.stage !== "active") {
        updateCall(key, { stage: "active", connectedAt: call.connectedAt || Date.now() });
      }
    } else if (state === "disconnected") {
      // Often comes back by itself (e.g. Wi-Fi hiccup); give it a moment.
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => { if (isCurrent(key)) hangUp("The connection was lost."); }, RECONNECT_MS);
      timers.push(reconnectTimer);
    } else if (state === "failed") {
      hangUp("The call couldn't connect. The network may be blocking calls.");
    }
  };
  return connection;
}

// Waits until the browser has collected its connection details (its
// addresses, found with the STUN servers), or GATHER_MS at most, then
// returns them all as text for the database.
function connectionDetails(connection) {
  return new Promise((resolve) => {
    const done = () => resolve(connection.localDescription.sdp);
    if (connection.iceGatheringState === "complete") return done();
    setTimeout(done, GATHER_MS);
    connection.addEventListener("icegatheringstatechange", () => {
      if (connection.iceGatheringState === "complete") done();
    });
  });
}

function startKeepAlive(key, callId) {
  timers.push(setInterval(async () => {
    await rememberToken();
    const { data: stillGoing, error } = await supabase.rpc("keep_call_alive", { target_call: callId });
    // The call ended while this browser missed the update.
    if (!error && stillGoing === false && isCurrent(key)) finish("Call ended.");
  }, KEEP_ALIVE_SECONDS * 1000));
}

// Stops everything the call uses. With a message, it stays on screen for a
// moment ("No answer.", "Call ended.") before the window closes.
function finish(message) {
  if (!call) return;
  // clearTimeout also stops intervals (browsers keep both in one list).
  timers.forEach((timer) => clearTimeout(timer));
  timers = [];
  if (peer) {
    peer.ontrack = null;
    peer.onconnectionstatechange = null;
    peer.ondatachannel = null;
    peer.close();
    peer = null;
  }
  statusChannel = null;
  stopStream(call.localStream);

  if (!message) {
    setCall(null);
    return;
  }
  const { key } = call;
  setCall({ ...call, stage: "ended", message, localStream: null, remoteStream: null });
  setTimeout(() => { if (isCurrent(key)) setCall(null); }, MESSAGE_MS);
}

// ---------------------------------------------------------------------------
// What the pages call
// ---------------------------------------------------------------------------

// Calls the other person in a conversation. Problems (no microphone, they're
// busy) show in the call window, so this never throws.
export async function startCall({ conversationId, kind, other }) {
  if (inCall()) return;
  const key = nextKey++;
  setCall({ key, id: null, conversationId, kind, direction: "outgoing", other, stage: "starting", muted: false, cameraOff: false });

  let localStream = null;
  try {
    localStream = await getMedia(kind);
    if (!isCurrent(key)) return stopStream(localStream); // cancelled meanwhile
    updateCall(key, { localStream });

    peer = createPeer(key, localStream, true);
    await peer.setLocalDescription(await peer.createOffer());
    const offer = await connectionDetails(peer);
    if (!isCurrent(key)) return;

    await rememberToken();
    const { data: callId, error } = await supabase.rpc("start_call", {
      target_conversation: conversationId,
      call_kind: kind,
      offer_sdp: offer
    });
    if (error) throw new Error(callError(error, "Couldn't start the call. Please try again."));
    if (!isCurrent(key)) {
      // Cancelled while the call was being saved.
      endInDatabase(callId);
      return;
    }
    updateCall(key, { id: callId, stage: "calling" });
    later(key, () => { if (call.stage === "calling") hangUp("No answer."); }, RING_SECONDS * 1000);
  } catch (error) {
    if (!isCurrent(key)) return stopStream(localStream);
    finish(error.message);
  }
}

// The person being called accepts.
export async function acceptCall() {
  if (call?.stage !== "ringing") return;
  const { key, id, kind, offer } = call;
  updateCall(key, { stage: "connecting" });

  let localStream = null;
  try {
    localStream = await getMedia(kind);
    if (!isCurrent(key)) return stopStream(localStream);
    updateCall(key, { localStream });

    peer = createPeer(key, localStream, false);
    await peer.setRemoteDescription({ type: "offer", sdp: offer });
    await peer.setLocalDescription(await peer.createAnswer());
    const answer = await connectionDetails(peer);
    if (!isCurrent(key)) return;

    await rememberToken();
    const { error } = await supabase.rpc("answer_call", { target_call: id, answer_sdp: answer });
    if (error) throw new Error(callError(error, "Couldn't answer the call."));
    startKeepAlive(key, id);
  } catch (error) {
    if (!isCurrent(key)) return stopStream(localStream);
    // The caller sees it as declined.
    endInDatabase(id);
    finish(error.message);
  }
}

// Hang up, cancel, or decline (the database decides which from the status).
// Also closes a finished call's message. Resolves once the database knows.
export function hangUp(message) {
  if (!inCall()) {
    setCall(null);
    return Promise.resolve();
  }
  const saved = call.id ? endInDatabase(call.id) : Promise.resolve();
  finish(message);
  return saved;
}

export function toggleMute() {
  if (!call?.localStream) return;
  const muted = !call.muted;
  call.localStream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
  updateCall(call.key, { muted });
}

export function toggleCamera() {
  if (!call?.localStream) return;
  const cameraOff = !call.cameraOff;
  call.localStream.getVideoTracks().forEach((track) => { track.enabled = !cameraOff; });
  updateCall(call.key, { cameraOff });
  sendStatus(); // tell the other browser
}

// ---------------------------------------------------------------------------
// Incoming calls and status changes (Realtime)
// ---------------------------------------------------------------------------

// Someone is calling this user.
async function handleIncoming(row) {
  if (inCall() || row.status !== "ringing") return;
  const { data: caller } = await supabase
    .from("profiles")
    .select("full_name, username, avatar_path")
    .eq("id", row.caller_id)
    .maybeSingle();
  if (inCall()) return;

  const key = nextKey++;
  setCall({
    key,
    id: row.id,
    conversationId: row.conversation_id,
    kind: row.kind,
    direction: "incoming",
    other: { id: row.caller_id, name: caller?.full_name || caller?.username || "Someone", avatarPath: caller?.avatar_path || "" },
    stage: "ringing",
    offer: row.offer,
    muted: false,
    cameraOff: false
  });
  // The caller's browser normally ends the ringing after 30 seconds; this is
  // in case it closed (the database also marks it missed within a minute).
  later(key, () => { if (call.stage === "ringing") finish(); }, (RING_SECONDS + 15) * 1000);
}

// The current call's row changed (answered, declined, ended...).
async function handleChange(row) {
  if (!inCall() || call.id !== row.id) return;
  const { key } = call;

  if (FINISHED.includes(row.status)) {
    if (call.stage === "ringing") finish(); // they cancelled; the chat line says "Missed"
    else if (row.status === "declined") finish("Call declined.");
    else if (call.stage === "calling") finish("No answer.");
    else finish("Call ended.");
    return;
  }

  if (row.status === "accepted") {
    if (call.direction === "incoming" && call.stage === "ringing") {
      finish(); // answered in another tab of the same account
    } else if (call.direction === "outgoing" && call.stage === "calling" && row.answer) {
      updateCall(key, { stage: "connecting" });
      try {
        await peer.setRemoteDescription({ type: "answer", sdp: row.answer });
        startKeepAlive(key, row.id);
      } catch {
        if (isCurrent(key)) hangUp("The call couldn't connect.");
      }
    }
  }
}

// Anything missed while not listening: a page opened while a call rings, or
// the moment between two dashboard layouts.
async function catchUp(userId) {
  if (inCall() && call.id) {
    const { data: row } = await supabase.from("calls").select(CALL_COLUMNS).eq("id", call.id).maybeSingle();
    if (row) handleChange(row);
    return;
  }
  if (inCall()) return;
  const { data: row } = await supabase
    .from("calls")
    .select(CALL_COLUMNS)
    .eq("callee_id", userId)
    .eq("status", "ringing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (row) handleIncoming(row);
}

// Used by the dashboard (useDashboardShell) while a user is signed in.
// Returns the function that stops listening.
//
// Calls live inside the dashboard: leaving it (e.g. typing the homepage
// address) ends the call, instead of the voice going on with no window.
// Moving between the dashboard's two layouts stops this and starts it again
// within a moment, which cancels the ending.
export function listenForCalls(userId) {
  clearTimeout(leaveTimer);
  const channel = supabase
    .channel(`calls:${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` }, ({ new: row }) => handleIncoming(row))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` }, ({ new: row }) => handleChange(row))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `caller_id=eq.${userId}` }, ({ new: row }) => handleChange(row))
    .subscribe((status) => { if (status === "SUBSCRIBED") catchUp(userId); });
  return () => {
    supabase.removeChannel(channel);
    leaveTimer = setTimeout(() => hangUp(), LEAVE_MS);
  };
}

// Closing or reloading the tab ends the call right away, so the other person
// isn't left waiting. A normal request could be cut off as the page closes;
// "keepalive" lets it finish. A call that's only ringing here is left alone:
// it may still ring in another tab.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (!inCall() || !call.id || call.stage === "ringing" || !accessToken) return;
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/end_call`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ target_call: call.id })
    }).catch(() => {});
  });
}
