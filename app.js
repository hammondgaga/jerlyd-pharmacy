/**
 * Jerlyd Pharmacy — browser client for Express + SQLite API.
 */

const TOKEN_KEY = "jerlyd-session-token";

/** @typedef {{ id: number; email: string; role: 'patient' | 'pharmacist'; displayName: string; createdAt?: string }} User */

/** @typedef {{ id: number; drugName: string; indication: string; dosage: string; duration: string; dispensedOn: string | null; pharmacistNote: string; patientFeedback: string; sideEffectsObserved: string; pharmacistDisplayName?: string; createdAt?: string; updatedAt?: string }} Prescription */

/** @typedef {{ id: number; email: string; displayName: string; createdAt: string; prescriptionCount: number }} PatientRow */

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

/** @param {string} path @param {RequestInit} [init] */
async function api(path, init = {}) {
  const headers = { Accept: "application/json", ...(init.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && typeof init.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`/api${path}`, { ...init, headers });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || res.statusText };
  }
  if (!res.ok) {
    const msg = data.error || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return data;
}

/** @type {User | null} */
let currentUser = null;

/** @type {'welcome' | 'patient' | 'admin'} */
let view = "welcome";

/** @type {'login' | 'register'} */
let patientSub = "login";

/** @type {'login' | 'register'} */
let adminSub = "login";

/** @type {string | null} */
let flash = null;
/** @type {'success' | 'error' | 'info'} */
let flashKind = "info";

/** @type {Prescription[] | null} */
let patientPrescriptions = null;

/** @type {PatientRow[] | null} */
let pharmacistPatients = null;

function setFlash(msg, kind = "info") {
  flash = msg;
  flashKind = kind;
}

function consumeFlash() {
  const m = flash;
  const k = flashKind;
  flash = null;
  return m ? { msg: m, kind: k } : null;
}

function renderNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-view") === view);
  });
}

function renderWelcome() {
  return `
    <section class="hero" aria-labelledby="welcome-title">
      <p class="pill">Welcome to your care portal</p>
      <h1 id="welcome-title">We are glad you are here</h1>
      <p class="hero-lead">
        Jerlyd Pharmacy helps you stay organized after your visit. Create a free account to
        track medications your pharmacist records for you, read indications and directions,
        and share feedback or side effects you notice.
      </p>
      <div class="hero-actions">
        <button type="button" class="btn btn-primary" data-go="patient">Patient sign-in</button>
        <button type="button" class="btn btn-secondary" data-go="patient-register">Create patient account</button>
        <button type="button" class="btn btn-secondary" data-go="admin">Pharmacist</button>
      </div>
    </section>
    <section class="panel" aria-labelledby="how-title">
      <h2 id="how-title">How this portal works</h2>
      <p class="panel-sub">
        Anyone with this site link can <strong>register as a patient</strong> with an email and password.
        Your pharmacist uses a separate staff account to record medications dispensed from Jerlyd Pharmacy.
        Patients cannot add their own medications; they can only view what the pharmacy has listed and add notes.
      </p>
      <ul class="muted" style="margin:0;padding-left:1.2rem;">
        <li>Patients: create an account, then sign in any time to see listed medications and update feedback.</li>
        <li>Pharmacists: staff accounts require the invite code configured on the server.</li>
        <li>Data is stored in the pharmacy database on the server (not in your browser).</li>
      </ul>
    </section>
  `;
}

function alertFromFlash() {
  const f = consumeFlash();
  return f
    ? `<div class="alert alert-${f.kind === "error" ? "error" : f.kind === "success" ? "success" : "info"}" role="status">${escapeHtml(f.msg)}</div>`
    : "";
}

