<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/bootstrap.php';

$lockFile = __DIR__ . '/installed.lock';
if (is_file($lockFile)) {
    http_response_code(403);
    echo 'La instalación ya fue completada. Elimina o bloquea install.php por seguridad.';
    exit;
}

$error = null;
$success = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $password = (string)($_POST['password'] ?? '');
    $confirm = (string)($_POST['confirm'] ?? '');
    if (strlen($password) < 8) {
        $error = 'La contraseña debe tener al menos 8 caracteres.';
    } elseif ($password !== $confirm) {
        $error = 'Las contraseñas no coinciden.';
    } else {
        try {
            $cfg = qrlav_load_config();
            $pdo = qrlav_pdo($cfg);

            // Ejecutar esquema inicial
            $sql = file_get_contents(__DIR__ . '/migrations/001_initial_schema.sql');
            if ($sql === false) {
                throw new RuntimeException('No se encontró migrations/001_initial_schema.sql');
            }
            $pdo->exec($sql);

            // Crear directorios privados
            if (!is_dir($cfg['private_storage_dir'])) mkdir($cfg['private_storage_dir'], 0750, true);
            if (!is_dir($cfg['chunk_storage_dir'])) mkdir($cfg['chunk_storage_dir'], 0750, true);

            // Verificar si ya existe superadministrador
            $cnt = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            if ($cnt === 0) {
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $now = date('Y-m-d H:i:s');
                $stmt = $pdo->prepare(
                    "INSERT INTO users (id, username, password_hash, role, status, is_primary_superadmin, created_at, updated_at)
                     VALUES (?, 'lavariega', ?, 'superadmin', 'active', 1, ?, ?)"
                );
                $stmt->execute([qrlav_uuid('usr'), $hash, $now, $now]);
            }

            $pdo->prepare("INSERT IGNORE INTO schema_migrations (name, applied_at) VALUES ('001_initial_schema', NOW())")->execute();
            file_put_contents($lockFile, 'installed:' . date('c'));
            $success = 'Instalación completada. Cuenta inicial «lavariega» lista. Ya puedes acceder a la aplicación.';
        } catch (Throwable $e) {
            $error = $e->getMessage();
        }
    }
}
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Instalador único · Generador QR LAV</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { width: 100%; max-width: 440px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    p { font-size: 14px; color: #475569; margin: 0 0 20px; }
    label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; margin-bottom: 14px; font-size: 14px; }
    button { width: 100%; padding: 11px; background: #0f172a; color: #fff; border: 0; border-radius: 10px; font-weight: 600; cursor: pointer; }
    .err { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 10px 12px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; }
    .ok { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 10px 12px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Instalación inicial · Generador QR LAV</h1>
    <p>Este instalador de un solo uso configura la base de datos y crea la cuenta principal <strong>lavariega</strong>.</p>
    <?php if ($error): ?><div class="err"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
    <?php if ($success): ?><div class="ok"><?= htmlspecialchars($success, ENT_QUOTES, 'UTF-8') ?></div><?php else: ?>
    <form method="post">
      <label>Usuario principal</label>
      <input type="text" value="lavariega" disabled />
      <label>Contraseña inicial (mínimo 8 caracteres)</label>
      <input type="password" name="password" required minlength="8" />
      <label>Confirmar contraseña</label>
      <input type="password" name="confirm" required minlength="8" />
      <button type="submit">Instalar base de datos y crear cuenta</button>
    </form>
    <?php endif; ?>
  </div>
</body>
</html>
