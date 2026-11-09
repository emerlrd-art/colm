// Master Lists (admin and registrar): imported enrollment rows are retained; prior academic years are archived on import.
(function () {
  const form = document.getElementById("masterImportForm");
  if (!form) return;
  const plan = document.getElementById("masterPlan");
  const importButton = document.getElementById("masterImportBtn");
  let enrollmentPage = 1;
  let checked = false, checkSeq = 0, checkTimer = null;   // the file is checked automatically; Import list is enabled only after a good check

  function formData(extra) {
    const data = new FormData();
    data.append("csv", document.getElementById("masterFile").files[0]);
    data.append("academic_year", document.getElementById("masterYear").value.trim());
    data.append("semester", document.getElementById("masterSemester").value);
    Object.entries(extra).forEach(([k, v]) => data.append(k, v));
    return data;
  }
  function setReady(ok) {
    checked = ok;
    importButton.disabled = !ok;
    importButton.textContent = "Import list";
  }
  setReady(false);

  const defaultYear = () => { const d = new Date(), y = d.getFullYear(), start = d.getMonth() >= 5 ? y : y - 1; return `${start}-${start + 1}`; };
  const yearInput = document.getElementById("masterYear");
  // Back to default: the form is cleared (no file chosen, Import list disabled). The message stays so the reason can be read.
  function backToDefault() {
    form.reset();
    yearInput.value = defaultYear();
    setReady(false);
  }
  backToDefault();

  // Automatic checking: runs by itself as soon as a file is chosen. It looks only at what is IN the file
  // (columns, course, year level 1-4, @gmail.com) - not at the academic year or the semester.
  async function autoCheck() {
    const file = document.getElementById("masterFile").files[0];
    const seq = ++checkSeq;
    setReady(false);
    if (!file) { plan.hidden = true; return; }
    plan.hidden = true;
    try {
      const r = await Api.postForm("masterlist.php", (() => { const d = new FormData(); d.append("csv", file); return d; })(), { action: "check" });
      if (seq !== checkSeq) return;                         // a newer check started meanwhile
      const c = r.counts;
      if (c.INVALID > 0) {
        // Wrong information in the file: only a short pop-up, no long text on the page.
        plan.hidden = true;
        Portal.toast("Wrong format. Please follow the contents of the sample CSV.", "error", "Master list");
        backToDefault();
        return;
      }
      plan.hidden = true;
      Portal.toast(`File checked: ${r.rows} students, no errors. You can now import the list.`, "success", "Master list");
      setReady(true);
    } catch (error) {
      if (seq !== checkSeq) return;
      plan.hidden = true;
      Portal.toast(error.status === 422 ? "Wrong format. Please follow the contents of the sample CSV." : error.message, "error", "Master list");
      backToDefault();
    }
  }
  const scheduleCheck = delay => { clearTimeout(checkTimer); checkTimer = setTimeout(autoCheck, delay); };
  document.getElementById("masterFile").addEventListener("change", () => scheduleCheck(100));

  // Sample CSV the user can download and fill in.
  document.getElementById("masterTemplateBtn").addEventListener("click", () => {
    const csv = "student_id,full_name,course,year,email\r\n"
      + "2026-10001,Juliana Yadao,BSIT - Information Technology,4,juliana.yadao@gmail.com\r\n"
      + "2026-10002,John Emerson Larida,BSTM - Tourism Management,3,john.larida@gmail.com\r\n"
      + "2026-10003,Mark Jennon Gatchalian,BSCRIM - Criminology,1,mark.gatchalian@gmail.com\r\n";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    link.download = "master_list_template.csv";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!checked) { autoCheck(); return; }
    await Portal.busy(importButton, "Importing...", async () => {
      try {
        const r = await Api.postForm("masterlist.php", formData({}), { action: "import" });
        Portal.toast(`${r.period} imported (${r.rows} enrollment records).${r.will_archive.length ? " Prior academic-year lists archived." : ""}`, "success");
        backToDefault(); plan.hidden = true; enrollmentPage = 1; loadImports(); loadEnrollments();
      } catch (error) {
        Portal.toast(error.message, "error", "Master list");
        plan.hidden = true;
        backToDefault();
      }
    });
    setReady(false);
  });

  async function loadImports() {
    const body = document.getElementById("masterImports");
    try {
      const rows = (await Api.get("masterlist.php", { action: "imports" })).imports;
      body.innerHTML = rows.length ? rows.map(i => `<tr><td>${escapeHtml(i.academic_year)}</td><td>${escapeHtml(i.semester_label)}</td><td>${i.row_count}</td>
        <td>${escapeHtml(i.imported_at)}</td><td>${escapeHtml(i.archived_at || "—")}</td></tr>`).join("")
        : '<tr><td colspan="5" class="requests-empty">No master list imported yet.</td></tr>';
    } catch (error) { body.innerHTML = `<tr><td colspan="5" class="requests-empty">${escapeHtml(error.message)}</td></tr>`; }
  }

  async function loadEnrollments() {
    const body = document.getElementById("masterEnrollments");
    try {
      const result = await Api.get("masterlist.php", { action: "current_enrollments", page: enrollmentPage });
      document.getElementById("masterEnrollmentsTitle").textContent = `Enrollment records · A.Y. ${result.academic_year}`;
      body.innerHTML = result.records.length ? result.records.map(row => `<tr>
        <td>${escapeHtml(row.student_no)}</td><td>${escapeHtml(row.student_name)}</td>
        <td>${escapeHtml([row.course, row.year_level].filter(Boolean).join(" / ") || "—")}</td>
        <td>${escapeHtml(row.semester_label)}</td>
        <td>Currently Enrolled</td>
        <td>${escapeHtml(row.validation_status)}${row.validation_note ? `<br><small>${escapeHtml(row.validation_note)}</small>` : ""}</td>
      </tr>`).join("") : '<tr><td colspan="6" class="requests-empty">No enrollment records for this academic year.</td></tr>';
      const pages = Math.max(1, Math.ceil(result.total / result.per_page));
      document.getElementById("masterEnrollmentsPage").textContent = `Page ${result.page} of ${pages} (${result.total} records)`;
      document.getElementById("masterEnrollmentsPrev").disabled = result.page <= 1;
      document.getElementById("masterEnrollmentsNext").disabled = result.page >= pages;
    } catch (error) {
      body.innerHTML = `<tr><td colspan="6" class="requests-empty">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  document.getElementById("masterEnrollmentsPrev").addEventListener("click", () => { enrollmentPage = Math.max(1, enrollmentPage - 1); loadEnrollments(); });
  document.getElementById("masterEnrollmentsNext").addEventListener("click", () => { enrollmentPage++; loadEnrollments(); });
  document.addEventListener("page:change", event => {
    if (event.detail === "Master Lists") { loadImports(); loadEnrollments(); }
  });
})();