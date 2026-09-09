<?php
// Reuses the shared DB connection, hashing and response helpers from the user auth API.
require_once __DIR__ . '/../../login/api/db.php';

function startAdminSession()
{
    // Distinct cookie name so an admin session never collides with a regular user session.
    session_name('PHILFREELA_ADMIN');
    session_start();
}

function requireAdmin()
{
    startAdminSession();

    if (!isset($_SESSION['admin_id']) || (int)$_SESSION['admin_id'] <= 0) {
        jsonResponse(401, array(
            'success' => false,
            'message' => 'Admin login required.'
        ));
    }

    return (int)$_SESSION['admin_id'];
}
