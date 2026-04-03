import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyARdk5DaF17f-e06vnNqVCTwInMn5qPJB0",
  authDomain: "maya-927cb.firebaseapp.com",
  projectId: "maya-927cb",
  storageBucket: "maya-927cb.firebasestorage.app",
  messagingSenderId: "898371027452",
  appId: "1:898371027452:web:9cc3c0efffc367d7d0f279"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const eventForm = document.getElementById("eventForm");
const eventDateInput = document.getElementById("eventDate");
const eventTimeInput = document.getElementById("eventTime");
const durationMinutesInput = document.getElementById("durationMinutes");
const triggersInput = document.getElementById("triggers");
const dailyMedicationInput = document.getElementById("dailyMedication");
const rescueMedicationInput = document.getElementById("rescueMedication");
const symptomsInput = document.getElementById("symptoms");
const notesInput = document.getElementById("notes");

const eventsTableBody = document.getElementById("eventsTableBody");
const mobileCards = document.getElementById("mobileCards");
const totalEventsEl = document.getElementById("totalEvents");
const lastEventTextEl = document.getElementById("lastEventText");
const timeSinceLastNowEl = document.getElementById("timeSinceLastNow");
const syncStatusEl = document.getElementById("syncStatus");

const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");

const EVENTS_COLLECTION = "maya_events";
let events = [];
let unsubscribeEvents = null;

init();

function init() {
  setDefaultDateTime();
  bindEvents();
  signIn();
}

function bindEvents() {
  eventForm.addEventListener("submit", handleSubmit);
  resetBtn.addEventListener("click", () => {
    setTimeout(setDefaultDateTime, 0);
  });
  clearAllBtn.addEventListener("click", handleClearAll);
  downloadPdfBtn.addEventListener("click", downloadPdf);
  setInterval(updateLiveTimeSinceLast, 60000);
}

async function signIn() {
  try {
    syncStatusEl.textContent = "Conectando...";
    await signInAnonymously(auth);

    onAuthStateChanged(auth, (user) => {
      if (!user) {
        syncStatusEl.textContent = "Sin sesión";
        return;
      }

      syncStatusEl.textContent = "Sincronizado";
      subscribeToEvents();
    });
  } catch (error) {
    console.error(error);
    syncStatusEl.textContent = "Error de conexión";
    showToast("Error conectando con Firebase.");
  }
}

function subscribeToEvents() {
  if (unsubscribeEvents) unsubscribeEvents();

  const q = query(collection(db, EVENTS_COLLECTION), orderBy("timestamp", "desc"));

  unsubscribeEvents = onSnapshot(
    q,
    (snapshot) => {
      events = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));
      renderAll();
      syncStatusEl.textContent = "Sincronizado";
    },
    (error) => {
      console.error(error);
      syncStatusEl.textContent = "Error al sincronizar";
      showToast("No se han podido cargar los eventos.");
    }
  );
}

async function handleSubmit(event) {
  event.preventDefault();

  const date = eventDateInput.value;
  const time = eventTimeInput.value;
  const durationMinutes = durationMinutesInput.value.trim();

  if (!date || !time || !durationMinutes) {
    showToast("Faltan datos obligatorios.");
    return;
  }

  const composedDate = new Date(`${date}T${time}`);
  if (Number.isNaN(composedDate.getTime())) {
    showToast("Fecha u hora no válidas.");
    return;
  }

  const payload = {
    date,
    time,
    durationMinutes,
    triggers: triggersInput.value.trim(),
    dailyMedication: dailyMedicationInput.value.trim(),
    rescueMedication: rescueMedicationInput.value.trim(),
    symptoms: symptomsInput.value.trim(),
    notes: notesInput.value.trim(),
    timestamp: composedDate.toISOString(),
    createdAt: new Date().toISOString()
  };

  try {
    saveBtn.disabled = true;
    saveBtn.textContent = "Guardando...";
    await addDoc(collection(db, EVENTS_COLLECTION), payload);
    eventForm.reset();
    setDefaultDateTime();
    showToast("Evento guardado.");
  } catch (error) {
    console.error(error);
    showToast("No se ha podido guardar.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Guardar evento";
  }
}

async function handleDelete(id) {
  const ok = window.confirm("¿Eliminar este evento?");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, EVENTS_COLLECTION, id));
    showToast("Evento eliminado.");
  } catch (error) {
    console.error(error);
    showToast("No se ha podido eliminar.");
  }
}