function renderPatientAuth() {
  const alert = alertFromFlash();
  if (patientSub === "register") {
    return `
    <section class="panel">
      <h2>Create your patient account</h2>
      <p class="panel-sub">Use the email you would like Jerlyd Pharmacy to recognize for this portal.</p>
      ${alert}
      <form id="patientRegisterForm" class="form-grid">
        <div>
          <label for="prEmail">Email</label>
          <input id="prEmail" name="email" type="email" autocomplete="email" required />
        </div>
        <div>
          <label for="prName">Preferred name</label>
          <input id="prName" name="displayName" autocomplete="name" required maxlength="120" />
        </div>
        <div>
          <label for="prPw">Password</label>
          <input id="prPw" name="password" type="password" minlength="8" autocomplete="new-password" required />
        </div>
        <div>
          <label for="prPw2">Confirm password</label>
          <input id="prPw2" name="password2" type="password" minlength="8" autocomplete="new-password" required />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Create account</button>
          <button type="button" class="btn btn-secondary" data-patient-sub="login">Already have an account</button>
          <button type="button" class="btn btn-secondary" data-cancel>Home</button>
        </div>
      </form>
    </section>`;
  }

  return `
    <section class="panel">
      <h2>Patient sign-in</h2>
      <p class="panel-sub">Sign in with the email and password you used when you created your account.</p>
      ${alert}
      <form id="patientLoginForm" class="form-grid">
        <div>
          <label for="plEmail">Email</label>
          <input id="plEmail" name="email" type="email" autocomplete="username" required />
        </div>
        <div>
          <label for="plPw">Password</label>
          <input id="plPw" name="password" type="password" autocomplete="current-password" required />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Sign in</button>
          <button type="button" class="btn btn-secondary" data-patient-sub="register">Create account</button>
          <button type="button" class="btn btn-secondary" data-cancel>Home</button>
        </div>
      </form>
    </section>
  `;
}

/** @param {User} user @param {Prescription[]} rx */
function renderPatientDashboard(user, rx) {
  const alert = alertFromFlash();
  const list =
    rx.length === 0
      ? `<div class="empty-state">
          <p><strong>No medications listed yet.</strong></p>
          <p class="muted">When your pharmacist records a dispensed medication for your account, it will appear here.</p>
        </div>`
      : `<div class="med-list">${rx
          .map(
            (m) => `
        <article class="med-card" data-rx-id="${escapeHtml(String(m.id))}">
          <h3>${escapeHtml(m.drugName)}</h3>
          <p class="muted" style="margin:0 0 0.75rem;font-size:0.85rem;">Recorded by ${escapeHtml(m.pharmacistDisplayName || "your pharmacist")}</p>
          <dl class="med-meta">
            <div><dt>Indication</dt><dd>${escapeHtml(m.indication) || "—"}</dd></div>
            <div><dt>Dosage &amp; directions</dt><dd>${escapeHtml(m.dosage) || "—"}</dd></div>
            <div><dt>Duration</dt><dd>${escapeHtml(m.duration) || "—"}</dd></div>
            <div><dt>Dispensed</dt><dd>${escapeHtml(m.dispensedOn || "") || "—"}</dd></div>
          </dl>
          ${
            m.pharmacistNote
              ? `<p class="muted" style="margin:0 0 0.75rem;font-size:0.88rem;"><strong>From your pharmacist:</strong> ${escapeHtml(m.pharmacistNote)}</p>`
              : ""
          }
          <div class="divider"></div>
          <form class="rx-update-form" data-rx-id="${escapeHtml(String(m.id))}">
            <label for="fb-${escapeHtml(String(m.id))}">Your feedback or questions</label>
            <textarea id="fb-${escapeHtml(String(m.id))}" name="patientFeedback" rows="3" placeholder="How is the medication working for you? Any questions?">${escapeHtml(m.patientFeedback)}</textarea>
            <label for="se-${escapeHtml(String(m.id))}" style="margin-top:0.75rem;">Observed side effects</label>
            <textarea id="se-${escapeHtml(String(m.id))}" name="sideEffectsObserved" rows="3" placeholder="Describe anything unusual you noticed. If this is urgent, seek medical care.">${escapeHtml(m.sideEffectsObserved)}</textarea>
            <div class="form-actions" style="margin-top:0.75rem;">
              <button type="submit" class="btn btn-primary">Save notes</button>
            </div>
          </form>
        </article>`
          )
          .join("")}</div>`;

  return `
    <section class="panel">
      <h2>Hello, ${escapeHtml(user.displayName)}</h2>
      <p class="panel-sub">Medications your pharmacist has recorded for you at Jerlyd Pharmacy.</p>
      ${alert}
      <p class="muted" style="margin-bottom:1rem;">Signed in as ${escapeHtml(user.email)}
        · <button type="button" class="btn-small" id="patientSignOut">Sign out</button>
      </p>
      ${list}
    </section>
  `;
}

