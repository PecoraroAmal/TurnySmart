const DIP_STORAGE_KEY = "gestoreTurni_data";

const dipSelectors = {
	formHost: document.getElementById("employeeForm"),
	listHost: document.getElementById("employeeList"),
	counter: document.getElementById("employeeCounter"),
	emptyState: document.getElementById("employeeEmptyState"),
	formPanel: document.getElementById("employeeFormPanel"),
	openButton: document.getElementById("openEmployeeForm"),
	message: document.getElementById("employeesMessage"),
};

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

const giorniSettimana = [
	"lunedì",
	"martedì",
	"mercoledì",
	"giovedì",
	"venerdì",
	"sabato",
	"domenica",
];

let tempIndisponibilita = [];

function readDipDb() {
	try {
		const parsed = JSON.parse(localStorage.getItem(DIP_STORAGE_KEY) || "{}");
		return {
			dipendenti: parsed?.dipendenti || [],
			ruoli: parsed?.ruoli || [],
			turni: parsed?.turni || [],
			vincoli: parsed?.vincoli || {},
		};
	} catch (error) {
		console.error("Errore lettura dipendenti", error);
		return { dipendenti: [], ruoli: [], turni: [], vincoli: {} };
	}
}

function persistDipDb(db) {
	localStorage.setItem(DIP_STORAGE_KEY, JSON.stringify(db));
}

function showEmployeesMessage(text, variant = "info") {
	if (!dipSelectors.message) return;
	dipSelectors.message.textContent = text;
	dipSelectors.message.className = `app-message app-message--${variant}`;
}

function clearEmployeesMessage() {
	if (!dipSelectors.message) return;
	dipSelectors.message.textContent = "";
	dipSelectors.message.className = "app-message hidden";
}

function toggleEmployeeForm(open, employee) {
	if (!dipSelectors.formPanel || !dipSelectors.formHost) return;
	if (open) {
		dipSelectors.formPanel.classList.remove("hidden");
		document.body.classList.add("no-scroll");
		renderEmployeeForm(employee);
	} else {
		dipSelectors.formPanel.classList.add("hidden");
		dipSelectors.formHost.innerHTML = "";
		tempIndisponibilita = [];
		document.body.classList.remove("no-scroll");
	}
}

