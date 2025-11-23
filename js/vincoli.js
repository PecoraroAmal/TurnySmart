const VINCOLI_STORAGE_KEY = "gestoreTurni_data";

const selectorsVincoli = {
	globalHost: document.getElementById("globalConstraints"),
	listHost: document.getElementById("perEmployeeConstraints"),
	emptyState: document.getElementById("constraintsEmptyState"),
	addBtn: document.getElementById("addConstraint"),
	message: document.getElementById("constraintsMessage"),
};

const defaultVincoli = {
	riposoMinimoOre: 11,
	oreMassimeGiornaliereDefault: 8,
	pausaDopoOre: 6,
	durataPausaMinuti: 30,
	perDipendente: {},
};

function readVincoliDb() {
	try {
		const parsed = JSON.parse(localStorage.getItem(VINCOLI_STORAGE_KEY) || "{}");
		return {
			ruoli: parsed?.ruoli || [],
			dipendenti: parsed?.dipendenti || [],
			turni: parsed?.turni || [],
			vincoli: { ...defaultVincoli, ...(parsed?.vincoli || {}) },
		};
	} catch (error) {
		console.error("Errore lettura vincoli", error);
		return {
			ruoli: [],
			dipendenti: [],
			turni: [],
			vincoli: { ...defaultVincoli },
		};
	}
}

function persistVincoli(vincoli) {
	const db = readVincoliDb();
	localStorage.setItem(
		VINCOLI_STORAGE_KEY,
		JSON.stringify({ ...db, vincoli })
	);
}

function showVincoliMessage(text, variant = "info") {
	if (!selectorsVincoli.message) return;
	selectorsVincoli.message.textContent = text;
	selectorsVincoli.message.className = `app-message app-message--${variant}`;
}

function clearVincoliMessage() {
	if (!selectorsVincoli.message) return;
	selectorsVincoli.message.textContent = "";
	selectorsVincoli.message.className = "app-message hidden";
}

function renderGlobalConstraints() {
	if (!selectorsVincoli.globalHost) return;
	const { vincoli } = readVincoliDb();
	selectorsVincoli.globalHost.innerHTML = `
		<div class="form-field">
			<label>Riposo minimo (ore)</label>
			<input type="number" min="0" step="1" name="riposoMinimoOre" value="${vincoli.riposoMinimoOre}" />
		</div>
		<div class="form-field">
			<label>Ore max giornaliere (default)</label>
			<input type="number" min="1" step="1" name="oreMassimeGiornaliereDefault" value="${vincoli.oreMassimeGiornaliereDefault}" />
		</div>
		<div class="form-field">
			<label>Ore dopo cui fare pausa</label>
			<input type="number" min="1" step="0.5" name="pausaDopoOre" value="${vincoli.pausaDopoOre}" />
		</div>
		<div class="form-field">
			<label>Durata pausa (minuti)</label>
			<input type="number" min="1" step="5" name="durataPausaMinuti" value="${vincoli.durataPausaMinuti}" />
		</div>
	`;

	selectorsVincoli.globalHost
		.querySelectorAll("input")
		.forEach((input) => input.addEventListener("change", handleGlobalChange));
}

function handleGlobalChange(event) {
	const { name, value } = event.target;
	const db = readVincoliDb();
	const numericValue = Number(value);
	db.vincoli[name] = Number.isNaN(numericValue) ? value : numericValue;
	persistVincoli(db.vincoli);
}

function renderPerEmployeeList() {
	if (!selectorsVincoli.listHost) return;
	const { vincoli, dipendenti } = readVincoliDb();
	const entries = Object.entries(vincoli.perDipendente || {});

	if (!entries.length) {
		selectorsVincoli.listHost.innerHTML = "";
		if (selectorsVincoli.emptyState) selectorsVincoli.emptyState.style.display = "block";
		return;
	}

	if (selectorsVincoli.emptyState) selectorsVincoli.emptyState.style.display = "none";
	selectorsVincoli.listHost.innerHTML = entries
		.map(([id, settings]) => {
			const employee = dipendenti.find((d) => String(d.id) === String(id));
			const label = employee ? employee.nome : `Dipendente #${id}`;
			return `
				<div class="vincolo-item" data-id="${id}">
					<div>
						<strong>${label}</strong>
						<p class="muted">Ore max giornaliere: ${settings.oreMassimeGiornaliere || "Default"}</p>
					</div>
					<div class="list-inline">
						<button class="button secondary" data-action="edit"><i class="fa-solid fa-pen"></i></button>
						<button class="button danger" data-action="delete"><i class="fa-solid fa-trash"></i></button>
					</div>
				</div>
			`;
		})
		.join(" ");
}