async function handleClearAll() {
  if (!events.length) {
    showToast("No hay eventos para borrar.");
    return;
  }

  const ok = window.confirm(
    "Vas a borrar todos los eventos de todos los dispositivos. ¿Seguro?"
  );

  if (!ok) return;

  try {
    clearAllBtn.disabled = true;
    clearAllBtn.textContent = "Borrando...";

    const snapshot = await getDocs(collection(db, EVENTS_COLLECTION));
    const batch = writeBatch(db);

    snapshot.forEach((item) => {
      batch.delete(item.ref);
    });

    await batch.commit();
    showToast("Registro borrado.");
  } catch (error) {
    console.error(error);
    showToast("No se ha podido borrar todo.");
  } finally {
    clearAllBtn.disabled = false;
    clearAllBtn.textContent = "Borrar todo";
  }
}

function renderAll() {
  renderSummary();
  renderDesktopTable();
  renderMobileCards();
}

function renderSummary() {
  totalEventsEl.textContent = String(events.length);

  if (!events.length) {
    lastEventTextEl.textContent = "—";
    timeSinceLastNowEl.textContent = "—";
    return;
  }

  const latest = events[0];
  lastEventTextEl.textContent = `${formatDateDisplay(latest.timestamp)} · ${latest.time}`;
  timeSinceLastNowEl.textContent = diffFromNow(latest.timestamp);
}

