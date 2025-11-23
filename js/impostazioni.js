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
		title: "2. Aggiungi dipendenti",
		description: "Ruoli abilitati, importanza e indisponibilità.",
		href: "dipendenti.html",
		icon: "fa-user-group",
	},
	{
		title: "3. Configura i turni",
		description: "Fasce orarie e ruoli richiesti.",
		href: "turni.html",
		icon: "fa-business-time",
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
		{ id: 1, nome: "Store Delivery Mattina", colore: "#22d3ee", minDipendenti: 1, maxDipendenti: 2, livello: 1 },
		{ id: 2, nome: "Store Delivery Pomeriggio", colore: "#0ea5e9", minDipendenti: 1, maxDipendenti: 2, livello: 1 },
		{ id: 3, nome: "Sniper", colore: "#ef4444", minDipendenti: 1, maxDipendenti: 1, livello: 2 },
		{ id: 4, nome: "Carrista", colore: "#f59e0b", minDipendenti: 1, maxDipendenti: 2, livello: 3 },
	],
	shifts: [
		{ id: 1, nome: "Mattina", colore: "#4ade80", inizio: "06:00", fine: "14:30", ruoliPossibili: [3, 1, 4] },
		{ id: 2, nome: "Pomeriggio", colore: "#818cf8", inizio: "13:30", fine: "22:00", ruoliPossibili: [3, 2, 4] },
	],
	defaultVincoli: {
		riposoMinimoOre: 11,
		oreMassimeGiornaliereDefault: 8,
		pausaDopoOre: 6,
		durataPausaMinuti: 30,
		perDipendente: {},
	},
	employeeNames: [
		"Alessio Moretti",
		"Beatrice Villa",
		"Carlo Gentile",
		"Davide Conti",
		"Elena Fabbri",
		"Fabio Leone",
		"Giulia Serra",
		"Hamed Saidi",
		"Irene Bellini",
		"Jacopo Ferri",
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

function resetAll() {
	if (!confirm("Eliminare tutti i dati salvati in locale?")) return;
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

	// 4 dipendenti: Store Delivery Mattina, Store Delivery Pomeriggio, Sniper, Carrista
	for (let i = 0; i < 4; i++) {
		dipendenti.push({
			id: i + 1,
			nome: simulationConfig.employeeNames[i],
			ruoli: [1, 2, 3, 4], // Store Delivery Mattina, Store Delivery Pomeriggio, Sniper, Carrista
			oreSettimanali: 40,
			oreGiornaliere: 8,
			importanza: (i % 5) + 1,
			indisponibilita: [],
			feriePermessi: [],
		});
	}

	// 2 dipendenti: Store Delivery Mattina, Store Delivery Pomeriggio, Sniper
	for (let i = 4; i < 6; i++) {
		dipendenti.push({
			id: i + 1,
			nome: simulationConfig.employeeNames[i],
			ruoli: [1, 2, 3], // Store Delivery Mattina, Store Delivery Pomeriggio, Sniper
			oreSettimanali: 40,
			oreGiornaliere: 8,
			importanza: (i % 5) + 1,
			indisponibilita: [],
			feriePermessi: [],
		});
	}

	// 4 dipendenti: Store Delivery Mattina, Store Delivery Pomeriggio
	for (let i = 6; i < 10; i++) {
		dipendenti.push({
			id: i + 1,
			nome: simulationConfig.employeeNames[i],
			ruoli: [1, 2], // Store Delivery Mattina, Store Delivery Pomeriggio
			oreSettimanali: 40,
			oreGiornaliere: 8,
			importanza: (i % 5) + 1,
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

function seedSimulation() {
	if (!confirm("Sovrascrivere i dati attuali con la simulazione?")) return;
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