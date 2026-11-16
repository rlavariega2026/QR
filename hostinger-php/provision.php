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
    $reason = $error instanceof PDOException ? match ((int)($error->errorInfo[1] ?? 0)) {
        1044 => 'El usuario de MySQL no tiene acceso a la base.',
        1045 => 'MySQL rechazó el usuario o la contraseña.',
        1049 => 'El nombre de la base MySQL no existe en este servidor.',
        2002, 2003, 2005 => 'PHP no pudo conectar con el servidor MySQL.',
        default => 'MySQL devolvió un error de configuración o esquema.',
    } : 'Revisa las extensiones PHP y los permisos del almacenamiento.';
    qrlav_json(['error'=>$reason], 503);
}
