const STORAGE_KEY = "lab-cabinets-data-v1";

const fallbackData = {
  settings: { schoolName: "مدرستي", logo: "" },
  labs: [
    { id: "lab-bio", name: "مختبر أحياء" },
    { id: "lab-geo", name: "مختبر جيولوجيا" },
  ],
  users: [
    { id: "user-admin", name: "مدير النظام", username: "admin", password: "admin123", role: "admin" },
  ],
  cabinets: [],
  items: [],
};

let data = structuredClone(fallbackData);
let currentUser = null;
let jsonFileHandle = null;
let apiStorageAvailable = false;
let apiDataEndpoint = null;
let pendingLogo = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const elements = {
  publicLogo: $("#publicLogo"),
  publicSchoolName: $("#publicSchoolName"),
  storageWarning: $("#storageWarning"),
  cabinetSearchSelect: $("#cabinetSearchSelect"),
  cabinetResult: $("#cabinetResult"),
  itemSearchInput: $("#itemSearchInput"),
  itemResult: $("#itemResult"),
  loginModal: $("#loginModal"),
  loginForm: $("#loginForm"),
  adminShell: $("#adminShell"),
  adminTitle: $("#adminTitle"),
  currentUserName: $("#currentUserName"),
  sidebar: $("#sidebar"),
  sidebarBackdrop: $("#sidebarBackdrop"),
  settingsForm: $("#settingsForm"),
  schoolNameInput: $("#schoolNameInput"),
  logoInput: $("#logoInput"),
  logoPreview: $("#logoPreview"),
  usersTable: $("#usersTable"),
  userForm: $("#userForm"),
  cabinetsTable: $("#cabinetsTable"),
  cabinetForm: $("#cabinetForm"),
  cabinetLabInput: $("#cabinetLabInput"),
  itemsTable: $("#itemsTable"),
  itemForm: $("#itemForm"),
  itemCabinetInput: $("#itemCabinetInput"),
  adminItemFilter: $("#adminItemFilter"),
  jsonStatus: $("#jsonStatus"),
  statsGrid: $("#statsGrid"),
  importFileInput: $("#importFileInput"),
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message, type = "success") {
  const root = $("#toastRoot");
  const colors = {
    success: "border-leaf/30 bg-white text-ink",
    error: "border-red-200 bg-white text-red-700",
    info: "border-ocean/25 bg-white text-ocean",
  };
  const el = document.createElement("div");
  el.className = `toast rounded-md border ${colors[type]} px-4 py-3 text-sm font-bold shadow-soft`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function ensureShape(input) {
  const safe = structuredClone(fallbackData);
  return {
    settings: { ...safe.settings, ...(input.settings || {}) },
    labs: Array.isArray(input.labs) && input.labs.length ? input.labs : safe.labs,
    users: Array.isArray(input.users) && input.users.length ? input.users : safe.users,
    cabinets: Array.isArray(input.cabinets) ? input.cabinets : [],
    items: Array.isArray(input.items) ? input.items : [],
  };
}

function loadLocalData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  try {
    return ensureShape(JSON.parse(saved));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function mergeById(remoteItems, localItems) {
  const merged = new Map();
  remoteItems.forEach((item) => merged.set(item.id, item));
  localItems.forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });
  return Array.from(merged.values());
}

function mergeLocalIntoRemote(remoteData, localData) {
  if (!localData) return remoteData;

  const merged = ensureShape(remoteData);
  merged.labs = mergeById(merged.labs, localData.labs);
  merged.users = mergeById(merged.users, localData.users);
  merged.cabinets = mergeById(merged.cabinets, localData.cabinets);
  merged.items = mergeById(merged.items, localData.items);

  const localHasCustomSchool = localData.settings?.schoolName && localData.settings.schoolName !== fallbackData.settings.schoolName;
  const remoteHasCustomSchool = merged.settings?.schoolName && merged.settings.schoolName !== fallbackData.settings.schoolName;
  if (localHasCustomSchool && !remoteHasCustomSchool) {
    merged.settings.schoolName = localData.settings.schoolName;
  }
  if (localData.settings?.logo && !merged.settings.logo) {
    merged.settings.logo = localData.settings.logo;
  }

  return merged;
}

