USE amr_payroll;

-- Run once after migrating an existing normalized database whose records use
-- Monday week starts. This preserves work dates and shifts only old Monday keys
-- to the previous Sunday; rerunning it will not shift Sunday keys again.
START TRANSACTION;

UPDATE weekly_timesheets
SET week_start = DATE_SUB(week_start, INTERVAL 1 DAY)
WHERE WEEKDAY(week_start) = 0;

COMMIT;

SELECT COUNT(*) AS non_sunday_week_starts
FROM weekly_timesheets
WHERE WEEKDAY(week_start) <> 6;
