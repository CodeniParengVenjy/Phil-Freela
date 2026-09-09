<?php
// Admin-only endpoint to list or delete regular user accounts.
require_once __DIR__ . '/db.php';

requireAdmin();

$pdo = getPdo();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT id, full_name, username, email, gender, created_at FROM users ORDER BY created_at DESC');
    jsonResponse(200, array(
        'success' => true,
        'users' => $stmt->fetchAll()
    ));
}

if ($method === 'POST' || $method === 'DELETE') {
    $input = getRequestData();
    $userId = isset($input['id']) ? (int)$input['id'] : 0;

    if ($userId <= 0) {
        jsonResponse(422, array(
            'success' => false,
            'message' => 'A valid user id is required.'
        ));
    }

    $stmt = $pdo->prepare('DELETE FROM users WHERE id = :id');
    $stmt->execute(array(':id' => $userId));

    jsonResponse(200, array(
        'success' => true,
        'message' => 'User removed.'
    ));
}

jsonResponse(405, array(
    'success' => false,
    'message' => 'Method not allowed.'
));