function sameData(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

async function loadData() {
  if (location.protocol.startsWith("http")) {
    const endpoints = ["./api/data.php", "./api/data"];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (response.ok) {
          const remoteData = ensureShape(await response.json());
          data = mergeLocalIntoRemote(remoteData, loadLocalData());
          apiStorageAvailable = true;
          apiDataEndpoint = endpoint;
          persistLocal();
          if (!sameData(remoteData, data)) {
            await persistAll(true);
          }
          return;
        }
      } catch {
        apiStorageAvailable = false;
      }
    }
  }

  const localData = loadLocalData();
  if (localData) {
    data = localData;
    return;
  }

  try {
    const response = await fetch("./data.json", { cache: "no-store" });
    if (response.ok) {
      data = ensureShape(await response.json());
      persistLocal();
      return;
    }
  } catch {
    data = structuredClone(fallbackData);
  }
}

function persistLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function renderStorageWarning() {
  elements.storageWarning?.classList.toggle("hidden", apiStorageAvailable);
}

async function persistAll(silent = false) {
  persistLocal();
  if (apiStorageAvailable) {
    try {
      const response = await fetch(apiDataEndpoint || "./api/data.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("API save failed");
      if (!silent) toast("تم حفظ البيانات على الخادم.");
      return;
    } catch (error) {
      console.error(error);
      apiStorageAvailable = false;
      renderStorageWarning();
      toast("تعذر الحفظ على الخادم. تم الحفظ محلياً على هذا الجهاز.", "error");
    }
  }
  if (jsonFileHandle) {
    try {
      const writable = await jsonFileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      if (elements.jsonStatus) {
        elements.jsonStatus.textContent = "تم حفظ التغييرات على ملف JSON المرتبط.";
      }
      if (!silent) toast("تم حفظ البيانات في ملف JSON.");
      return;
    } catch (error) {
      console.error(error);
      toast("لم أستطع الكتابة على ملف JSON. تم الحفظ محلياً.", "error");
    }
  }
  if (!silent) toast("تم الحفظ محلياً على هذا الجهاز فقط.");
}

function getLab(id) {
  return data.labs.find((lab) => lab.id === id) || { name: "غير محدد" };
}

function getCabinet(id) {
  return data.cabinets.find((cabinet) => cabinet.id === id) || null;
}

function itemsForCabinet(cabinetId) {
  return data.items.filter((item) => item.cabinetId === cabinetId);
}

function logoMarkup(size = "h-7 w-7") {
  if (data.settings.logo) {
    return `<img src="${data.settings.logo}" alt="شعار المدرسة" class="h-full w-full object-cover" />`;
  }
  return `<i data-lucide="flask-conical" class="${size}"></i>`;
}

function renderBrand() {
  elements.publicSchoolName.textContent = data.settings.schoolName || "مدرستي";
  elements.publicLogo.innerHTML = logoMarkup("h-7 w-7");
  elements.logoPreview.innerHTML = logoMarkup("h-10 w-10");
  elements.schoolNameInput.value = data.settings.schoolName || "";
  refreshIcons();
}

function renderPublicSearch() {
  elements.cabinetSearchSelect.innerHTML = [
    `<option value="">اختر خزنة</option>`,
    ...data.cabinets.map((cabinet) => `<option value="${cabinet.id}">${escapeHtml(cabinet.name)} - ${escapeHtml(getLab(cabinet.labId).name)}</option>`),
  ].join("");
  renderCabinetResult();
  renderItemSearch();
}

function emptyState(text) {
  return `<div class="empty-state p-5 text-center text-sm font-bold text-slate-500">${escapeHtml(text)}</div>`;
}

function renderCabinetResult() {
  const cabinetId = elements.cabinetSearchSelect.value;
  if (!cabinetId) {
    elements.cabinetResult.innerHTML = emptyState("اختر خزنة لعرض محتوياتها.");
    return;
  }
  const cabinet = getCabinet(cabinetId);
  const items = itemsForCabinet(cabinetId);
  if (!cabinet) {
    elements.cabinetResult.innerHTML = emptyState("الخزنة غير موجودة.");
    return;
  }
  const rows = items.length
    ? items.map((item) => `
        <tr>
          <td data-label="المحتوى" class="font-bold">${escapeHtml(item.name)}</td>
          <td data-label="التصنيف">${escapeHtml(item.category || "-")}</td>
          <td data-label="الكمية">${escapeHtml(item.quantity ?? 0)} ${escapeHtml(item.unit || "")}</td>
          <td data-label="ملاحظات">${escapeHtml(item.notes || "-")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="4" class="empty-cell text-center text-slate-500">لا توجد محتويات مسجلة لهذه الخزنة.</td></tr>`;
  elements.cabinetResult.innerHTML = `
    <div class="cabinet-summary border-b border-slate-200 bg-slate-50 p-4">
      <h3 class="font-extrabold">${escapeHtml(cabinet.name)}</h3>
      <p class="mt-1 text-sm text-slate-600">${escapeHtml(getLab(cabinet.labId).name)} - ${escapeHtml(cabinet.location || "بدون موقع")}</p>
    </div>
    <div class="table-wrap rounded-none border-0">
      <table>
        <thead><tr><th>المحتوى</th><th>التصنيف</th><th>الكمية</th><th>ملاحظات</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderItemSearch() {
  const q = normalize(elements.itemSearchInput.value);
  if (!q) {
    elements.itemResult.innerHTML = emptyState("اكتب كلمة بحث لإظهار الخزنة المرتبطة بالمحتوى.");
    return;
  }
  const matches = data.items.filter((item) => {
    const haystack = normalize([item.name, item.category, item.notes, item.unit].join(" "));
    return haystack.includes(q);
  });
  if (!matches.length) {
    elements.itemResult.innerHTML = emptyState("لا توجد نتائج مطابقة.");
    return;
  }
  elements.itemResult.innerHTML = matches.map((item) => {
    const cabinet = getCabinet(item.cabinetId);
    return `
      <article class="result-card rounded-md border border-slate-200 bg-white p-4 transition hover:border-leaf">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-extrabold">${escapeHtml(item.name)}</h3>
            <p class="mt-1 text-sm text-slate-600">${escapeHtml(item.quantity ?? 0)} ${escapeHtml(item.unit || "")} - ${escapeHtml(item.category || "بدون تصنيف")}</p>
          </div>
          <span class="rounded-md bg-leaf/10 px-3 py-1 text-sm font-extrabold text-leaf">${escapeHtml(cabinet?.name || "خزنة محذوفة")}</span>
        </div>
        <p class="mt-3 text-sm leading-7 text-slate-600">${escapeHtml(cabinet ? `${getLab(cabinet.labId).name} - ${cabinet.location || "بدون موقع"}` : "لا توجد خزنة مرتبطة")}</p>
      </article>
    `;
  }).join("");
}

function renderSelects() {
  elements.cabinetLabInput.innerHTML = data.labs.map((lab) => `<option value="${lab.id}">${escapeHtml(lab.name)}</option>`).join("");
  elements.itemCabinetInput.innerHTML = data.cabinets.length
    ? data.cabinets.map((cabinet) => `<option value="${cabinet.id}">${escapeHtml(cabinet.name)} - ${escapeHtml(getLab(cabinet.labId).name)}</option>`).join("")
    : `<option value="">أضف خزنة أولاً</option>`;
}

function actionButton(action, id, icon, label, tone = "slate") {
  const color = tone === "red" ? "hover:border-red-300 hover:text-red-700" : "hover:border-ocean hover:text-ocean";
  return `<button class="action-btn inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold ${color}" data-action="${action}" data-id="${id}" type="button"><i data-lucide="${icon}" class="h-4 w-4"></i>${label}</button>`;
}

function renderUsers() {
  const rows = data.users.map((user) => `
    <tr>
      <td data-label="الاسم" class="font-bold">${escapeHtml(user.name)}</td>
      <td data-label="اسم المستخدم">${escapeHtml(user.username)}</td>
      <td data-label="الصلاحية">${user.role === "admin" ? "أدمن" : "محرر"}</td>
      <td data-label="إجراءات" class="action-cell flex flex-wrap gap-2">
        ${actionButton("edit-user", user.id, "pencil", "تعديل")}
        ${actionButton("delete-user", user.id, "trash-2", "حذف", "red")}
      </td>
    </tr>
  `).join("");
  elements.usersTable.innerHTML = `<table><thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>الصلاحية</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCabinets() {
  const rows = data.cabinets.map((cabinet) => `
    <tr>
      <td data-label="الخزنة" class="font-bold">${escapeHtml(cabinet.name)}</td>
      <td data-label="المختبر">${escapeHtml(getLab(cabinet.labId).name)}</td>
      <td data-label="الموقع">${escapeHtml(cabinet.location || "-")}</td>
      <td data-label="عدد المحتويات">${itemsForCabinet(cabinet.id).length}</td>
      <td data-label="إجراءات" class="action-cell flex flex-wrap gap-2">
        ${actionButton("edit-cabinet", cabinet.id, "pencil", "تعديل")}
        ${actionButton("delete-cabinet", cabinet.id, "trash-2", "حذف", "red")}
      </td>
    </tr>
  `).join("");
  elements.cabinetsTable.innerHTML = `<table><thead><tr><th>الخزنة</th><th>المختبر</th><th>الموقع</th><th>عدد المحتويات</th><th>إجراءات</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="empty-cell text-center text-slate-500">لا توجد خزانات بعد.</td></tr>`}</tbody></table>`;
}

function renderItems() {
  const filter = normalize(elements.adminItemFilter.value);
  const filtered = data.items.filter((item) => normalize([item.name, item.category, item.notes, getCabinet(item.cabinetId)?.name].join(" ")).includes(filter));
  const rows = filtered.map((item) => {
    const cabinet = getCabinet(item.cabinetId);
    return `
      <tr>
        <td data-label="المحتوى" class="font-bold">${escapeHtml(item.name)}</td>
        <td data-label="الخزنة">${escapeHtml(cabinet?.name || "خزنة محذوفة")}</td>
        <td data-label="الكمية">${escapeHtml(item.quantity ?? 0)} ${escapeHtml(item.unit || "")}</td>
        <td data-label="التصنيف">${escapeHtml(item.category || "-")}</td>
        <td data-label="إجراءات" class="action-cell flex flex-wrap gap-2">
          ${actionButton("edit-item", item.id, "pencil", "تعديل")}
          ${actionButton("delete-item", item.id, "trash-2", "حذف", "red")}
        </td>
      </tr>
    `;
  }).join("");
  elements.itemsTable.innerHTML = `<table><thead><tr><th>المحتوى</th><th>الخزنة</th><th>الكمية</th><th>التصنيف</th><th>إجراءات</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="empty-cell text-center text-slate-500">لا توجد محتويات مطابقة.</td></tr>`}</tbody></table>`;
}

function renderStats() {
  const stats = [
    ["الخزانات", data.cabinets.length, "archive"],
    ["المحتويات", data.items.length, "boxes"],
    ["المستخدمون", data.users.length, "users"],
    ["المختبرات", data.labs.length, "flask-conical"],
  ];
  elements.statsGrid.innerHTML = stats.map(([label, value, icon]) => `
    <div class="stat-card rounded-md border border-slate-200 bg-mist p-4">
      <i data-lucide="${icon}" class="mb-3 h-6 w-6 text-ocean"></i>
      <p class="text-sm font-bold text-slate-500">${label}</p>
      <strong class="text-3xl font-extrabold">${value}</strong>
    </div>
  `).join("");
}

function renderAdmin() {
  renderBrand();
  renderSelects();
  renderUsers();
  renderCabinets();
  renderItems();
  renderStats();
  renderPublicSearch();
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function openModal(id) {
  $(`#${id}`).classList.add("active");
  refreshIcons();
}

function closeModal(id) {
  $(`#${id}`).classList.remove("active");
}

function openAdmin() {
  elements.adminShell.classList.remove("hidden");
  elements.currentUserName.textContent = currentUser?.name || "الأدمن";
  renderAdmin();
}

function closeAdmin() {
  elements.adminShell.classList.add("hidden");
  currentUser = null;
}

function setView(viewId) {
  $$(".admin-view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $$(".sidebar-link").forEach((link) => {
    const active = link.dataset.view === viewId;
    link.classList.toggle("active", active);
    if (active) elements.adminTitle.textContent = link.textContent.trim();
  });
  closeSidebar();
  refreshIcons();
}

function openSidebar() {
  elements.sidebar.classList.remove("translate-x-full");
  elements.sidebarBackdrop.classList.remove("hidden");
}

function closeSidebar() {
  elements.sidebar.classList.add("translate-x-full");
  elements.sidebarBackdrop.classList.add("hidden");
}

function resetUserForm() {
  elements.userForm.reset();
  $("#userIdInput").value = "";
  $("#roleInput").value = "admin";
}

function resetCabinetForm() {
  elements.cabinetForm.reset();
  $("#cabinetIdInput").value = "";
  elements.cabinetLabInput.value = data.labs[0]?.id || "";
}

function resetItemForm() {
  elements.itemForm.reset();
  $("#itemIdInput").value = "";
  $("#quantityInput").value = 1;
  $("#unitInput").value = "قطعة";
}

function revealEditForm(form, focusSelector, message) {
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  const field = focusSelector ? $(focusSelector) : null;
  window.setTimeout(() => field?.focus({ preventScroll: true }), 250);
  toast(message, "info");
}

function loadUserForEdit(user) {
  $("#userIdInput").value = user.id;
  $("#userNameInput").value = user.name;
  $("#usernameInput").value = user.username;
  $("#passwordInput").value = user.password;
  $("#roleInput").value = user.role;
  revealEditForm(elements.userForm, "#userNameInput", "تم تحميل بيانات المستخدم للتعديل.");
}

function loadCabinetForEdit(cabinet) {
  $("#cabinetIdInput").value = cabinet.id;
  $("#cabinetNameInput").value = cabinet.name;
  $("#cabinetLabInput").value = cabinet.labId;
  $("#cabinetLocationInput").value = cabinet.location || "";
  $("#cabinetNotesInput").value = cabinet.notes || "";
  revealEditForm(elements.cabinetForm, "#cabinetNameInput", "تم تحميل بيانات الخزنة للتعديل.");
}

function loadItemForEdit(item) {
  $("#itemIdInput").value = item.id;
  $("#itemNameInput").value = item.name;
  $("#itemCabinetInput").value = item.cabinetId;
  $("#quantityInput").value = item.quantity ?? 0;
  $("#unitInput").value = item.unit || "";
  $("#categoryInput").value = item.category || "";
  $("#itemNotesInput").value = item.notes || "";
  revealEditForm(elements.itemForm, "#itemNameInput", "تم تحميل بيانات المحتوى للتعديل.");
}

function exportJson() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "data.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importJsonFile(file) {
  try {
    const text = await file.text();
    data = ensureShape(JSON.parse(text));
    await persistAll(true);
    renderAdmin();
    toast("تم استيراد ملف JSON بنجاح.");
  } catch (error) {
    console.error(error);
    toast("ملف JSON غير صالح.", "error");
  }
}

async function openJsonFile() {
  if (!window.showOpenFilePicker) {
    toast("المتصفح لا يدعم الربط المباشر. استخدم الاستيراد والتصدير.", "error");
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      multiple: false,
    });
    jsonFileHandle = handle;
    const file = await handle.getFile();
    await importJsonFile(file);
    if (elements.jsonStatus) {
      elements.jsonStatus.textContent = `تم ربط الملف: ${file.name}`;
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error(error);
      toast("تعذر ربط ملف JSON.", "error");
    }
  }
}

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bindEvents() {
  $("#adminOpenBtn").addEventListener("click", () => openModal("loginModal"));
  $$(".close-modal").forEach((btn) => btn.addEventListener("click", () => closeModal(btn.dataset.target)));
  elements.loginModal.addEventListener("click", (event) => {
    if (event.target === elements.loginModal) closeModal("loginModal");
  });

  elements.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = $("#loginUsername").value.trim();
    const password = $("#loginPassword").value;
    const user = data.users.find((entry) => entry.username === username && entry.password === password);
    if (!user) {
      toast("بيانات الدخول غير صحيحة.", "error");
      return;
    }
    currentUser = user;
    elements.loginForm.reset();
    closeModal("loginModal");
    openAdmin();
  });

  $("#adminCloseBtn").addEventListener("click", closeAdmin);
  $("#sidebarOpenBtn").addEventListener("click", openSidebar);
  $("#sidebarCloseBtn").addEventListener("click", closeSidebar);
  elements.sidebarBackdrop.addEventListener("click", closeSidebar);
  $$(".sidebar-link").forEach((link) => link.addEventListener("click", () => setView(link.dataset.view)));

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !button.dataset.action.startsWith("edit-")) return;
    event.preventDefault();
    event.stopPropagation();

    if (button.dataset.action === "edit-user") {
      const user = data.users.find((entry) => entry.id === button.dataset.id);
      if (user) loadUserForEdit(user);
    }

    if (button.dataset.action === "edit-cabinet") {
      const cabinet = getCabinet(button.dataset.id);
      if (cabinet) loadCabinetForEdit(cabinet);
    }

    if (button.dataset.action === "edit-item") {
      const item = data.items.find((entry) => entry.id === button.dataset.id);
      if (item) loadItemForEdit(item);
    }
  }, true);

  elements.cabinetSearchSelect.addEventListener("change", renderCabinetResult);
  elements.itemSearchInput.addEventListener("input", renderItemSearch);
  elements.adminItemFilter.addEventListener("input", renderItems);

  elements.logoInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    pendingLogo = await readLogoFile(file);
    elements.logoPreview.innerHTML = `<img src="${pendingLogo}" alt="معاينة الشعار" class="h-full w-full object-cover" />`;
  });

  $("#removeLogoBtn").addEventListener("click", async () => {
    pendingLogo = "";
    data.settings.logo = "";
    await persistAll(true);
    renderAdmin();
    toast("تم حذف الشعار.");
  });

  elements.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    data.settings.schoolName = elements.schoolNameInput.value.trim() || "مدرستي";
    if (pendingLogo !== null) {
      data.settings.logo = pendingLogo;
      pendingLogo = null;
    }
    await persistAll();
    renderAdmin();
  });

  elements.userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("#userIdInput").value || uid("user");
    const username = $("#usernameInput").value.trim();
    const duplicate = data.users.some((user) => user.username === username && user.id !== id);
    if (duplicate) {
      toast("اسم المستخدم موجود مسبقاً.", "error");
      return;
    }
    const payload = {
      id,
      name: $("#userNameInput").value.trim(),
      username,
      password: $("#passwordInput").value,
      role: $("#roleInput").value,
    };
    const index = data.users.findIndex((user) => user.id === id);
    if (index >= 0) data.users[index] = payload;
    else data.users.push(payload);
    await persistAll();
    resetUserForm();
    renderAdmin();
  });

  $("#resetUserFormBtn").addEventListener("click", resetUserForm);
  elements.usersTable.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const user = data.users.find((entry) => entry.id === button.dataset.id);
    if (!user) return;
    if (button.dataset.action === "edit-user") {
      loadUserForEdit(user);
    }
    if (button.dataset.action === "delete-user") {
      if (data.users.length === 1) {
        toast("لا يمكن حذف آخر مستخدم.", "error");
        return;
      }
      if (confirm(`حذف المستخدم "${user.name}"؟`)) {
        data.users = data.users.filter((entry) => entry.id !== user.id);
        await persistAll();
        renderAdmin();
      }
    }
  });

  elements.cabinetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("#cabinetIdInput").value || uid("cab");
    const payload = {
      id,
      name: $("#cabinetNameInput").value.trim(),
      labId: $("#cabinetLabInput").value,
      location: $("#cabinetLocationInput").value.trim(),
      notes: $("#cabinetNotesInput").value.trim(),
    };
    const index = data.cabinets.findIndex((cabinet) => cabinet.id === id);
    if (index >= 0) data.cabinets[index] = payload;
    else data.cabinets.push(payload);
    await persistAll();
    resetCabinetForm();
    renderAdmin();
  });

  $("#resetCabinetFormBtn").addEventListener("click", resetCabinetForm);
  elements.cabinetsTable.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const cabinet = getCabinet(button.dataset.id);
    if (!cabinet) return;
    if (button.dataset.action === "edit-cabinet") {
      loadCabinetForEdit(cabinet);
    }
    if (button.dataset.action === "delete-cabinet" && confirm(`حذف الخزنة "${cabinet.name}" وكل محتوياتها؟`)) {
      data.cabinets = data.cabinets.filter((entry) => entry.id !== cabinet.id);
      data.items = data.items.filter((item) => item.cabinetId !== cabinet.id);
      await persistAll();
      renderAdmin();
    }
  });

  elements.itemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!$("#itemCabinetInput").value) {
      toast("أضف خزنة قبل إضافة المحتوى.", "error");
      return;
    }
    const id = $("#itemIdInput").value || uid("item");
    const payload = {
      id,
      cabinetId: $("#itemCabinetInput").value,
      name: $("#itemNameInput").value.trim(),
      quantity: Number($("#quantityInput").value || 0),
      unit: $("#unitInput").value.trim() || "قطعة",
      category: $("#categoryInput").value.trim(),
      notes: $("#itemNotesInput").value.trim(),
    };
    const index = data.items.findIndex((item) => item.id === id);
    if (index >= 0) data.items[index] = payload;
    else data.items.push(payload);
    await persistAll();
    resetItemForm();
    renderAdmin();
  });

  $("#resetItemFormBtn").addEventListener("click", resetItemForm);
  elements.itemsTable.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = data.items.find((entry) => entry.id === button.dataset.id);
    if (!item) return;
    if (button.dataset.action === "edit-item") {
      loadItemForEdit(item);
    }
    if (button.dataset.action === "delete-item" && confirm(`حذف المحتوى "${item.name}"؟`)) {
      data.items = data.items.filter((entry) => entry.id !== item.id);
      await persistAll();
      renderAdmin();
    }
  });

  $("#saveJsonBtn")?.addEventListener("click", () => persistAll());
  $("#openJsonBtn")?.addEventListener("click", openJsonFile);
  $("#exportJsonBtn")?.addEventListener("click", exportJson);
  $("#importJsonBtn")?.addEventListener("click", () => elements.importFileInput?.click());
  elements.importFileInput?.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importJsonFile(file);
    event.target.value = "";
  });
}

async function init() {
  await loadData();
  renderStorageWarning();
  bindEvents();
  renderAdmin();
  resetUserForm();
  resetCabinetForm();
  resetItemForm();
  refreshIcons();
}

init();