function renderAdminAuth() {
  const alert = alertFromFlash();
  if (adminSub === "register") {
    return `
    <section class="panel">
      <h2>Pharmacist staff registration</h2>
      <p class="panel-sub">Enter the staff invite code provided by your pharmacy IT or manager. Patient accounts do not need this code.</p>
      ${alert}
      <form id="adminRegisterForm" class="form-grid">
        <div>
          <label for="arEmail">Work email</label>
          <input id="arEmail" name="email" type="email" autocomplete="email" required />
        </div>
        <div>
          <label for="arName">Display name</label>
          <input id="arName" name="displayName" autocomplete="name" required maxlength="120" />
        </div>
        <div>
          <label for="arInvite">Staff invite code</label>
          <input id="arInvite" name="inviteCode" autocomplete="off" required />
        </div>
        <div>
          <label for="arPw">Password</label>
          <input id="arPw" name="password" type="password" minlength="8" autocomplete="new-password" required />
        </div>
        <div>
          <label for="arPw2">Confirm password</label>
          <input id="arPw2" name="password2" type="password" minlength="8" autocomplete="new-password" required />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Create staff account</button>
          <button type="button" class="btn btn-secondary" data-admin-sub="login">Staff sign-in</button>
          <button type="button" class="btn btn-secondary" data-cancel>Home</button>
        </div>
      </form>
    </section>`;
  }

  return `
    <section class="panel">
      <h2>Pharmacist sign-in</h2>
      <p class="panel-sub">Sign in to view registered patients and record dispensed medications.</p>
      ${alert}
      <form id="adminLoginForm" class="form-grid">
        <div>
          <label for="alEmail">Email</label>
          <input id="alEmail" name="email" type="email" autocomplete="username" required />
        </div>
        <div>
          <label for="alPw">Password</label>
          <input id="alPw" name="password" type="password" autocomplete="current-password" required />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Sign in</button>
          <button type="button" class="btn btn-secondary" data-admin-sub="register">New staff account</button>
          <button type="button" class="btn btn-secondary" data-cancel>Home</button>
        </div>
      </form>
    </section>
  `;
}

