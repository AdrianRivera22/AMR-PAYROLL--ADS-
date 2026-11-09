CREATE DATABASE IF NOT EXISTS amr_payroll
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE amr_payroll;

CREATE TABLE IF NOT EXISTS positions (
  id VARCHAR(40) PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  daily_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sites (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  location VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS workers (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  position_id VARCHAR(40) NULL,
  site_id VARCHAR(40) NULL,
  override_rate DECIMAL(12,2) NULL,
  pca_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  initial_pca_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  phone_number VARCHAR(50) NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  emergency_contact VARCHAR(255) NOT NULL DEFAULT '',
  photo_path VARCHAR(255) NOT NULL DEFAULT '',
  removal_reason TEXT NOT NULL,
  deleted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_workers_position FOREIGN KEY (position_id) REFERENCES positions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_workers_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_workers_name (name),
  INDEX idx_workers_deleted (deleted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS weekly_timesheets (
  id VARCHAR(40) PRIMARY KEY,
  worker_id VARCHAR(40) NOT NULL,
  week_start DATE NOT NULL,
  effective_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  allowance_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  allowance_type ENUM('Gas', 'Load', 'Others') NULL,
  allowance_note VARCHAR(255) NOT NULL DEFAULT '',
  cash_advance DECIMAL(12,2) NOT NULL DEFAULT 0,
  new_pca_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  pca_reason VARCHAR(255) NOT NULL DEFAULT '',
  pca_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
  resulting_pca_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_timesheets_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE KEY uq_worker_week (worker_id, week_start),
  INDEX idx_timesheets_week (week_start)
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS app_users (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_single_admin CHECK (id = 1)
) ENGINE=InnoDB;
