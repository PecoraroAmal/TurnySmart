const DB_KEY = "gestoreTurni_data";
const PLANNING_KEY = "gestoreTurni_planning";

const dashboardDom = {
	metricsHost: document.getElementById("dashboardMetrics"),
	refreshBtn: document.getElementById("refreshDashboard"),
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

function savePlanning(planning) {
	localStorage.setItem(PLANNING_KEY, JSON.stringify(planning));
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
	const cards = [
		{ label: "Dipendenti", value: db.dipendenti.length, icon: "fa-user-group" },
		{ label: "Ruoli", value: db.ruoli.length, icon: "fa-layer-group" },
		{ label: "Turni", value: db.turni.length, icon: "fa-business-time" },
		{ label: "Vincoli personalizzati", value: Object.keys(db.vincoli?.perDipendente || {}).length, icon: "fa-scale-balanced" },
	];

	dashboardDom.metricsHost.innerHTML = cards
		.map(
			(card) => `
				<div class="card">
					<div class="card-title" style="color:#000">
						<i class="fa-solid ${card.icon}"></i>${card.label}
					</div>
					<p style="font-size:2rem;font-weight:700;color:#000;">${card.value}</p>
				</div>
			`
		)
		.join(" ");
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
	if (!dashboardDom.planningStart.value) {
		dashboardDom.planningStart.value = getDefaultStartDate();
	}
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

function canWorkEmployee(employee, context) {
	const {
		roleId,
		dayName,
		shift,
		dayKey,
		vincoli,
		state,
		assignmentStart,
		assignmentEnd,
	} = context;

	if (!employee.ruoli.includes(roleId)) {
		console.log(`[canWork] ${employee.nome}: NON ha il ruolo ${roleId}`);
		return false;
	}

	const dailyLimit = vincoli.perDipendente?.[employee.id]?.oreMassimeGiornaliere || vincoli.oreMassimeGiornaliereDefault || 8;
	// Precedenza: valore specifico su dipendente (oreGiornaliere) -> override vincoli.perDipendente -> default globale
	const effectiveDailyLimit = employee.oreGiornaliere || dailyLimit;
	const weeklyLimit = employee.oreSettimanali || 40;
	const restMin = vincoli.perDipendente?.[employee.id]?.riposoMinimoOre || vincoli.riposoMinimoOre || 11;

	const pauseAfter = vincoli.pausaDopoOre || 6;
	const pauseMinutes = vincoli.durataPausaMinuti || 30;

	let assignmentMinutes = minutesBetween(shift.inizio, shift.fine);
	// Sottrai pausa se il turno supera la soglia
	if (assignmentMinutes / 60 > pauseAfter) {
		assignmentMinutes -= pauseMinutes;
	}

	const dayMinutes = state.dailyMinutes.get(dayKey)?.get(employee.id) || 0;
	if ((dayMinutes + assignmentMinutes) / 60 > effectiveDailyLimit) {
		console.log(`[canWork] ${employee.nome}: Supera ore giornaliere (${((dayMinutes + assignmentMinutes) / 60).toFixed(1)} > ${effectiveDailyLimit})`);
		return false;
	}

	const weekIndex = state.currentWeek;
	const weekMap = state.weeklyMinutes.get(weekIndex) || new Map();
	const currentWeekMinutes = weekMap.get(employee.id) || 0;
	if ((currentWeekMinutes + assignmentMinutes) / 60 > weeklyLimit) {
		console.log(`[canWork] ${employee.nome}: Supera ore settimanali (${((currentWeekMinutes + assignmentMinutes) / 60).toFixed(1)} > ${weeklyLimit})`);
		return false;
	}

	const lastEnd = state.lastAssignmentEnd.get(employee.id);
	if (lastEnd) {
		const hoursSince = (assignmentStart - lastEnd) / (1000 * 60 * 60);
		if (hoursSince < restMin) {
			console.log(`[canWork] ${employee.nome}: Non rispetta riposo minimo (${hoursSince.toFixed(1)}h < ${restMin}h, ultimo turno finito ${lastEnd.toISOString()})`);
			return false;
		}
	}

	const indisponibile = (employee.indisponibilita || []).some((periodo) => {
		if (periodo.giorno.toLowerCase() !== dayName) return false;
		return !(
			shift.fine <= periodo.da ||
			shift.inizio >= periodo.a
		);
	});
	if (indisponibile) {
		console.log(`[canWork] ${employee.nome}: In indisponibilità per ${dayName}`);
		return false;
	}

	console.log(`[canWork] ${employee.nome}: ✓ OK (ore nette: ${(assignmentMinutes/60).toFixed(1)})`);
	return true;
}

function updateStateAfterAssignment(employeeId, context) {
	const { state, dayKey, assignmentStart, assignmentEnd, assignmentMinutes } = context;
	if (!state.dailyMinutes.has(dayKey)) state.dailyMinutes.set(dayKey, new Map());
	const dailyMap = state.dailyMinutes.get(dayKey);
	dailyMap.set(employeeId, (dailyMap.get(employeeId) || 0) + assignmentMinutes);

	const weekMap = state.weeklyMinutes.get(state.currentWeek) || new Map();
	weekMap.set(employeeId, (weekMap.get(employeeId) || 0) + assignmentMinutes);
	state.weeklyMinutes.set(state.currentWeek, weekMap);

	state.lastAssignmentEnd.set(employeeId, assignmentEnd);
	
	console.log(`[updateState] ${employeeId}: +${(assignmentMinutes/60).toFixed(1)}h, giorno=${((dailyMap.get(employeeId))/60).toFixed(1)}h, settimana=${((weekMap.get(employeeId))/60).toFixed(1)}h`);
}

function assignShiftToRole(params) {
	const { db, role, dayName, dayKey, shift, state, strategy } = params;
	const assignmentMinutes = minutesBetween(shift.inizio, shift.fine);
	const assignmentStart = new Date(`${dayKey}T${shift.inizio}`);
	const assignmentEnd = new Date(`${dayKey}T${shift.fine}`);

	const candidates = [...db.dipendenti].filter((employee) => employee.ruoli.includes(role.id));

	const weekMap = state.weeklyMinutes.get(state.currentWeek) || new Map();

	const sortedCandidates = candidates.sort((a, b) => (a.importanza || 5) - (b.importanza || 5));

	const assignments = [];
	for (const employee of sortedCandidates) {
		const canWork = canWorkEmployee(employee, {
			roleId: role.id,
			dayName,
			shift,
			dayKey,
			vincoli: db.vincoli,
			state,
			assignmentStart,
			assignmentEnd,
		});
		if (!canWork) continue;

		assignments.push({
			dipendente: employee.nome,
			dipendenteId: employee.id,
			turno: shift.nome,
			ruolo: role.nome,
			colore: role.colore,
			inizio: shift.inizio,
			fine: shift.fine,
		});

		updateStateAfterAssignment(employee.id, {
			state,
			dayKey,
			assignmentStart,
			assignmentEnd,
			assignmentMinutes,
		});

		if (assignments.length >= (role.maxDipendenti || 1)) break;
	}

	const results = [...assignments];
	while (results.length < (role.minDipendenti || 1)) {
		results.push({
			dipendente: "Non coperto",
			dipendenteId: null,
			turno: shift.nome,
			ruolo: role.nome,
			colore: role.colore,
			inizio: shift.inizio,
			fine: shift.fine,
			warning: true,
		});
	}

	return results;
}

function generatePlanning() {

	clearDashboardMessage();
	setPlanningStatus("Generazione in corso...", "pending");
	dashboardDom.generateBtn.disabled = true;
	const startDateValue = dashboardDom.planningStart.value;
	if (!startDateValue) {
		showDashboardMessage("Seleziona la data di partenza.", "warning");
		setPlanningStatus("Errore: data mancante", "error");
		dashboardDom.generateBtn.disabled = false;
		return;
	}

	const db = readDatabase();
	if (!db.ruoli.length || !db.turni.length || !db.dipendenti.length) {
		showDashboardMessage("Servono ruoli, turni e dipendenti per il planning.", "warning");
		setPlanningStatus("Errore: dati mancanti", "error");
		dashboardDom.generateBtn.disabled = false;
		return;
	}

	const days = createDateRange(startDateValue, 7);
	const planning = {};
	const state = {
		weeklyMinutes: new Map(),
		dailyMinutes: new Map(),
		lastAssignmentEnd: new Map(),
		currentWeek: 0,
		weeklyAssignments: new Map(), // key: employeeId, value: {shiftId, roleId} per la settimana corrente
	};

	// Dividi i 7 giorni in 1 settimana
	const week1Days = days.slice(0, 7);
	const weeks = [week1Days];

	weeks.forEach((weekDays, weekIndex) => {
		state.currentWeek = weekIndex;
		state.weeklyAssignments = new Map(); // Reset assegnazioni settimanali
		state.weeklyMinutes = new Map(); // Reset ore settimanali per nuova settimana
		console.log(`[DEBUG] ======== SETTIMANA ${weekIndex + 1} ========`);

		// Genera assegnazioni per la settimana
		const weeklyPlan = generateWeeklyPlan(db, weekDays, state);

		// Applica il piano settimanale a ogni giorno
		weekDays.forEach((date, dayIndex) => {
			const dayKey = date.toISOString().split("T")[0];
			const dayName = giornoLabel[date.getDay()].toLowerCase();
			
			const result = applyDailyPlan(db, dayKey, dayName, weeklyPlan, state);
			planning[dayKey] = {
				assignments: result.assignments,
				roleMatrix: result.roleMatrix,
				employeeMatrix: result.employeeMatrix
			};
		});

		// Fase di completamento: rimuovi tutti i "Non coperto" se ci sono dipendenti disponibili
		for (const date of weekDays) {
			const dayKey = date.toISOString().split("T")[0];
			const dayName = giornoLabel[date.getDay()].toLowerCase();
			const dayObj = planning[dayKey];
			const dayAssignments = dayObj && Array.isArray(dayObj.assignments) ? dayObj.assignments : [];

			for (const shift of db.turni) {
				for (const role of db.ruoli) {
					// Trova slot "Non coperto" per questo turno/ruolo
					const nonCoperti = dayAssignments.filter(a => !a.dipendenteId && a.turno === shift.nome && a.ruolo === role.nome);
					for (const slot of nonCoperti) {
						// Trova dipendente disponibile
						const candidates = db.dipendenti.filter(emp => {
							// Non già assegnato in questo giorno
							if (dayAssignments.some(a => a.dipendenteId === emp.id)) return false;
							// Deve avere il ruolo
							if (!emp.ruoli.includes(role.id)) return false;
							// Deve avere ore residue settimanali
							const weekMap = state.weeklyMinutes.get(state.currentWeek) || new Map();
							const currentMinutes = weekMap.get(emp.id) || 0;
							const targetMinutes = (emp.oreSettimanali || 40) * 60;
							if (currentMinutes >= targetMinutes) return false;
							// Deve rispettare limiti giornalieri
							const dailyLimit = emp.oreGiornaliere || db.vincoli.oreMassimeGiornaliereDefault || 8;
							const dayMap = state.dailyMinutes.get(dayKey) || new Map();
							const todayMinutes = dayMap.get(emp.id) || 0;
							const shiftMinutes = minutesBetween(shift.inizio, shift.fine);
							const pauseAfter = db.vincoli?.pausaDopoOre || 6;
							const pauseMinutes = db.vincoli?.durataPausaMinuti || 30;
							let netMinutes = shiftMinutes;
							if (shiftMinutes / 60 > pauseAfter) netMinutes -= pauseMinutes;
							if ((todayMinutes + netMinutes) / 60 > dailyLimit) return false;
							// Deve rispettare indisponibilità
							const indisponibile = (emp.indisponibilita || []).some((periodo) => {
								if (periodo.giorno.toLowerCase() !== dayName) return false;
								return !(shift.fine <= periodo.da || shift.inizio >= periodo.a);
							});
							if (indisponibile) return false;
							return true;
						});
						if (candidates.length > 0) {
							// Scegli il candidato con meno ore settimanali assegnate
							candidates.sort((a, b) => {
								const weekMap = state.weeklyMinutes.get(state.currentWeek) || new Map();
								return (weekMap.get(a.id) || 0) - (weekMap.get(b.id) || 0);
							});
							const emp = candidates[0];
							// Sostituisci lo slot "Non coperto" con l'assegnazione
							const assignment = {
								dipendente: emp.nome,
								dipendenteId: emp.id,
								turno: shift.nome,
								ruolo: role.nome,
								colore: role.colore,
								inizio: shift.inizio,
								fine: shift.fine,
							};
							const idx = dayAssignments.indexOf(slot);
							if (idx !== -1) {
								dayAssignments[idx] = assignment;
								updateStateAfterAssignment(emp.id, {
									state,
									dayKey,
									assignmentStart: new Date(`${dayKey}T${shift.inizio}`),
									assignmentEnd: new Date(`${dayKey}T${shift.fine}`),
									assignmentMinutes: minutesBetween(shift.inizio, shift.fine),
								});
							}
						}
					}
				}
			}
		}
	});

	const stored = { startDate: startDateValue, planning, generatedAt: new Date().toISOString(), versione: 2 };
	savePlanning(stored);
	renderPlanningMatrix(stored);
	setPlanningStatus("Planning aggiornato", "ok");
	showDashboardMessage("Planning di 7 giorni generato.", "success");
	dashboardDom.generateBtn.disabled = false;
}

function generateWeeklyPlan(db, weekDays, state) {
	// Calcola giorni di lavoro per ogni dipendente
	const remainingDays = new Map();
	for (const emp of db.dipendenti) {
		const oreGiornaliere = emp.oreGiornaliere || db.vincoli.oreMassimeGiornaliereDefault || 8;
		const giorniLavoro = Math.floor((emp.oreSettimanali || 40) / oreGiornaliere);
		// Conta giorni disponibili (semplificato, considera tutti i giorni, controlla indisponibilità in applyDailyPlan)
		let available = Math.min(giorniLavoro, weekDays.length);
		remainingDays.set(emp.id, available);
	}
	state.remainingDays = remainingDays;
	return {}; // Non serve più weeklyPlan
}

function canWorkWeeklyShift(employee, shift, weekDays, vincoli, state) {
	// Verifica se un dipendente può lavorare un turno per i giorni disponibili della settimana
	const shiftMinutes = minutesBetween(shift.inizio, shift.fine);
	const pauseAfter = vincoli.pausaDopoOre || 6;
	const pauseMinutes = vincoli.durataPausaMinuti || 30;
	let netMinutes = shiftMinutes;
	if (shiftMinutes / 60 > pauseAfter) {
		netMinutes -= pauseMinutes;
	}

	const dailyLimit = employee.oreGiornaliere || vincoli.oreMassimeGiornaliereDefault || 8;
	const weeklyLimit = employee.oreSettimanali || 40;

	// Verifica che il turno non superi il limite giornaliero
	if (netMinutes / 60 > dailyLimit) {
		console.log(`[canWorkWeekly] ${employee.nome}: Turno supera limite giornaliero (${(netMinutes/60).toFixed(1)}h > ${dailyLimit}h)`);
		return false;
	}

	// Calcola quanti giorni disponibili ha per questo turno nella settimana
	let availableDays = 0;
	for (const date of weekDays) {
		const dayName = giornoLabel[date.getDay()].toLowerCase();
		
		// Verifica indisponibilità
		const indisponibile = (employee.indisponibilita || []).some((periodo) => {
			if (periodo.giorno.toLowerCase() !== dayName) return false;
			return !(
				shift.fine <= periodo.da ||
				shift.inizio >= periodo.a
			);
		});
		
		if (!indisponibile) {
			availableDays++;
		}
	}

	if (availableDays === 0) {
		console.log(`[canWorkWeekly] ${employee.nome}: Nessun giorno disponibile per ${shift.nome}`);
		return false;
	}

	// Calcola quanti giorni potrebbe lavorare senza superare il limite settimanale
	const maxDaysForWeeklyLimit = Math.floor((weeklyLimit * 60) / netMinutes);
	const actualDays = Math.min(availableDays, maxDaysForWeeklyLimit);

	if (actualDays === 0) {
		console.log(`[canWorkWeekly] ${employee.nome}: Limite settimanale troppo basso per ${shift.nome}`);
		return false;
	}

	console.log(`[canWorkWeekly] ${employee.nome}: ✓ OK per ${shift.nome} (può lavorare ${actualDays}/${availableDays} giorni, ${(actualDays * netMinutes/60).toFixed(1)}h settimanali)`);
	return true;
}

function applyDailyPlan(db, dayKey, dayName, weeklyPlan, state) {
	const assignments = [];
	const vincoli = db.vincoli || {};
	const shifts = [...db.turni].sort((a,b) => a.inizio.localeCompare(b.inizio));
	const assignedEmployeesForDay = new Set();

	// Matrice ruoli (globale sul giorno, accumula assegnazioni minime per ogni ruolo indipendentemente dal turno)
	const roleMatrix = db.ruoli.map(role => ({
		nome: role.nome,
		livello: role.livello,
		minimoPersone: role.minDipendenti || 1,
		massimoPersone: role.maxDipendenti || role.minDipendenti || 1,
		assegnazioni: 0,
		minimoRaggiunto: false
	}));

	// Matrice dipendenti (stato di capacità + giorni residui)
	const employeeMatrix = db.dipendenti.map(emp => ({
		nome: emp.nome,
		id: emp.id,
		oreSettimanali: emp.oreSettimanali || 40,
		oreGiornaliere: emp.oreGiornaliere || 8,
		giorniLavorativi: Math.floor((emp.oreSettimanali || 40) / (emp.oreGiornaliere || 8)),
		importanza: emp.importanza || 5,
		ruoli: emp.ruoli.slice(),
		remainingDays: state.remainingDays.get(emp.id) || 0
	}));

	// Funzione di ordinamento distribuzione: preferire chi ha meno giorni residui, meno ore settimanali accumulate, poi importanza alta
	function sortCandidates(list, roleId) {
		return list.slice().sort((a,b) => {
			// giorni residui
			const remA = state.remainingDays.get(a.id) || 0;
			const remB = state.remainingDays.get(b.id) || 0;
			if (remA !== remB) return remA - remB; // meno giorni rimasti prima
			// ore settimanali già accumulate
			const weekMap = state.weeklyMinutes.get(state.currentWeek) || new Map();
			const minA = weekMap.get(a.id) || 0;
			const minB = weekMap.get(b.id) || 0;
			if (minA !== minB) return minA - minB; // chi ha meno ore prima
			// importanza (numeri maggiori più importanti secondo descrizione utente)
			return (b.importanza || 0) - (a.importanza || 0);
		});
	}

	// Assegnazione minima per ogni turno (fase 1)
	for (const shift of shifts) {
		const compatibleRoles = db.ruoli.filter(r => shift.ruoliPossibili && shift.ruoliPossibili.includes(r.id));
		// Ordina ruoli con meno persone disponibili prima
		compatibleRoles.sort((a,b) => {
			const aCount = db.dipendenti.filter(emp => emp.ruoli.includes(a.id)).length;
			const bCount = db.dipendenti.filter(emp => emp.ruoli.includes(b.id)).length;
			return aCount - bCount;
		});

		for (const role of compatibleRoles) {
			const requiredMin = role.minDipendenti || 1;
			let alreadyAssigned = assignments.filter(a => a.turno === shift.nome && a.ruolo === role.nome && a.dipendenteId).length;
			if (alreadyAssigned >= requiredMin) continue; // già coperto

			// Candidati disponibili
			let candidates = db.dipendenti.filter(emp => 
				emp.ruoli.includes(role.id) && (state.remainingDays.get(emp.id) || 0) > 0 && !assignedEmployeesForDay.has(emp.id)
			);
			candidates = sortCandidates(candidates, role.id);

			for (const emp of candidates) {
				if (alreadyAssigned >= requiredMin) break;
				// indisponibilità
				const indisponibile = (emp.indisponibilita || []).some(per => {
					if (per.giorno.toLowerCase() !== dayName) return false;
					return !(shift.fine <= per.da || shift.inizio >= per.a);
				});
				if (indisponibile) continue;

				// limiti orari
				const shiftMinutes = minutesBetween(shift.inizio, shift.fine);
				const pauseAfter = vincoli.pausaDopoOre || 6;
				const pauseMinutes = vincoli.durataPausaMinuti || 30;
				let netMinutes = shiftMinutes;
				if (shiftMinutes / 60 > pauseAfter) netMinutes -= pauseMinutes;
				const dailyLimit = emp.oreGiornaliere || vincoli.oreMassimeGiornaliereDefault || 8;
				const weeklyLimit = emp.oreSettimanali || 40;
				const weekMap = state.weeklyMinutes.get(state.currentWeek) || new Map();
				const currentWeekMinutes = weekMap.get(emp.id) || 0;
				if (netMinutes/60 > dailyLimit || (currentWeekMinutes + netMinutes)/60 > weeklyLimit) continue;

				assignments.push({
					dipendente: emp.nome,
					dipendenteId: emp.id,
					turno: shift.nome,
					ruolo: role.nome,
					colore: role.colore,
					inizio: shift.inizio,
					fine: shift.fine,
				});
				alreadyAssigned++;
				assignedEmployeesForDay.add(emp.id);
				state.remainingDays.set(emp.id, state.remainingDays.get(emp.id) - 1);
				updateStateAfterAssignment(emp.id, {
					state,
					dayKey,
					assignmentStart: new Date(`${dayKey}T${shift.inizio}`),
					assignmentEnd: new Date(`${dayKey}T${shift.fine}`),
					assignmentMinutes: netMinutes,
				});
				const roleEntry = roleMatrix.find(r => r.nome === role.nome);
				if (roleEntry) {
					roleEntry.assegnazioni++;
					if (roleEntry.assegnazioni >= roleEntry.minimoPersone) roleEntry.minimoRaggiunto = true;
				}
			}

			// Se non coperto minimo, aggiungi placeholder
			for (let i = alreadyAssigned; i < requiredMin; i++) {
				assignments.push({
					dipendente: "Non coperto",
					dipendenteId: null,
					turno: shift.nome,
					ruolo: role.nome,
					colore: role.colore,
					inizio: shift.inizio,
					fine: shift.fine,
					warning: true,
				});
			}
		}
	}

	// Non aggiungiamo fase di riempimento massimo: conserviamo risorse per altri giorni
	return { assignments, roleMatrix, employeeMatrix };
}

function generateWeekPlanning(db, dayKey, dayName, state) {
	const assignments = [];

	// 1. Calcolo numero giorni di lavoro per dipendente
	const employees = db.dipendenti.map(emp => ({
		...emp,
		giorniLavoro: Math.ceil((emp.oreSettimanali || 40) / (emp.oreGiornaliere || 8))
	}));

	// 2. Calcolo persone per ruoli (usa minDipendenti e maxDipendenti)
	const roleRequirements = db.ruoli.map(role => ({
		...role,
		requiredMin: role.minDipendenti || 1,
		requiredMax: role.maxDipendenti || role.minDipendenti || 1
	}));

	// 3. Ordina dipendenti per importanza
	const groupedByImportance = {};
	employees.forEach(emp => {
		const imp = emp.importanza || 5;
		if (!groupedByImportance[imp]) groupedByImportance[imp] = [];
		groupedByImportance[imp].push(emp);
	});

	const sortedImportances = Object.keys(groupedByImportance).sort((a,b) => a - b);
	let sortedEmployees = [];
	sortedImportances.forEach(imp => {
		const group = groupedByImportance[imp];
		sortedEmployees.push(...group);
	});

	// 4. Leggi vincoli (già in db.vincoli)

	// 5. Assegna partendo dal ruolo con meno persone
	const sortedRoles = roleRequirements.sort((a,b) => a.requiredMin - b.requiredMin);

	const shifts = [...db.turni].sort((a,b) => a.inizio.localeCompare(b.inizio));

	console.log(`[DEBUG] Giorno ${dayKey} (${dayName}): ${shifts.length} turni disponibili`);

	// Cicla tutti i turni del giorno
	for (const shift of shifts) {
		console.log(`[DEBUG] Turno: ${shift.nome} (${shift.inizio}-${shift.fine}), ruoliPossibili:`, shift.ruoliPossibili);
		
		// Filtra solo i ruoli compatibili con questo turno
		const compatibleRoles = sortedRoles.filter(role => 
			shift.ruoliPossibili && shift.ruoliPossibili.includes(role.id)
		);

		console.log(`[DEBUG] Ruoli compatibili per ${shift.nome}:`, compatibleRoles.map(r => r.nome));

		compatibleRoles.forEach(role => {
			// Ricalcola candidati ordinati per ore settimanali crescenti, poi importanza
			const candidates = sortedEmployees
				.filter(emp => emp.ruoli.includes(role.id))
				.sort((a, b) => {
					const aWeek = (state.weeklyMinutes.get(state.currentWeek)?.get(a.id) || 0);
					const bWeek = (state.weeklyMinutes.get(state.currentWeek)?.get(b.id) || 0);
					if (aWeek !== bWeek) return aWeek - bWeek;
					return (a.importanza || 5) - (b.importanza || 5);
				});

			console.log(`[DEBUG] Candidati per ruolo ${role.nome}:`, candidates.map(c => c.nome));

			let assigned = 0;
			const assignedEmployees = new Set();

			// PRIMA FASE: Copertura minima (requiredMin)
			for (const emp of candidates) {
				if (assigned >= role.requiredMin) break;
				if (assignedEmployees.has(emp.id)) continue;

				const canWork = canWorkEmployee(emp, {
					roleId: role.id,
					dayName,
					shift,
					dayKey,
					vincoli: db.vincoli,
					state,
					assignmentStart: new Date(`${dayKey}T${shift.inizio}`),
					assignmentEnd: new Date(`${dayKey}T${shift.fine}`),
				});

				console.log(`[DEBUG] Dipendente ${emp.nome} può lavorare come ${role.nome}?`, canWork);

				if (canWork) {
					const shiftMinutes = minutesBetween(shift.inizio, shift.fine);
					const pauseAfter = db.vincoli?.pausaDopoOre || 6;
					const pauseMinutes = db.vincoli?.durataPausaMinuti || 30;
					let netMinutes = shiftMinutes;
					if (shiftMinutes / 60 > pauseAfter) {
						netMinutes -= pauseMinutes;
					}

					assignments.push({
						dipendente: emp.nome,
						dipendenteId: emp.id,
						turno: shift.nome,
						ruolo: role.nome,
						colore: role.colore,
						inizio: shift.inizio,
						fine: shift.fine,
					});
					updateStateAfterAssignment(emp.id, {
						state,
						dayKey,
						assignmentStart: new Date(`${dayKey}T${shift.inizio}`),
						assignmentEnd: new Date(`${dayKey}T${shift.fine}`),
						assignmentMinutes: netMinutes,
					});
					assignedEmployees.add(emp.id);
					assigned++;
					console.log(`[DEBUG] ✓ Assegnato ${emp.nome} a ${role.nome} nel turno ${shift.nome}`);
				}
			}

			// Se non abbastanza per il minimo, aggiungi "Non coperto"
			while (assigned < role.requiredMin) {
				assignments.push({
					dipendente: "Non coperto",
					dipendenteId: null,
					turno: shift.nome,
					ruolo: role.nome,
					colore: role.colore,
					inizio: shift.inizio,
					fine: shift.fine,
					warning: true,
				});
				assigned++;
				console.log(`[DEBUG] ⚠ Slot non coperto per ${role.nome} nel turno ${shift.nome}`);
			}

			// SECONDA FASE: Estensione fino a maxDipendenti
			for (const emp of candidates) {
				if (assigned >= role.requiredMax) break;
				if (assignedEmployees.has(emp.id)) continue;

				if (canWorkEmployee(emp, {
					roleId: role.id,
					dayName,
					shift,
					dayKey,
					vincoli: db.vincoli,
					state,
					assignmentStart: new Date(`${dayKey}T${shift.inizio}`),
					assignmentEnd: new Date(`${dayKey}T${shift.fine}`),
				})) {
					const shiftMinutes = minutesBetween(shift.inizio, shift.fine);
					const pauseAfter = db.vincoli?.pausaDopoOre || 6;
					const pauseMinutes = db.vincoli?.durataPausaMinuti || 30;
					let netMinutes = shiftMinutes;
					if (shiftMinutes / 60 > pauseAfter) {
						netMinutes -= pauseMinutes;
					}

					assignments.push({
						dipendente: emp.nome,
						dipendenteId: emp.id,
						turno: shift.nome,
						ruolo: role.nome,
						colore: role.colore,
						inizio: shift.inizio,
						fine: shift.fine,
					});
					updateStateAfterAssignment(emp.id, {
						state,
						dayKey,
						assignmentStart: new Date(`${dayKey}T${shift.inizio}`),
						assignmentEnd: new Date(`${dayKey}T${shift.fine}`),
						assignmentMinutes: netMinutes,
					});
					assignedEmployees.add(emp.id);
					assigned++;
					console.log(`[DEBUG] ✓ Assegnato (fase 2) ${emp.nome} a ${role.nome} nel turno ${shift.nome}`);
				}
			}
		});

		// 6. Riordina dipendenti dopo ogni turno (chi ha meno ore va prima)
		sortedEmployees.sort((a, b) => {
			const aWeek = (state.weeklyMinutes.get(state.currentWeek)?.get(a.id) || 0);
			const bWeek = (state.weeklyMinutes.get(state.currentWeek)?.get(b.id) || 0);
			if (aWeek !== bWeek) return aWeek - bWeek;
			return (a.importanza || 5) - (b.importanza || 5);
		});
	}

	// TERZA FASE: Continua ad assegnare finché i dipendenti non raggiungono le ore settimanali
	console.log(`[DEBUG] FASE 3: Completamento ore settimanali`);
	const maxIterations = 50; // Limite per evitare loop infiniti
	let iteration = 0;
	
	// Traccia quante persone sono assegnate a ogni combinazione (turno, ruolo)
	const roleAssignmentCounts = new Map(); // key: "shiftId-roleId", value: count
	
	// Inizializza contatori dalle fasi precedenti
	assignments.forEach(assignment => {
		if (assignment.dipendenteId) { // Ignora "Non coperto"
			const shift = db.turni.find(s => s.nome === assignment.turno);
			const role = db.ruoli.find(r => r.nome === assignment.ruolo);
			if (shift && role) {
				const key = `${shift.id}-${role.id}`;
				roleAssignmentCounts.set(key, (roleAssignmentCounts.get(key) || 0) + 1);
			}
		}
	});
	
	while (iteration < maxIterations) {
		iteration++;
		let assignedInIteration = false;

		// Ordina dipendenti per ore settimanali crescenti
		const empsByWeeklyHours = [...sortedEmployees].sort((a, b) => {
			const aWeek = (state.weeklyMinutes.get(state.currentWeek)?.get(a.id) || 0);
			const bWeek = (state.weeklyMinutes.get(state.currentWeek)?.get(b.id) || 0);
			if (aWeek !== bWeek) return aWeek - bWeek;
			return (a.importanza || 5) - (b.importanza || 5);
		});

		// Per ogni dipendente che non ha raggiunto le ore settimanali
		for (const emp of empsByWeeklyHours) {
			const weekMap = state.weeklyMinutes.get(state.currentWeek) || new Map();
			const currentMinutes = weekMap.get(emp.id) || 0;
			const targetMinutes = (emp.oreSettimanali || 40) * 60;
			
			if (currentMinutes >= targetMinutes) continue; // Ha già le ore sufficienti

			// Trova un turno compatibile
			for (const shift of shifts) {
				const compatibleRoles = sortedRoles.filter(role => 
					shift.ruoliPossibili && shift.ruoliPossibili.includes(role.id) && emp.ruoli.includes(role.id)
				);

				for (const role of compatibleRoles) {
					// Verifica se abbiamo già raggiunto maxDipendenti per questo ruolo in questo turno
					const key = `${shift.id}-${role.id}`;
					const currentCount = roleAssignmentCounts.get(key) || 0;
					if (currentCount >= role.requiredMax) {
						console.log(`[DEBUG] FASE 3: Ruolo ${role.nome} in ${shift.nome} già al massimo (${currentCount}/${role.requiredMax})`);
						continue; // Salta questo ruolo, è già al massimo
					}

					if (canWorkEmployee(emp, {
						roleId: role.id,
						dayName,
						shift,
						dayKey,
						vincoli: db.vincoli,
						state,
						assignmentStart: new Date(`${dayKey}T${shift.inizio}`),
						assignmentEnd: new Date(`${dayKey}T${shift.fine}`),
					})) {
						const shiftMinutes = minutesBetween(shift.inizio, shift.fine);
						const pauseAfter = db.vincoli?.pausaDopoOre || 6;
						const pauseMinutes = db.vincoli?.durataPausaMinuti || 30;
						let netMinutes = shiftMinutes;
						if (shiftMinutes / 60 > pauseAfter) {
							netMinutes -= pauseMinutes;
						}

						assignments.push({
							dipendente: emp.nome,
							dipendenteId: emp.id,
							turno: shift.nome,
							ruolo: role.nome,
							colore: role.colore,
							inizio: shift.inizio,
							fine: shift.fine,
						});
						updateStateAfterAssignment(emp.id, {
							state,
							dayKey,
							assignmentStart: new Date(`${dayKey}T${shift.inizio}`),
							assignmentEnd: new Date(`${dayKey}T${shift.fine}`),
							assignmentMinutes: netMinutes,
						});
						roleAssignmentCounts.set(key, currentCount + 1);
						assignedInIteration = true;
						console.log(`[DEBUG] ✓ FASE 3: Assegnato ${emp.nome} a ${role.nome} (${shift.nome}) per completare ore (${currentCount + 1}/${role.requiredMax})`);
						break; // Passa al prossimo dipendente
					}
				}
				if (assignedInIteration) break; // Ha trovato un turno per questo dipendente
			}
		}

		// Se non abbiamo fatto assegnazioni in questa iterazione, usciamo
		if (!assignedInIteration) break;
	}

	console.log(`[DEBUG] Totale assegnazioni per ${dayKey}:`, assignments.length);
	return assignments;
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
	dashboardDom.refreshBtn?.addEventListener("click", renderMetrics);
	dashboardDom.generateBtn?.addEventListener("click", () => generatePlanning());
	dashboardDom.downloadBtn?.addEventListener("click", downloadPlanning);
	dashboardDom.clearBtn?.addEventListener("click", clearPlanning);
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