<?php
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(405, array(
        'success' => false,
        'message' => 'Method not allowed.'
    ));
}

startAdminSession();
$_SESSION = array();

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
}

session_destroy();

jsonResponse(200, array(
    'success' => true,
    'message' => 'Signed out successfully.'
));
