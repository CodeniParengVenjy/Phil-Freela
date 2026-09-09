<?php
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(405, array(
        'success' => false,
        'message' => 'Method not allowed.'
    ));
}

startAdminSession();

if (!isset($_SESSION['admin_id']) || (int)$_SESSION['admin_id'] <= 0) {
    jsonResponse(200, array(
        'success' => true,
        'authenticated' => false
    ));
}

jsonResponse(200, array(
    'success' => true,
    'authenticated' => true,
    'username' => isset($_SESSION['admin_username']) ? (string)$_SESSION['admin_username'] : 'Admin',
    'fullName' => isset($_SESSION['admin_full_name']) ? (string)$_SESSION['admin_full_name'] : ''
));
