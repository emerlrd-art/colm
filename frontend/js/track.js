const TRACK_ICONS = {
  submitted: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/></svg>',
  verification: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  processing: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  ready: '<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>'
};
const TRACK_STEPS = [
  { key: "submitted", label: "Submitted", description: "Your request was received by the Registrar." },
  { key: "verification", label: "Verification", description: "Your documents are being verified by the Registrar's Office." },
  { key: "processing", label: "Processing", description: "Your request is being processed and prepared." },
  { key: "ready", label: "Ready for Release", description: "Your document is ready to be released." }
];
const TRACK_PROGRESS = { submitted: 25, verification: 45, processing: 72, ready: 100 };
const trackEsc = value => String(value == null ? "" : value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const trackDate = value => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString([], { month: "short", day: "numeric" });
};
const trackDateTime = value => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-PH", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila"
  }).format(date);
};

function renderTrack(request) {
  const timeline = document.getElementById("statusTimeline");
  const details = document.getElementById("trackDetails");
  const card = document.getElementById("trackCard");
  const subtitle = document.getElementById("trackSubtitle");
  const requestedAt = document.getElementById("trackRequestedAt");
  const updated = document.getElementById("trackUpdated");
  const order = TRACK_STEPS.map(step => step.key);
  const hasRequest = !!request;
  const current = hasRequest ? Math.max(0, order.indexOf(request.status)) : -1;
  const rejected = hasRequest && request.requestStatus === "REJECTED";
  card.classList.toggle("is-empty", !hasRequest);
  timeline.innerHTML = '<span class="timeline-rail" aria-hidden="true"></span>' + TRACK_STEPS.map((step, index) => {
    const done = hasRequest && (index < current || (request.status === "ready" && index === current));
    const active = hasRequest && index === current && !done;
    const cls = done ? "is-complete" : active ? (rejected ? "is-rejected" : "is-active") : "is-pending";
    const date = hasRequest && request.dates ? trackDate(request.dates[step.key]) : "";
    const sub = done ? "Completed" : active
      ? (rejected ? "Rejected" : request.status === "completed" ? "Completed" : request.status === "needs_correction" ? "Action Needed" : "In Progress")
      : "";
    return `<div class="timeline-step ${cls}"${active ? ' aria-current="step"' : ""}>
      <span class="step-node" aria-hidden="true">${done ? '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>' : ""}</span>
      <div class="step-pill">
        <span class="step-ico" aria-hidden="true">${TRACK_ICONS[step.key]}</span>
        <span class="step-text"><strong>${step.label}</strong>${sub ? `<small>${sub}</small>` : ""}</span>
        <span class="step-date">${trackEsc(date)}</span>
      </div>
    </div>`;
  }).join("");

  if (!hasRequest) {
    subtitle.textContent = "Enter your tracking number to see where your request is.";
    requestedAt.hidden = true;
    requestedAt.textContent = "";
    updated.textContent = "—";
    details.innerHTML = `<div class="track-empty">
      <span class="track-empty-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></span>
      <h3>No request yet</h3>
      <p>Once you enter a tracking number, the status, progress and expected completion date of your request will show here.</p>
      <p class="track-empty-hint">You can find the tracking number in the email we sent you after you submitted your request.</p>
    </div>`;
    return;
  }

  const step = TRACK_STEPS[current] || TRACK_STEPS[0];
  const percent = TRACK_PROGRESS[request.status] || 0;
  const statusText = rejected ? "Rejected" : request.statusLabel || (request.status === "ready" ? "Ready" : "In Progress");
  const requestedDateTime = trackDateTime(request.createdAt || request.dates?.submitted);
  requestedAt.hidden = !requestedDateTime;
  requestedAt.textContent = requestedDateTime ? "Date and time requested: " + requestedDateTime : "";
  const rejectionReason = ["REJECTED", "CANCELLED"].includes(request.requestStatus) ? request.reason : "";
  const showExpected = !["REJECTED", "CANCELLED"].includes(request.requestStatus);
  subtitle.textContent = "Tracking #" + trackEsc(request.requestNo);
  details.innerHTML = `<dl class="track-facts">
      <dt>Status:</dt><dd${rejected ? ' class="track-rejected-text"' : ""}>${trackEsc(statusText)}</dd>
      <dt>Details:</dt><dd>${trackEsc(request.description || step.description)}</dd>
      ${request.documentName ? `<dt>Document:</dt><dd>${trackEsc(request.documentName)}</dd>` : ""}
      ${rejectionReason ? `<dt>Reason:</dt><dd>${trackEsc(rejectionReason)}</dd>` : ""}
      ${rejected ? "" : `<dt>Status summary:</dt><dd class="track-pct"><span>${percent}%</span></dd>`}
    </dl>
    ${rejected ? "" : `<div class="track-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div>`}
    ${showExpected ? `<dl class="track-facts"><dt>Expected Completion:</dt><dd>${trackEsc(request.completionDate || "To be announced")}</dd></dl>` : ""}`;
  updated.textContent = request.updatedAt
    ? new Date(request.updatedAt).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
}

let trackRef = "";
let trackTimer = null;
let trackLastJson = "";

async function lookupTrack(ref, quiet = false) {
  const value = String(ref || "").trim();
  const message = document.getElementById("trackLookupMsg");
  const input = document.getElementById("trackRefInput");
  const say = (text, isError) => {
    if (quiet) return;
    message.textContent = text;
    message.classList.toggle("error", !!isError);
  };
  if (!value) {
    say("Please enter your tracking number.", true);
    renderTrack(null);
    input.focus();
    return;
  }
  say("Looking for your request…");
  try {
    const response = await fetch("../api/track.php?ref=" + encodeURIComponent(value) + (quiet ? "&live=1" : ""), {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    if (quiet && !response.ok) {
      clearInterval(trackTimer);
      trackTimer = null;
      return;
    }
    if (response.status === 429) {
      say("Too many tries. Please wait a few minutes and try again.", true);
      renderTrack(null);
      return;
    }
    if (response.status === 404) {
      say("No request matches that tracking number. Please check the email we sent you.", true);
      renderTrack(null);
      return;
    }
    if (!response.ok) throw new Error("Tracking request failed with HTTP " + response.status);
    const data = await response.json();
    if (!data || !data.request) {
      say("Tracking number not found. Please check the email we sent you.", true);
      renderTrack(null);
      return;
    }
    const json = JSON.stringify(data.request);
    if (quiet && json === trackLastJson) return;
    trackLastJson = json;
    say("Request found.", false);
    renderTrack(data.request);
    if (!quiet) {
      trackRef = value;
      startTrackPolling();
    }
  } catch (error) {
    if (quiet) return;
    say("Tracking is not available right now. Please try again later.", true);
    renderTrack(null);
  }
}

function startTrackPolling() {
  clearInterval(trackTimer);
  trackTimer = setInterval(() => {
    if (trackRef && !document.hidden) lookupTrack(trackRef, true);
  }, 10000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && trackRef) lookupTrack(trackRef, true);
});
document.getElementById("trackForm").addEventListener("submit", event => {
  event.preventDefault();
  lookupTrack(document.getElementById("trackRefInput").value);
});

renderTrack(null);
const emailReference = new URLSearchParams(location.search).get("ref");
if (emailReference) {
  document.getElementById("trackRefInput").value = emailReference;
  lookupTrack(emailReference);
}
