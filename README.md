# AMR Payroll

AMR Payroll uses Core PHP, MySQL, HTML, CSS, and vanilla JavaScript. No framework or frontend package installation is required.

## Requirements

- PHP 8.1+ with PDO MySQL enabled
- MySQL 8.0+ (or a compatible MySQL server)

## Database setup

1. Create a MySQL account for the app, or use your local development account.
2. Run `schema.sql` in MySQL or phpMyAdmin. It creates the `amr_payroll` database and its tables.
   The normalized timesheet design stores each work shift in `timesheet_days`; fresh installs should use this updated schema.
3. Configure the database connection using environment variables:
   - `AMR_DB_HOST` (defaults to `127.0.0.1`)
   - `AMR_DB_PORT` (defaults to `3306`)
   - `AMR_DB_NAME` (defaults to `amr_payroll`)
   - `AMR_DB_USER` (defaults to `root`)
   - `AMR_DB_PASSWORD` (defaults to an empty password for local XAMPP development)

Use a MySQL account with access only to the `amr_payroll` database. Authentication is provided by a single administrator account. Use HTTPS before exposing the app publicly.

## Database design

See the [data architecture and normalization notes](.github/modernize/assessment/engines/facts/data-architecture.md) for the system scope, entity relationships, relational keys and delete rules, workload, and normalization analysis.

### Upgrade an existing database

Back up the database before upgrading. In MySQL or phpMyAdmin, run the preflight query at the top of `migration_timesheet_days.sql`. If it returns rows, enter the intended date for each legacy extra-day entry before continuing; the old schema allowed those dates to be blank. Then run that migration against the configured database. It creates `timesheet_days`, copies every recorded weekday/extra-day entry with its original date, hours, and site, and changes legacy Monday week starts to Sunday without deleting the old columns. The old system's Sunday entry is kept on its original date, even if it falls just outside the new Sunday-to-Saturday summary week, so historical payouts are not silently reassigned.

If you already applied the earlier `migration_timesheet_days.sql` and the database has `timesheet_days`, do not rerun its backfill. Run `migration_sunday_week_start.sql` once to convert existing Monday-start records; it leaves work dates unchanged and can be safely rerun. Verify all week starts and test the application before running `migration_timesheet_days_cleanup.sql`. The cleanup is a separate, irreversible step that removes the legacy weekday and extra-day columns and their site foreign keys. If your database name is not `amr_payroll`, update the `USE` statement in each migration script first. Do not run these migration scripts on a fresh install made from the updated `schema.sql`.

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
- Weekly payroll summary fields are stored in `weekly_timesheets`; each daily attendance entry is a `timesheet_days` row containing its date, hours worked, and optional site. A worker can have multiple entries or work sites on the same date.
- Payroll weeks run Sunday through Saturday. The app opens on the previous Sunday–Saturday week by default, since payroll is processed on Saturdays; the week controls can select another week. Batch attendance shows the date for each day. Eight recorded work hours equal one payable day unit. Gross labor pay is `(total hours ÷ 8) × the saved effective daily rate`; a 4-hour day at a 1,000 daily rate earns 500 before adjustments.
- Enter hours actually worked after subtracting unpaid lunch. For example, 8 AM–5 PM with a one-hour lunch break is 8 payable attendance hours.
- An effective rate uses the worker's override daily rate when set, otherwise the position's default daily rate. The selected rate is saved with each weekly record as a historical snapshot.
- Batch attendance entry is site-first: choose a site/week, then enter hours for each regular date and worker. Enable "Show all active workers" to include workers assigned elsewhere. Blank dates are unchanged; entering `0` clears that site's hours for the date. Use individual payroll entry for separate shifts, special/makeup dates, and financial adjustments.
- The Sites page totals attendance hours, payable day units, and gross labor cost by assigned work site. Payslips list each recorded date, hours, units, site, and labor cost.
- Individual payroll entry hides workers already processed for that week. Allowances require a type and descriptive note; a new PCA loan requires a reason.
- A worker's position and site are retained when removed, preserving payroll history and preventing deletion of referenced records.
- `initial_pca_balance` stores the opening balance; each timesheet stores the resulting balance snapshot.
- Payroll totals use total weekly hours divided by eight, multiplied by the effective daily rate, plus allowance, less cash advance and PCA deduction.
