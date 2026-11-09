<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
start_app_session();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function auth_respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function auth_request_data(): array
{
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($payload)) {
        auth_respond(['error' => 'Request body must be valid JSON.'], 400);
    }
    return $payload;
}

function auth_check_csrf(): void
{
    $submitted = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $stored = $_SESSION['csrf_token'] ?? '';
    if (!is_string($submitted) || !is_string($stored) || $stored === '' || !hash_equals($stored, $submitted)) {
        auth_respond(['error' => 'Your session expired. Reload the page and try again.'], 403);
    }
}

function auth_public_user(array $user): array
{
    return ['id' => (int)$user['id'], 'name' => $user['name'], 'email' => $user['email']];
}

function auth_is_local_setup_request(): bool
{
    if (getenv('AMR_ALLOW_REMOTE_SETUP') === '1') {
        return true;
    }

    $remoteAddress = $_SERVER['REMOTE_ADDR'] ?? '';
    return in_array($remoteAddress, ['127.0.0.1', '::1'], true);
}

try {
    $pdo = database_connection();
    $userCount = (int)$pdo->query('SELECT COUNT(*) FROM app_users')->fetchColumn();
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        $user = null;
        if (!empty($_SESSION['user_id'])) {
            $statement = $pdo->prepare('SELECT id, name, email FROM app_users WHERE id = ?');
            $statement->execute([(int)$_SESSION['user_id']]);
            $user = $statement->fetch() ?: null;
            if ($user === null) {
                $_SESSION = [];
                session_regenerate_id(true);
                $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            }
        }
        auth_respond([
            'setupRequired' => $userCount === 0,
            'authenticated' => $user !== null,
            'user' => $user === null ? null : auth_public_user($user),
            'csrfToken' => $_SESSION['csrf_token'],
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: GET, POST');
        auth_respond(['error' => 'Method not allowed.'], 405);
    }

    auth_check_csrf();
    $payload = auth_request_data();
    $action = $payload['action'] ?? '';

    if ($action === 'setup') {
        $name = trim((string)($payload['name'] ?? ''));
        $email = strtolower(trim((string)($payload['email'] ?? '')));
        $password = (string)($payload['password'] ?? '');
        if (!auth_is_local_setup_request()) {
            auth_respond(['error' => 'For safety, create the first admin account on the computer running this app.'], 403);
        }
        if ($userCount > 0) {
            auth_respond(['error' => 'Admin setup is already complete. Please sign in.'], 409);
        }
        if ($name === '' || mb_strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
            auth_respond(['error' => 'Enter a name and a valid email address.'], 400);
        }
        if (strlen($password) < 12) {
            auth_respond(['error' => 'Use a password with at least 12 characters.'], 400);
        }

        try {
            $statement = $pdo->prepare('INSERT INTO app_users (id, name, email, password_hash) VALUES (1, ?, ?, ?)');
            $statement->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                auth_respond(['error' => 'Admin setup has already been completed. Please sign in.'], 409);
            }
            throw $error;
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = 1;
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        auth_respond([
            'ok' => true,
            'user' => ['id' => 1, 'name' => $name, 'email' => $email],
            'csrfToken' => $_SESSION['csrf_token'],
        ]);
    }

    if ($action === 'login') {
        $email = strtolower(trim((string)($payload['email'] ?? '')));
        $password = (string)($payload['password'] ?? '');
        $statement = $pdo->prepare('SELECT id, name, email, password_hash FROM app_users WHERE email = ? LIMIT 1');
        $statement->execute([$email]);
        $user = $statement->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) {
            auth_respond(['error' => 'Email or password is incorrect.'], 401);
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        auth_respond([
            'ok' => true,
            'user' => auth_public_user($user),
            'csrfToken' => $_SESSION['csrf_token'],
        ]);
    }

    if ($action === 'logout') {
        unset($_SESSION['user_id']);
        session_regenerate_id(true);
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        auth_respond(['ok' => true]);
    }

    auth_respond(['error' => 'Unknown authentication action.'], 400);
} catch (PDOException $error) {
    error_log('AMR payroll authentication database error: ' . $error->getMessage());
    auth_respond(['error' => 'Database operation failed. Check the MySQL connection and auth schema setup.'], 500);
} catch (Throwable $error) {
    error_log('AMR payroll authentication error: ' . $error->getMessage());
    auth_respond(['error' => 'The authentication request could not be completed.'], 500);
}
