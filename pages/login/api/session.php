<?php

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(405, array(
        'success' => false,
        'message' => 'Method not allowed.'
    ));
}

session_start();

if (!isset($_SESSION['user_id']) || (int)$_SESSION['user_id'] <= 0) {
    jsonResponse(200, array(
        'success' => true,
        'authenticated' => false,
        'username' => 'Guest'
    ));
}

$userId = (int)$_SESSION['user_id'];
$username = isset($_SESSION['username']) ? trim((string)$_SESSION['username']) : '';
$fullName = isset($_SESSION['full_name']) ? trim((string)$_SESSION['full_name']) : '';
$email = isset($_SESSION['user_email']) ? trim((string)$_SESSION['user_email']) : '';

if ($username === '' || $fullName === '') {
    $pdo = getPdo();
    $stmt = $pdo->prepare('SELECT username, full_name, email FROM users WHERE id = :id LIMIT 1');
    $stmt->execute(array(':id' => $userId));
    $row = $stmt->fetch();

    if ($row) {
        $username = isset($row['username']) ? (string)$row['username'] : $username;
        $fullName = isset($row['full_name']) ? (string)$row['full_name'] : $fullName;
        $email = isset($row['email']) ? (string)$row['email'] : $email;
    }
}

if ($username === '' && $email !== '') {
    $atPos = strpos($email, '@');
    $username = $atPos === false ? $email : substr($email, 0, $atPos);
}

if ($username === '') {
    $username = 'User';
}

$_SESSION['username'] = $username;
$_SESSION['full_name'] = $fullName;

jsonResponse(200, array(
    'success' => true,
    'authenticated' => true,
    'username' => $username,
    'fullName' => $fullName,
    'email' => $email
));