/** @param {PatientRow[]} patients */
function renderAdminDashboard(patients) {
  const alert = alertFromFlash();
  const rows = patients
    .map((p) => {
      const count = typeof p.prescriptionCount === "number" ? p.prescriptionCount : 0;
      return `<tr>
        <td><strong>${escapeHtml(p.displayName)}</strong><br/><span class="muted" style="font-size:0.82rem;">${escapeHtml(p.email)} · #${p.id}</span></td>
        <td>${count}</td>
        <td class="row-actions">
          <button type="button" class="btn-small" data-add-rx="${p.id}">Add medication</button>
          <button type="button" class="btn-small" data-view-rx="${p.id}">View / manage</button>
        </td>
      </tr>`;
    })
    .join("");

  const table =
    patients.length === 0
      ? `<p class="empty-state muted">No patient accounts yet. Patients can register from the public link; they will appear here automatically.</p>`
      : `<div class="table-wrap"><table>
        <thead><tr><th>Patient</th><th>Meds listed</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;

  return `
    ${alert}
    <section class="panel">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:0.75rem;align-items:flex-start;">
        <div>
          <h2>Pharmacist dashboard</h2>
          <p class="panel-sub" style="margin-bottom:0;">Patients who have registered appear below. Only pharmacists can add or remove medication records.</p>
        </div>
        <button type="button" class="btn btn-secondary" id="adminSignOut">Sign out</button>
      </div>
      ${table}
    </section>
    <section class="panel" id="rxPanel" hidden>
      <h2 id="rxPanelTitle">Medications for patient</h2>
      <p class="panel-sub" id="rxPanelSub"></p>
      <div id="rxPanelBody"></div>
    </section>
    <section class="panel" id="addRxPanel" hidden>
      <h2>Record dispensed medication</h2>
      <p class="panel-sub">This information is visible to the patient when they sign in.</p>
      <form id="addRxForm" class="form-grid">
        <input type="hidden" name="patientId" id="addRxPatientId" />
        <div class="form-grid two" style="grid-column:1/-1;">
          <div>
            <label for="rxDrug">Medication name</label>
            <input id="rxDrug" name="drugName" required placeholder="e.g. Amoxicillin 500 mg capsule" />
          </div>
          <div>
            <label for="rxDispensed">Dispensed on</label>
            <input id="rxDispensed" name="dispensedOn" type="date" />
          </div>
        </div>
        <div>
          <label for="rxIndication">Indication</label>
          <input id="rxIndication" name="indication" required placeholder="What it is being used for" />
        </div>
        <div class="form-grid two" style="grid-column:1/-1;">
          <div>
            <label for="rxDosage">Dosage &amp; directions</label>
            <textarea id="rxDosage" name="dosage" rows="2" required placeholder="e.g. Take 1 capsule by mouth three times daily with food"></textarea>
          </div>
          <div>
            <label for="rxDuration">Duration</label>
            <input id="rxDuration" name="duration" required placeholder="e.g. 10 days" />
          </div>
        </div>
        <div>
          <label for="rxNote">Pharmacist note (optional)</label>
          <textarea id="rxNote" name="pharmacistNote" rows="2" placeholder="Counseling highlights, storage, cautions…"></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save medication</button>
          <button type="button" class="btn btn-secondary" id="cancelAddRx">Cancel</button>
        </div>
      </form>
    </section>
  `;
}

async function render() {
  const root = document.getElementById("appRoot");
  if (!root) return;

  if (currentUser?.role === "patient" && view === "patient" && patientPrescriptions === null) {
    try {
      const data = await api("/patient/prescriptions");
      patientPrescriptions = data.prescriptions;
    } catch {
      patientPrescriptions = [];
    }
  }

  if (currentUser?.role === "pharmacist" && view === "admin" && pharmacistPatients === null) {
    try {
      const data = await api("/pharmacist/patients");
      pharmacistPatients = data.patients || [];
    } catch {
      pharmacistPatients = [];
    }
  }

  let html = "";
  if (view === "welcome") {
    html = renderWelcome();
  } else if (view === "patient") {
    if (currentUser?.role === "patient") {
      html = renderPatientDashboard(currentUser, patientPrescriptions || []);
    } else {
      html = renderPatientAuth();
    }
  } else if (view === "admin") {
    if (currentUser?.role === "pharmacist") {
      html = renderAdminDashboard(pharmacistPatients || []);
    } else {
      html = renderAdminAuth();
    }
  }

  root.innerHTML = html;
  renderNav();
  wireEvents();
}

function wireEvents() {
  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", () => {
      const v = el.getAttribute("data-go");
      if (v === "patient") {
        view = "patient";
        patientSub = "login";
        render();
      } else if (v === "patient-register") {
        view = "patient";
        patientSub = "register";
        render();
      } else if (v === "admin") {
        view = "admin";
        adminSub = "login";
        render();
      }
    });
  });

  document.querySelectorAll("[data-patient-sub]").forEach((el) => {
    el.addEventListener("click", () => {
      const s = el.getAttribute("data-patient-sub");
      if (s === "login" || s === "register") {
        patientSub = s;
        render();
      }
    });
  });

  document.querySelectorAll("[data-admin-sub]").forEach((el) => {
    el.addEventListener("click", () => {
      const s = el.getAttribute("data-admin-sub");
      if (s === "login" || s === "register") {
        adminSub = s;
        render();
      }
    });
  });

  document.querySelectorAll("[data-cancel]").forEach((el) => {
    el.addEventListener("click", () => {
      view = "welcome";
      render();
    });
  });

  document.getElementById("patientLoginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: String(fd.get("email") || ""),
          password: String(fd.get("password") || ""),
        }),
      });
      if (data.user.role !== "patient") {
        setFlash("This email is registered as a pharmacist. Use the pharmacist sign-in instead.", "error");
        render();
        return;
      }
      setToken(data.token);
      currentUser = data.user;
      patientPrescriptions = null;
      setFlash("Signed in successfully.", "success");
      await render();
    } catch (err) {
      setFlash(/** @type {Error} */ (err).message, "error");
      render();
    }
  });

  document.getElementById("patientRegisterForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const pw = String(fd.get("password") || "");
    const pw2 = String(fd.get("password2") || "");
    if (pw !== pw2) {
      setFlash("Passwords did not match.", "error");
      render();
      return;
    }
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: String(fd.get("email") || ""),
          password: pw,
          displayName: String(fd.get("displayName") || ""),
          role: "patient",
        }),
      });
      setToken(data.token);
      currentUser = data.user;
      patientPrescriptions = null;
      patientSub = "login";
      setFlash("Account created. You are signed in.", "success");
      await render();
    } catch (err) {
      setFlash(/** @type {Error} */ (err).message, "error");
      render();
    }
  });

  document.getElementById("patientSignOut")?.addEventListener("click", () => {
    setToken(null);
    currentUser = null;
    patientPrescriptions = null;
    view = "patient";
    patientSub = "login";
    setFlash("You have been signed out.", "info");
    render();
  });

  document.querySelectorAll(".rx-update-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rxId = form.getAttribute("data-rx-id");
      if (!rxId) return;
      const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
      try {
        await api(`/patient/prescriptions/${rxId}`, {
          method: "PATCH",
          body: JSON.stringify({
            patientFeedback: String(fd.get("patientFeedback") || ""),
            sideEffectsObserved: String(fd.get("sideEffectsObserved") || ""),
          }),
        });
        patientPrescriptions = null;
        setFlash("Your notes were saved. Thank you for keeping us informed.", "success");
        await render();
      } catch (err) {
        setFlash(/** @type {Error} */ (err).message, "error");
        render();
      }
    });
  });

  document.getElementById("adminLoginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: String(fd.get("email") || ""),
          password: String(fd.get("password") || ""),
        }),
      });
      if (data.user.role !== "pharmacist") {
        setFlash("This email is registered as a patient. Use the patient portal instead.", "error");
        render();
        return;
      }
      setToken(data.token);
      currentUser = data.user;
      pharmacistPatients = null;
      setFlash("Welcome back.", "success");
      await render();
    } catch (err) {
      setFlash(/** @type {Error} */ (err).message, "error");
      render();
    }
  });

  document.getElementById("adminRegisterForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const pw = String(fd.get("password") || "");
    const pw2 = String(fd.get("password2") || "");
    if (pw !== pw2) {
      setFlash("Passwords did not match.", "error");
      render();
      return;
    }
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: String(fd.get("email") || ""),
          password: pw,
          displayName: String(fd.get("displayName") || ""),
          role: "pharmacist",
          inviteCode: String(fd.get("inviteCode") || ""),
        }),
      });
      setToken(data.token);
      currentUser = data.user;
      pharmacistPatients = null;
      adminSub = "login";
      setFlash("Staff account created. You are signed in.", "success");
      await render();
    } catch (err) {
      setFlash(/** @type {Error} */ (err).message, "error");
      render();
    }
  });

  document.getElementById("adminSignOut")?.addEventListener("click", () => {
    setToken(null);
    currentUser = null;
    pharmacistPatients = null;
    view = "admin";
    adminSub = "login";
    setFlash("Signed out of pharmacist account.", "info");
    render();
  });

  document.querySelectorAll("[data-add-rx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pid = btn.getAttribute("data-add-rx");
      if (!pid) return;
      const panel = document.getElementById("addRxPanel");
      const hidden = document.getElementById("addRxPatientId");
      if (panel && hidden) {
        hidden.value = pid;
        panel.hidden = false;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("rxDrug")?.focus();
      }
    });
  });

  document.getElementById("cancelAddRx")?.addEventListener("click", () => {
    const panel = document.getElementById("addRxPanel");
    if (panel) panel.hidden = true;
  });

  document.getElementById("addRxForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const patientUserId = Number(fd.get("patientId"));
    try {
      await api("/pharmacist/prescriptions", {
        method: "POST",
        body: JSON.stringify({
          patientUserId,
          drugName: String(fd.get("drugName") || ""),
          indication: String(fd.get("indication") || ""),
          dosage: String(fd.get("dosage") || ""),
          duration: String(fd.get("duration") || ""),
          dispensedOn: String(fd.get("dispensedOn") || ""),
          pharmacistNote: String(fd.get("pharmacistNote") || ""),
        }),
      });
      const panel = document.getElementById("addRxPanel");
      if (panel) panel.hidden = true;
      pharmacistPatients = null;
      setFlash("Medication saved.", "success");
      await render();
      openRxPanel(String(patientUserId));
    } catch (err) {
      setFlash(/** @type {Error} */ (err).message, "error");
      render();
    }
  });

  document.querySelectorAll("[data-view-rx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pid = btn.getAttribute("data-view-rx");
      if (pid) void openRxPanel(pid);
    });
  });
}

/** @param {string} patientId */
async function openRxPanel(patientId) {
  const panel = document.getElementById("rxPanel");
  const title = document.getElementById("rxPanelTitle");
  const sub = document.getElementById("rxPanelSub");
  const body = document.getElementById("rxPanelBody");
  if (!panel || !title || !sub || !body) return;
  try {
    const data = await api(`/pharmacist/patients/${patientId}/prescriptions`);
    const patient = data.patient;
    const rx = data.prescriptions || [];
    panel.hidden = false;
    title.textContent = `Medications — ${patient.displayName}`;
    sub.innerHTML = `${escapeHtml(patient.email)} · Patient #${patient.id}`;

    body.innerHTML =
      rx.length === 0
        ? `<p class="muted">No medications listed yet for this patient.</p>`
        : `<div class="table-wrap"><table>
        <thead><tr><th>Medication</th><th>Indication</th><th>Dosage</th><th>Duration</th><th>Patient notes</th><th></th></tr></thead>
        <tbody>${rx
          .map(
            (m) => `<tr>
          <td><strong>${escapeHtml(m.drugName)}</strong><br/><span class="muted" style="font-size:0.8rem;">${escapeHtml(m.dispensedOn || "") || "—"}</span></td>
          <td>${escapeHtml(m.indication)}</td>
          <td>${escapeHtml(m.dosage)}</td>
          <td>${escapeHtml(m.duration)}</td>
          <td>
            <div class="muted" style="font-size:0.82rem;"><strong>Feedback:</strong> ${escapeHtml(m.patientFeedback) || "—"}</div>
            <div class="muted" style="font-size:0.82rem;margin-top:0.35rem;"><strong>Side effects:</strong> ${escapeHtml(m.sideEffectsObserved) || "—"}</div>
          </td>
          <td><button type="button" class="btn-small" data-del-rx="${escapeHtml(String(m.id))}">Remove</button></td>
        </tr>`
          )
          .join("")}</tbody></table></div>`;

    body.querySelectorAll("[data-del-rx]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-del-rx");
        if (!id || !confirm("Remove this medication record from the patient portal?")) return;
        try {
          await api(`/pharmacist/prescriptions/${id}`, { method: "DELETE" });
          pharmacistPatients = null;
          await openRxPanel(patientId);
        } catch (err) {
          alert(/** @type {Error} */ (err).message);
        }
      });
    });

    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    setFlash(/** @type {Error} */ (err).message, "error");
    render();
  }
}

