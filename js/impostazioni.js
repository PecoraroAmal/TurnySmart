const SETTINGS_STORAGE_KEY = "gestoreTurni_data";
const PLANNING_STORAGE_KEY = "gestoreTurni_planning";

const settingsDom = {
	exportBtn: document.getElementById("exportData"),
	importInput: document.getElementById("importData"),
	resetBtn: document.getElementById("resetAll"),
	guideHost: document.getElementById("guideQuickLinks"),
	simulationBtn: document.getElementById("seedSimulation"),
	message: document.getElementById("settingsMessage"),
};

const guideLinks = [
	{
		title: "1. Definisci i ruoli",
		description: "Colore, livello e copertura minima per ogni ruolo.",
		href: "ruoli.html",
		icon: "fa-layer-group",
	},
	{
		title: "2. Configura i turni",
		description: "Fasce orarie e ruoli richiesti.",
		href: "turni.html",
		icon: "fa-business-time",
	},
	{
		title: "3. Aggiungi dipendenti",
		description: "Ruoli abilitati, esperienza e indisponibilità.",
		href: "dipendenti.html",
		icon: "fa-user-group",
	},
	{
		title: "4. Imposta i vincoli",
		description: "Limiti globali e per dipendente.",
		href: "vincoli.html",
		icon: "fa-scale-balanced",
	},
	{
		title: "5. Genera il planning",
		description: "Vai in dashboard e calcola 2 settimane.",
		href: "index.html",
		icon: "fa-table-columns",
	},
];

const simulationConfig = {
	roles: [
		{ id: 1, nome: "Cameriere", colore: "#4ade80", minDipendenti: 2, maxDipendenti: 4, livello: 1 },
		{ id: 2, nome: "Cuoco", colore: "#f59e0b", minDipendenti: 2, maxDipendenti: 3, livello: 2 },
		{ id: 3, nome: "Aiuto Cuoco", colore: "#818cf8", minDipendenti: 1, maxDipendenti: 2, livello: 1 },
		{ id: 4, nome: "Pizzaiolo", colore: "#ef4444", minDipendenti: 1, maxDipendenti: 2, livello: 2 },
		{ id: 5, nome: "Responsabile di sala", colore: "#a322eeff", minDipendenti: 1, maxDipendenti: 1, livello: 3 },
	],
	shifts: [
		{ id: 1, nome: "Pranzo", colore: "#60a5fa", inizio: "10:00", fine: "15:30", ruoliPossibili: [1,2,3,4,5] },
		{ id: 2, nome: "Cena", colore: "#a78bfa", inizio: "17:30", fine: "23:30", ruoliPossibili: [1,2,3,4,5] },
	],
	defaultVincoli: {
		riposoMinimoOre: 11,
		oreMassimeGiornaliereDefault: 8,
		pausaDopoOre: 6,
		durataPausaMinuti: 30,
		perDipendente: {},
	},
	employeeNames: [
		"Mario Rossi",
		"Luca Bianchi",
		"Giulia Verdi",
		"Francesca Neri",
		"Alessandro Gallo",
		"Sara Fontana",
		"Paolo Ricci",
		"Elena Greco",
		"Simone Costa",
		"Martina Riva",
	],
};

function readSettings() {
	try {
		return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}") || {};
	} catch (error) {
		console.error("Errore lettura dati", error);
		return {};
	}
}

function exportData() {
	const payload = {
		dati: readSettings(),
		planning: JSON.parse(localStorage.getItem(PLANNING_STORAGE_KEY) || "null"),
		exportedAt: new Date().toISOString(),
	};
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = `turnify-backup-${Date.now()}.json`;
	link.click();
	URL.revokeObjectURL(link.href);
}

function showSettingsMessage(text, variant = "info") {
	if (!settingsDom.message) return;
	settingsDom.message.textContent = text;
	settingsDom.message.className = `app-message app-message--${variant}`;
}

function clearSettingsMessage() {
	if (!settingsDom.message) return;
	settingsDom.message.textContent = "";
	settingsDom.message.className = "app-message hidden";
}

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

function importData(event) {
	const file = event.target.files?.[0];
	if (!file) return;
	clearSettingsMessage();
	const reader = new FileReader();
	reader.onload = (loadEvent) => {
		try {
			const parsed = JSON.parse(loadEvent.target.result);
			if (!parsed?.dati) {
				showSettingsMessage("File non valido. Carica un backup Turnify.", "warning");
				return;
			}
			localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed.dati));
			if (parsed.planning) {
				localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(parsed.planning));
			}
			showSettingsMessage("Backup importato. Ricarico l'app...", "success");
			setTimeout(() => window.location.reload(), 800);
		} catch (error) {
			console.error("Errore import", error);
			showSettingsMessage("Errore durante l'import del file.", "error");
		}
	};
	reader.readAsText(file);
}

