const DB_KEY = "gestoreTurni_data";
const INDISPONIBILITA_KEY = "gestoreTurni_indisponibilita";

const form = document.getElementById("indisponibilitaForm");
const dipendenteSelect = document.getElementById("dipendente");
const tipoSelect = document.getElementById("tipo");
const dataInizioInput = document.getElementById("dataInizio");
const oraInizioInput = document.getElementById("oraInizio");
const dataFineInput = document.getElementById("dataFine");
const oraFineInput = document.getElementById("oraFine");
const noteTextarea = document.getElementById("note");
const cancelBtn = document.getElementById("cancelBtn");
const listContainer = document.getElementById("indisponibilitaList");
const messageDiv = document.getElementById("message");
const addBtn = document.getElementById("addBtn");
const togglePastBtn = document.getElementById("togglePastBtn");
const formModal = document.getElementById("formModal");

let editingId = null;
let hidePast = false;

function readDatabase() {
	try {
		const parsed = JSON.parse(localStorage.getItem(DB_KEY) || "{}");
		if (parsed.dipendenti && parsed.dipendenti.length > 0) {
			return {
				dipendenti: parsed?.dipendenti || [],
			};
		} else {
			// Use hardcoded data
			return {
				dipendenti: (window.employees || []).map(e => ({ id: e.name, nome: e.name })),
			};
		}
	} catch (error) {
		console.error("Errore lettura database", error);
		return { dipendenti: [] };
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

function saveIndisponibilita(indisponibilita) {
	localStorage.setItem(INDISPONIBILITA_KEY, JSON.stringify(indisponibilita));
}

function populateDipendenteSelect() {
	const db = readDatabase();
	dipendenteSelect.innerHTML = '<option value="">Seleziona dipendente</option>';
	db.dipendenti.forEach(dip => {
		const option = document.createElement("option");
		option.value = dip.id;
		option.textContent = dip.nome;
		dipendenteSelect.appendChild(option);
	});
}

function showMessage(text, variant = "info") {
	messageDiv.textContent = text;
	messageDiv.className = `app-message app-message--${variant}`;
	messageDiv.classList.remove("hidden");
	setTimeout(() => {
		messageDiv.classList.add("hidden");
	}, 5000);
}

function resetForm() {
	form.reset();
	editingId = null;
	formModal.classList.add("hidden");
}

function loadIndisponibilitaForEdit(id) {
	const indisponibilita = readIndisponibilita();
	const item = indisponibilita.find(i => i.id === id);
	if (item) {
		dipendenteSelect.value = String(item.dipendenteId);
		tipoSelect.value = item.tipo;
		dataInizioInput.value = item.dataInizio;
		oraInizioInput.value = item.oraInizio || "";
		dataFineInput.value = item.dataFine;
		oraFineInput.value = item.oraFine || "";
		noteTextarea.value = item.note || "";
		editingId = id;
		formModal.classList.remove("hidden");
	}
}

function deleteIndisponibilita(id) {
	showConfirm("Eliminare questa indisponibilità?").then((ok) => {
		if (!ok) return;
		let indisponibilita = readIndisponibilita();
		indisponibilita = indisponibilita.filter(i => i.id !== id);
		saveIndisponibilita(indisponibilita);
		renderList();
		showMessage("Indisponibilità eliminata.", "success");
	});
}
// Conferma modale come nelle altre pagine
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

function renderList() {
	const indisponibilita = readIndisponibilita();
	const db = readDatabase();
	const today = new Date().toISOString().split("T")[0];

	let filtered = indisponibilita;
	if (hidePast) {
		filtered = indisponibilita.filter(i => i.dataFine >= today);
	}

	filtered.sort((a, b) => a.dataInizio.localeCompare(b.dataInizio));

	listContainer.innerHTML = "";

	if (filtered.length === 0) {
		listContainer.innerHTML = '<div class="empty-state"><p>Nessuna indisponibilità trovata.</p></div>';
		return;
	}

	filtered.forEach(item => {
		const dip = db.dipendenti.find(d => d.id === item.dipendenteId);
		const dipNome = dip ? dip.nome : "Dipendente sconosciuto";

		const card = document.createElement("div");
		card.className = "card";
		const start = item.oraInizio ? `${item.dataInizio} ${item.oraInizio}` : item.dataInizio;
		const end = item.oraFine ? `${item.dataFine} ${item.oraFine}` : item.dataFine;
		card.innerHTML = `
			<div class="card-header">
				<div>
					<p class="card-title">${dipNome} - ${item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)}</p>
					<p class="card-description">${start} → ${end}</p>
				</div>
				<div class="form-actions">
					<button class="button small" onclick="loadIndisponibilitaForEdit('${item.id}')"><i class="fa-solid fa-edit"></i>Modifica</button>
					<button class="button small danger" onclick="deleteIndisponibilita('${item.id}')"><i class="fa-solid fa-trash"></i>Elimina</button>
				</div>
			</div>
			${item.note ? `<p>${item.note}</p>` : ""}
		`;
		listContainer.appendChild(card);
	});
}

form.addEventListener("submit", (e) => {
	e.preventDefault();

	const dipendenteId = Number(dipendenteSelect.value);
	const tipo = tipoSelect.value;
	const dataInizio = dataInizioInput.value;
	const oraInizio = oraInizioInput.value;
	const dataFine = dataFineInput.value;
	const oraFine = oraFineInput.value;
	const note = noteTextarea.value.trim();

	if (!dipendenteId || !tipo || !dataInizio || !dataFine) {
		showMessage("Compila tutti i campi obbligatori.", "error");
		return;
	}

	if (dataInizio > dataFine) {
		showMessage("La data di inizio deve essere precedente o uguale alla data di fine.", "error");
		return;
	}

	if (oraInizio && oraFine && dataInizio === dataFine && oraInizio >= oraFine) {
		showMessage("L'ora di inizio deve essere precedente all'ora di fine.", "error");
		return;
	}

	let indisponibilita = readIndisponibilita();

	if (editingId) {
		const index = indisponibilita.findIndex(i => i.id === editingId);
		if (index !== -1) {
			indisponibilita[index] = { ...indisponibilita[index], dipendenteId, tipo, dataInizio, oraInizio, dataFine, oraFine, note };
		}
	} else {
		const newItem = {
			id: Date.now().toString(),
			dipendenteId,
			tipo,
			dataInizio,
			oraInizio,
			dataFine,
			oraFine,
			note
		};
		indisponibilita.push(newItem);
	}

	saveIndisponibilita(indisponibilita);
	renderList();
	resetForm();
	showMessage(editingId ? "Indisponibilità modificata." : "Indisponibilità aggiunta.", "success");
});

cancelBtn.addEventListener("click", resetForm);
togglePastBtn.addEventListener("click", () => {
	hidePast = !hidePast;
	renderList();
	togglePastBtn.textContent = hidePast ? "Mostra passate" : "Nascondi passate";
});
addBtn.addEventListener("click", () => {
	resetForm();
	formModal.classList.remove("hidden");
});

formModal.addEventListener("click", (e) => {
	if (e.target === formModal) {
		resetForm();
	}
});

document.addEventListener("DOMContentLoaded", () => {
	populateDipendenteSelect();
	renderList();
	formModal.classList.add("hidden");
	togglePastBtn.textContent = "Nascondi passate";
});