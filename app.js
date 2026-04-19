const STORAGE_KEY = "pc-build-planner-v3";

const COMPONENT_ORDER = [
    { key: "case", label: "Case" },
    { key: "videocard", label: "Videocard" },
    { key: "cpu", label: "CPU" },
    { key: "ram", label: "RAM" },
    { key: "ssd", label: "SSD" },
    { key: "motherboard", label: "Motherboard" },
    { key: "cooling", label: "Cooling" },
    { key: "powerSupply", label: "Power Supply" },
];

function uuidv4() {
    try {
        if (
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
        ) {
            return crypto.randomUUID();
        }
        if (
            typeof crypto !== "undefined" &&
            typeof crypto.getRandomValues === "function"
        ) {
            const bytes = crypto.getRandomValues(new Uint8Array(16));
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const hex = Array.from(bytes, (b) =>
                b.toString(16).padStart(2, "0"),
            ).join("");
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        }
    } catch (e) {
        // fall through to Math.random fallback
    }

    // Basic Math.random fallback (not cryptographically strong)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        },
    );
}

const PRESET_BUILDS = [
    {
        id: uuidv4(),
        name: "Ridge",
        components: buildEmptyComponents(),
    },
    {
        id: uuidv4(),
        name: "K66 Lite",
        components: {
            ...buildEmptyComponents(),
            videocard: {
                name: "RTX 5070",
                price: 52275,
                url: "https://www.wildberries.ru/catalog/677117349/detail.aspx?size=911673792",
                purchased: false,
            },
        },
    },
];

const state = {
    builds: loadBuilds(),
    editingId: null,
};

const dom = {
    buildForm: document.querySelector("#buildForm"),
    buildList: document.querySelector("#buildList"),
    componentGrid: document.querySelector("#componentGrid"),
    totalPrice: document.querySelector("#totalPrice"),
    newBuildButton: document.querySelector("#newBuildButton"),
    modalOverlay: document.querySelector("#modalOverlay"),
    closeModalButton: document.querySelector("#closeModalButton"),
    cancelModalButton: document.querySelector("#cancelModalButton"),
    modalTitle: document.querySelector("#modalTitle"),
    componentEditorTemplate: document.querySelector("#componentEditorTemplate"),
};

init();

function init() {
    renderComponentInputs();
    bindEvents();
    renderBuildList();
}

function bindEvents() {
    dom.buildForm.addEventListener("submit", handleSubmit);
    dom.buildForm.addEventListener("input", updateTotalPrice);
    dom.newBuildButton.addEventListener("click", openCreateModal);
    dom.closeModalButton.addEventListener("click", closeModal);
    dom.cancelModalButton.addEventListener("click", closeModal);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !dom.modalOverlay.hidden) {
            closeModal();
        }
    });
    dom.modalOverlay.addEventListener("click", (event) => {
        if (event.target === dom.modalOverlay) {
            closeModal();
        }
    });
}

function buildEmptyComponents() {
    return COMPONENT_ORDER.reduce((acc, component) => {
        acc[component.key] = { name: "", price: 0, url: "", purchased: false };
        return acc;
    }, {});
}

function loadBuilds() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(PRESET_BUILDS));
            return PRESET_BUILDS;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.length) return PRESET_BUILDS;

        // migrate: add purchased:false if missing
        parsed.forEach((build) => {
            COMPONENT_ORDER.forEach(({ key }) => {
                if (
                    build.components[key] &&
                    build.components[key].purchased === undefined
                ) {
                    build.components[key].purchased = false;
                }
            });
        });

        return parsed;
    } catch {
        return PRESET_BUILDS;
    }
}

function persistBuilds() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.builds));
}

function renderComponentInputs() {
    dom.componentGrid.innerHTML = "";

    COMPONENT_ORDER.forEach((component) => {
        const fragment = dom.componentEditorTemplate.content.cloneNode(true);
        const card = fragment.querySelector(".component-editor");
        card.dataset.component = component.key;
        fragment.querySelector("h3").textContent = component.label;
        dom.componentGrid.appendChild(fragment);
    });
}

