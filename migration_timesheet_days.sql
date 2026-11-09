USE amr_payroll;

-- Run this preflight first. If it returns any rows, assign the intended date to
-- each legacy extra-day entry before continuing; the old schema allowed no date.
SELECT id, week_start, other_hours, other_site_id
FROM weekly_timesheets
WHERE (other_hours <> 0 OR other_site_id IS NOT NULL)
  AND other_date IS NULL;

CREATE TABLE IF NOT EXISTS timesheet_days (
  id VARCHAR(40) NOT NULL,
  timesheet_id VARCHAR(40) NOT NULL,
  work_date DATE NOT NULL,
  hours DECIMAL(7,2) NOT NULL DEFAULT 0,
  site_id VARCHAR(40) NULL,
  PRIMARY KEY (timesheet_id, id),
  CONSTRAINT fk_timesheet_days_timesheet FOREIGN KEY (timesheet_id) REFERENCES weekly_timesheets(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_timesheet_days_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_timesheet_days_date (timesheet_id, work_date),
  INDEX idx_timesheet_days_site_date (site_id, work_date)
) ENGINE=InnoDB;

START TRANSACTION;

-- Legacy week_start is Monday: Monday is offset 0, and Sunday is offset 6.
INSERT INTO timesheet_days (id, timesheet_id, work_date, hours, site_id)
SELECT LOWER(SHA1(CONCAT(id, ':legacy:sunday'))), id, DATE_ADD(week_start, INTERVAL 6 DAY), sunday_hours, sunday_site_id
FROM weekly_timesheets
WHERE sunday_hours <> 0 OR sunday_site_id IS NOT NULL
UNION ALL
SELECT LOWER(SHA1(CONCAT(id, ':legacy:monday'))), id, DATE_ADD(week_start, INTERVAL 0 DAY), monday_hours, monday_site_id
FROM weekly_timesheets
WHERE monday_hours <> 0 OR monday_site_id IS NOT NULL
UNION ALL
SELECT LOWER(SHA1(CONCAT(id, ':legacy:tuesday'))), id, DATE_ADD(week_start, INTERVAL 1 DAY), tuesday_hours, tuesday_site_id
FROM weekly_timesheets
WHERE tuesday_hours <> 0 OR tuesday_site_id IS NOT NULL
UNION ALL
SELECT LOWER(SHA1(CONCAT(id, ':legacy:wednesday'))), id, DATE_ADD(week_start, INTERVAL 2 DAY), wednesday_hours, wednesday_site_id
FROM weekly_timesheets
WHERE wednesday_hours <> 0 OR wednesday_site_id IS NOT NULL
UNION ALL
SELECT LOWER(SHA1(CONCAT(id, ':legacy:thursday'))), id, DATE_ADD(week_start, INTERVAL 3 DAY), thursday_hours, thursday_site_id
FROM weekly_timesheets
WHERE thursday_hours <> 0 OR thursday_site_id IS NOT NULL
UNION ALL
SELECT LOWER(SHA1(CONCAT(id, ':legacy:friday'))), id, DATE_ADD(week_start, INTERVAL 4 DAY), friday_hours, friday_site_id
FROM weekly_timesheets
WHERE friday_hours <> 0 OR friday_site_id IS NOT NULL
UNION ALL
SELECT LOWER(SHA1(CONCAT(id, ':legacy:saturday'))), id, DATE_ADD(week_start, INTERVAL 5 DAY), saturday_hours, saturday_site_id
FROM weekly_timesheets
WHERE saturday_hours <> 0 OR saturday_site_id IS NOT NULL
UNION ALL
SELECT LOWER(SHA1(CONCAT(id, ':legacy:other'))), id, other_date, other_hours, other_site_id
FROM weekly_timesheets
WHERE other_date IS NOT NULL
  AND (other_hours <> 0 OR other_site_id IS NOT NULL);

-- Legacy records used Monday-to-Sunday periods. Normalize the summary key to
-- Sunday while preserving the original dates, including the legacy Sunday
-- entry, which remains a dated special entry after the new week boundary.
UPDATE weekly_timesheets
SET week_start = DATE_SUB(week_start, INTERVAL 1 DAY)
WHERE WEEKDAY(week_start) = 0;

COMMIT;

-- Verify migrated row counts and hours before running migration_timesheet_days_cleanup.sql.
SELECT COUNT(*) AS migrated_day_entries, COALESCE(SUM(hours), 0) AS migrated_hours
FROM timesheet_days;
