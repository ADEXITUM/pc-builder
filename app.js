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

const PRESET_BUILDS = [
  {
    id: crypto.randomUUID(),
    name: "Ridge",
    components: buildEmptyComponents(),
  },
  {
    id: crypto.randomUUID(),
    name: "K66 Lite",
    components: {
      ...buildEmptyComponents(),
      videocard: {
        name: "RTX 5070",
        price: 52275,
        url: "https://www.wildberries.ru/catalog/677117349/detail.aspx?size=911673792",
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
    acc[component.key] = { name: "", price: 0, url: "" };
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
    return Array.isArray(parsed) && parsed.length ? parsed : PRESET_BUILDS;
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

    const filledComponents = COMPONENT_ORDER.filter((component) => build.components[component.key]?.name);
    const links = filledComponents.filter((component) => build.components[component.key]?.url);

    card.innerHTML = `
      <div class="build-card-top">
        <div>
          <h3 class="build-name">${escapeHtml(build.name || "Без названия")}</h3>
        </div>
        <div class="build-total">${formatPrice(calculateTotal(build))}</div>
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
      if (!action) {
        return;
      }

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

  return `
    <div class="spec-row">
      <div class="spec-left">${component.label}</div>
      <div class="spec-main">
        <div class="spec-name">${escapeHtml(item.name)}</div>
        ${item.url ? `<a class="link" href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">Ссылка</a>` : ""}
      </div>
      <div class="spec-price">${item.price ? formatPrice(item.price) : "—"}</div>
    </div>
  `;
}

function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(dom.buildForm);
  const payload = {
    id: state.editingId || crypto.randomUUID(),
    name: String(formData.get("name") || "").trim() || "Без названия",
    components: collectComponentsFromForm(),
  };

  const index = state.builds.findIndex((build) => build.id === payload.id);
  if (index >= 0) {
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
      price: Number(root.querySelector('[data-field="price"]').value || 0),
      url: root.querySelector('[data-field="url"]').value.trim(),
    };
    return acc;
  }, {});
}

function updateTotalPrice() {
  const total = Object.values(collectComponentsFromForm()).reduce((sum, item) => sum + Number(item.price || 0), 0);
  dom.totalPrice.textContent = formatPrice(total);
}

function fillForm(build) {
  dom.buildForm.name.value = build?.name || "";

  COMPONENT_ORDER.forEach((component) => {
    const values = build?.components?.[component.key] || { name: "", price: 0, url: "" };
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
  if (!build) {
    return;
  }

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
  if (!current) {
    return;
  }

  const copy = JSON.parse(JSON.stringify(current));
  copy.id = crypto.randomUUID();
  copy.name = `${current.name} copy`;
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
  return COMPONENT_ORDER.reduce((sum, component) => sum + Number(build.components[component.key]?.price || 0), 0);
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
