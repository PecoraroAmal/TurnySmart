function normalizeDayName(s){ return (s||"").toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase(); }
const DB_KEY = "gestoreTurni_data";
const PLANNING_KEY = "gestoreTurni_planning";
const INDISPONIBILITA_KEY = "gestoreTurni_indisponibilita";

const dashboardDom = {
	metricsHost: document.getElementById("dashboardMetrics"),
	planningStart: document.getElementById("planningStart"),
	generateBtn: document.getElementById("generatePlanning"),
	downloadBtn: document.getElementById("downloadPlanning"),
	clearBtn: document.getElementById("clearPlanning"),
	status: document.getElementById("planningStatus"),
	matrixHost: document.getElementById("planningMatrix"),
	message: document.getElementById("dashboardMessage"),
};

const giornoLabel = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

function getReadableTextColor(hex) {
	if (!hex || typeof hex !== "string") return "#000000";
	const value = hex.replace("#", "");
	if (value.length !== 6) return "#000000";
	const r = parseInt(value.slice(0, 2), 16);
	const g = parseInt(value.slice(2, 4), 16);
	const b = parseInt(value.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.6 ? "#000000" : "#ffffff";
}

function readDatabase() {
	try {
		const parsed = JSON.parse(localStorage.getItem(DB_KEY) || "{}");
		return {
			ruoli: parsed?.ruoli || [],
			dipendenti: parsed?.dipendenti || [],
			turni: parsed?.turni || [],
			vincoli: parsed?.vincoli || {},
		};
	} catch (error) {
		console.error("Errore lettura database", error);
		return { ruoli: [], dipendenti: [], turni: [], vincoli: {} };
	}
}

function readIndisponibilita() {
	try {
		return JSON.parse(localStorage.getItem(INDISPONIBILITA_KEY) || "[]");
	} catch (error) {
		console.error("Errore lettura indisponibilità", error);
		return [];
	}
}

function loadPlanning() {
	try {
		return JSON.parse(localStorage.getItem(PLANNING_KEY) || "null");
	} catch (error) {
		console.error("Errore lettura planning", error);
		return null;
	}
}

function renderMetrics() {
	if (!dashboardDom.metricsHost) return;
	const db = readDatabase();
	const indisponibilita = readIndisponibilita();
	       const cards = [
		       { label: "Dipendenti", value: db.dipendenti.length, icon: "fa-user-group", link: "dipendenti.html" },
		       { label: "Ruoli", value: db.ruoli.length, icon: "fa-layer-group", link: "ruoli.html" },
		       { label: "Turni", value: db.turni.length, icon: "fa-business-time", link: "turni.html" },
		       { label: "Indisponibilità", value: indisponibilita.length, icon: "fa-calendar-times", link: "indisponibilità.html" },
	       ];

	       dashboardDom.metricsHost.innerHTML = cards
		       .map(
			       (card) => `
				       <a class="card metric-link" href="${card.link}">
					       <div class="card-title" style="color:#000">
						       <i class="fa-solid ${card.icon}"></i>${card.label}
					       </div>
					       <p style="font-size:2rem;font-weight:700;color:#000;">${card.value}</p>
				       </a>
			       `
		       )
		       .join("");
}

function setPlanningStatus(message, type = "ok") {
	if (!dashboardDom.status) return;
	dashboardDom.status.textContent = message;
	dashboardDom.status.className = `chip status-pill ${type}`;
}

function showDashboardMessage(text, variant = "info") {
	if (!dashboardDom.message) return;
	dashboardDom.message.textContent = text;
	dashboardDom.message.className = `app-message app-message--${variant}`;
}

function clearDashboardMessage() {
	if (!dashboardDom.message) return;
	dashboardDom.message.textContent = "";
	dashboardDom.message.className = "app-message hidden";
}

function getDefaultStartDate() {
	const today = new Date();
	const day = today.getDay();
	const diff = (1 - day + 7) % 7; // next Monday
	today.setDate(today.getDate() + diff);
	return today.toISOString().split("T")[0];
}

function ensureStartDate() {
	dashboardDom.planningStart.value = getDefaultStartDate();
}

function createDateRange(startDate, days) {
	const base = new Date(startDate);
	if (Number.isNaN(base)) throw new Error("Data di partenza non valida");
	return Array.from({ length: days }, (_, index) => {
		const date = new Date(base);
		date.setDate(base.getDate() + index);
		return date;
	});
}

function minutesBetween(start, end) {
	const [sh, sm] = start.split(":").map(Number);
	const [eh, em] = end.split(":").map(Number);
	let diff = (eh * 60 + em) - (sh * 60 + sm);
	if (diff <= 0) diff += 24 * 60;
	return diff;
}

function calculateNetMinutes(assignment, pauseAfter, pauseMinutes) {
	let minutes = minutesBetween(assignment.inizio, assignment.fine);
	if (minutes <= 0) return 0;
	if (minutes / 60 > pauseAfter) minutes -= pauseMinutes;
	return Math.max(minutes, 0);
}

function formatHoursLabel(minutes, expectedHours) {
	if (!minutes && !expectedHours) return "";
	const hours = minutes / 60;
	const exp = expectedHours || 0;
	return ` (${Number(hours.toFixed(1))}/${exp}h)`;
}

function downloadPlanning() {
	const stored = loadPlanning();
	if (!stored) {
		showDashboardMessage("Non c'è alcun planning da scaricare.", "warning");
		return;
	}
	const blob = new Blob([JSON.stringify(stored, null, 2)], { type: "application/json" });
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = `turnify-planning-${stored.startDate || Date.now()}.json`;
	link.click();
	URL.revokeObjectURL(link.href);
}

function clearPlanning() {
	showConfirm("Rimuovere il planning salvato?").then((ok) => {
		if (!ok) return;
		localStorage.removeItem(PLANNING_KEY);
		renderPlanningMatrix();
		setPlanningStatus("Planning assente", "warning");
		showDashboardMessage("Planning eliminato.", "info");
	});
}

function renderPlanningMatrix(preloadedPlanning) {
	if (!dashboardDom.matrixHost) return;
	const stored = preloadedPlanning || loadPlanning();
	if (!stored || !stored.planning) {
		dashboardDom.matrixHost.innerHTML = `
			<div class="empty-state">
				<p>Genera un planning per visualizzare la tabella settimanale.</p>
			</div>
		`;
		return;
	}

	const db = readDatabase();
	const pauseAfter = db.vincoli?.pausaDopoOre || 6;
	const pauseMinutes = db.vincoli?.durataPausaMinuti || 30;
	const entries = Object.entries(stored.planning).sort(([a], [b]) => a.localeCompare(b));
	if (!entries.length) {
		dashboardDom.matrixHost.innerHTML = `
			<div class="empty-state">
				<p>Il planning corrente non contiene assegnazioni.</p>
			</div>
		`;
		return;
	}

	const weeks = [];
	for (let i = 0; i < entries.length; i += 7) {
		weeks.push(entries.slice(i, i + 7));
	}

	const weeksMarkup = weeks
		.map((weekEntries, index) => buildWeekMatrix(weekEntries, index, pauseAfter, pauseMinutes, db))
		.join(" ");

	dashboardDom.matrixHost.innerHTML = weeksMarkup;
}

function buildWeekMatrix(weekEntries, weekIndex, pauseAfter, pauseMinutes, db) {
	if (!weekEntries.length) return "";
	const dayDateMap = {};
	weekEntries.forEach(([date]) => {
		const dayName = giornoLabel[new Date(date).getDay()];
		dayDateMap[dayName] = date;
	});

	const rowsMap = new Map();
	weekEntries.forEach(([date, dayData]) => {
		const assignments = Array.isArray(dayData) ? dayData : (dayData.assignments || []);
		assignments.forEach((assignment) => {
			const key = assignment.dipendenteId ?? `missing-${assignment.ruolo}`;
			const label = assignment.dipendenteId ? assignment.dipendente : `Non coperto (${assignment.ruolo})`;
			if (!rowsMap.has(key)) {
				const emp = assignment.dipendenteId ? db.dipendenti.find(e => e.id === assignment.dipendenteId) : null;
				const expectedHours = emp ? (emp.oreSettimanali || 40) : 0;
				rowsMap.set(key, { label, minutes: 0, dayAssignments: {}, expectedHours });
			}
			const row = rowsMap.get(key);
			if (!row.dayAssignments[date]) row.dayAssignments[date] = [];
			row.dayAssignments[date].push(assignment);
			if (assignment.dipendenteId) {
				row.minutes += calculateNetMinutes(assignment, pauseAfter, pauseMinutes);
			}
		});
	});

	// Aggiungi dipendenti senza assegnazioni
	db.dipendenti.forEach(emp => {
		const key = emp.id;
		if (!rowsMap.has(key)) {
			rowsMap.set(key, { label: emp.nome, minutes: 0, dayAssignments: {}, expectedHours: emp.oreSettimanali || 40 });
		}
	});

	const rows = Array.from(rowsMap.values()).sort((a, b) => a.label.localeCompare(b.label));
	if (!rows.length) {
		return `
			<div class="matrix-week">
				<p class="muted">Settimana ${weekIndex + 1}: nessuna assegnazione.</p>
			</div>
		`;
	}

	const weekStart = weekEntries[0][0];
	const weekEnd = weekEntries[weekEntries.length - 1][0];

	const headerCells = giornoLabel
		.map((day) => `<th>${day.charAt(0).toUpperCase() + day.slice(1)}</th>`)
		.join(" ");

	const bodyRows = rows
		.map((row) => {
			const cells = giornoLabel
				.map((day) => {
					const dateKey = dayDateMap[day];
					const assignments = dateKey ? row.dayAssignments[dateKey] || [] : [];
					if (!assignments.length) return `<td class="muted">-</td>`;
					const cellContent = assignments
						.map(
							(assignment) => {
								const bg = assignment.colore || "#000000";
								const textColor = getReadableTextColor(bg);
								return `
								<span class="planning-cell-tag" style="background:${bg};color:${textColor};">
									${assignment.turno} · ${assignment.ruolo} (${assignment.inizio}-${assignment.fine})
								</span>
							`;
							}
						)
						.join(" ");
					return `<td>${cellContent}</td>`;
				})
				.join(" ");

			return `
				<tr>
					<th scope="row">${row.label}${formatHoursLabel(row.minutes, row.expectedHours)}</th>
					${cells}
				</tr>
			`;
		})
		.join(" ");

	return `
		<div class="matrix-week">
			<p class="card-title">Settimana ${weekIndex + 1} · ${weekStart} → ${weekEnd}</p>
			<div class="table-wrapper">
				<table class="table">
					<thead>
						<tr>
							<th>Dipendente (ore lavorate/ore previste)</th>
							${headerCells}
						</tr>
					</thead>
					<tbody>
						${bodyRows}
					</tbody>
				</table>
			</div>
		</div>
	`;
}

function initDashboard() {
	if (!dashboardDom.metricsHost) return;
	ensureStartDate();
	renderMetrics();
	renderPlanningMatrix();
	// Rimuovi i bottoni di generazione, download e pulizia planning
	if (dashboardDom.generateBtn) dashboardDom.generateBtn.style.display = "none";
	if (dashboardDom.downloadBtn) dashboardDom.downloadBtn.style.display = "none";
	if (dashboardDom.clearBtn) dashboardDom.clearBtn.style.display = "none";
}

document.addEventListener("DOMContentLoaded", initDashboard);

function showConfirm(message) {
	return new Promise((resolve) => {
		const overlay = document.createElement("div");
		overlay.className = "confirm-overlay";
		overlay.innerHTML = `
			<div class="confirm-dialog">
				<h2>Conferma</h2>
				<p>${message}</p>
				<div class="confirm-actions">
					<button class="button danger" id="confirmYes"><i class="fa-solid fa-check"></i>Conferma</button>
					<button class="button secondary" id="confirmNo"><i class="fa-solid fa-rotate-left"></i>Annulla</button>
				</div>
			</div>`;
		document.body.appendChild(overlay);
		const cleanup = () => overlay.remove();
		overlay.querySelector("#confirmYes").addEventListener("click", () => { resolve(true); cleanup(); });
		overlay.querySelector("#confirmNo").addEventListener("click", () => { resolve(false); cleanup(); });
	});
}