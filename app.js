(function () {
  "use strict";

  const DAYS = [
    { key: "sunday", label: "Sunday", short: "Sun" },
    { key: "monday", label: "Monday", short: "Mon" },
    { key: "tuesday", label: "Tuesday", short: "Tue" },
    { key: "wednesday", label: "Wednesday", short: "Wed" },
    { key: "thursday", label: "Thursday", short: "Thu" },
    { key: "friday", label: "Friday", short: "Fri" },
    { key: "saturday", label: "Saturday", short: "Sat" }
  ];
  const HOURS_PER_DAY = 8;
  const PAGE_NAMES = { overview: "Overview", workers: "Workers", payroll: "Weekly payroll", positions: "Positions", sites: "Work sites", deleted: "Removed workers" };
  const pageContent = document.getElementById("page-content");
  const dialog = document.getElementById("app-dialog");
  const authScreen = document.getElementById("auth-screen");
  const appShell = document.getElementById("app-shell");
  let page = "overview";
  let currentWeek = previousWeekStart(new Date());
  let toastTimer;
  let saveQueue = Promise.resolve();
  let dataLoading = true;
  let dataLoadError = "";
  let csrfToken = "";
  let activeFilters = { worker: "", position: "", site: "", from: "", to: "", pca: false };

  function emptyData() {
    return { workers: [], positions: [], sites: [], payroll: [] };
  }
  let data = emptyData();
  function recalculatePca(person) {
    let balance = number(person.initialPcaBalance != null ? person.initialPcaBalance : person.pcaBalance);
    const records = data.payroll.filter(item => item.workerId === person.id).sort((a, b) => a.weekStart.localeCompare(b.weekStart) || String(a.createdAt).localeCompare(String(b.createdAt)));
    records.forEach(record => {
      balance = Math.max(0, balance + number(record.newPcaAmount) - number(record.pcaDeduction));
      record.resultingPcaBalance = balance;
    });
    person.pcaBalance = balance;
  }
  function projectedPcaBalance(person, editedRecord, week, newAmount, deduction) {
    if (!person) return 0;
    let balance = number(person.initialPcaBalance != null ? person.initialPcaBalance : person.pcaBalance);
    const precedingRecords = data.payroll
      .filter(record => record.workerId === person.id && record.id !== (editedRecord && editedRecord.id) && record.weekStart < week)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || String(a.createdAt).localeCompare(String(b.createdAt)));
    precedingRecords.forEach(record => {
      balance = Math.max(0, balance + number(record.newPcaAmount) - number(record.pcaDeduction));
    });
    return Math.max(0, balance + newAmount - deduction);
  }
  function save() {
    const request = saveQueue.catch(() => {}).then(async () => {
      const response = await fetch("api.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) showAuthScreen(false, "Your session expired. Sign in again to continue.");
        const error = new Error(result.error || "Could not save payroll data.");
        error.status = response.status;
        throw error;
      }
      if (result.photos && typeof result.photos === "object") {
        data.workers.forEach(person => {
          if (result.photos[person.id]) person.photo = result.photos[person.id];
        });
      }
      return true;
    });
    saveQueue = request;
    return request;
  }
  async function loadData() {
    const response = await fetch("api.php", { headers: { "Accept": "application/json" } });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) showAuthScreen(false, "Your session expired. Sign in again to continue.");
      const error = new Error(result.error || "Could not load payroll data.");
      error.status = response.status;
      throw error;
    }
    data = {
      workers: Array.isArray(result.workers) ? result.workers : [],
      positions: Array.isArray(result.positions) ? result.positions : [],
      sites: Array.isArray(result.sites) ? result.sites : [],
      payroll: Array.isArray(result.payroll) ? result.payroll : []
    };
    dataLoadError = "";
    dataLoading = false;
  }
  function id() { return window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function money(value) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(Number(value) || 0); }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
  function fmtDate(date) {
    if (!date) return "—";
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }
  function isoDate(date) {
    const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return copy.toISOString().slice(0, 10);
  }
  function weekStart(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  }
  function previousWeekStart(date) {
    const start = weekStart(date);
    start.setDate(start.getDate() - 7);
    return start;
  }
  function weekEnd(start) { const result = new Date(start); result.setDate(result.getDate() + 6); return result; }
  function weekKey(date) { return isoDate(weekStart(new Date(`${date}T00:00:00`))); }
  function weekdayDate(week, day) {
    const date = new Date(`${week}T00:00:00`);
    date.setDate(date.getDate() + DAYS.indexOf(day));
    return isoDate(date);
  }
  function weekLabel(start) {
    const end = weekEnd(start);
    return `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  function position(idValue) { return data.positions.find(item => item.id === idValue); }
  function site(idValue) { return data.sites.find(item => item.id === idValue); }
  function worker(idValue) { return data.workers.find(item => item.id === idValue) || data.workers.find(item => item.id === idValue && item.deletedAt); }
  function workerForRecord(idValue) { return [...data.workers, ...data.workers.filter(item => item.deletedAt)].find(item => item.id === idValue); }
  function workerName(record) {
    const person = workerForRecord(record.workerId);
    return person ? person.name : "Removed worker";
  }
  function effectiveRate(person) {
    const job = position(person.positionId);
    return person.overrideRate !== "" && person.overrideRate != null ? number(person.overrideRate) : number(job && job.dailyRate);
  }
  function recordHours(record) {
    return (record.days || []).reduce((sum, entry) => sum + number(entry.hours), 0);
  }
  function recordUnits(record) {
    return recordHours(record) / HOURS_PER_DAY;
  }
  function calcTotal(record) {
    return Math.round((recordUnits(record) * number(record.effectiveRate) + number(record.allowanceAmount) - number(record.cashAdvance) - number(record.pcaDeduction)) * 100) / 100;
  }
  function persistAndRender(message) {
    save().then(() => {
      render();
      if (message) notify(message);
    }).catch(error => {
      console.error("Could not save payroll data.", error);
      render();
      notify(error.message || "Could not save payroll data.");
    });
  }
  function notify(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
  }
  function selectOptions(items, selected, placeholder, labelFn) {
    return `<option value="">${esc(placeholder)}</option>${items.map(item => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(labelFn(item))}</option>`).join("")}`;
  }
  function workerAvatar(person, compact) {
    if (person && person.photo) return `<img class="worker-photo" src="${esc(person.photo)}" alt="">`;
    const initials = person ? person.name.split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() : "?";
    return `<span class="worker-initials">${esc(initials)}</span>`;
  }
  function workerCell(person, subline) {
    return `<div class="worker-cell">${workerAvatar(person, true)}<span><strong>${esc(person ? person.name : "Removed worker")}</strong><small>${esc(subline || "")}</small></span></div>`;
  }
  function heading(title, description, actions) {
    return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="heading-actions">${actions || ""}</div></div>`;
  }
  function statCard(title, value, note, icon, color) {
    return `<article class="stat-card"><span class="stat-icon ${color || ""}">${icon}</span><div class="stat-title">${esc(title)}</div><div class="stat-value">${value}</div><div class="stat-note">${esc(note)}</div></article>`;
  }
  function emptyState(title, message) {
    return `<div class="empty-state"><div class="empty-icon">◌</div><strong>${esc(title)}</strong>${esc(message)}</div>`;
  }
  function tableCard(content) { return `<div class="table-card"><div class="table-wrap">${content}</div></div>`; }
  function weekControl() {
    return `<div class="week-control"><button type="button" data-action="week-prev" aria-label="Previous week">‹</button><span>${esc(weekLabel(currentWeek))}</span><button type="button" data-action="week-next" aria-label="Next week">›</button></div>`;
  }
  function activeWorkers() { return data.workers.filter(person => !person.deletedAt); }
  function payrollForWeek(start) { const key = isoDate(start); return data.payroll.filter(record => record.weekStart === key); }
  function getRecords() {
    return data.payroll.filter(record => {
      const person = workerForRecord(record.workerId);
      if (!activeFilters.from && !activeFilters.to && record.weekStart !== isoDate(currentWeek)) return false;
      if (activeFilters.worker && record.workerId !== activeFilters.worker) return false;
      if (activeFilters.position && (!person || person.positionId !== activeFilters.position)) return false;
      if (activeFilters.site && !(record.days || []).some(day => day.siteId === activeFilters.site)) return false;
      const date = record.weekStart;
      if (activeFilters.from && date < activeFilters.from) return false;
      if (activeFilters.to && date > activeFilters.to) return false;
      if (activeFilters.pca && number(record.resultingPcaBalance) <= 0) return false;
      return true;
    }).sort((a, b) => b.weekStart.localeCompare(a.weekStart) || workerName(a).localeCompare(workerName(b)));
  }
  function statsForRecords(records) {
    return records.reduce((sum, record) => ({
      pay: sum.pay + number(record.totalPay),
      cash: sum.cash + number(record.cashAdvance),
      pca: sum.pca + number(record.pcaDeduction),
      allowance: sum.allowance + number(record.allowanceAmount)
    }), { pay: 0, cash: 0, pca: 0, allowance: 0 });
  }
  function summaryStrip(records) {
    const sums = statsForRecords(records);
    return `<div class="summary-strip"><span>Net payroll<strong>${money(sums.pay)}</strong></span><span>Cash advances<strong>${money(sums.cash)}</strong></span><span>PCA deductions<strong>${money(sums.pca)}</strong></span><span>Allowances<strong>${money(sums.allowance)}</strong></span></div>`;
  }
  function payrollTable(records, showChecks) {
    if (!records.length) return emptyState("No payroll records yet", "Create a weekly record or use batch entry to get started.");
    const rows = records.map(record => {
      const person = workerForRecord(record.workerId);
      const job = position(person && person.positionId);
      const siteIds = [...new Set((record.days || []).map(day => day.siteId).filter(Boolean))];
      const siteNames = siteIds.map(siteId => site(siteId)).filter(Boolean).map(item => item.name);
      return `<tr>
        ${showChecks ? `<td class="check-cell"><input type="checkbox" class="record-check" value="${esc(record.id)}" aria-label="Select ${esc(workerName(record))} payroll"></td>` : ""}
        <td>${workerCell(person, job ? job.title : "Position not set")}</td>
        <td>${esc(weekLabel(new Date(`${record.weekStart}T00:00:00`)))}</td>
        <td>${esc(siteNames.join(", ") || "—")}</td>
        <td>${recordHours(record).toFixed(2)}<div class="rate-note">${recordUnits(record).toFixed(2)} day units</div></td>
        <td>${money(record.effectiveRate)}<div class="rate-note">per day</div></td>
        <td>${money(record.allowanceAmount)}</td>
        <td>${money(record.cashAdvance)}</td>
        <td class="pay-value">${money(record.totalPay)}</td>
        <td><div class="row-actions"><button class="icon-btn" data-action="edit-payroll" data-id="${esc(record.id)}" title="Edit">✎</button><button class="icon-btn" data-action="print-record" data-id="${esc(record.id)}" title="Print payslip">▤</button><button class="icon-btn delete" data-action="delete-payroll" data-id="${esc(record.id)}" title="Delete">×</button></div></td>
      </tr>`;
    }).join("");
    return `<table><thead><tr>${showChecks ? "<th></th>" : ""}<th>Worker</th><th>Week</th><th>Site(s)</th><th>Hours / units</th><th>Daily rate</th><th>Allowance</th><th>Cash advance</th><th>Net pay</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function renderOverview() {
    const thisWeek = payrollForWeek(currentWeek);
    const sums = statsForRecords(thisWeek);
    const pcaCount = activeWorkers().filter(person => number(person.pcaBalance) > 0).length;
    const records = [...thisWeek].sort((a, b) => workerName(a).localeCompare(workerName(b))).slice(0, 6);
    return `${heading("Overview", "A clear view of your workforce and weekly payroll.", weekControl() + `<button class="btn btn-primary" data-action="new-payroll">＋ New payroll</button>`)}
      <div class="stats-grid">
        ${statCard("Active workers", activeWorkers().length, `${data.positions.length} positions available`, "♙", "")}
        ${statCard("Payroll this week", money(sums.pay), `${thisWeek.length} payroll records`, "₱", "green")}
        ${statCard("Total allowances", money(sums.allowance), "For the selected week", "＋", "orange")}
        ${statCard("Workers with PCA", pcaCount, "Positive balance on file", "↗", "blue")}
      </div>
      <section class="panel"><div class="panel-header"><div><h2>Recent payroll</h2><p>Payroll activity for ${esc(weekLabel(currentWeek))}</p></div><button class="btn btn-sm" data-page="payroll">View all records →</button></div>
        ${payrollTable(records, false)}
      </section>
      <section class="panel"><div class="panel-header"><div><h2>Workforce snapshot</h2><p>Active workers by assigned position</p></div><button class="btn btn-sm" data-page="workers">Manage workers →</button></div>
        ${data.positions.length ? `<div class="summary-strip">${data.positions.map(job => `<span>${esc(job.title)}<strong>${activeWorkers().filter(person => person.positionId === job.id).length}</strong></span>`).join("")}</div>` : emptyState("No positions added", "Add positions to organize your workforce.")}</section>`;
  }
  function renderWorkers() {
    const search = (document.getElementById("worker-search") || {}).value || "";
    const siteFilter = (document.getElementById("worker-site-filter") || {}).value || "";
    const positionFilter = (document.getElementById("worker-position-filter") || {}).value || "";
    const records = activeWorkers().filter(person =>
      (!search || person.name.toLowerCase().includes(search.toLowerCase())) &&
      (!siteFilter || person.siteId === siteFilter) &&
      (!positionFilter || person.positionId === positionFilter)
    );
    return `${heading("Workers", "Manage worker profiles, job assignments, and pay rates.", `<button class="btn btn-primary" data-action="add-worker">＋ Add worker</button>`)}
      <section class="panel"><div class="filter-bar">
        <div class="search-wrap"><input id="worker-search" class="search-control" placeholder="Search workers by name" value="${esc(search)}"></div>
        <select id="worker-site-filter" class="field-control">${selectOptions(data.sites, siteFilter, "All sites", item => item.name)}</select>
        <select id="worker-position-filter" class="field-control">${selectOptions(data.positions, positionFilter, "All positions", item => item.title)}</select>
        <span class="muted" style="font-size:9px;margin-left:auto">${records.length} worker${records.length === 1 ? "" : "s"}</span>
      </div>
      ${records.length ? tableCard(`<table><thead><tr><th>Worker</th><th>Position</th><th>Site</th><th>Effective daily rate</th><th>Phone</th><th>PCA balance</th><th>Status</th><th></th></tr></thead><tbody>${records.map(person => {
        const job = position(person.positionId);
        const workSite = site(person.siteId);
        return `<tr><td>${workerCell(person, person.phone || "No phone number")}</td><td>${esc(job ? job.title : "—")}</td><td>${esc(workSite ? workSite.name : "—")}</td><td>${money(effectiveRate(person))}<div class="rate-note">${person.overrideRate !== "" && person.overrideRate != null ? "Worker override" : "Position default"} · per day</div></td><td>${esc(person.phone || "—")}</td><td class="${number(person.pcaBalance) > 0 ? "pca-positive" : ""}">${money(person.pcaBalance)}</td><td><span class="pill green">Active</span></td><td><div class="row-actions"><button class="icon-btn" data-action="worker-history" data-id="${esc(person.id)}" title="Pay history">◷</button><button class="icon-btn" data-action="edit-worker" data-id="${esc(person.id)}" title="Edit">✎</button><button class="icon-btn delete" data-action="remove-worker" data-id="${esc(person.id)}" title="Remove">×</button></div></td></tr>`;
      }).join("")}</tbody></table>`) : emptyState(search || siteFilter || positionFilter ? "No workers match these filters" : "No workers added yet", "Add workers to start managing assignments and payroll.")}</section>`;
  }
  function renderPositions() {
    return `${heading("Positions", "Set up job titles and their default daily rates.", `<button class="btn btn-primary" data-action="add-position">＋ Add position</button>`)}
      <section class="panel"><div class="panel-header"><div><h2>All positions</h2><p>Position rates can be overridden on an individual worker profile.</p></div></div>
      ${data.positions.length ? tableCard(`<table><thead><tr><th>Position title</th><th>Default daily rate</th><th>Assigned workers</th><th></th></tr></thead><tbody>${data.positions.map(job => {
        const assigned = activeWorkers().filter(person => person.positionId === job.id).length;
        return `<tr><td><strong style="color:#35425a">${esc(job.title)}</strong></td><td>${money(job.dailyRate)}</td><td>${assigned} worker${assigned === 1 ? "" : "s"}</td><td><div class="row-actions"><button class="icon-btn" data-action="edit-position" data-id="${esc(job.id)}" title="Edit">✎</button><button class="icon-btn delete" data-action="delete-position" data-id="${esc(job.id)}" title="Delete">×</button></div></td></tr>`;
      }).join("")}</tbody></table>`) : emptyState("No positions added", "Create job positions and set a default rate.")}</section>`;
  }
  function renderSites() {
    return `${heading("Work sites", "Manage locations, daily attendance, and labor costs by site.", `<button class="btn btn-primary" data-action="add-site">＋ Add work site</button>`)}
      <section class="panel"><div class="panel-header"><div><h2>All work sites</h2><p>Labor cost is allocated by each recorded day's hours and the worker's saved daily rate.</p></div></div>
      ${data.sites.length ? tableCard(`<table><thead><tr><th>Site name</th><th>Location</th><th>Assigned workers</th><th>Payroll records</th><th>Hours</th><th>Pay units</th><th>Labor cost</th><th></th></tr></thead><tbody>${data.sites.map(workSite => {
        const assigned = activeWorkers().filter(person => person.siteId === workSite.id).length;
        const siteRecords = data.payroll.filter(record => (record.days || []).some(day => day.siteId === workSite.id));
        const siteEntries = data.payroll.flatMap(record => (record.days || [])
          .filter(day => day.siteId === workSite.id)
          .map(day => ({ record, day })));
        const hours = siteEntries.reduce((sum, entry) => sum + number(entry.day.hours), 0);
        const units = hours / HOURS_PER_DAY;
        const laborCost = siteEntries.reduce((sum, entry) => sum + number(entry.day.hours) / HOURS_PER_DAY * number(entry.record.effectiveRate), 0);
        return `<tr><td><strong style="color:#35425a">${esc(workSite.name)}</strong></td><td>${esc(workSite.location || "—")}</td><td>${assigned}</td><td>${siteRecords.length}</td><td>${hours.toFixed(2)}</td><td>${units.toFixed(2)}</td><td class="pay-value">${money(laborCost)}</td><td><div class="row-actions"><button class="icon-btn" data-action="edit-site" data-id="${esc(workSite.id)}" title="Edit">✎</button><button class="icon-btn delete" data-action="delete-site" data-id="${esc(workSite.id)}" title="Delete">×</button></div></td></tr>`;
      }).join("")}</tbody></table>`) : emptyState("No work sites added", "Create sites to assign workers and track where hours are worked.")}</section>`;
  }
  function renderPayroll() {
    const records = getRecords();
    const sums = statsForRecords(records);
    const recordStart = new Date(`${isoDate(currentWeek)}T00:00:00`);
    return `${heading("Weekly payroll", "Review weekly timesheets, deductions, and worker pay.", `${weekControl()}<button class="btn" data-action="batch-entry">▦ Batch entry</button><button class="btn btn-primary" data-action="new-payroll">＋ Add payroll</button>`)}
      <div class="stats-grid">${statCard("Net payroll", money(sums.pay), `${records.length} matching records`, "₱", "green")}${statCard("Cash advances", money(sums.cash), "For matching records", "↗", "orange")}${statCard("PCA deductions", money(sums.pca), "For matching records", "−", "blue")}${statCard("Allowances", money(sums.allowance), "For matching records", "＋", "")}</div>
      <section class="panel"><div class="filter-bar">
        <select id="pay-filter-worker" class="field-control">${selectOptions(activeWorkers(), activeFilters.worker, "All workers", item => item.name)}</select>
        <select id="pay-filter-position" class="field-control">${selectOptions(data.positions, activeFilters.position, "All positions", item => item.title)}</select>
        <select id="pay-filter-site" class="field-control">${selectOptions(data.sites, activeFilters.site, "All sites", item => item.name)}</select>
        <input id="pay-filter-from" type="date" class="field-control" aria-label="From date" value="${esc(activeFilters.from)}">
        <input id="pay-filter-to" type="date" class="field-control" aria-label="To date" value="${esc(activeFilters.to)}">
        <label style="display:flex;align-items:center;gap:5px;color:#77849a;font-size:9px"><input id="pay-filter-pca" type="checkbox" ${activeFilters.pca ? "checked" : ""}> PCA balance</label>
        <button class="btn btn-sm" data-action="clear-pay-filters">Clear</button>
      </div>
      ${summaryStrip(records)}
      <div class="panel-header"><div><h2>Payroll records</h2><p>Selected week: ${esc(weekLabel(recordStart))}</p></div><div class="heading-actions"><button class="btn btn-sm" data-action="print-selected">▤ Print selected</button><button class="btn btn-sm" data-action="print-all">Print all</button></div></div>
      ${tableCard(payrollTable(records, true))}
      <div class="table-footer"><span>${records.length} payroll record${records.length === 1 ? "" : "s"}</span><span>Pay = (total hours ÷ 8) × daily rate + allowance − cash advance − PCA deduction</span></div>
      </section>
      <section class="panel"><div class="panel-header"><div><h2>Batch payroll entry</h2><p>Enter hours for several workers at one site and save all timesheets together.</p></div><button class="btn btn-primary btn-sm" data-action="batch-entry">Start batch entry</button></div></section>`;
  }
  function renderDeleted() {
    const records = data.workers.filter(person => person.deletedAt);
    return `${heading("Removed workers", "Removed profiles are kept with their payroll history and can be restored.", "")}
      <section class="panel"><div class="panel-header"><div><h2>Removed workers</h2><p>${records.length} archived worker${records.length === 1 ? "" : "s"}</p></div></div>
      ${records.length ? tableCard(`<table><thead><tr><th>Worker</th><th>Position</th><th>Site</th><th>Removal reason</th><th>Removed on</th><th></th></tr></thead><tbody>${records.map(person => `<tr><td>${workerCell(person, person.phone || "No phone number")}</td><td>${esc((position(person.positionId) || {}).title || "—")}</td><td>${esc((site(person.siteId) || {}).name || "—")}</td><td>${esc(person.removalReason || "—")}</td><td>${fmtDate(person.deletedAt.slice(0, 10))}</td><td><div class="row-actions"><button class="btn btn-sm" data-action="restore-worker" data-id="${esc(person.id)}">Restore</button></div></td></tr>`).join("")}</tbody></table>`) : emptyState("No removed workers", "Workers you remove will appear here for later restoration.")}</section>`;
  }
  function render() {
    document.getElementById("breadcrumb-current").textContent = PAGE_NAMES[page];
    document.getElementById("today-label").textContent = new Date().toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    document.getElementById("deleted-count").textContent = data.workers.filter(person => person.deletedAt).length;
    document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.page === page));
    if (dataLoading) {
      pageContent.innerHTML = `<div class="empty-state"><div class="empty-icon">◌</div><strong>Connecting to payroll database</strong>Loading workers and payroll records from MySQL.</div>`;
      return;
    }
    if (dataLoadError) {
      pageContent.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><strong>Could not connect to payroll database</strong>${esc(dataLoadError)}<div style="margin-top:14px"><button class="btn btn-primary" data-action="retry-load">Retry connection</button></div></div>`;
      return;
    }
    pageContent.innerHTML = ({ overview: renderOverview, workers: renderWorkers, positions: renderPositions, sites: renderSites, payroll: renderPayroll, deleted: renderDeleted })[page]();
  }
  function showAuthScreen(setupRequired, message) {
    authScreen.hidden = false;
    appShell.hidden = true;
    authScreen.innerHTML = `<div class="auth-card">
      <a class="brand auth-brand" href="#" aria-label="AMR Payroll"><span class="brand-mark">A</span><span><strong>AMR</strong><small>PAYROLL SYSTEM</small></span></a>
      <div class="auth-copy"><h1>${setupRequired ? "Set up your admin account" : "Welcome back"}</h1>
      <p>${setupRequired ? "Create the first and only administrator account to secure payroll access." : "Sign in to manage workers and payroll."}</p></div>
      ${message ? `<div class="auth-message" role="alert">${esc(message)}</div>` : ""}
      <form id="auth-form" data-auth-action="${setupRequired ? "setup" : "login"}">
        ${setupRequired ? `<div class="form-field"><label for="auth-name">Administrator name</label><input class="form-control" id="auth-name" name="name" autocomplete="name" maxlength="120" required></div>` : ""}
        <div class="form-field"><label for="auth-email">Email address</label><input class="form-control" id="auth-email" name="email" type="email" autocomplete="username" maxlength="190" required></div>
        <div class="form-field"><label for="auth-password">Password</label><input class="form-control" id="auth-password" name="password" type="password" autocomplete="${setupRequired ? "new-password" : "current-password"}" minlength="${setupRequired ? "12" : "1"}" required>${setupRequired ? `<small class="auth-hint">Use at least 12 characters. Store it safely; password reset is not configured.</small>` : ""}</div>
        ${setupRequired ? `<div class="form-field"><label for="auth-confirm-password">Confirm password</label><input class="form-control" id="auth-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required></div>` : ""}
        <button class="btn btn-primary auth-submit" type="submit">${setupRequired ? "Create admin account" : "Sign in"}</button>
      </form>
      <p class="auth-footnote">Payroll data is restricted to the signed-in administrator.</p>
    </div>`;
  }
  async function fetchAuthStatus() {
    const response = await fetch("auth.php", { headers: { "Accept": "application/json" } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not check authentication status.");
    csrfToken = result.csrfToken || "";
    return result;
  }
  function enterApp(user) {
    authScreen.hidden = true;
    authScreen.innerHTML = "";
    appShell.hidden = false;
    document.getElementById("signed-in-user").textContent = user.name;
    initializeData();
  }
  async function initializeAuth() {
    authScreen.hidden = false;
    authScreen.innerHTML = `<div class="auth-card"><div class="auth-copy"><h1>Connecting securely</h1><p>Checking payroll access…</p></div></div>`;
    try {
      const status = await fetchAuthStatus();
      if (status.authenticated && status.user) enterApp(status.user);
      else showAuthScreen(status.setupRequired, "");
    } catch (error) {
      console.error("Could not check authentication status.", error);
      showAuthScreen(false, error.message || "Could not connect to the authentication service.");
    }
  }
  async function submitAuthForm(form) {
    const formData = new FormData(form);
    const action = form.dataset.authAction;
    const password = String(formData.get("password") || "");
    if (action === "setup" && password !== String(formData.get("confirmPassword") || "")) {
      showAuthScreen(true, "The passwords do not match.");
      return;
    }
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = action === "setup" ? "Creating account…" : "Signing in…";
    try {
      const response = await fetch("auth.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({
          action,
          name: String(formData.get("name") || ""),
          email: String(formData.get("email") || ""),
          password
        })
      });
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error || "Authentication failed.");
        error.status = response.status;
        throw error;
      }
      csrfToken = result.csrfToken || "";
      enterApp(result.user);
    } catch (error) {
      console.error("Authentication request failed.", error);
      try {
        const status = await fetchAuthStatus();
        if (status.authenticated && status.user) {
          enterApp(status.user);
          return;
        }
        showAuthScreen(status.setupRequired, error.message || "Authentication failed.");
      } catch (statusError) {
        showAuthScreen(false, statusError.message || error.message || "Authentication failed.");
      }
    }
  }
  async function signOut() {
    try {
      const response = await fetch("auth.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ action: "logout" })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not sign out.");
      csrfToken = result.csrfToken || "";
      data = emptyData();
      showAuthScreen(false, "");
    } catch (error) {
      console.error("Sign out failed.", error);
      notify(error.message || "Could not sign out.");
    }
  }
  function switchPage(next) {
    if (!PAGE_NAMES[next]) return;
    page = next;
    render();
  }
  function openDialog(title, subtitle, body, submitText, onSubmit, wide) {
    dialog.className = `app-dialog${wide ? " wide" : ""}`;
    dialog.innerHTML = `<form id="dialog-form"><div class="dialog-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button type="button" class="dialog-close" aria-label="Close">×</button></div>${body}<div class="form-actions"><button type="button" class="btn" data-dialog-cancel>Cancel</button><button class="btn btn-primary" type="submit">${esc(submitText)}</button></div></form>`;
    dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
    dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
    dialog.querySelector("#dialog-form").addEventListener("submit", event => {
      event.preventDefault();
      if (onSubmit(new FormData(event.currentTarget)) !== false) dialog.close();
    });
    dialog.showModal();
  }
  function field(label, name, value, type, options) {
    const inputType = type || "text";
    const required = options && options.required ? "required" : "";
    const placeholder = options && options.placeholder ? `placeholder="${esc(options.placeholder)}"` : "";
    const step = options && options.step ? `step="${esc(options.step)}"` : "";
    const min = options && options.min != null ? `min="${esc(options.min)}"` : "";
    const max = options && options.max != null ? `max="${esc(options.max)}"` : "";
    const accept = options && options.accept ? `accept="${esc(options.accept)}"` : "";
    const content = options && options.selectOptions
      ? `<select class="form-control" name="${esc(name)}" ${required}>${options.selectOptions}</select>`
      : inputType === "textarea"
        ? `<textarea class="form-control" name="${esc(name)}" ${placeholder}>${esc(value)}</textarea>`
        : `<input class="form-control" type="${esc(inputType)}" name="${esc(name)}" value="${esc(value)}" ${placeholder} ${step} ${min} ${max} ${accept} ${required}>`;
    return `<div class="form-field ${options && options.full ? "full" : ""}"><label>${esc(label)}</label>${content}</div>`;
  }
  function showWorkerForm(person) {
    const editing = Boolean(person);
    const positionOptions = selectOptions(data.positions, person && person.positionId, "Choose position", item => item.title);
    const siteOptions = selectOptions(data.sites, person && person.siteId, "Choose site", item => item.name);
    const body = `<div class="form-grid">
      ${field("Full name", "name", person ? person.name : "", "text", { required: true })}
      ${field("Phone number", "phone", person ? person.phone : "", "tel")}
      ${field("Position (optional)", "positionId", "", "select", { selectOptions: positionOptions })}
      ${field("Work site (optional)", "siteId", "", "select", { selectOptions: siteOptions })}
      ${field("Override daily rate (optional)", "overrideRate", person && person.overrideRate != null ? person.overrideRate : "", "number", { step: "0.01", min: "0", placeholder: "Uses position default when blank" })}
      ${field("Opening PCA balance", "pcaBalance", person ? (person.initialPcaBalance != null ? person.initialPcaBalance : person.pcaBalance) : 0, "number", { step: "0.01", min: "0" })}
      ${field("Address", "address", person ? person.address : "", "textarea", { full: true })}
      ${field("Emergency contact", "emergencyContact", person ? person.emergencyContact : "", "text")}
      ${field("Worker photo", "photoFile", "", "file", { accept: "image/png,image/jpeg,image/webp" })}
      ${person && person.photo ? `<div class="form-field full"><label>Current photo</label>${workerAvatar(person)}</div>` : ""}
    </div>`;
    openDialog(editing ? "Edit worker" : "Add worker", "Position and work site can be assigned now or updated later.", body, editing ? "Save changes" : "Add worker", form => {
      const name = String(form.get("name") || "").trim();
      const positionId = String(form.get("positionId") || "");
      const siteId = String(form.get("siteId") || "");
      if (!name || (positionId && !position(positionId)) || (siteId && !site(siteId))) { notify("Enter a worker name and choose valid assignments, or leave them blank for now."); return false; }
      const file = form.get("photoFile");
      const commit = photo => {
        const values = {
          name, phone: String(form.get("phone") || "").trim(), positionId,
          siteId, overrideRate: form.get("overrideRate") === "" ? "" : number(form.get("overrideRate")),
            initialPcaBalance: number(form.get("pcaBalance")), address: String(form.get("address") || "").trim(),
          emergencyContact: String(form.get("emergencyContact") || "").trim()
        };
          if (person) {
            Object.assign(person, values, photo ? { photo } : {});
            recalculatePca(person);
          } else {
            data.workers.push({ id: id(), ...values, pcaBalance: values.initialPcaBalance, photo: photo || "", deletedAt: null, removalReason: "" });
          }
        persistAndRender(editing ? "Worker details updated." : "Worker added.");
      };
      if (file && file.size) {
        if (file.size > 2 * 1024 * 1024) { notify("Photo must be 2 MB or smaller."); return false; }
        const reader = new FileReader();
        reader.onload = () => commit(String(reader.result || ""));
        reader.onerror = () => notify("Could not read the selected photo.");
        reader.readAsDataURL(file);
      } else commit("");
      return true;
    });
  }
  function showPositionForm(job) {
    const editing = Boolean(job);
    const body = `<div class="form-grid">${field("Position title", "title", job ? job.title : "", "text", { required: true })}${field("Default daily rate", "dailyRate", job ? job.dailyRate : "", "number", { required: true, step: "0.01", min: "0" })}</div>`;
    openDialog(editing ? "Edit position" : "Add position", "Set the default rate used by workers without an override.", body, editing ? "Save changes" : "Add position", form => {
      const title = String(form.get("title") || "").trim();
      const rate = number(form.get("dailyRate"));
      if (!title || !form.get("dailyRate") || rate < 0) { notify("Enter a title and a valid rate."); return false; }
      if (job) Object.assign(job, { title, dailyRate: rate });
      else data.positions.push({ id: id(), title, dailyRate: rate });
      persistAndRender(editing ? "Position updated." : "Position added.");
    });
  }
  function showSiteForm(workSite) {
    const editing = Boolean(workSite);
    const body = `<div class="form-grid">${field("Site name", "name", workSite ? workSite.name : "", "text", { required: true })}${field("Location", "location", workSite ? workSite.location : "", "text", { full: true, placeholder: "Address or area" })}</div>`;
    openDialog(editing ? "Edit work site" : "Add work site", "Use a clear name so hours can be assigned accurately.", body, editing ? "Save changes" : "Add site", form => {
      const name = String(form.get("name") || "").trim();
      if (!name) { notify("Enter a site name."); return false; }
      const values = { name, location: String(form.get("location") || "").trim() };
      if (workSite) Object.assign(workSite, values);
      else data.sites.push({ id: id(), ...values });
      persistAndRender(editing ? "Work site updated." : "Work site added.");
    });
  }
  function defaultRecord(person, week) {
    return {
      id: id(), workerId: person.id, weekStart: week, effectiveRate: effectiveRate(person),
      allowanceAmount: 0, allowanceType: "", allowanceNote: "", cashAdvance: 0,
      newPcaAmount: 0, pcaReason: "", pcaDeduction: 0, resultingPcaBalance: number(person.pcaBalance),
      totalPay: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      days: []
    };
  }
  function showPayrollForm(record) {
    const existing = Boolean(record);
    const person = record ? workerForRecord(record.workerId) : null;
    const selectedWeek = record ? record.weekStart : isoDate(currentWeek);
    const availableWorkers = existing
      ? (person ? [person] : [])
      : activeWorkers().filter(worker => !data.payroll.some(item => item.workerId === worker.id && item.weekStart === selectedWeek));
    const workerOptions = selectOptions(availableWorkers, record && record.workerId, "Choose worker", item => item.name);
    const siteSelect = selected => selectOptions(data.sites, selected, "No site", item => item.name);
    const entryMarkup = entry => `<div class="timesheet-entry" data-entry-row>
      <input type="hidden" name="entryId" value="${esc(entry.id)}">
      <label>Work date<input class="form-control" type="date" name="entryDate" value="${esc(entry.workDate)}" required></label>
      <label>Hours worked<input class="form-control" type="number" name="entryHours" min="0" step="0.25" value="${esc(entry.hours)}" required></label>
      <label>Work site<select class="form-control" name="entrySite">${siteSelect(entry.siteId || "")}</select></label>
      <button class="btn btn-sm" type="button" data-remove-entry>Remove</button>
    </div>`;
    const body = `<div class="form-grid">
      ${existing
        ? `<div class="form-field"><label>Worker</label><select class="form-control" name="workerId" disabled>${workerOptions}</select><input type="hidden" name="workerId" value="${esc(record.workerId)}"></div>`
        : field("Worker", "workerId", "", "select", { required: true, selectOptions: workerOptions })}
      ${field("Week starting Sunday", "weekStart", selectedWeek, "date", { required: true })}
      <div class="form-field"><label>Effective daily rate</label><input id="effective-rate" class="form-control" type="number" name="effectiveRate" value="${esc(record ? record.effectiveRate : "")}" readonly required><small id="rate-source" class="rate-note">Select a worker</small></div>
      <div class="section-label">Work entries</div>
      <div class="form-field full"><div class="notice">Enter actual hours worked after subtracting lunch (for example, 8 AM–5 PM less a 1-hour lunch = 8 hours). Eight hours equals one payable day unit; four hours equals 0.5 units. Special or makeup dates can be outside the regular week.</div><div id="timesheet-entries" class="timesheet-entries">${(record && record.days || []).map(entryMarkup).join("")}</div><button class="btn btn-sm" type="button" id="add-timesheet-entry">＋ Add work entry</button></div>
      <div class="section-label">Allowance and deductions</div>
      ${field("Allowance amount", "allowanceAmount", record ? record.allowanceAmount : 0, "number", { min: "0", step: "0.01" })}
      ${field("Allowance type", "allowanceType", "", "select", { selectOptions: `<option value="">Choose type</option>${["Gas", "Load", "Others"].map(item => `<option value="${item}" ${record && record.allowanceType === item ? "selected" : ""}>${item}</option>`).join("")}` })}
      ${field("Allowance note", "allowanceNote", record ? record.allowanceNote : "", "text", { placeholder: "Required when an allowance is entered" })}
      ${field("Cash advance", "cashAdvance", record ? record.cashAdvance : 0, "number", { min: "0", step: "0.01" })}
      ${field("New PCA amount", "newPcaAmount", record ? record.newPcaAmount : 0, "number", { min: "0", step: "0.01" })}
      ${field("PCA deduction", "pcaDeduction", record ? record.pcaDeduction : 0, "number", { min: "0", step: "0.01" })}
      ${field("PCA reason", "pcaReason", record ? record.pcaReason : "", "text", { full: true, placeholder: "Required when adding a PCA loan" })}
      <div class="form-field full"><div class="summary-strip" style="margin:0"><span>Hours recorded<strong id="preview-hours">0</strong></span><span>Payable day units<strong id="preview-units">0</strong></span><span>Gross labor pay<strong id="preview-gross">${money(0)}</strong></span><span>Net pay<strong id="preview-pay">${money(record ? record.totalPay : 0)}</strong></span><span>Ending PCA balance<strong id="preview-pca">${money(record ? record.resultingPcaBalance : 0)}</strong></span></div></div>
    </div>`;
    openDialog(existing ? "Edit weekly payroll" : "New weekly payroll", "Record hours by day and site, then confirm allowances and deductions.", body, existing ? "Save payroll" : "Create payroll", form => savePayrollForm(record, form), true);
    const workerInput = dialog.querySelector('[name="workerId"]');
    const rateInput = dialog.querySelector('[name="effectiveRate"]');
    const source = dialog.querySelector("#rate-source");
    const weekInput = dialog.querySelector('[name="weekStart"]');
    const entries = dialog.querySelector("#timesheet-entries");
    const addEntry = entry => {
      entries.insertAdjacentHTML("beforeend", entryMarkup(entry));
      updatePreview();
    };
    const setRate = () => {
      const selected = workerForRecord(workerInput.value);
      if (!selected) {
        source.textContent = "Select a worker";
        if (!existing) rateInput.value = "";
        return;
      }
      if (!existing || workerInput.value !== record.workerId) {
        rateInput.value = effectiveRate(selected);
      }
      source.textContent = selected.overrideRate !== "" && selected.overrideRate != null ? "Worker override" : "Position default";
    };
    const refreshWorkerOptions = () => {
      if (existing) return;
      const currentWorkerId = workerInput.value;
      const eligibleWorkers = activeWorkers().filter(worker =>
        !data.payroll.some(item => item.workerId === worker.id && item.weekStart === weekInput.value)
      );
      const selection = eligibleWorkers.some(worker => worker.id === currentWorkerId) ? currentWorkerId : "";
      workerInput.innerHTML = selectOptions(eligibleWorkers, selection, "Choose worker", item => item.name);
      setRate();
    };
    const updatePreview = () => {
      const values = new FormData(dialog.querySelector("#dialog-form"));
      const hourTotal = values.getAll("entryHours").reduce((sum, hours) => sum + number(hours), 0);
      const dayUnits = hourTotal / HOURS_PER_DAY;
      const rate = number(values.get("effectiveRate"));
      const selectedWorker = workerForRecord(workerInput.value);
      const balance = projectedPcaBalance(
        selectedWorker,
        record,
        weekInput.value,
        number(values.get("newPcaAmount")),
        number(values.get("pcaDeduction"))
      );
      const gross = dayUnits * rate;
      const pay = gross + number(values.get("allowanceAmount")) - number(values.get("cashAdvance")) - number(values.get("pcaDeduction"));
      dialog.querySelector("#preview-hours").textContent = hourTotal.toFixed(2);
      dialog.querySelector("#preview-units").textContent = dayUnits.toFixed(2);
      dialog.querySelector("#preview-gross").textContent = money(gross);
      dialog.querySelector("#preview-pay").textContent = money(Math.round(pay * 100) / 100);
      dialog.querySelector("#preview-pca").textContent = money(balance);
    };
    dialog.querySelector("#add-timesheet-entry").addEventListener("click", () => {
      const selected = workerForRecord(workerInput.value);
      addEntry({
        id: id(),
        workDate: weekInput.value || isoDate(currentWeek),
        hours: "",
        siteId: selected ? selected.siteId || "" : ""
      });
    });
    entries.addEventListener("click", event => {
      const button = event.target.closest("[data-remove-entry]");
      if (!button) return;
      button.closest("[data-entry-row]").remove();
      updatePreview();
    });
    workerInput.addEventListener("change", () => { setRate(); updatePreview(); });
    weekInput.addEventListener("change", () => {
      if (!weekInput.value) return;
      weekInput.value = isoDate(weekStart(new Date(`${weekInput.value}T00:00:00`)));
      refreshWorkerOptions();
      updatePreview();
    });
    dialog.querySelector("#dialog-form").addEventListener("input", updatePreview);
    dialog.querySelector("#dialog-form").addEventListener("change", updatePreview);
    setRate();
    updatePreview();
  }
  function savePayrollForm(existingRecord, form) {
    const workerId = String(form.get("workerId") || "");
    const person = workerForRecord(workerId);
    const startValue = String(form.get("weekStart") || "");
    if (!person || !startValue) { notify("Choose a worker and a week."); return false; }
    const week = isoDate(weekStart(new Date(`${startValue}T00:00:00`)));
    const duplicate = data.payroll.find(item => item.workerId === workerId && item.weekStart === week && item.id !== (existingRecord && existingRecord.id));
    if (duplicate) { notify("This worker already has a payroll record for that week. Edit the existing record instead."); return false; }
    const entryIds = form.getAll("entryId");
    const entryDates = form.getAll("entryDate");
    const entryHours = form.getAll("entryHours");
    const entrySites = form.getAll("entrySite");
    const days = [];
    for (let index = 0; index < entryIds.length; index++) {
      const workDate = String(entryDates[index] || "");
      const hoursValue = String(entryHours[index] || "");
      const siteId = String(entrySites[index] || "");
      if (!workDate && !hoursValue && !siteId) continue;
      const parsedDate = new Date(`${workDate}T00:00:00`);
      if (!workDate || Number.isNaN(parsedDate.getTime()) || isoDate(parsedDate) !== workDate || hoursValue === "" || number(hoursValue) < 0) {
        notify("Enter a valid work date and non-negative hours for every work entry.");
        return false;
      }
      if (siteId && !site(siteId)) { notify("Choose a valid work site or leave it blank."); return false; }
      days.push({ id: String(entryIds[index] || id()), workDate, hours: number(hoursValue), siteId });
    }
    const allowanceAmount = number(form.get("allowanceAmount"));
    const allowanceType = String(form.get("allowanceType") || "");
    const allowanceNote = String(form.get("allowanceNote") || "").trim();
    const newPcaAmount = number(form.get("newPcaAmount"));
    const pcaReason = String(form.get("pcaReason") || "").trim();
    const unchangedLegacyAllowance = existingRecord
      && allowanceAmount === number(existingRecord.allowanceAmount)
      && allowanceType === String(existingRecord.allowanceType || "")
      && allowanceNote === String(existingRecord.allowanceNote || "");
    if (allowanceAmount > 0 && (!allowanceType || !allowanceNote) && !unchangedLegacyAllowance) {
      notify("Choose an allowance type and enter a descriptive note.");
      return false;
    }
    const unchangedLegacyPca = existingRecord
      && newPcaAmount === number(existingRecord.newPcaAmount)
      && pcaReason === String(existingRecord.pcaReason || "");
    if (newPcaAmount > 0 && !pcaReason && !unchangedLegacyPca) {
      notify("Enter a reason for the new PCA loan.");
      return false;
    }
    const values = {
      workerId, weekStart: week, effectiveRate: number(form.get("effectiveRate")),
      allowanceAmount, allowanceType,
      allowanceNote, cashAdvance: number(form.get("cashAdvance")),
      newPcaAmount, pcaReason,
      pcaDeduction: number(form.get("pcaDeduction")), days
    };
    values.resultingPcaBalance = 0;
    values.totalPay = calcTotal(values);
    values.updatedAt = new Date().toISOString();
    if (existingRecord) Object.assign(existingRecord, values);
    else data.payroll.push({ ...defaultRecord(person, week), ...values });
    recalculatePca(person);
    currentWeek = new Date(`${week}T00:00:00`);
    persistAndRender(existingRecord ? "Payroll updated." : "Payroll saved.");
  }
  function showBatchEntry() {
    if (!activeWorkers().length) { notify("Add workers before starting batch entry."); return; }
    if (!data.sites.length) { notify("Add a work site before starting batch entry."); return; }
    const batchDrafts = new Map();
    const body = `<div class="batch-grid"><div class="batch-options">
      ${field("Work site", "batchSite", "", "select", { required: true, selectOptions: selectOptions(data.sites, "", "Choose site", item => item.name) })}
      ${field("Week starting Sunday", "batchWeek", isoDate(currentWeek), "date", { required: true })}
      <div class="notice">Enter attendance hours for each worker and day at this site. Eight hours equals one payable day unit. Blank days are unchanged; different sites can be entered on the same date. Enter allowances and separate shifts in the individual timesheet.</div>
      <button class="btn btn-primary" type="button" id="batch-save">Save batch payroll</button>
    </div><div class="batch-work-area">
      <div class="batch-toolbar"><div class="search-wrap"><input id="batch-search" class="search-control" placeholder="Find worker by name"></div><label class="batch-toggle"><input id="batch-show-all" type="checkbox"> Show all active workers</label><span id="batch-result-count" class="muted"></span></div>
      <div id="batch-worker-list" class="batch-workers"></div>
      <div id="batch-pagination" class="batch-pagination"></div>
    </div></div>`;
    openDialog("Batch payroll entry", "Enter weekly hours for multiple workers at one site.", body, "Save batch", form => saveBatch(form, batchDrafts), true);
    dialog.querySelector("#batch-save").addEventListener("click", () => dialog.querySelector("#dialog-form").requestSubmit());
    let batchPage = 0;
    const batchPageSize = 25;

    function currentBatchContext() {
      return {
        siteId: String(dialog.querySelector('[name="batchSite"]').value || ""),
        weekDate: String(dialog.querySelector('[name="batchWeek"]').value || ""),
        showAll: dialog.querySelector("#batch-show-all").checked,
        search: String(dialog.querySelector("#batch-search").value || "").trim().toLowerCase()
      };
    }

    function currentBatchWeek(weekDate) {
      return weekDate ? isoDate(weekStart(new Date(`${weekDate}T00:00:00`))) : "";
    }

    function draftKey(siteId, week, workerId) {
      return `${siteId}|${week}|${workerId}`;
    }

    function getBatchDraft(person, siteId, week) {
      const key = draftKey(siteId, week, person.id);
      if (!batchDrafts.has(key)) {
        const record = data.payroll.find(item => item.workerId === person.id && item.weekStart === week);
        const days = {};
        DAYS.forEach(day => {
          const date = weekdayDate(week, day);
          const matchingEntries = (record && record.days || []).filter(entry => entry.workDate === date && entry.siteId === siteId);
          days[day.key] = matchingEntries.length
            ? String(matchingEntries.reduce((sum, entry) => sum + number(entry.hours), 0))
            : "";
        });
        batchDrafts.set(key, { days });
      }
      return batchDrafts.get(key);
    }

    function captureBatchInputs() {
      const list = dialog.querySelector("#batch-worker-list");
      const siteId = list.dataset.siteId || "";
      const week = list.dataset.week || "";
      if (!siteId || !week) return;
      dialog.querySelectorAll(".batch-worker-row[data-worker-id]").forEach(row => {
        const person = worker(row.dataset.workerId);
        if (!person) return;
        const draft = getBatchDraft(person, siteId, week);
        DAYS.forEach(day => {
          draft.days[day.key] = row.querySelector(`[data-day="${day.key}"]`).value;
        });
      });
    }

    function renderBatchWorkers() {
      const context = currentBatchContext();
      const week = currentBatchWeek(context.weekDate);
      const list = dialog.querySelector("#batch-worker-list");
      const pagination = dialog.querySelector("#batch-pagination");
      const count = dialog.querySelector("#batch-result-count");
      list.dataset.siteId = context.siteId;
      list.dataset.week = week;
      if (!context.siteId || !week) {
        list.innerHTML = emptyState("Choose a site and week", "Select the site where the hours were worked to find workers and enter hours.");
        pagination.innerHTML = "";
        count.textContent = "";
        return;
      }
      const matches = activeWorkers().filter(person => {
        const record = data.payroll.find(item => item.workerId === person.id && item.weekStart === week);
        const hasHoursAtSite = record && (record.days || []).some(entry => entry.siteId === context.siteId && number(entry.hours) > 0);
        const belongsAtSite = person.siteId === context.siteId || hasHoursAtSite;
        return (context.showAll || belongsAtSite) && (!context.search || person.name.toLowerCase().includes(context.search));
      }).sort((a, b) => a.name.localeCompare(b.name));
      const pages = Math.max(1, Math.ceil(matches.length / batchPageSize));
      batchPage = Math.min(batchPage, pages - 1);
      const pageWorkers = matches.slice(batchPage * batchPageSize, (batchPage + 1) * batchPageSize);
      count.textContent = `${matches.length} worker${matches.length === 1 ? "" : "s"}`;
      if (!matches.length) {
        list.innerHTML = emptyState("No workers found for this site", context.showAll ? "Try another search." : "Try searching by name or include all active workers.");
      } else {
        const header = `<div class="batch-worker-row header"><span>Worker</span>${DAYS.map(day => {
          const workDate = weekdayDate(week, day);
          const date = new Date(`${workDate}T12:00:00`);
          const shortDate = date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
          return `<span class="batch-day-heading" title="${esc(fmtDate(workDate))}">${day.short}<small>${esc(shortDate)}</small></span>`;
        }).join("")}</div>`;
        const rows = pageWorkers.map(person => {
          const draft = getBatchDraft(person, context.siteId, week);
          const title = (position(person.positionId) || {}).title || "No position";
          return `<div class="batch-worker-row" data-worker-id="${esc(person.id)}">
            <div class="worker-cell">${workerAvatar(person)}<span><strong>${esc(person.name)}</strong><small>${esc(title)}</small></span></div>
            ${DAYS.map(day => `<input type="number" min="0" step="0.25" value="${esc(draft.days[day.key])}" placeholder="—" data-day="${day.key}" aria-label="${day.short} hours for ${esc(person.name)}">`).join("")}
          </div>`;
        }).join("");
        list.innerHTML = `${header}${rows}`;
      }
      pagination.innerHTML = `<span>Page ${matches.length ? batchPage + 1 : 0} of ${matches.length ? pages : 0}</span><div><button class="btn btn-sm" type="button" data-batch-page="-1" ${batchPage === 0 ? "disabled" : ""}>← Previous</button><button class="btn btn-sm" type="button" data-batch-page="1" ${batchPage >= pages - 1 ? "disabled" : ""}>Next →</button></div>`;
    }

    dialog.querySelector('[name="batchSite"]').addEventListener("change", () => {
      captureBatchInputs();
      batchPage = 0;
      renderBatchWorkers();
    });
    dialog.querySelector('[name="batchWeek"]').addEventListener("change", () => {
      captureBatchInputs();
      batchPage = 0;
      renderBatchWorkers();
    });
    dialog.querySelector("#batch-search").addEventListener("input", () => {
      captureBatchInputs();
      batchPage = 0;
      renderBatchWorkers();
    });
    dialog.querySelector("#batch-show-all").addEventListener("change", () => {
      captureBatchInputs();
      batchPage = 0;
      renderBatchWorkers();
    });
    dialog.querySelector("#batch-worker-list").addEventListener("input", event => {
      const input = event.target;
      const row = input.closest(".batch-worker-row[data-worker-id]");
      if (!row) return;
      const context = currentBatchContext();
      const week = currentBatchWeek(context.weekDate);
      const draft = getBatchDraft(worker(row.dataset.workerId), context.siteId, week);
      if (input.dataset.day) draft.days[input.dataset.day] = input.value;
    });
    dialog.querySelector("#batch-pagination").addEventListener("click", event => {
      const button = event.target.closest("[data-batch-page]");
      if (!button || button.disabled) return;
      captureBatchInputs();
      batchPage += Number(button.dataset.batchPage);
      renderBatchWorkers();
    });
    renderBatchWorkers();
  }
  function saveBatch(form, batchDrafts) {
    const siteId = String(form.get("batchSite") || "");
    const weekDate = String(form.get("batchWeek") || "");
    if (!site(siteId) || !weekDate) { notify("Choose a site and week."); return false; }
    const week = isoDate(weekStart(new Date(`${weekDate}T00:00:00`)));
    const allWorkerDrafts = new Map();
    const keyPrefix = `${siteId}|${week}|`;
    batchDrafts.forEach((draft, draftId) => {
      if (!draftId.startsWith(keyPrefix)) return;
      const person = worker(draftId.slice(keyPrefix.length));
      if (person) allWorkerDrafts.set(person.id, { person, draft });
    });

    let saved = 0;
    let skipped = 0;
    allWorkerDrafts.forEach(({ person, draft }) => {
      const hasEntry = DAYS.some(day => draft.days[day.key] !== "");
      if (!hasEntry) { skipped++; return; }
      let record = data.payroll.find(item => item.workerId === person.id && item.weekStart === week);
      if (!record) {
        record = defaultRecord(person, week);
        data.payroll.push(record);
      }
      DAYS.forEach(day => {
        const value = draft.days[day.key];
        if (value === "") return;
        const hours = number(value);
        const date = weekdayDate(week, day);
        record.days = (record.days || []).filter(entry => !(entry.workDate === date && entry.siteId === siteId));
        if (hours > 0) record.days.push({ id: id(), workDate: date, hours, siteId });
      });
      record.updatedAt = new Date().toISOString();
      record.resultingPcaBalance = number(person.pcaBalance);
      record.totalPay = calcTotal(record);
      recalculatePca(person);
      saved++;
    });
    currentWeek = new Date(`${week}T00:00:00`);
    persistAndRender(`Site batch saved: ${saved} worker${saved === 1 ? "" : "s"} updated; ${skipped} blank entries skipped.`);
  }
  function showRemoveForm(person) {
    const body = `<div class="form-grid"><div class="notice form-field full">Payroll records and worker history will be kept. The worker can be restored later.</div>${field("Removal reason", "reason", "", "textarea", { full: true, placeholder: "Reason for removal" })}</div>`;
    openDialog("Remove worker", `Remove ${person.name} from the active worker list?`, body, "Remove worker", form => {
      person.deletedAt = new Date().toISOString();
      person.removalReason = String(form.get("reason") || "").trim();
      persistAndRender("Worker removed. Their payroll history remains.");
    });
  }
  function workerHistory(person) {
    const records = data.payroll.filter(record => record.workerId === person.id).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    const body = `<div class="panel-header"><div><h2>${esc(person.name)}</h2><p>${esc((position(person.positionId) || {}).title || "Position not set")} · ${esc((site(person.siteId) || {}).name || "No site")}</p></div></div>
      ${records.length ? `<div class="table-wrap"><table><thead><tr><th>Week</th><th>Hours</th><th>Day units</th><th>Allowance</th><th>Cash advance</th><th>PCA deduction</th><th>Net pay</th><th></th></tr></thead><tbody>${records.map(record => {
        const hours = recordHours(record);
        return `<tr><td>${esc(weekLabel(new Date(`${record.weekStart}T00:00:00`)))}</td><td>${hours.toFixed(2)}</td><td>${recordUnits(record).toFixed(2)}</td><td>${money(record.allowanceAmount)}</td><td>${money(record.cashAdvance)}</td><td>${money(record.pcaDeduction)}</td><td class="pay-value">${money(record.totalPay)}</td><td><button class="icon-btn" data-action="edit-payroll" data-id="${esc(record.id)}">✎</button></td></tr>`;
      }).join("")}</tbody></table></div>` : emptyState("No payroll history", "Payroll records for this worker will appear here.")}`;
    openDialog("Worker pay history", "Previous weekly timesheets and pay records.", body, "Close", () => true, true);
    dialog.querySelector(".form-actions").innerHTML = `<button type="button" class="btn btn-primary" data-dialog-cancel>Close</button>`;
    dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  }
  function printRecords(records) {
    if (!records.length) { notify("No payroll records to print."); return; }
    const html = records.map(record => {
      const person = workerForRecord(record.workerId);
      const job = position(person && person.positionId);
      const daysRows = (record.days || []).slice().sort((a, b) => a.workDate.localeCompare(b.workDate)).map(entry => {
        const workSite = site(entry.siteId);
        const units = number(entry.hours) / HOURS_PER_DAY;
        return `<tr><td>${esc(fmtDate(entry.workDate))}</td><td>${number(entry.hours).toFixed(2)}</td><td>${units.toFixed(2)}</td><td>${esc(workSite ? workSite.name : "—")}</td><td>${money(units * number(record.effectiveRate))}</td></tr>`;
      }).join("");
      const totalHours = recordHours(record);
      const totalUnits = recordUnits(record);
      const grossPay = totalUnits * number(record.effectiveRate);
      return `<article class="slip"><header><div><h1>AMR Payroll</h1><p>Worker payslip</p></div><strong>${esc(weekLabel(new Date(`${record.weekStart}T00:00:00`)))}</strong></header>
        <section class="identity"><div><small>WORKER</small><strong>${esc(person ? person.name : "Removed worker")}</strong></div><div><small>POSITION</small><strong>${esc(job ? job.title : "—")}</strong></div><div><small>DAILY RATE</small><strong>${money(record.effectiveRate)}</strong></div></section>
        <table><thead><tr><th>Work date</th><th>Hours</th><th>Day units</th><th>Site</th><th>Labor cost</th></tr></thead><tbody>${daysRows}<tr><th>Total</th><th>${totalHours.toFixed(2)}</th><th>${totalUnits.toFixed(2)}</th><th></th><th>${money(grossPay)}</th></tr></tbody></table>
        <section class="pay-summary"><div><span>Gross labor pay (${totalHours.toFixed(2)} hours ÷ 8 × ${money(record.effectiveRate)} daily rate)</span><strong>${money(grossPay)}</strong></div><div><span>Allowance${record.allowanceType ? ` · ${esc(record.allowanceType)}` : ""}${record.allowanceNote ? ` · ${esc(record.allowanceNote)}` : ""}</span><strong>+ ${money(record.allowanceAmount)}</strong></div><div><span>Cash advance</span><strong>− ${money(record.cashAdvance)}</strong></div><div><span>PCA deduction${record.pcaReason ? ` · ${esc(record.pcaReason)}` : ""}</span><strong>− ${money(record.pcaDeduction)}</strong></div><div class="net"><span>Net pay</span><strong>${money(record.totalPay)}</strong></div><div><span>Ending PCA balance</span><strong>${money(record.resultingPcaBalance)}</strong></div></section>
        <footer><span>Worker signature: _______________________</span><span>Received on: ______________</span></footer></article>`;
    }).join("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) { notify("Allow pop-ups to print payslips."); return; }
    printWindow.document.write(`<!doctype html><html><head><title>AMR Payroll Payslips</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17233b;margin:0;padding:24px}.slip{max-width:760px;margin:0 auto 35px;padding:24px;border:1px solid #dfe3eb;page-break-after:always}.slip:last-child{page-break-after:auto}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #6656d9;padding-bottom:12px;margin-bottom:16px}h1{font-size:21px;margin:0 0 4px}header p{font-size:11px;color:#78849a;margin:0}header>strong{font-size:12px}.identity{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:17px}.identity small{display:block;color:#8792a5;font-size:9px;margin-bottom:5px}.identity strong{font-size:12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{text-align:left;padding:7px;border-bottom:1px solid #e9edf3}th{color:#647188}.pay-summary{width:65%;margin:16px 0 10px auto}.pay-summary div{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eef0f4;font-size:11px}.pay-summary .net{font-size:15px;font-weight:bold;border-top:2px solid #17233b;border-bottom:2px solid #17233b;padding:10px 0}.slip footer{display:flex;justify-content:space-between;font-size:10px;margin-top:30px;color:#66738a}@media print{body{padding:0}.slip{border:0;margin:0 auto;padding:10px;min-height:96vh}}
    </style></head><body>${html}<script>window.onload=function(){window.print()}<\/script></body></html>`);
    printWindow.document.close();
  }
  function handleAction(button) {
    const action = button.dataset.action;
    const record = data.payroll.find(item => item.id === button.dataset.id);
    const person = worker(button.dataset.id);
    if (action === "week-prev" || action === "week-next") {
      currentWeek.setDate(currentWeek.getDate() + (action === "week-prev" ? -7 : 7)); render(); return;
    }
    if (action === "retry-load") { initializeData(); return; }
    if (action === "new-payroll") { showPayrollForm(null); return; }
    if (action === "add-worker") { showWorkerForm(null); return; }
    if (action === "edit-worker" && person) { showWorkerForm(person); return; }
    if (action === "remove-worker" && person) { showRemoveForm(person); return; }
    if (action === "worker-history" && person) { workerHistory(person); return; }
    if (action === "restore-worker" && person) { person.deletedAt = null; person.removalReason = ""; persistAndRender("Worker restored."); return; }
    if (action === "add-position") { showPositionForm(null); return; }
    if (action === "edit-position") { showPositionForm(position(button.dataset.id)); return; }
    if (action === "delete-position") {
      const job = position(button.dataset.id);
      if (data.workers.some(item => item.positionId === button.dataset.id)) { notify("This position is assigned to workers and cannot be deleted."); return; }
      if (job && window.confirm(`Delete the ${job.title} position?`)) { data.positions = data.positions.filter(item => item.id !== job.id); persistAndRender("Position deleted."); }
      return;
    }
    if (action === "add-site") { showSiteForm(null); return; }
    if (action === "edit-site") { showSiteForm(site(button.dataset.id)); return; }
    if (action === "delete-site") {
      const workSite = site(button.dataset.id);
      if (data.workers.some(item => item.siteId === button.dataset.id)) { notify("This site is assigned to workers and cannot be deleted."); return; }
      if (data.payroll.some(item => (item.days || []).some(entry => entry.siteId === button.dataset.id))) { notify("This site is used in payroll history and cannot be deleted."); return; }
      if (workSite && window.confirm(`Delete the ${workSite.name} site?`)) { data.sites = data.sites.filter(item => item.id !== workSite.id); persistAndRender("Work site deleted."); }
      return;
    }
    if (action === "edit-payroll" && record) { showPayrollForm(record); return; }
    if (action === "delete-payroll" && record && window.confirm(`Delete ${workerName(record)}’s payroll record for this week?`)) {
      data.payroll = data.payroll.filter(item => item.id !== record.id);
      const owner = workerForRecord(record.workerId);
      if (owner) recalculatePca(owner);
      persistAndRender("Payroll record deleted.");
      return;
    }
    if (action === "print-record" && record) { printRecords([record]); return; }
    if (action === "print-selected") {
      const selected = [...document.querySelectorAll(".record-check:checked")].map(input => data.payroll.find(item => item.id === input.value)).filter(Boolean);
      printRecords(selected); return;
    }
    if (action === "print-all") { printRecords(getRecords()); return; }
    if (action === "batch-entry") { showBatchEntry(); return; }
    if (action === "clear-pay-filters") { activeFilters = { worker: "", position: "", site: "", from: "", to: "", pca: false }; render(); return; }
  }
  document.getElementById("navigation").addEventListener("click", event => {
    const button = event.target.closest("[data-page]");
    if (button) switchPage(button.dataset.page);
  });
  authScreen.addEventListener("submit", event => {
    if (event.target.id !== "auth-form") return;
    event.preventDefault();
    submitAuthForm(event.target);
  });
  document.getElementById("logout-button").addEventListener("click", signOut);
  pageContent.addEventListener("click", event => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) { switchPage(pageButton.dataset.page); return; }
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) handleAction(actionButton);
  });
  pageContent.addEventListener("input", event => {
    if (event.target.id === "worker-search") {
      const start = event.target.selectionStart;
      const end = event.target.selectionEnd;
      render();
      const input = document.getElementById("worker-search");
      input.focus(); input.setSelectionRange(start, end);
    }
    if (event.target.id === "pay-filter-from") { activeFilters.from = event.target.value; render(); }
    if (event.target.id === "pay-filter-to") { activeFilters.to = event.target.value; render(); }
  });
  pageContent.addEventListener("change", event => {
    const target = event.target;
    if (target.id === "worker-site-filter" || target.id === "worker-position-filter") { render(); return; }
    if (target.id === "pay-filter-worker") activeFilters.worker = target.value;
    if (target.id === "pay-filter-position") activeFilters.position = target.value;
    if (target.id === "pay-filter-site") activeFilters.site = target.value;
    if (target.id === "pay-filter-pca") activeFilters.pca = target.checked;
    if (target.id && target.id.startsWith("pay-filter-")) render();
  });
  function initializeData() {
    dataLoading = true;
    dataLoadError = "";
    render();
    loadData().then(render).catch(error => {
      console.error("Could not load payroll data.", error);
      if (error.status === 401) return;
      dataLoading = false;
      dataLoadError = error.message || "Check the PHP server and MySQL configuration.";
      render();
    });
  }
  initializeAuth();
}());