async function resetAll() {
	const ok = await showConfirm("Eliminare tutti i dati salvati in locale?");
	if (!ok) return;
	clearSettingsMessage();
	localStorage.removeItem(SETTINGS_STORAGE_KEY);
	localStorage.removeItem(PLANNING_STORAGE_KEY);
	showSettingsMessage("Dati eliminati. Ricarico l'app...", "info");
	setTimeout(() => window.location.reload(), 600);
}

function renderGuide() {
	if (!settingsDom.guideHost) return;
	settingsDom.guideHost.innerHTML = guideLinks
		.map(
			(item) => `
				<a class="card" href="${item.href}">
					<p class="card-title"><i class="fa-solid ${item.icon}"></i>${item.title}</p>
					<p class="card-description">${item.description}</p>
				</a>
			`
		)
		.join(" ");
}

function buildSimulationData() {
	const dipendenti = [];

	// 2 responsabili di sala
	for (let i = 0; i < 2; i++) {
		dipendenti.push({
			id: i + 1,
			nome: simulationConfig.employeeNames[i],
			ruoli: [5, 1], // Responsabile di sala, Cameriere
			turni: [1, 2], // Pranzo, Cena
			oreSettimanali: 40,
			oreGiornaliere: 8,
			esperienza: 3,
			indisponibilita: [],
			feriePermessi: [],
		});
	}

	// 2 pizzaioli
	for (let i = 2; i < 4; i++) {
		dipendenti.push({
			id: i + 1,
			nome: simulationConfig.employeeNames[i],
			ruoli: [4], // Pizzaiolo
			turni: [2], // Cena
			oreSettimanali: 40,
			oreGiornaliere: 8,
			esperienza: 2,
			indisponibilita: [],
			feriePermessi: [],
		});
	}

	// 2 cuochi
	for (let i = 4; i < 6; i++) {
		dipendenti.push({
			id: i + 1,
			nome: simulationConfig.employeeNames[i],
			ruoli: [2], // Cuoco
			turni: [1, 2], // Pranzo, Cena
			oreSettimanali: 40,
			oreGiornaliere: 8,
			esperienza: 2,
			indisponibilita: [],
			feriePermessi: [],
		});
	}

	// 2 aiuto cuochi
	for (let i = 6; i < 8; i++) {
		dipendenti.push({
			id: i + 1,
			nome: simulationConfig.employeeNames[i],
			ruoli: [3], // Aiuto Cuoco
			turni: [1, 2], // Pranzo, Cena
			oreSettimanali: 40,
			oreGiornaliere: 8,
			esperienza: 1,
			indisponibilita: [],
			feriePermessi: [],
		});
	}

	// 2 camerieri
	for (let i = 8; i < 10; i++) {
		dipendenti.push({
			id: i + 1,
			nome: simulationConfig.employeeNames[i],
			ruoli: [1], // Cameriere
			turni: [1, 2], // Pranzo, Cena
			oreSettimanali: 40,
			oreGiornaliere: 8,
			esperienza: 1,
			indisponibilita: [],
			feriePermessi: [],
		});
	}

	return {
		ruoli: simulationConfig.roles,
		turni: simulationConfig.shifts,
		dipendenti,
		vincoli: simulationConfig.defaultVincoli,
	};
}

async function seedSimulation() {
	const ok = await showConfirm("Sovrascrivere i dati attuali con la simulazione?");
	if (!ok) return;
	clearSettingsMessage();
	const payload = buildSimulationData();
	localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
	localStorage.removeItem(PLANNING_STORAGE_KEY);
	showSettingsMessage("Dataset demo generato. Ti porto in dashboard...", "success");
	setTimeout(() => (window.location.href = "index.html"), 800);
}

function initSettings() {
	renderGuide();
	settingsDom.exportBtn?.addEventListener("click", exportData);
	settingsDom.importInput?.addEventListener("change", importData);
	settingsDom.resetBtn?.addEventListener("click", resetAll);
	settingsDom.simulationBtn?.addEventListener("click", seedSimulation);
}

document.addEventListener("DOMContentLoaded", initSettings);