function renderDesktopTable() {
  if (!events.length) {
    eventsTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="10">Todavía no hay eventos guardados.</td>
      </tr>
    `;
    return;
  }

  const chronological = [...events].reverse();

  const diffMap = new Map();
  chronological.forEach((item, index) => {
    if (index === 0) {
      diffMap.set(item.id, "Primer registro");
      return;
    }

    const previous = chronological[index - 1];
    diffMap.set(
      item.id,
      humanizeDuration(
        new Date(item.timestamp).getTime() - new Date(previous.timestamp).getTime()
      )
    );
  });

  eventsTableBody.innerHTML = events
    .map((item) => {
      return `
        <tr>
          <td>${escapeHtml(formatDateDisplay(item.timestamp))}</td>
          <td><span class="badge-time">${escapeHtml(diffMap.get(item.id) || "—")}</span></td>
          <td>${escapeHtml(item.time || "—")}</td>
          <td>${escapeHtml(item.durationMinutes || "—")} min</td>
          <td>${escapeHtml(item.triggers || "—")}</td>
          <td>${escapeHtml(item.dailyMedication || "—")}</td>
          <td>${escapeHtml(item.rescueMedication || "—")}</td>
          <td>${escapeHtml(item.symptoms || "—")}</td>
          <td>${escapeHtml(item.notes || "—")}</td>
          <td>
            <div class="row-actions">
              <button
                class="icon-btn delete"
                type="button"
                onclick="window.deleteEventById('${item.id}')"
                aria-label="Eliminar evento"
              >
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderMobileCards() {
  if (!events.length) {
    mobileCards.innerHTML = `
      <article class="mobile-empty">
        Todavía no hay eventos guardados.
      </article>
    `;
    return;
  }

  const chronological = [...events].reverse();

  const diffMap = new Map();
  chronological.forEach((item, index) => {
    if (index === 0) {
      diffMap.set(item.id, "Primer registro");
      return;
    }

    const previous = chronological[index - 1];
    diffMap.set(
      item.id,
      humanizeDuration(
        new Date(item.timestamp).getTime() - new Date(previous.timestamp).getTime()
      )
    );
  });

  mobileCards.innerHTML = events
    .map((item) => {
      return `
        <article class="event-card">
          <div class="event-card__top">
            <div>
              <div class="event-card__date">${escapeHtml(formatDateDisplay(item.timestamp))}</div>
              <div class="event-card__time">${escapeHtml(item.time || "—")}</div>
            </div>
            <span class="badge-time event-card__pill">${escapeHtml(diffMap.get(item.id) || "—")}</span>
          </div>

          <div class="event-card__grid">
            <div class="event-card__item">
              <span>Duración</span>
              <strong>${escapeHtml(item.durationMinutes || "—")} min</strong>
            </div>

            <div class="event-card__item">
              <span>Posibles desencadenantes</span>
              <p>${escapeHtml(item.triggers || "—")}</p>
            </div>

            <div class="event-card__item">
              <span>Medicación preventiva diaria</span>
              <p>${escapeHtml(item.dailyMedication || "—")}</p>
            </div>

            <div class="event-card__item">
              <span>Medicación rescate</span>
              <p>${escapeHtml(item.rescueMedication || "—")}</p>
            </div>

            <div class="event-card__item">
              <span>Síntomas</span>
              <p>${escapeHtml(item.symptoms || "—")}</p>
            </div>

            <div class="event-card__item">
              <span>Observaciones</span>
              <p>${escapeHtml(item.notes || "—")}</p>
            </div>
          </div>

          <div class="event-card__actions">
            <button
              class="icon-btn delete"
              type="button"
              onclick="window.deleteEventById('${item.id}')"
              aria-label="Eliminar evento"
            >
              🗑️
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function updateLiveTimeSinceLast() {
  if (!events.length) return;
  timeSinceLastNowEl.textContent = diffFromNow(events[0].timestamp);
}

function downloadPdf() {
  if (!events.length) {
    showToast("No hay eventos para exportar.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const exportDate = new Date();

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(16);
  docPdf.text("Registro de ataques - Maya", 14, 14);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(10);
  docPdf.text(
    `Exportado el ${formatDateDisplay(exportDate.toISOString())} a las ${formatTimeDisplay(exportDate)}`,
    14,
    20
  );

  const chronological = [...events].reverse();
  const diffMap = new Map();

  chronological.forEach((item, index) => {
    if (index === 0) {
      diffMap.set(item.id, "Primer registro");
      return;
    }

    const previous = chronological[index - 1];
    diffMap.set(
      item.id,
      humanizeDuration(
        new Date(item.timestamp).getTime() - new Date(previous.timestamp).getTime()
      )
    );
  });

  const body = events.map((item) => [
    formatDateDisplay(item.timestamp),
    diffMap.get(item.id) || "—",
    item.time || "—",
    `${item.durationMinutes || "—"} min`,
    item.triggers || "—",
    item.dailyMedication || "—",
    item.rescueMedication || "—",
    item.symptoms || "—",
    item.notes || "—"
  ]);

  docPdf.autoTable({
    startY: 26,
    head: [[
      "Fecha",
      "Desde el anterior",
      "Hora",
      "Duración",
      "Desencadenantes",
      "Prevención",
      "Rescate",
      "Síntomas",
      "Observaciones"
    ]],
    body,
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      overflow: "linebreak",
      valign: "top"
    },
    headStyles: {
      fillColor: [125, 93, 63]
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 28 },
      2: { cellWidth: 16 },
      3: { cellWidth: 18 },
      4: { cellWidth: 34 },
      5: { cellWidth: 34 },
      6: { cellWidth: 28 },
      7: { cellWidth: 34 },
      8: { cellWidth: 45 }
    },
    margin: { left: 8, right: 8 }
  });

  const fileDate = exportDate.toISOString().slice(0, 10);
  docPdf.save(`registro-maya-${fileDate}.pdf`);
}

function setDefaultDateTime() {
  const now = new Date();
  eventDateInput.value = formatDateInput(now);
  eventTimeInput.value = formatTimeInput(now);
}

function diffFromNow(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) return "0 min";
  return humanizeDuration(diff);
}

function humanizeDuration(milliseconds) {
  const totalMinutes = Math.floor(milliseconds / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} d`);
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} min`);

  return parts.join(" ");
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDateDisplay(isoString) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(isoString));
}

function formatTimeDisplay(date) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function showToast(message) {
  let toast = document.querySelector(".toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.deleteEventById = handleDelete;