function renderBuildList() {
    if (!state.builds.length) {
        dom.buildList.innerHTML = '<div class="empty-state">Пока пусто.</div>';
        return;
    }

    dom.buildList.innerHTML = "";

    state.builds.forEach((build) => {
        const card = document.createElement("article");
        card.className = `build-card ${build.id === state.editingId ? "is-active" : ""}`;

        const filledComponents = COMPONENT_ORDER.filter(
            (component) => build.components[component.key]?.name,
        );
        const links = filledComponents.filter(
            (component) => build.components[component.key]?.url,
        );

        const total = calculateTotal(build);
        const remaining = calculateRemaining(build);
        const allPurchased = remaining === 0 && filledComponents.length > 0;

        card.innerHTML = `
      <div class="build-card-top">
        <div>
          <h3 class="build-name">${escapeHtml(build.name || "Без названия")}</h3>
        </div>
        <div class="build-totals">
          <div class="build-total">${formatPrice(total)}</div>
          ${
              remaining < total
                  ? `<div class="build-remaining ${allPurchased ? "all-purchased" : ""}">
            ${allPurchased ? "✓ Всё куплено" : `Осталось: ${formatPrice(remaining)}`}
          </div>`
                  : ""
          }
        </div>
      </div>
      <div class="spec-list">
        ${COMPONENT_ORDER.map((component) => renderSpecRow(component, build)).join("")}
      </div>
      <div class="build-card-footer">
        <div class="muted">${filledComponents.length} / ${COMPONENT_ORDER.length}</div>
        <div class="card-actions">
          ${links.length ? `<a class="link" href="${escapeAttribute(build.components[links[0].key].url)}" target="_blank" rel="noreferrer">Открыть ссылку</a>` : ""}
          <button class="button button-ghost" type="button" data-action="duplicate">Дубль</button>
          <button class="button button-ghost" type="button" data-action="edit">Редактировать</button>
          <button class="button button-ghost" type="button" data-action="delete">Удалить</button>
        </div>
      </div>
    `;

        card.addEventListener("click", (event) => {
            const action = event.target.dataset.action;
            if (action === "edit") {
                openEditModal(build.id);
                return;
            }
            if (action === "duplicate") {
                duplicateBuild(build.id);
                return;
            }
            if (action === "delete") {
                deleteBuild(build.id);
                return;
            }

            const checkbox = event.target.closest(".purchased-checkbox");
            if (checkbox) {
                const key = checkbox.dataset.component;
                build.components[key].purchased = checkbox.checked;
                persistBuilds();
                renderBuildList();
            }
        });

        dom.buildList.appendChild(card);
    });
}