document.getElementById("siteNav")?.addEventListener("click", (e) => {
  const t = /** @type {HTMLElement} */ (e.target);
  const v = t.closest("[data-view]")?.getAttribute("data-view");
  if (v === "welcome" || v === "patient" || v === "admin") {
    view = v;
    if (v === "patient" && currentUser?.role !== "patient") patientSub = "login";
    if (v === "admin" && currentUser?.role !== "pharmacist") adminSub = "login";
    render();
  }
});

function initFooter() {
  const el = document.getElementById("demoNote");
  if (el) {
    el.textContent =
      "Run the Jerlyd server (npm start) and open this site from that address so the app can reach the database API. Do not open the HTML file directly from disk.";
  }
}

async function bootstrap() {
  initFooter();
  const token = getToken();
  if (!token) {
    currentUser = null;
    await render();
    return;
  }
  try {
    const data = await api("/me");
    currentUser = data.user;
    patientPrescriptions = null;
    pharmacistPatients = null;
  } catch {
    setToken(null);
    currentUser = null;
  }
  await render();
}

function onHashChange() {
  const h = (location.hash || "").replace(/^#/, "").toLowerCase();
  if (h === "register" || h === "signup" || h === "patient-register") {
    view = "patient";
    patientSub = "register";
    void render();
  }
}

window.addEventListener("hashchange", onHashChange);

bootstrap().then(() => onHashChange());
