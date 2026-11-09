<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
start_app_session();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function request_data(): array
{
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($payload)) {
        respond(['error' => 'Request body must be valid JSON.'], 400);
    }

    return $payload;
}

function id_list(array $rows, string $table): array
{
    $ids = [];
    foreach ($rows as $row) {
        if (!is_array($row) || !isset($row['id']) || !is_string($row['id']) || $row['id'] === '') {
            respond(['error' => 'Every ' . $table . ' record must have a valid ID.'], 400);
        }
        $ids[] = $row['id'];
    }
    if (count($ids) !== count(array_unique($ids))) {
        respond(['error' => 'Duplicate record IDs are not allowed.'], 400);
    }

    return $ids;
}

function nullable_id(mixed $value): ?string
{
    return is_string($value) && $value !== '' ? $value : null;
}

function decimal_value(mixed $value, string $label): float
{
    if (!is_numeric($value) || (float)$value < 0) {
        respond(['error' => $label . ' must be a non-negative number.'], 400);
    }
    return (float)$value;
}

function require_authenticated_user(bool $checkCsrf): void
{
    if (empty($_SESSION['user_id'])) {
        respond(['error' => 'Sign in is required to access payroll data.'], 401);
    }

    if ($checkCsrf) {
        $submitted = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        $stored = $_SESSION['csrf_token'] ?? '';
        if (!is_string($submitted) || !is_string($stored) || $stored === '' || !hash_equals($stored, $submitted)) {
            respond(['error' => 'Your session expired. Reload the page and try again.'], 403);
        }
    }
}

function normalize_photo(mixed $photo): string
{
    if (!is_string($photo) || $photo === '') {
        return '';
    }
    if (str_starts_with($photo, 'uploads/')) {
        return $photo;
    }
    if (!preg_match('#^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$#', $photo, $matches)) {
        respond(['error' => 'Worker photos must be PNG, JPEG, or WebP images.'], 400);
    }
    $contents = base64_decode($matches[2], true);
    if ($contents === false || strlen($contents) > 2 * 1024 * 1024) {
        respond(['error' => 'Worker photos must be 2 MB or smaller.'], 400);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($contents);
    $extensions = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) {
        respond(['error' => 'The uploaded file is not a supported image.'], 400);
    }

    $directory = __DIR__ . '/uploads';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to create the worker photo directory.');
    }
    $filename = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (file_put_contents($directory . '/' . $filename, $contents, LOCK_EX) === false) {
        throw new RuntimeException('Unable to store the worker photo.');
    }
    return 'uploads/' . $filename;
}

