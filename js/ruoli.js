const STORAGE_KEY = "gestoreTurni_data";

const selectors = {
	formHost: document.getElementById("roleForm"),
	listHost: document.getElementById("roleList"),
	counter: document.getElementById("roleCounter"),
	emptyState: document.getElementById("roleEmptyState"),
	formPanel: document.getElementById("roleFormPanel"),
	openButton: document.getElementById("openRoleForm"),
	message: document.getElementById("rolesMessage"),
};

const defaultDb = { ruoli: [], dipendenti: [], turni: [], vincoli: {} };

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

function loadDb() {
	try {
		const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
		return { ...defaultDb, ...parsed, ruoli: parsed?.ruoli || [] };
	} catch (error) {
		console.error("Impossibile leggere il database locale", error);
		return structuredClone(defaultDb);
	}
}

function saveDb(db) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function showRolesMessage(text, variant = "info") {
	if (!selectors.message) return;
	selectors.message.textContent = text;
	selectors.message.className = `app-message app-message--${variant}`;
}

function clearRolesMessage() {
	if (!selectors.message) return;
	selectors.message.textContent = "";
	selectors.message.className = "app-message hidden";
}

function toggleFormPanel(open, role) {
	if (!selectors.formPanel || !selectors.formHost) return;
	if (open) {
		selectors.formPanel.classList.remove("hidden");
		document.body.classList.add("no-scroll");
		renderForm(role);
	} else {
		selectors.formPanel.classList.add("hidden");
		selectors.formHost.innerHTML = "";
		document.body.classList.remove("no-scroll");
	}
}

function renderForm(role) {
	const isEditing = Boolean(role);
	selectors.formHost.innerHTML = `
		<form id="roleFormElement">
			<input type="hidden" name="id" value="${role?.id || ""}">
			<div class="form-grid two-columns">
				<div class="form-field">
					<label for="roleName">Nome ruolo</label>
					<input id="roleName" name="nome" type="text" placeholder="Es. Carrista" value="${role?.nome || ""}" required>
				</div>
				<div class="form-field">
					<label for="roleColor">Colore</label>
					<div class="inline-field">
						<input id="roleColor" name="colore" type="color" value="${role?.colore || "#000000"}" required>
						<span class="tag">${role?.colore || "#000000"}</span>
					</div>
				</div>
				<div class="form-field">
					<label for="roleLevel">Livello priorità</label>
					<input id="roleLevel" name="livello" type="number" min="1" value="${role?.livello || 1}" required>
				</div>
				<div class="form-field">
					<label>Copertura minimo/massimo</label>
					<div class="inline-field">
						<input name="minDipendenti" type="number" min="1" placeholder="Min" value="${role?.minDipendenti || 1}" required>
						<input name="maxDipendenti" type="number" min="1" placeholder="Max" value="${role?.maxDipendenti || 1}" required>
					</div>
					<p class="helper-text">Usato dal generatore di planning per ruolo.</p>
				</div>
			</div>
			<div class="form-actions">
				<button class="button" type="submit">
					<i class="fa-solid ${isEditing ? "fa-floppy-disk" : "fa-plus"}"></i>
					${isEditing ? "Aggiorna" : "Crea"} ruolo
				</button>
				<button class="button secondary" type="button" id="cancelRoleForm">
					<i class="fa-solid fa-xmark"></i>
					Chiudi
				</button>
			</div>
		</form>
	`;

	const formEl = document.getElementById("roleFormElement");
	formEl.addEventListener("submit", handleSubmit);
	const colorInput = document.getElementById("roleColor");
	colorInput?.addEventListener("input", handleColorPreview);
	const cancelButton = document.getElementById("cancelRoleForm");
	cancelButton?.addEventListener("click", () => toggleFormPanel(false));
}

function handleColorPreview(event) {
	const tag = event.target.parentElement.querySelector(".tag");
	if (tag) tag.textContent = event.target.value;
}

function handleSubmit(event) {
	event.preventDefault();
	clearRolesMessage();
	const formData = new FormData(event.target);
	const min = Number(formData.get("minDipendenti"));
	const max = Number(formData.get("maxDipendenti"));

	if (min > max) {
		showRolesMessage("Il valore minimo non può superare il massimo.", "error");
		return;
	}

	const db = loadDb();
	const payload = {
		id: formData.get("id") ? Number(formData.get("id")) : Date.now(),
		nome: formData.get("nome").trim(),
		colore: formData.get("colore"),
		livello: Number(formData.get("livello")),
		minDipendenti: min,
		maxDipendenti: max,
	};

	if (!payload.nome) {
		showRolesMessage("Inserisci il nome del ruolo.", "warning");
		return;
	}

	const existingIndex = db.ruoli.findIndex((role) => role.id === payload.id);
	if (existingIndex >= 0) {
		db.ruoli[existingIndex] = payload;
	} else {
		db.ruoli.push(payload);
	}

	saveDb(db);
	renderRoles();
	toggleFormPanel(false);
	showRolesMessage("Ruolo salvato correttamente.", "success");
}

function renderRoles() {
	const db = loadDb();
	const roles = db.ruoli.sort((a, b) => a.livello - b.livello);

	selectors.counter.textContent = `${roles.length} ruoli`;
	selectors.listHost.innerHTML = roles
		.map(
			(role) => {
				const textColor = getReadableTextColor(role.colore);
				const descColor = textColor === "#ffffff" ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.75)";
				return `
				<article class="card" data-id="${role.id}" style="background:${role.colore};color:${textColor};">
					<div class="card-header">
						<div>
							  <p class="card-title"><span class="role-pill" style="--dot-color:${role.colore};color:${textColor};background:${textColor === "#ffffff" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.25)"};">${role.nome}</span></p>
							<p class="card-description" style="color:${descColor}">Livello ${role.livello} · Min ${role.minDipendenti} · Max ${role.maxDipendenti}</p>
						</div>
						<div class="list-inline">
							<button class="button secondary" data-action="edit"><i class="fa-solid fa-pen"></i></button>
							<button class="button danger" data-action="delete"><i class="fa-solid fa-trash"></i></button>
						</div>
					</div>
				</article>
			`;
			}
		)
		.join(" ");

	if (selectors.emptyState) selectors.emptyState.style.display = roles.length ? "none" : "block";
	selectors.listHost.style.display = roles.length ? "grid" : "none";
}

function handleListClick(event) {
	const actionButton = event.target.closest("button[data-action]");
	if (!actionButton) return;

	const card = actionButton.closest("article[data-id]");
	const roleId = Number(card?.dataset.id);
	if (!roleId) return;

	if (actionButton.dataset.action === "delete") {
		showConfirm("Eliminare il ruolo?").then((ok) => {
			if (!ok) return;
			const db = loadDb();
			db.ruoli = db.ruoli.filter((role) => role.id !== roleId);
			saveDb(db);
			renderRoles();
			showRolesMessage("Ruolo eliminato.", "info");
		});
		return;
	}

	if (actionButton.dataset.action === "edit") {
		const db = loadDb();
		const role = db.ruoli.find((item) => item.id === roleId);
		if (role) {
			clearRolesMessage();
			toggleFormPanel(true, role);
		}
	}
}

function init() {
	if (!selectors.formHost || !selectors.listHost) return;
	renderRoles();
	selectors.listHost.addEventListener("click", handleListClick);
	selectors.openButton?.addEventListener("click", () => {
		clearRolesMessage();
		toggleFormPanel(true);
		setTimeout(() => document.getElementById("roleName")?.focus(), 50);
	});
}

document.addEventListener("DOMContentLoaded", init);

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