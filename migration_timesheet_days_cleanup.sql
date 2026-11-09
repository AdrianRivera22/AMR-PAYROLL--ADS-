USE amr_payroll;

-- Run only after applying migration_timesheet_days.sql and verifying every
-- legacy timesheet's hours and site assignments in timesheet_days.
ALTER TABLE weekly_timesheets
  DROP FOREIGN KEY fk_timesheets_sun_site,
  DROP FOREIGN KEY fk_timesheets_mon_site,
  DROP FOREIGN KEY fk_timesheets_tue_site,
  DROP FOREIGN KEY fk_timesheets_wed_site,
  DROP FOREIGN KEY fk_timesheets_thu_site,
  DROP FOREIGN KEY fk_timesheets_fri_site,
  DROP FOREIGN KEY fk_timesheets_sat_site,
  DROP FOREIGN KEY fk_timesheets_other_site,
  DROP COLUMN sunday_hours,
  DROP COLUMN monday_hours,
  DROP COLUMN tuesday_hours,
  DROP COLUMN wednesday_hours,
  DROP COLUMN thursday_hours,
  DROP COLUMN friday_hours,
  DROP COLUMN saturday_hours,
  DROP COLUMN sunday_site_id,
  DROP COLUMN monday_site_id,
  DROP COLUMN tuesday_site_id,
  DROP COLUMN wednesday_site_id,
  DROP COLUMN thursday_site_id,
  DROP COLUMN friday_site_id,
  DROP COLUMN saturday_site_id,
  DROP COLUMN other_date,
  DROP COLUMN other_hours,
  DROP COLUMN other_site_id,
  DROP COLUMN total_pay;
