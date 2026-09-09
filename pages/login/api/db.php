<?php

function sendCorsHeaders()
{
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string)$_SERVER['HTTP_ORIGIN']) : '';

    if ($origin !== '') {
        $isLocalHttp = preg_match('/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i', $origin);
        if ($origin === 'null' || $isLocalHttp) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
            header('Vary: Origin');
        }
    }

    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
}

sendCorsHeaders();

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('HTTP/1.1 204 No Content');
    exit;
}

const DB_HOST = '127.0.0.1';
const DB_PORT = 3306;
const DB_NAME = 'capstone_system_2026';
const DB_USER = 'root';
const DB_PASS = '';

function getJsonBody()
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return array();
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : array();
}

function getRequestData()
{
    $json = getJsonBody();
    if (!empty($json)) {
        return $json;
    }

    if (!empty($_POST)) {
        return $_POST;
    }

    return array();
}

function setHttpStatus($statusCode)
{
    if (function_exists('http_response_code')) {
        http_response_code((int)$statusCode);
        return;
    }

    $labels = array(
        200 => 'OK',
        201 => 'Created',
        401 => 'Unauthorized',
        405 => 'Method Not Allowed',
        409 => 'Conflict',
        422 => 'Unprocessable Entity',
        500 => 'Internal Server Error'
    );

    $label = isset($labels[$statusCode]) ? $labels[$statusCode] : 'OK';
    header('HTTP/1.1 ' . (int)$statusCode . ' ' . $label);
}

function jsonResponse($statusCode, $payload)
{
    setHttpStatus($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function getPdo()
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8', DB_HOST, DB_PORT, DB_NAME);

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false
        ));
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    } catch (PDOException $exception) {
        jsonResponse(500, array(
            'success' => false,
            'message' => 'Database connection failed. Check DB settings in api/db.php.'
        ));
    }

    return $pdo;
}

function hashPasswordCompat($password)
{
    if (function_exists('password_hash')) {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    $salt = substr(md5(uniqid(mt_rand(), true)), 0, 12);
    $hash = hash('sha256', $salt . $password);
    return 'legacy$' . $salt . '$' . $hash;
}

function getPasswordStrengthError($password)
{
    if (strlen($password) < 8) {
        return 'Password must be at least 8 characters.';
    }

    if (!preg_match('/[A-Z]/', $password)) {
        return 'Password must contain at least 1 uppercase letter.';
    }

    if (!preg_match('/[a-z]/', $password)) {
        return 'Password must contain at least 1 lowercase letter.';
    }

    if (!preg_match('/\d/', $password)) {
        return 'Password must contain at least 1 number.';
    }

    return '';
}

function verifyPasswordCompat($password, $storedHash)
{
    if (!$storedHash) {
        return false;
    }

    if (function_exists('password_verify')) {
        return password_verify($password, $storedHash);
    }

    if (strpos($storedHash, 'legacy$') !== 0) {
        return false;
    }

    $parts = explode('$', $storedHash);
    if (count($parts) !== 3) {
        return false;
    }

    $salt = $parts[1];
    $expected = $parts[2];
    $actual = hash('sha256', $salt . $password);

    return $actual === $expected;
}
