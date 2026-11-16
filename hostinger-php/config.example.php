<?php
// Copia este archivo como config.php (preferentemente fuera de public_html, o protegido por .htaccess)
// Nunca subas credenciales reales al repositorio.

return [
    'db_host' => '127.0.0.1',
    'db_port' => '3306',
    'db_name' => 'u000000000_qrlav',
    'db_user' => 'u000000000_qrlav_user',
    'db_pass' => 'REEMPLAZAR_EN_SERVIDOR',
    'db_charset' => 'utf8mb4',

    // Ruta privada fuera de public_html (recomendado en Hostinger: dirname(__DIR__) . '/qrlav_private')
    'private_storage_dir' => __DIR__ . '/storage/private_files',
    'chunk_storage_dir' => __DIR__ . '/storage/chunks',

    // Cuota de almacenamiento (por defecto 1 GB; ajustar según plan Hostinger)
    'max_storage_bytes' => 1073741824,

    // Seguridad de sesiones
    'idle_timeout_sec' => 1800,
    'absolute_timeout_sec' => 86400,
    'rate_limit_window_sec' => 900,
    'rate_limit_max_attempts' => 8,
];