function renderSpecRow(component, build) {
    const item = build.components[component.key];
    if (!item?.name) {
        return `
      <div class="spec-row">
        <div class="spec-left">${component.label}</div>
        <div class="spec-main muted">—</div>
        <div class="spec-price muted">—</div>
      </div>
    `;
    }

    const purchased = item.purchased === true;
    return `
    <div class="spec-row ${purchased ? "is-purchased" : ""}">
      <div class="spec-left">${component.label}</div>
      <div class="spec-main">
        <div class="spec-name">${escapeHtml(item.name)}</div>
        ${item.url ? `<a class="link" href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">Ссылка</a>` : ""}
      </div>
      <div class="spec-price-col">
        <div class="spec-price ${purchased ? "purchased-price" : ""}">${item.price ? formatPrice(item.price) : "—"}</div>
        <label class="purchased-label" title="${purchased ? "Куплено" : "Отметить как купленное"}">
          <input class="purchased-checkbox" type="checkbox" data-component="${component.key}" ${purchased ? "checked" : ""}>
          <span class="purchased-tick"></span>
        </label>
      </div>
    </div>
  `;
}

function handleSubmit(event) {
    event.preventDefault();

    const formData = new FormData(dom.buildForm);
    const payload = {
        id: state.editingId || uuidv4(),
        name: String(formData.get("name") || "").trim() || "Без названия",
        components: collectComponentsFromForm(),
    };

    const index = state.builds.findIndex((build) => build.id === payload.id);
    if (index >= 0) {
        // preserve purchased state when editing
        COMPONENT_ORDER.forEach(({ key }) => {
            const existing = state.builds[index].components[key];
            if (existing) {
                payload.components[key].purchased = existing.purchased ?? false;
            }
        });
        state.builds[index] = payload;
    } else {
        state.builds.unshift(payload);
    }

    state.editingId = payload.id;
    persistBuilds();
    closeModal();
    renderBuildList();
}

function collectComponentsFromForm() {
    return COMPONENT_ORDER.reduce((acc, component) => {
        const root = getComponentNode(component.key);
        acc[component.key] = {
            name: root.querySelector('[data-field="name"]').value.trim(),
            price: Number(
                root.querySelector('[data-field="price"]').value || 0,
            ),
            url: root.querySelector('[data-field="url"]').value.trim(),
            purchased: false,
        };
        return acc;
    }, {});
}

function updateTotalPrice() {
    const total = Object.values(collectComponentsFromForm()).reduce(
        (sum, item) => sum + Number(item.price || 0),
        0,
    );
    dom.totalPrice.textContent = formatPrice(total);
}

function fillForm(build) {
    dom.buildForm.name.value = build?.name || "";

    COMPONENT_ORDER.forEach((component) => {
        const values = build?.components?.[component.key] || {
            name: "",
            price: 0,
            url: "",
            purchased: false,
        };
        const root = getComponentNode(component.key);
        root.querySelector('[data-field="name"]').value = values.name || "";
        root.querySelector('[data-field="price"]').value = values.price || "";
        root.querySelector('[data-field="url"]').value = values.url || "";
    });

    updateTotalPrice();
}

function resetForm() {
    dom.buildForm.reset();

    COMPONENT_ORDER.forEach((component) => {
        const root = getComponentNode(component.key);
        root.querySelector('[data-field="name"]').value = "";
        root.querySelector('[data-field="price"]').value = "";
        root.querySelector('[data-field="url"]').value = "";
    });

    updateTotalPrice();
}

function openCreateModal() {
    state.editingId = null;
    dom.modalTitle.textContent = "Новая сборка";
    resetForm();
    dom.modalOverlay.hidden = false;
}

function openEditModal(id) {
    const build = getBuildById(id);
    if (!build) return;

    state.editingId = id;
    dom.modalTitle.textContent = "Редактировать сборку";
    fillForm(build);
    dom.modalOverlay.hidden = false;
}

function closeModal() {
    dom.modalOverlay.hidden = true;
    dom.buildForm.reset();
}

function duplicateBuild(id) {
    const current = getBuildById(id);
    if (!current) return;

    const copy = JSON.parse(JSON.stringify(current));
    copy.id = uuidv4();
    copy.name = `${current.name} copy`;
    // reset purchased on duplicate
    COMPONENT_ORDER.forEach(({ key }) => {
        if (copy.components[key]) copy.components[key].purchased = false;
    });
    state.builds.unshift(copy);
    persistBuilds();
    renderBuildList();
}

function deleteBuild(id) {
    state.builds = state.builds.filter((build) => build.id !== id);
    if (state.editingId === id) {
        state.editingId = null;
        closeModal();
    }
    persistBuilds();
    renderBuildList();
}

function getBuildById(id) {
    return state.builds.find((build) => build.id === id) || null;
}

function getComponentNode(key) {
    return dom.componentGrid.querySelector(`[data-component="${key}"]`);
}

function calculateTotal(build) {
    return COMPONENT_ORDER.reduce(
        (sum, component) =>
            sum + Number(build.components[component.key]?.price || 0),
        0,
    );
}

function calculateRemaining(build) {
    return COMPONENT_ORDER.reduce((sum, component) => {
        const item = build.components[component.key];
        if (!item?.name || item.purchased) return sum;
        return sum + Number(item.price || 0);
    }, 0);
}

function formatPrice(value) {
    return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: 0,
    }).format(value || 0);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
