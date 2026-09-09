<?php
// One-time bootstrap: only works while the admins table is empty, then locks itself.
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(405, array(
        'success' => false,
        'message' => 'Method not allowed.'
    ));
}

$pdo = getPdo();

$countStmt = $pdo->query('SELECT COUNT(*) AS total FROM admins');
$row = $countStmt->fetch();
if ($row && (int)$row['total'] > 0) {
    jsonResponse(403, array(
        'success' => false,
        'message' => 'An admin account already exists. Setup is locked.'
    ));
}

$input = getRequestData();

$fullName = isset($input['fullName']) ? trim((string)$input['fullName']) : '';
$username = isset($input['username']) ? trim((string)$input['username']) : '';
$email = isset($input['email']) ? trim((string)$input['email']) : '';
$password = isset($input['password']) ? (string)$input['password'] : '';

if ($fullName === '' || $username === '' || $email === '' || $password === '') {
    jsonResponse(422, array(
        'success' => false,
        'message' => 'All fields are required.'
    ));
}

$passwordError = getPasswordStrengthError($password);
if ($passwordError !== '') {
    jsonResponse(422, array(
        'success' => false,
        'message' => $passwordError
    ));
}

$insertStmt = $pdo->prepare('INSERT INTO admins (full_name, username, email, password_hash) VALUES (:full_name, :username, :email, :password_hash)');
$insertStmt->execute(array(
    ':full_name' => $fullName,
    ':username' => $username,
    ':email' => strtolower($email),
    ':password_hash' => hashPasswordCompat($password)
));

jsonResponse(201, array(
    'success' => true,
    'message' => 'Admin account created. You can now sign in.'
));
