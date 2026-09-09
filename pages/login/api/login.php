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

$userStmt = $pdo->prepare('SELECT id, email, username, full_name, password_hash FROM users WHERE email = :email LIMIT 1');
$userStmt->execute(array(':email' => strtolower($email)));
$user = $userStmt->fetch();

if (!$user) {
    jsonResponse(401, array(
        'success' => false,
        'message' => 'Invalid credentials.'
    ));
}

if (!verifyPasswordCompat($password, (string)$user['password_hash'])) {
    jsonResponse(401, array(
        'success' => false,
        'message' => 'Invalid credentials.'
    ));
}

session_start();
$_SESSION['user_id'] = (int)$user['id'];
$_SESSION['user_email'] = (string)$user['email'];
$_SESSION['username'] = (string)$user['username'];
$_SESSION['full_name'] = (string)$user['full_name'];

jsonResponse(200, array(
    'success' => true,
    'message' => 'Signed in successfully.',
    'user' => array(
        'id' => (int)$user['id'],
        'username' => (string)$user['username'],
        'fullName' => (string)$user['full_name'],
        'email' => (string)$user['email']
    )
));