function save_data(PDO $pdo, array $payload): array
{
    foreach (['positions', 'sites', 'workers', 'payroll'] as $key) {
        if (!isset($payload[$key]) || !is_array($payload[$key])) {
            respond(['error' => 'The ' . $key . ' collection is required.'], 400);
        }
    }

    $positionIds = id_list($payload['positions'], 'positions');
    $siteIds = id_list($payload['sites'], 'sites');
    $workerIds = id_list($payload['workers'], 'workers');
    $payrollIds = id_list($payload['payroll'], 'payroll');

    $pdo->beginTransaction();
    try {
        $positionQuery = $pdo->prepare(
            'INSERT INTO positions (id, title, daily_rate) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE title = VALUES(title), daily_rate = VALUES(daily_rate)'
        );
        foreach ($payload['positions'] as $row) {
            $title = trim((string)($row['title'] ?? ''));
            if ($title === '') {
                respond(['error' => 'Position title is required.'], 400);
            }
            $positionQuery->execute([$row['id'], $title, decimal_value($row['dailyRate'] ?? null, 'Daily rate')]);
        }

        $siteQuery = $pdo->prepare(
            'INSERT INTO sites (id, name, location) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), location = VALUES(location)'
        );
        foreach ($payload['sites'] as $row) {
            $name = trim((string)($row['name'] ?? ''));
            if ($name === '') {
                respond(['error' => 'Site name is required.'], 400);
            }
            $siteQuery->execute([$row['id'], $name, trim((string)($row['location'] ?? ''))]);
        }

        $workerQuery = $pdo->prepare(
            'INSERT INTO workers
             (id, name, position_id, site_id, override_rate, pca_balance, initial_pca_balance,
              phone_number, address, emergency_contact, photo_path, removal_reason, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), position_id = VALUES(position_id),
              site_id = VALUES(site_id), override_rate = VALUES(override_rate),
              pca_balance = VALUES(pca_balance), initial_pca_balance = VALUES(initial_pca_balance),
              phone_number = VALUES(phone_number), address = VALUES(address),
              emergency_contact = VALUES(emergency_contact), photo_path = VALUES(photo_path),
              removal_reason = VALUES(removal_reason), deleted_at = VALUES(deleted_at)'
        );
        $photoPaths = [];
        foreach ($payload['workers'] as $row) {
            $name = trim((string)($row['name'] ?? ''));
            if ($name === '') {
                respond(['error' => 'Worker name is required.'], 400);
            }
            $deletedAt = !empty($row['deletedAt']) ? date('Y-m-d H:i:s', strtotime((string)$row['deletedAt'])) : null;
            $overrideRate = ($row['overrideRate'] ?? '') === '' ? null : decimal_value($row['overrideRate'], 'Override rate');
            $photoPath = normalize_photo($row['photo'] ?? '');
            $workerQuery->execute([
                $row['id'], $name, nullable_id($row['positionId'] ?? null), nullable_id($row['siteId'] ?? null),
                $overrideRate, decimal_value($row['pcaBalance'] ?? 0, 'PCA balance'),
                decimal_value($row['initialPcaBalance'] ?? $row['pcaBalance'] ?? 0, 'Initial PCA balance'),
                trim((string)($row['phone'] ?? '')), trim((string)($row['address'] ?? '')),
                trim((string)($row['emergencyContact'] ?? '')), $photoPath,
                trim((string)($row['removalReason'] ?? '')), $deletedAt,
            ]);
            if ($photoPath !== '') {
                $photoPaths[$row['id']] = $photoPath;
            }
        }

        $timesheetColumns = [
            'id', 'worker_id', 'week_start',
            'sunday_hours', 'monday_hours', 'tuesday_hours', 'wednesday_hours', 'thursday_hours', 'friday_hours', 'saturday_hours',
            'sunday_site_id', 'monday_site_id', 'tuesday_site_id', 'wednesday_site_id', 'thursday_site_id', 'friday_site_id', 'saturday_site_id',
            'other_date', 'other_hours', 'other_site_id', 'effective_rate', 'allowance_amount', 'allowance_type', 'allowance_note',
            'cash_advance', 'new_pca_amount', 'pca_reason', 'pca_deduction', 'resulting_pca_balance', 'total_pay'
        ];
        $insertColumns = implode(', ', $timesheetColumns);
        $placeholders = implode(', ', array_fill(0, count($timesheetColumns), '?'));
        $updates = implode(', ', array_map(
            static fn(string $column): string => $column . ' = VALUES(' . $column . ')',
            array_slice($timesheetColumns, 1)
        ));
        $payrollQuery = $pdo->prepare(
            "INSERT INTO weekly_timesheets ($insertColumns) VALUES ($placeholders)
             ON DUPLICATE KEY UPDATE $updates"
        );
        foreach ($payload['payroll'] as $row) {
            $weekStart = (string)($row['weekStart'] ?? '');
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $weekStart);
            if (!$date || $date->format('Y-m-d') !== $weekStart || (int)$date->format('N') !== 1) {
                respond(['error' => 'Each timesheet week must start on a valid Monday.'], 400);
            }
            $values = [$row['id'], (string)($row['workerId'] ?? ''), $weekStart];
            foreach (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as $day) {
                $values[] = decimal_value($row[$day . 'Hours'] ?? 0, ucfirst($day) . ' hours');
            }
            foreach (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as $day) {
                $values[] = nullable_id($row[$day . 'SiteId'] ?? null);
            }
            $values[] = !empty($row['otherDate']) ? (string)$row['otherDate'] : null;
            $values[] = decimal_value($row['otherHours'] ?? 0, 'Other hours');
            $values[] = nullable_id($row['otherSiteId'] ?? null);
            $values[] = decimal_value($row['effectiveRate'] ?? 0, 'Effective rate');
            $values[] = decimal_value($row['allowanceAmount'] ?? 0, 'Allowance');
            $allowanceType = (string)($row['allowanceType'] ?? '');
            $values[] = in_array($allowanceType, ['Gas', 'Load', 'Others'], true) ? $allowanceType : null;
            $values[] = trim((string)($row['allowanceNote'] ?? ''));
            $values[] = decimal_value($row['cashAdvance'] ?? 0, 'Cash advance');
            $values[] = decimal_value($row['newPcaAmount'] ?? 0, 'New PCA amount');
            $values[] = trim((string)($row['pcaReason'] ?? ''));
            $values[] = decimal_value($row['pcaDeduction'] ?? 0, 'PCA deduction');
            $values[] = decimal_value($row['resultingPcaBalance'] ?? 0, 'Resulting PCA balance');
            $values[] = (float)($row['totalPay'] ?? 0);
            $payrollQuery->execute($values);
        }

        delete_missing($pdo, 'weekly_timesheets', $payrollIds);
        delete_missing($pdo, 'sites', $siteIds);
        delete_missing($pdo, 'positions', $positionIds);
        $pdo->commit();
        return $photoPaths;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function delete_missing(PDO $pdo, string $table, array $ids): void
{
    $allowed = ['weekly_timesheets', 'sites', 'positions'];
    if (!in_array($table, $allowed, true)) {
        throw new LogicException('Unsupported table.');
    }
    if ($ids === []) {
        $pdo->exec('DELETE FROM ' . $table);
        return;
    }
    $placeholders = implode(', ', array_fill(0, count($ids), '?'));
    $statement = $pdo->prepare('DELETE FROM ' . $table . ' WHERE id NOT IN (' . $placeholders . ')');
    $statement->execute($ids);
}

try {
    $pdo = database_connection();
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        require_authenticated_user(false);
        $workers = $pdo->query(
            'SELECT id, name, position_id AS positionId, site_id AS siteId, override_rate AS overrideRate,
                    pca_balance AS pcaBalance, initial_pca_balance AS initialPcaBalance,
                    phone_number AS phone, address, emergency_contact AS emergencyContact,
                    photo_path AS photo, removal_reason AS removalReason, deleted_at AS deletedAt
             FROM workers ORDER BY name'
        )->fetchAll();
        $positions = $pdo->query('SELECT id, title, daily_rate AS dailyRate FROM positions ORDER BY title')->fetchAll();
        $sites = $pdo->query('SELECT id, name, location FROM sites ORDER BY name')->fetchAll();
        $payroll = $pdo->query(
            'SELECT id, worker_id AS workerId, week_start AS weekStart,
                    sunday_hours AS sundayHours, monday_hours AS mondayHours, tuesday_hours AS tuesdayHours,
                    wednesday_hours AS wednesdayHours, thursday_hours AS thursdayHours, friday_hours AS fridayHours,
                    saturday_hours AS saturdayHours, sunday_site_id AS sundaySiteId, monday_site_id AS mondaySiteId,
                    tuesday_site_id AS tuesdaySiteId, wednesday_site_id AS wednesdaySiteId, thursday_site_id AS thursdaySiteId,
                    friday_site_id AS fridaySiteId, saturday_site_id AS saturdaySiteId, other_date AS otherDate,
                    other_hours AS otherHours, other_site_id AS otherSiteId, effective_rate AS effectiveRate,
                    allowance_amount AS allowanceAmount, allowance_type AS allowanceType, allowance_note AS allowanceNote,
                    cash_advance AS cashAdvance, new_pca_amount AS newPcaAmount, pca_reason AS pcaReason,
                    pca_deduction AS pcaDeduction, resulting_pca_balance AS resultingPcaBalance,
                    total_pay AS totalPay, created_at AS createdAt, updated_at AS updatedAt
             FROM weekly_timesheets ORDER BY week_start DESC'
        )->fetchAll();

        foreach ($workers as &$worker) {
            $worker['overrideRate'] = $worker['overrideRate'] === null ? '' : (float)$worker['overrideRate'];
            $worker['pcaBalance'] = (float)$worker['pcaBalance'];
            $worker['initialPcaBalance'] = (float)$worker['initialPcaBalance'];
            $worker['deletedAt'] = $worker['deletedAt'] === null ? null : date(DATE_ATOM, strtotime($worker['deletedAt']));
        }
        unset($worker);
        foreach ($payroll as &$record) {
            foreach (['effectiveRate', 'allowanceAmount', 'cashAdvance', 'newPcaAmount', 'pcaDeduction', 'resultingPcaBalance', 'totalPay', 'otherHours'] as $field) {
                $record[$field] = (float)$record[$field];
            }
            foreach (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as $day) {
                $record[$day . 'Hours'] = (float)$record[$day . 'Hours'];
            }
        }
        unset($record);
        foreach ($positions as &$position) {
            $position['dailyRate'] = (float)$position['dailyRate'];
        }
        unset($position);

        respond(['workers' => $workers, 'positions' => $positions, 'sites' => $sites, 'payroll' => $payroll]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: GET, POST');
        respond(['error' => 'Method not allowed.'], 405);
    }

    require_authenticated_user(true);
    $photoPaths = save_data($pdo, request_data());
    respond(['ok' => true, 'photos' => $photoPaths]);
} catch (PDOException $error) {
    error_log('AMR payroll database error: ' . $error->getMessage());
    if ($error->getCode() === '23000') {
        respond(['error' => 'This item is still in use or references a missing worker, position, or site.'], 409);
    }
    respond(['error' => 'Database operation failed. Check the MySQL connection and schema setup.'], 500);
} catch (Throwable $error) {
    error_log('AMR payroll API error: ' . $error->getMessage());
    respond(['error' => 'The request could not be completed.'], 500);
}
