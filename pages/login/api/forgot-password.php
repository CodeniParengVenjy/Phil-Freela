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
$newPassword = isset($input['newPassword']) ? (string)$input['newPassword'] : '';
$confirmPassword = isset($input['confirmPassword']) ? (string)$input['confirmPassword'] : '';

if ($email === '' || $newPassword === '' || $confirmPassword === '') {
    jsonResponse(422, array(
        'success' => false,
        'message' => 'Email and new password are required.'
    ));
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(422, array(
        'success' => false,
        'message' => 'Invalid email format.'
    ));
}

if ($newPassword !== $confirmPassword) {
    jsonResponse(422, array(
        'success' => false,
        'message' => 'Passwords do not match.'
    ));
}

$passwordError = getPasswordStrengthError($newPassword);
if ($passwordError !== '') {
    jsonResponse(422, array(
        'success' => false,
        'message' => $passwordError
    ));
}

$pdo = getPdo();

$findStmt = $pdo->prepare('SELECT id, username, full_name FROM users WHERE email = :email LIMIT 1');
$findStmt->execute(array(':email' => strtolower($email)));
$user = $findStmt->fetch();

if (!$user) {
    jsonResponse(404, array(
        'success' => false,
        'message' => 'Account not found for this email.'
    ));
}

$newHash = hashPasswordCompat($newPassword);
$updateStmt = $pdo->prepare('UPDATE users SET password_hash = :password_hash, updated_at = NOW() WHERE id = :id');
$updateStmt->execute(array(
    ':password_hash' => $newHash,
    ':id' => (int)$user['id']
));

session_start();
$_SESSION['user_id'] = (int)$user['id'];
$_SESSION['user_email'] = strtolower($email);
$_SESSION['username'] = (string)$user['username'];
$_SESSION['full_name'] = (string)$user['full_name'];

jsonResponse(200, array(
    'success' => true,
    'message' => 'Password updated successfully. You can now continue.'
));