function renderEmployeeForm(employee) {
	if (!dipSelectors.formHost) return;
	const db = readDipDb();
	const roles = db.ruoli;
	tempIndisponibilita = employee?.indisponibilita
		? JSON.parse(JSON.stringify(employee.indisponibilita))
		: [];
	const selectedRoles = new Set(employee?.ruoli || []);

	const rolesMarkup = roles.length
		? roles
				.map(
					(role) => `
						<label class="checkbox-chip">
							<input type="checkbox" name="ruoli" value="${role.id}" ${selectedRoles.has(role.id) ? "checked" : ""}>
							<span>${role.nome}</span>
						</label>
					`
				)
				.join(" ")
		: `<p class="helper-text">Definisci i ruoli prima di assegnarli al personale.</p>`;

	dipSelectors.formHost.innerHTML = `
		<form id="employeeFormElement">
			<input type="hidden" name="id" value="${employee?.id || ""}">
			<div class="form-grid two-columns">
				<div class="form-field">
					<label>Nome e cognome</label>
					<input name="nome" type="text" value="${employee?.nome || ""}" placeholder="Es. Mario Rossi" required>
				</div>
				<div class="form-field">
					<label>Ore settimanali</label>
					<input name="oreSettimanali" type="number" min="1" value="${employee?.oreSettimanali || 40}" required>
				</div>
				<div class="form-field">
					<label>Ore giornaliere</label>
					<input name="oreGiornaliere" type="number" min="1" step="0.5" value="${employee?.oreGiornaliere || 8}" required>
				</div>
				<div class="form-field">
					<label>Importanza</label>
					<select name="importanza">
						${Array.from({ length: 5 }, (_, idx) => idx + 1)
							.map((val) => `<option value="${val}" ${Number(employee?.importanza || 3) === val ? "selected" : ""}>${val}</option>`)
							.join(" ")}
					</select>
				</div>
			</div>

			<div class="form-field">
				<label>Ruoli abilitati</label>
				<div class="checkbox-group">${rolesMarkup}</div>
			</div>

			<div class="form-field">
				<label>Indisponibilità</label>
				<div class="inline-field">
					<select id="daySelect">
						${giorniSettimana.map((giorno) => `<option value="${giorno}">${giorno}</option>`).join(" ")}
					</select>
					<input type="time" id="startTime" value="08:00">
					<input type="time" id="endTime" value="17:00">
					<button class="button secondary" type="button" id="addUnavailability">
						<i class="fa-solid fa-plus"></i>Aggiungi
					</button>
				</div>
				<div id="unavailabilityList" class="vincoli-list"></div>
			</div>

			<div class="form-actions">
				<button class="button" type="submit">
					<i class="fa-solid ${employee ? "fa-floppy-disk" : "fa-plus"}"></i>
					${employee ? "Aggiorna" : "Crea"} dipendente
				</button>
				<button class="button secondary" type="button" id="cancelEmployeeForm">
					<i class="fa-solid fa-xmark"></i>
					Chiudi
				</button>
			</div>
		</form>
	`;

	const formEl = document.getElementById("employeeFormElement");
	formEl?.addEventListener("submit", handleEmployeeSubmit);
	document.getElementById("addUnavailability")?.addEventListener("click", handleAddUnavailability);
	renderUnavailabilityList();
	document.getElementById("cancelEmployeeForm")?.addEventListener("click", () => toggleEmployeeForm(false));
}

function handleAddUnavailability() {
	clearEmployeesMessage();
	const day = document.getElementById("daySelect").value;
	const start = document.getElementById("startTime").value;
	const end = document.getElementById("endTime").value;
	if (!day || !start || !end) return;
	if (start >= end) {
		showEmployeesMessage("L'orario di inizio deve precedere quello di fine.", "error");
		return;
	}
	tempIndisponibilita.push({ giorno: day, da: start, a: end });
	renderUnavailabilityList();
}

function renderUnavailabilityList() {
	const host = document.getElementById("unavailabilityList");
	if (!host) return;
	if (!tempIndisponibilita.length) {
		host.innerHTML = `<p class="helper-text">Nessuna indisponibilità registrata.</p>`;
		return;
	}
	host.innerHTML = tempIndisponibilita
		.map(
			(item, index) => `
				<div class="vincolo-item">
					<span>${item.giorno} · ${item.da} - ${item.a}</span>
					<button class="button danger" type="button" data-remove="${index}"><i class="fa-solid fa-xmark"></i></button>
				</div>
			`
		)
		.join(" ");

	host.querySelectorAll("button[data-remove]").forEach((btn) =>
		btn.addEventListener("click", (event) => {
			const idx = Number(event.currentTarget.dataset.remove);
			tempIndisponibilita.splice(idx, 1);
			renderUnavailabilityList();
		})
	);
}

function handleEmployeeSubmit(event) {
	event.preventDefault();
	clearEmployeesMessage();
	const formData = new FormData(event.target);
	const db = readDipDb();
	const name = formData.get("nome").trim();
	if (!name) {
		showEmployeesMessage("Inserisci il nome del dipendente.", "warning");
		return;
	}

	const selectedRoles = formData.getAll("ruoli").map((role) => Number(role));

	const payload = {
		id: formData.get("id") ? Number(formData.get("id")) : Date.now(),
		nome: name,
		oreSettimanali: Number(formData.get("oreSettimanali")) || 40,
		oreGiornaliere: Number(formData.get("oreGiornaliere")) || 8,
		importanza: Number(formData.get("importanza")) || 3,
		ruoli: selectedRoles,
		indisponibilita: tempIndisponibilita,
		feriePermessi: [],
	};

	const exists = db.dipendenti.some((d) => d.id === payload.id);
	if (exists) {
		db.dipendenti = db.dipendenti.map((d) => (d.id === payload.id ? payload : d));
	} else {
		db.dipendenti.push(payload);
	}

	persistDipDb(db);
	tempIndisponibilita = [];
	toggleEmployeeForm(false);
	renderEmployeeList();
	showEmployeesMessage("Dipendente salvato con successo.", "success");
}

