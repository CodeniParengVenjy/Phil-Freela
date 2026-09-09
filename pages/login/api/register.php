<?php

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(405, array(
        'success' => false,
        'message' => 'Method not allowed.'
    ));
}

$input = getRequestData();

$fullName = isset($input['fullName']) ? trim((string)$input['fullName']) : '';
$username = isset($input['username']) ? trim((string)$input['username']) : '';
$email = isset($input['email']) ? trim((string)$input['email']) : '';
$password = isset($input['password']) ? (string)$input['password'] : '';
$gender = isset($input['gender']) ? trim((string)$input['gender']) : '';

if ($fullName === '' || $username === '' || $email === '' || $password === '' || $gender === '') {
    jsonResponse(422, array(
        'success' => false,
        'message' => 'Please complete all fields.'
    ));
}

if (strlen($fullName) > 100) {
    jsonResponse(422, array(
        'success' => false,
        'message' => 'Full Name must not exceed 100 characters.'
    ));
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(422, array(
        'success' => false,
        'message' => 'Invalid email format.'
    ));
}

if (strlen($username) > 60) {
    jsonResponse(422, array(
        'success' => false,
        'message' => 'Username is too long.'
    ));
}

$passwordError = getPasswordStrengthError($password);
if ($passwordError !== '') {
    jsonResponse(422, array(
        'success' => false,
        'message' => $passwordError
    ));
}

if (!in_array($gender, array('male', 'female'), true)) {
    jsonResponse(422, array(
        'success' => false,
        'message' => 'Gender must be male or female.'
    ));
}

$pdo = getPdo();

$existsStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email OR username = :username LIMIT 1');
$existsStmt->execute(array(
    ':email' => strtolower($email),
    ':username' => $username
));

if ($existsStmt->fetch()) {
    jsonResponse(409, array(
        'success' => false,
        'message' => 'Email or username already exists.'
    ));
}

$passwordHash = hashPasswordCompat($password);

$insertStmt = $pdo->prepare('INSERT INTO users (full_name, username, email, password_hash, gender) VALUES (:full_name, :username, :email, :password_hash, :gender)');
$insertStmt->execute(array(
    ':full_name' => $fullName,
    ':username' => $username,
    ':email' => strtolower($email),
    ':password_hash' => $passwordHash,
    ':gender' => $gender
));

session_start();
$_SESSION['user_id'] = (int)$pdo->lastInsertId();
$_SESSION['user_email'] = strtolower($email);
$_SESSION['username'] = $username;
$_SESSION['full_name'] = $fullName;

jsonResponse(201, array(
    'success' => true,
    'message' => 'Account created successfully.',
    'user' => array(
        'id' => (int)$_SESSION['user_id'],
        'username' => $username,
        'fullName' => $fullName,
        'email' => strtolower($email),
        'gender' => $gender
    )
));
