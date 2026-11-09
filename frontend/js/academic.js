// Admin: Academic Management - Courses and Year Levels (api/academic.php).
(function () {
  const body = document.getElementById("academicBody");
  const head = document.getElementById("academicHead");
  const search = document.getElementById("academicSearch");
  const addButton = document.getElementById("academicAddBtn");
  let data = { levels: [], courses: [], year_levels: [] };
  let tab = "courses";

  // What each tab shows: its title, the type name used by the API, and the columns (header + how to show the cell).
  const TABS = {
    courses: { type: "course", add: "Add Course", one: "course", columns: [["Course", i => `<strong>${escapeHtml(i.name)}</strong>`], ["Level", i => escapeHtml(i.level)], ["Year levels", i => i.children], ["Students", i => i.students]] },
    year_levels: { type: "year_level", add: "Add Year Level", one: "year level", columns: [["Year level", i => `<strong>${escapeHtml(i.name)}</strong>`], ["Number", i => i.year], ["Course", i => `${escapeHtml(i.course)} <small>(${escapeHtml(i.level)})</small>`], ["Students", i => i.students]] }
  };

  async function load() {
    try {
      data = await Api.get("academic.php");
      render();
    } catch (error) {
      body.innerHTML = `<tr><td colspan="6" class="requests-empty">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  function render() {
    const def = TABS[tab];
    const text = search.value.trim().toLowerCase();
    const items = data[tab].filter(i => text === "" || [i.name, i.level, i.course, i.year].join(" ").toLowerCase().includes(text));
    const addText = tab === "courses"
      ? "Add College Course"
      : def.add;
    document.getElementById("academicAddText").textContent = addText;
    const columns = def.columns;
    head.innerHTML = "<tr>" + columns.map(c => `<th>${c[0]}</th>`).join("") + "<th>Actions</th></tr>";
    body.innerHTML = items.length ? items.map(i => `
      <tr>${columns.map(c => `<td>${c[1](i)}</td>`).join("")}
        <td class="row-actions wrap">
          <button class="request-table-action" type="button" data-edit="${i.id}">Edit</button>
          <button class="request-table-action danger" type="button" data-remove="${i.id}">Remove</button></td></tr>`).join("")
      : `<tr><td colspan="${def.columns.length + 1}" class="requests-empty">${data[tab].length ? "Nothing matches your search." : "Nothing here yet. Use the Add button."}</td></tr>`;
  }

  // ---------- Add / Edit ----------
  const options = (list, valueOf, textOf) => list.map(i => `<option value="${valueOf(i)}">${escapeHtml(textOf(i))}</option>`).join("");

  function formWindow(item) {
    const def = TABS[tab];
    const editing = !!item;
    const courseKind = "course";
    const itemLabel = tab === "courses" ? courseKind : def.one;
    const formTitle = tab === "courses"
      ? `${editing ? "Edit" : "Add"} College Course`
      : `${editing ? "Edit " + def.one : def.add}`;
    let fields = "";
    if (!editing && tab === "year_levels") {
      fields = `<label>Course<select class="request-text-input" name="parent_id" required><option value="">Select course</option>${options(data.courses.filter(c => c.is_active), c => c.id, c => `${c.name} (${c.level})`)}</select></label>
                <label>Year number<input class="request-text-input" name="year_number" type="number" min="1" max="6" step="1" required placeholder="1 for First Year, 2 for Second Year"></label>`;
    }
    const nameLabel = tab === "year_levels" ? "Year level name (for example Second Year)" : `Name of the ${itemLabel}`;
    const modal = Portal.openModal(`
      <h2>${formTitle}</h2>
      ${editing && item.students > 0 ? `<p class="notice notice-warning">${item.students} student(s) use this ${itemLabel}. Their records are renamed too.</p>` : ""}
      <form class="student-form" novalidate>
        ${fields}
        <label>${nameLabel}<input class="request-text-input" name="name" value="${escapeHtml(item ? item.name : "")}" required maxlength="80"></label>
        <p class="form-message error" role="alert"></p>
        <div class="detail-buttons"><button class="request-next-btn" type="submit">${editing ? "Save changes" : "Add"}</button>
          <button class="request-back-btn" type="button" data-close-modal>Cancel</button></div>
      </form>`);
    const form = modal.querySelector("form");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const message = form.querySelector(".form-message");
      message.textContent = "";
      const values = Object.fromEntries(new FormData(form));
      if (!values.name.trim() || (form.elements.parent_id && !values.parent_id) || (form.elements.year_number && !values.year_number)) { message.textContent = "Please complete all the fields."; return; }
      const collegeLevel = data.levels.find(level => level.name === "COLLEGE" && level.is_active);
      if (!editing && tab === "courses" && !collegeLevel) { message.textContent = "The College level is unavailable."; return; }
      const parentId = !editing && tab === "courses" ? Number(collegeLevel.id) : Number(values.parent_id || 0);
      const body = { type: def.type, name: values.name, id: editing ? item.id : 0, parent_id: parentId, year_number: values.year_number };
      await Portal.busy(form.querySelector("button[type=submit]"), "Saving...", async () => {
        try {
          await Api.postJson("academic.php", body, { action: "save" });
          Portal.closeModal();
          Portal.toast(editing ? "Saved." : `${itemLabel[0].toUpperCase() + itemLabel.slice(1)} added.`, "success");
          window.clearStructureCache?.();             // the Add Student form and the filters read the new lists
          load();
        } catch (error) { message.textContent = error.message; }
      });
    });
  }

  // ---------- Remove (with a question first) ----------
  function confirmRemoveItem(item, used, usedText) {
    const dialog = document.createElement("dialog");
    dialog.className = "request-cancel-confirm-dialog";
    dialog.setAttribute("aria-labelledby", "removeAcademicItemTitle");
    dialog.innerHTML = `
      <div class="logout-confirm-icon" aria-hidden="true"><span class="material-symbol">warning</span></div>
      <h2 id="removeAcademicItemTitle">Remove ${escapeHtml(item.name)}?</h2>
      <p>${used
        ? escapeHtml(usedText)
        : "Nothing uses this item, so it will be deleted permanently."}</p>
      <div class="logout-confirm-actions">
        <button class="request-back-btn" type="button" data-keep-item>Keep item</button>
        <button class="request-next-btn bad" type="button" data-confirm-remove>Remove</button>
      </div>`;
    document.body.append(dialog);
    dialog.showModal();

    return new Promise(resolve => {
      const finish = confirmed => {
        dialog.close();
        dialog.remove();
        resolve(confirmed);
      };
      dialog.querySelector("[data-keep-item]").addEventListener("click", () => finish(false), { once: true });
      dialog.querySelector("[data-confirm-remove]").addEventListener("click", () => finish(true), { once: true });
      dialog.addEventListener("cancel", event => {
        event.preventDefault();
        finish(false);
      }, { once: true });
      dialog.addEventListener("click", event => {
        if (event.target === dialog) finish(false);
      });
      dialog.querySelector("[data-keep-item]").focus();
    });
  }

  async function removeItem(item, button) {
    const def = TABS[tab];
    const used = item.students > 0 || item.children > 0;
    const usedText = "Existing records use this item, so it will be retained and removed from active use.";
    if (!await confirmRemoveItem(item, used, usedText)) return;
    await Portal.busy(button, "Saving...", async () => {
      try {
        const result = await Api.postJson("academic.php", { type: def.type, id: item.id }, { action: "remove" });
        Portal.toast(result.message || "Removed.", "success");
        window.clearStructureCache?.();
        load();
      } catch (error) { Portal.toast(error.message, "error"); }
    });
  }

  // ---------- events ----------
  body.addEventListener("click", event => {
    const button = event.target.closest("button[data-edit], button[data-remove]");
    if (!button) return;
    const id = Number(button.dataset.edit || button.dataset.remove);
    const item = data[tab].find(i => i.id === id);
    if (!item) return;
    if (button.dataset.edit) formWindow(item);
    else removeItem(item, button);
  });
  addButton.addEventListener("click", () => formWindow(null));
  document.querySelectorAll("[data-academic-tab]").forEach(button => button.addEventListener("click", () => {
    tab = button.dataset.academicTab;
    document.querySelectorAll("[data-academic-tab]").forEach(b => { b.classList.toggle("active", b === button); b.setAttribute("aria-selected", String(b === button)); });
    render();
  }));
  search.addEventListener("input", render);
  document.addEventListener("page:change", event => { if (event.detail === "Academic Management") load(); });
})();