function renderEmployeeList() {
	if (!dipSelectors.listHost) return;
	const db = readDipDb();
	const employees = db.dipendenti;
	dipSelectors.counter.textContent = `${employees.length} dipendenti`;

	if (!employees.length) {
		dipSelectors.listHost.innerHTML = "";
		if (dipSelectors.emptyState) dipSelectors.emptyState.style.display = "block";
		dipSelectors.listHost.style.display = "none";
		return;
	}

	if (dipSelectors.emptyState) dipSelectors.emptyState.style.display = "none";
	const roleMap = new Map(db.ruoli.map((role) => [role.id, role]));

	dipSelectors.listHost.innerHTML = employees
		.map((employee) => {
			const rolesLabel = employee.ruoli.length
				? employee.ruoli
					.map((roleId) => {
						const role = roleMap.get(roleId);
						if (!role) return `<span class="role-inline">Ruolo #${roleId}</span>`;
						const textColor = getReadableTextColor(role.colore);
						const bg = role.colore;
						return `<span class="role-inline" style="background:${bg};color:${textColor};border:1px solid ${textColor === '#ffffff' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.2)'}">${role.nome}</span>`;
					})
					.join(" ")
				: "Nessun ruolo";
			return `
				<article class="card" data-id="${employee.id}">
					<div class="card-header">
						<div>
							<p class="card-title"><i class="fa-solid fa-user"></i>${employee.nome}</p>
							<p class="card-description">Importanza ${employee.importanza} · ${employee.oreSettimanali}h/settimana · ${(employee.oreGiornaliere || 8).toString().replace('.', ',')}h/giorno</p>
							<p class="muted">Ruoli: ${rolesLabel}</p>
						</div>
						<div class="list-inline">
							<button class="button secondary" data-action="edit"><i class="fa-solid fa-pen"></i></button>
							<button class="button danger" data-action="delete"><i class="fa-solid fa-trash"></i></button>
						</div>
					</div>
				</article>
			`;
		})
		.join(" ");

	dipSelectors.listHost.style.display = "grid";
}

function handleEmployeeActions(event) {
	const actionBtn = event.target.closest("button[data-action]");
	if (!actionBtn) return;
	const card = actionBtn.closest("article[data-id]");
	const employeeId = Number(card?.dataset.id);
	if (!employeeId) return;

	const db = readDipDb();

	if (actionBtn.dataset.action === "delete") {
		showConfirm("Eliminare il dipendente?").then((ok) => {
			if (!ok) return;
			db.dipendenti = db.dipendenti.filter((emp) => emp.id !== employeeId);
			persistDipDb(db);
			renderEmployeeList();
			showEmployeesMessage("Dipendente rimosso.", "info");
		});
		return;
	}

	if (actionBtn.dataset.action === "edit") {
		const employee = db.dipendenti.find((emp) => emp.id === employeeId);
		if (employee) {
			clearEmployeesMessage();
			toggleEmployeeForm(true, employee);
		}
	}
}

function initDipendenti() {
	if (!dipSelectors.formHost) return;
	renderEmployeeList();
	dipSelectors.listHost?.addEventListener("click", handleEmployeeActions);
	dipSelectors.openButton?.addEventListener("click", () => {
		clearEmployeesMessage();
		toggleEmployeeForm(true);
		setTimeout(() => dipSelectors.formHost?.querySelector("input[name='nome']")?.focus(), 50);
	});
}

document.addEventListener("DOMContentLoaded", initDipendenti);

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