function showOverrideForm(existing) {
	removeOverrideForm();
	if (selectorsVincoli.emptyState) {
		selectorsVincoli.emptyState.style.display = "none";
	}
	clearVincoliMessage();

	const wrapper = document.createElement("div");
	wrapper.id = "overrideFormCard";
	wrapper.className = "form-card";
	const idValue = existing?.id || "";
	wrapper.innerHTML = `
		<form id="overrideForm">
			<div class="form-grid">
				<div class="form-field">
					<label>ID dipendente</label>
					<input type="number" min="1" name="dipendenteId" value="${idValue}" ${existing ? "readonly" : ""} required />
					<p class="helper-text">Usa l'ID del dipendente in anagrafica.</p>
				</div>
				<div class="form-field">
					<label>Ore max giornaliere</label>
					<input type="number" min="1" name="oreMassimeGiornaliere" value="${existing?.oreMassimeGiornaliere || ""}" />
				</div>
				<div class="form-field">
					<label>Ore max settimanali</label>
					<input type="number" min="1" name="oreMassimeSettimanali" value="${existing?.oreMassimeSettimanali || ""}" />
				</div>
				<div class="form-field">
					<label>Riposo minimo personalizzato</label>
					<input type="number" min="0" name="riposoMinimoOre" value="${existing?.riposoMinimoOre || ""}" />
				</div>
			</div>
			<div class="form-actions">
				<button class="button" type="submit"><i class="fa-solid fa-floppy-disk"></i>Salva</button>
				<button class="button secondary" type="button" id="cancelOverride"><i class="fa-solid fa-rotate-left"></i>Annulla</button>
			</div>
		</form>
	`;

	selectorsVincoli.listHost?.prepend(wrapper);
	document.getElementById("overrideForm").addEventListener("submit", handleOverrideSubmit);
	document.getElementById("cancelOverride").addEventListener("click", removeOverrideForm);
}

function removeOverrideForm() {
	const existingForm = document.getElementById("overrideFormCard");
	if (existingForm) existingForm.remove();
}

function handleOverrideSubmit(event) {
	event.preventDefault();
	clearVincoliMessage();
	const formData = new FormData(event.target);
	const dipendenteId = formData.get("dipendenteId");
	if (!dipendenteId) {
		showVincoliMessage("Serve l'ID del dipendente.", "warning");
		return;
	}

	const db = readVincoliDb();
	db.vincoli.perDipendente = db.vincoli.perDipendente || {};
	db.vincoli.perDipendente[dipendenteId] = {
		oreMassimeGiornaliere: formData.get("oreMassimeGiornaliere") ? Number(formData.get("oreMassimeGiornaliere")) : undefined,
		oreMassimeSettimanali: formData.get("oreMassimeSettimanali") ? Number(formData.get("oreMassimeSettimanali")) : undefined,
		riposoMinimoOre: formData.get("riposoMinimoOre") ? Number(formData.get("riposoMinimoOre")) : undefined,
	};

	persistVincoli(db.vincoli);
	removeOverrideForm();
	renderPerEmployeeList();
	showVincoliMessage("Regola salvata correttamente.", "success");
}

function handleOverrideActions(event) {
	const actionBtn = event.target.closest("button[data-action]");
	if (!actionBtn) return;
	const item = actionBtn.closest(".vincolo-item");
	const id = item?.dataset.id;
	if (!id) return;

	const db = readVincoliDb();

	if (actionBtn.dataset.action === "delete") {
		showConfirm("Eliminare la regola personalizzata?").then((ok) => {
			if (!ok) return;
			delete db.vincoli.perDipendente[id];
			persistVincoli(db.vincoli);
			renderPerEmployeeList();
			showVincoliMessage("Regola eliminata.", "info");
		});
		return;
	}

	if (actionBtn.dataset.action === "edit") {
		const current = db.vincoli.perDipendente[id];
		showOverrideForm({ id, ...current });
	}
}

function initVincoli() {
	if (!selectorsVincoli.globalHost) return;
	renderGlobalConstraints();
	renderPerEmployeeList();
	selectorsVincoli.listHost?.addEventListener("click", handleOverrideActions);
	selectorsVincoli.addBtn?.addEventListener("click", () => showOverrideForm());
}

document.addEventListener("DOMContentLoaded", initVincoli);

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