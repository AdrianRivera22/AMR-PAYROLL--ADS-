# AMR Payroll

AMR Payroll uses Core PHP, MySQL, HTML, CSS, and vanilla JavaScript. No framework or frontend package installation is required.

## Requirements

- PHP 8.1+ with PDO MySQL enabled
- MySQL 8.0+ (or a compatible MySQL server)

## Database setup

1. Create a MySQL account for the app, or use your local development account.
2. Run `schema.sql` in MySQL or phpMyAdmin. It creates the `amr_payroll` database and its tables.
3. Configure the database connection using environment variables:
   - `AMR_DB_HOST` (defaults to `127.0.0.1`)
   - `AMR_DB_PORT` (defaults to `3306`)
   - `AMR_DB_NAME` (defaults to `amr_payroll`)
   - `AMR_DB_USER` (defaults to `root`)
   - `AMR_DB_PASSWORD` (defaults to an empty password for local XAMPP development)

Use a MySQL account with access only to the `amr_payroll` database. Authentication is provided by a single administrator account. Use HTTPS before exposing the app publicly.

## Login setup

- If you have already imported `schema.sql`, run `migration_auth.sql` once in MySQL/phpMyAdmin to add the authentication table. You do not need to import the whole schema again.
- If you are setting up a new database, `schema.sql` already includes the authentication table.
- Start the PHP app and open it in your browser. The first visitor sees the one-time administrator setup form. Create an account with a valid email address and a password of at least 12 characters.
- Public registration is disabled. After setup, sign in with that administrator account. Keep the password safe; password reset and additional users are not currently provided.
- For safety, the first administrator can only be created from the same computer that runs the app. If you have a controlled remote deployment, set `AMR_ALLOW_REMOTE_SETUP=1` only for the initial setup, create the administrator, then remove the setting.
- Sign out when finished. PHP session cookies are HTTP-only and use SameSite=Lax; use HTTPS in a public deployment.

## Run locally

From this directory, start PHP's built-in development server:

```powershell
php -S 127.0.0.1:8000
```

Open `http://127.0.0.1:8000/`. Do not open the PHP page as a `file://` URL. The PHP server must be running for the MySQL API and uploads to work.

Worker photos are stored in `uploads/`. The web server needs permission to write to that directory. The supplied `.htaccess` prevents PHP execution in the photo directory when using Apache.

## Data notes

- Workers can be created without a position or site and assigned later from the worker's Edit action. Both assignment columns allow `NULL`; no database migration is needed for an existing installation created from `schema.sql`.
- Batch payroll is entered site-first: choose a site/week, search or page through workers assigned to that site, and fill hours only for days worked there. Enable "Show all active workers" to assign workers at other primary sites. Leave other-site days blank to preserve them; enter `0` to clear hours at the selected site. The same worker can be entered in batches for different sites as long as their hours are on different days.
- Timesheet weeks are saved with Monday as the week start.
- A worker's position and site are retained when removed, preserving payroll history and preventing deletion of referenced records.
- `initial_pca_balance` stores the opening balance; each timesheet stores the resulting balance snapshot.
- Payroll totals use total weekly hours multiplied by the effective worker rate, plus allowance, less cash advance and PCA deduction.
