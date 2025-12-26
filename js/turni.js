const TURNI_STORAGE_KEY = "gestoreTurni_data";

const shiftDom = {
	formHost: document.getElementById("shiftForm"),
	listHost: document.getElementById("shiftList"),
	counter: document.getElementById("shiftCounter"),
	emptyState: document.getElementById("shiftEmptyState"),
	formPanel: document.getElementById("shiftFormPanel"),
	openButton: document.getElementById("openShiftForm"),
	message: document.getElementById("shiftsMessage"),
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

function loadShiftDb() {
	try {
		const parsed = JSON.parse(localStorage.getItem(TURNI_STORAGE_KEY) || "{}");
		return {
			ruoli: parsed?.ruoli || [],
			turni: parsed?.turni || [],
			dipendenti: parsed?.dipendenti || [],
			vincoli: parsed?.vincoli || {},
		};
	} catch (error) {
		console.error("Errore lettura turni", error);
		return { ruoli: [], turni: [], dipendenti: [], vincoli: {} };
	}
}

function persistShifts(db) {
	localStorage.setItem(TURNI_STORAGE_KEY, JSON.stringify(db));
}

function showShiftMessage(text, variant = "info") {
	if (!shiftDom.message) return;
	shiftDom.message.textContent = text;
	shiftDom.message.className = `app-message app-message--${variant}`;
}

function clearShiftMessage() {
	if (!shiftDom.message) return;
	shiftDom.message.textContent = "";
	shiftDom.message.className = "app-message hidden";
}

function toggleShiftForm(open, shift) {
	if (!shiftDom.formPanel || !shiftDom.formHost) return;
	if (open) {
		shiftDom.formPanel.classList.remove("hidden");
		document.body.classList.add("no-scroll");
		renderShiftForm(shift);
	} else {
		shiftDom.formPanel.classList.add("hidden");
		shiftDom.formHost.innerHTML = "";
		document.body.classList.remove("no-scroll");
	}
}

function renderShiftForm(shift) {
	if (!shiftDom.formHost) return;
	const db = loadShiftDb();
	const roles = db.ruoli;
	const selectedRoles = new Set(shift?.ruoliPossibili || []);
	const rolesMarkup = roles.length
		? roles
				.map(
					(role) => `
						<label class="checkbox-chip">
							<input type="checkbox" name="ruoliPossibili" value="${role.id}" ${selectedRoles.has(role.id) ? "checked" : ""}>
							<span>${role.nome}</span>
						</label>
					`
				)
				.join(" ")
		: `<p class="helper-text">Crea prima almeno un ruolo per poter configurare i turni.</p>`;

	shiftDom.formHost.innerHTML = `
		<form id="shiftFormElement">
			<input type="hidden" name="id" value="${shift?.id || ""}">
			<div class="form-grid two-columns">
				<div class="form-field">
					<label for="shiftName">Nome turno</label>
					<input id="shiftName" name="nome" type="text" placeholder="Es. Mattina" value="${shift?.nome || ""}" required>
				</div>
				<div class="form-field">
					<label>Colore</label>
					<div class="inline-field">
						<input type="color" name="colore" value="${shift?.colore || "#000000"}" required>
						<span class="tag">${shift?.colore || "#000000"}</span>
					</div>
				</div>
				<div class="form-field">
					<label>Inizio</label>
					<input type="time" name="inizio" value="${shift?.inizio || ""}" required>
				</div>
				<div class="form-field">
					<label>Fine</label>
					<input type="time" name="fine" value="${shift?.fine || ""}" required>
				</div>
			</div>
			<div class="form-field">
				<label>Ruoli ammessi</label>
				<div class="checkbox-group">${rolesMarkup}</div>
			</div>
			<div class="form-actions">
				<button class="button" type="submit">
					<i class="fa-solid ${shift ? "fa-floppy-disk" : "fa-plus"}"></i>
					${shift ? "Aggiorna" : "Crea"} turno
				</button>
				<button class="button secondary" type="button" id="cancelShiftForm">
					<i class="fa-solid fa-times"></i>Annulla
				</button>
			</div>
		</form>
	`;

	const form = document.getElementById("shiftFormElement");
	form?.addEventListener("submit", handleShiftSubmit);
	form?.querySelector("input[type=color]")?.addEventListener("input", (event) => {
		const tag = event.target.parentElement.querySelector(".tag");
		if (tag) tag.textContent = event.target.value;
	});
	document.getElementById("cancelShiftForm")?.addEventListener("click", () => toggleShiftForm(false));
}

function handleShiftSubmit(event) {
	event.preventDefault();
	clearShiftMessage();
	const formData = new FormData(event.target);
	const db = loadShiftDb();
	if (!db.ruoli.length) {
		showShiftMessage("Crea almeno un ruolo prima di aggiungere un turno.", "warning");
		return;
	}

	const selectedRoles = formData.getAll("ruoliPossibili").map((value) => Number(value));
	if (!selectedRoles.length) {
		showShiftMessage("Seleziona almeno un ruolo per questo turno.", "warning");
		return;
	}

	const payload = {
		id: formData.get("id") ? Number(formData.get("id")) : Date.now(),
		nome: formData.get("nome").trim(),
		colore: formData.get("colore"),
		inizio: formData.get("inizio"),
		fine: formData.get("fine"),
		ruoliPossibili: selectedRoles,
	};

	const isEditing = db.turni.some((shift) => shift.id === payload.id);
	if (isEditing) {
		db.turni = db.turni.map((shift) => (shift.id === payload.id ? payload : shift));
	} else {
		db.turni.push(payload);
	}

	persistShifts(db);
	toggleShiftForm(false);
	renderShiftList();
	showShiftMessage("Turno salvato con successo.", "success");
}

function renderShiftList() {
	if (!shiftDom.listHost) return;
	const db = loadShiftDb();
	const shifts = db.turni;
	shiftDom.counter.textContent = `${shifts.length} turni`;

	if (!shifts.length) {
		shiftDom.listHost.innerHTML = "";
		if (shiftDom.emptyState) shiftDom.emptyState.style.display = "block";
		shiftDom.listHost.style.display = "none";
		return;
	}

	if (shiftDom.emptyState) shiftDom.emptyState.style.display = "none";
	shiftDom.listHost.style.display = "grid";

	const roleMap = new Map(db.ruoli.map((role) => [role.id, role]));

	shiftDom.listHost.innerHTML = shifts
		.map((shift) => {
			const rolesLabel = shift.ruoliPossibili
				.map((roleId) => roleMap.get(roleId)?.nome || `Role #${roleId}`)
				.join(", ");
			return `
				<article class="card metric-link" data-id="${shift.id}">
					<div class="card-header" style="justify-content:space-between;align-items:center;">
						<div style="display:flex;align-items:center;gap:12px;">
							<span class="shift-pill" style="--dot-color:${shift.colore};margin-right:10px;"></span>
							<div style="display:flex;flex-direction:column;">
								<span style="font-size:1.1rem;font-weight:600;color:#000;">${shift.nome}</span>
								<span class="card-description" style="color:#000;">${shift.inizio} - ${shift.fine}</span>
								<span class="muted" style="color:#000;">Ruoli: ${rolesLabel}</span>
							</div>
						</div>
						<div class="list-inline" style="gap:8px;">
							<button class="button secondary" data-action="edit"><i class="fa-solid fa-pen"></i> Modifica</button>
							<button class="button danger" data-action="delete"><i class="fa-solid fa-trash"></i></button>
						</div>
					</div>
				</article>
			`;
		})
		.join(" ");
}

function handleShiftActions(event) {
	const actionBtn = event.target.closest("button[data-action]");
	if (!actionBtn) return;
	const card = actionBtn.closest("article[data-id]");
	const shiftId = Number(card?.dataset.id);
	if (!shiftId) return;

	const db = loadShiftDb();

	if (actionBtn.dataset.action === "delete") {
		showConfirm("Eliminare il turno?").then((ok) => {
			if (!ok) return;
			db.turni = db.turni.filter((shift) => shift.id !== shiftId);
			persistShifts(db);
			renderShiftList();
			showShiftMessage("Turno eliminato.", "info");
		});
		return;
	}

	if (actionBtn.dataset.action === "edit") {
		const shift = db.turni.find((item) => item.id === shiftId);
		if (shift) {
			clearShiftMessage();
			toggleShiftForm(true, shift);
		}
	}
}

function initShifts() {
	if (!shiftDom.formHost) return;
	renderShiftList();
	shiftDom.listHost?.addEventListener("click", handleShiftActions);
	shiftDom.openButton?.addEventListener("click", () => {
		clearShiftMessage();
		toggleShiftForm(true);
		setTimeout(() => document.getElementById("shiftName")?.focus(), 50);
	});
}

document.addEventListener("DOMContentLoaded", initShifts);

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