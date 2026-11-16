<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') qrlav_json(['error'=>'Ruta no disponible'], 404);
try {
    $cfg = qrlav_load_config();
} catch (Throwable $error) {
    qrlav_json(['error'=>'Ruta no disponible'], 404);
}
$secret = (string)($_SERVER['HTTP_X_QR_DEPLOY_KEY'] ?? '');
$expected = $cfg['deploy_key_hash'] ?? '';
if (!$expected || !hash_equals($expected, hash('sha256', $secret))) {
    qrlav_json(['error'=>'Ruta no disponible'], 404);
}
try {
    $pdo = qrlav_pdo($cfg);
    $lock = $pdo->query("SELECT GET_LOCK('qrlav_install_schema', 10)")->fetchColumn();
    if ((int)$lock !== 1) qrlav_json(['error'=>'Instalación en curso'], 409);
    $sql = file_get_contents(__DIR__ . '/migrations/001_initial_schema.sql');
    if ($sql === false) throw new RuntimeException('Migración ausente.');
    $pdo->exec($sql);
    foreach (['private_storage_dir', 'chunk_storage_dir'] as $key) {
        if (!is_dir($cfg[$key]) && !mkdir($cfg[$key], 0750, true) && !is_dir($cfg[$key])) {
            throw new RuntimeException('El almacenamiento privado no se pudo crear.');
        }
    }
    if ((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0) {
        $hash = $cfg['initial_admin_hash'] ?? '';
        if (!$hash) qrlav_json(['error'=>'Configura QR_ADMIN_PASSWORD en GitHub Actions.'], 422);
        $pdo->prepare("INSERT INTO users (id, username, password_hash, role, status, is_primary_superadmin, created_at, updated_at) VALUES (?, 'lavariega', ?, 'superadmin', 'active', 1, NOW(), NOW())")
            ->execute([qrlav_uuid('usr'), $hash]);
    }
    $pdo->exec("INSERT IGNORE INTO schema_migrations (name, applied_at) VALUES ('001_initial_schema', NOW())");
    $pdo->query("SELECT RELEASE_LOCK('qrlav_install_schema')");
    qrlav_json(['ok'=>true]);
} catch (Throwable $error) {
    error_log('QR initialization: ' . $error->getMessage());
    qrlav_json(['error'=>'No se pudo inicializar QR. Revisa MySQL, permisos y el registro de PHP de Hostinger.'], 503);
}
