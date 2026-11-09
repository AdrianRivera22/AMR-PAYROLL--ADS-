<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f5f7fb">
  <title>AMR Payroll</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <section id="auth-screen" class="auth-screen" hidden aria-live="polite"></section>
  <div id="app-shell" class="app-shell" hidden>
    <aside class="sidebar">
      <a class="brand" href="#" aria-label="AMR Payroll home">
        <span class="brand-mark">A</span>
        <span><strong>AMR</strong><small>PAYROLL SYSTEM</small></span>
      </a>
      <p class="nav-label">WORKSPACE</p>
      <nav id="navigation" aria-label="Main navigation">
        <button class="nav-link active" data-page="overview"><span>◫</span> Overview</button>
        <button class="nav-link" data-page="workers"><span>♙</span> Workers</button>
        <button class="nav-link" data-page="payroll"><span>▤</span> Weekly payroll</button>
        <button class="nav-link" data-page="positions"><span>▦</span> Positions</button>
        <button class="nav-link" data-page="sites"><span>⌖</span> Work sites</button>
        <button class="nav-link" data-page="deleted"><span>↶</span> Removed workers <span class="nav-count" id="deleted-count">0</span></button>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-help"><span class="help-icon">?</span><div><strong>MySQL storage</strong><small>Payroll data is saved on the server.</small></div></div>
        <div class="user-chip"><span class="user-avatar">AM</span><span><strong>AMR Admin</strong><small>Administrator</small></span><span class="user-menu">•••</span></div>
      </div>
    </aside>
    <main class="main-content">
      <header class="topbar">
        <div class="breadcrumbs"><span>Workspace</span><b>/</b><strong id="breadcrumb-current">Overview</strong></div>
        <div class="topbar-actions"><span class="today-label" id="today-label"></span><span id="signed-in-user" class="signed-in-user"></span><button id="logout-button" class="btn btn-sm" type="button">Sign out</button></div>
      </header>
      <section id="page-content" class="page-content" aria-live="polite"></section>
    </main>
  </div>
  <dialog id="app-dialog" class="app-dialog"></dialog>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <script src="app.js"></script>
</body>
</html>
