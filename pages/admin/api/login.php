<?php
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(405, array(
        'success' => false,
        'message' => 'Method not allowed.'
    ));
}

$input = getRequestData();

$email = isset($input['email']) ? trim((string)$input['email']) : '';
$password = isset($input['password']) ? (string)$input['password'] : '';

if ($email === '' || $password === '') {
    jsonResponse(422, array(
        'success' => false,
        'message' => 'Email and password are required.'
    ));
}

$pdo = getPdo();

$stmt = $pdo->prepare('SELECT id, email, username, full_name, password_hash FROM admins WHERE email = :email LIMIT 1');
$stmt->execute(array(':email' => strtolower($email)));
$admin = $stmt->fetch();

if (!$admin || !verifyPasswordCompat($password, (string)$admin['password_hash'])) {
    jsonResponse(401, array(
        'success' => false,
        'message' => 'Invalid credentials.'
    ));
}

startAdminSession();
$_SESSION['admin_id'] = (int)$admin['id'];
$_SESSION['admin_username'] = (string)$admin['username'];
$_SESSION['admin_full_name'] = (string)$admin['full_name'];

jsonResponse(200, array(
    'success' => true,
    'message' => 'Signed in successfully.',
    'admin' => array(
        'id' => (int)$admin['id'],
        'username' => (string)$admin['username'],
        'fullName' => (string)$admin['full_name'],
        'email' => (string)$admin['email']
    )
));
