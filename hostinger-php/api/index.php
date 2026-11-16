<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/bootstrap.php';

try {
    $cfg = qrlav_load_config();
    $pdo = qrlav_pdo($cfg);
} catch (Throwable $e) {
    error_log('QR: ' . $e->getMessage());
    qrlav_json(['error' => 'La base de datos de QR requiere configuración en Hostinger.'], 503);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$apiPos = strpos($uriPath, '/api/');
$route = $apiPos !== false ? substr($uriPath, $apiPos + 4) : $uriPath; // starts with /...

// 1. Health & Setup Status
if ($method === 'GET' && $route === '/health') {
    qrlav_json(['ok' => true, 'service' => 'generador-qr-lav-php']);
}

if ($method === 'GET' && $route === '/auth/setup-status') {
    try {
        $cnt = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    } catch (PDOException $e) {
        error_log('QR schema: ' . $e->getMessage());
        qrlav_json(['error' => 'La base de datos de QR todavía no se ha inicializado.'], 503);
    }
    if ($cnt === 0) qrlav_json(['error' => 'La cuenta inicial todavía no se ha configurado.'], 503);
    qrlav_json(['needsSetup' => false, 'defaultUsername' => 'lavariega']);
}

if ($method === 'POST' && $route === '/auth/setup') {
    qrlav_json(['error' => 'La cuenta inicial se configura durante el despliegue autorizado.'], 403);
}

// 2. Login
if ($method === 'POST' && $route === '/auth/login') {
    $body = qrlav_read_json_body();
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if ($username === '' || $password === '') {
        qrlav_json(['error' => 'Ingresa tu usuario y contraseña.'], 400);
    }

    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $rateKey = $ip . '::' . strtolower($username);
    $nowMs = (int)(microtime(true) * 1000);
    $winMs = ((int)($cfg['rate_limit_window_sec'] ?? 900)) * 1000;
    $maxAtt = (int)($cfg['rate_limit_max_attempts'] ?? 8);

    $aStmt = $pdo->prepare('SELECT attempts, first_attempt_at, locked_until FROM login_attempts WHERE attempt_key = ?');
    $aStmt->execute([$rateKey]);
    $att = $aStmt->fetch();
    if ($att && (int)$att['locked_until'] > $nowMs) {
        $mins = (int)ceil(((int)$att['locked_until'] - $nowMs) / 60000);
        qrlav_json(['error' => "Demasiados intentos fallidos. Espera {$mins} minuto(s)."], 429);
    }

    $uStmt = $pdo->prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1');
    $uStmt->execute([$username]);
    $user = $uStmt->fetch();

    if (!$user || !password_verify($password, (string)$user['password_hash'])) {
        $reset = !$att || ($nowMs - (int)$att['first_attempt_at']) > $winMs;
        $newAttempts = $reset ? 1 : ((int)$att['attempts'] + 1);
        $firstAt = $reset ? $nowMs : (int)$att['first_attempt_at'];
        $lockedUntil = $newAttempts >= $maxAtt ? ($nowMs + $winMs) : 0;
        $pdo->prepare(
            'INSERT INTO login_attempts (attempt_key, attempts, first_attempt_at, locked_until)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE attempts = VALUES(attempts), first_attempt_at = VALUES(first_attempt_at), locked_until = VALUES(locked_until)'
        )->execute([$rateKey, $newAttempts, $firstAt, $lockedUntil]);
        qrlav_json(['error' => 'Usuario o contraseña incorrectos.'], 401);
    }

    if ($user['status'] !== 'active') {
        qrlav_json(['error' => 'Esta cuenta está suspendida. Contacta al superadministrador.'], 403);
    }

    $pdo->prepare('DELETE FROM login_attempts WHERE attempt_key = ?')->execute([$rateKey]);
    $oldSid = $_COOKIE['qrlav_sid'] ?? '';
    if (is_string($oldSid) && $oldSid !== '') {
        $pdo->prepare('DELETE FROM sessions WHERE id = ?')->execute([$oldSid]);
    }

    $newSid = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(32));
    $ttlSec = (int)($cfg['absolute_timeout_sec'] ?? 86400);
    $nowIso = date('Y-m-d H:i:s');

    $pdo->prepare(
        'INSERT INTO sessions (id, user_id, csrf_token, created_at, last_activity_at, expires_at, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $newSid,
        $user['id'],
        $csrf,
        $nowMs,
        $nowMs,
        $nowMs + ($ttlSec * 1000),
        $ip,
        substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 250),
    ]);
    $pdo->prepare('UPDATE users SET last_login_at = ? WHERE id = ?')->execute([$nowIso, $user['id']]);

    qrlav_set_session_cookie($newSid, $ttlSec);
    qrlav_json([
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'role' => $user['role'],
            'status' => $user['status'],
            'isPrimarySuperadmin' => (bool)$user['is_primary_superadmin'],
            'createdAt' => $user['created_at'],
            'lastLoginAt' => $nowIso,
        ],
        'csrfToken' => $csrf,
    ]);
}

// Authenticated routes below
$session = qrlav_require_auth($pdo, $cfg);
$isMutating = in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true);
if ($isMutating) {
    qrlav_require_csrf($session);
}

if ($method === 'GET' && $route === '/auth/me') {
    qrlav_json([
        'user' => [
            'id' => $session['uid'],
            'username' => $session['username'],
            'role' => $session['role'],
            'status' => $session['status'],
            'isPrimarySuperadmin' => (bool)$session['is_primary_superadmin'],
            'createdAt' => $session['created_at'],
            'lastLoginAt' => $session['last_login_at'],
        ],
        'csrfToken' => $session['csrf_token'],
    ]);
}

if ($method === 'POST' && $route === '/auth/logout') {
    $pdo->prepare('DELETE FROM sessions WHERE id = ?')->execute([$session['sid']]);
    qrlav_clear_session_cookie();
    qrlav_json(['ok' => true]);
}

// 3. Superadmin User Administration
if (strpos($route, '/users') === 0) {
    if ($session['role'] !== 'superadmin') {
        qrlav_json(['error' => 'Acceso restringido al superadministrador.'], 403);
    }

    if ($method === 'GET' && $route === '/users') {
        $rows = $pdo->query(
            'SELECT u.id, u.username, u.role, u.status, u.is_primary_superadmin, u.created_at, u.last_login_at,
                    (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS active_sessions,
                    (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id) AS project_count
             FROM users u ORDER BY u.is_primary_superadmin DESC, u.created_at ASC'
        )->fetchAll();
        $out = array_map(fn($u) => [
            'id' => $u['id'],
            'username' => $u['username'],
            'role' => $u['role'],
            'status' => $u['status'],
            'isPrimarySuperadmin' => (bool)$u['is_primary_superadmin'],
            'createdAt' => $u['created_at'],
            'lastLoginAt' => $u['last_login_at'],
            'activeSessions' => (int)$u['active_sessions'],
            'projectCount' => (int)$u['project_count'],
        ], $rows);
        qrlav_json(['users' => $out]);
    }

    if ($method === 'POST' && $route === '/users') {
        $b = qrlav_read_json_body();
        $uname = trim((string)($b['username'] ?? ''));
        $pass = (string)($b['password'] ?? '');
        $role = ($b['role'] ?? 'user') === 'superadmin' ? 'superadmin' : 'user';
        if (!preg_match('/^[a-zA-Z0-9._-]{3,40}$/', $uname)) {
            qrlav_json(['error' => 'Nombre de usuario inválido (3-40 caracteres).'], 400);
        }
        if (strlen($pass) < 8) {
            qrlav_json(['error' => 'La contraseña debe tener al menos 8 caracteres.'], 400);
        }
        $dup = $pdo->prepare('SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)');
        $dup->execute([$uname]);
        if ($dup->fetchColumn()) {
            qrlav_json(['error' => 'Ese usuario ya existe.'], 409);
        }
        $id = qrlav_uuid('usr');
        $now = date('Y-m-d H:i:s');
        $pdo->prepare(
            "INSERT INTO users (id, username, password_hash, role, status, is_primary_superadmin, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'active', 0, ?, ?)"
        )->execute([$id, $uname, password_hash($pass, PASSWORD_DEFAULT), $role, $now, $now]);
        qrlav_json(['user' => ['id' => $id, 'username' => $uname, 'role' => $role, 'status' => 'active', 'isPrimarySuperadmin' => false, 'createdAt' => $now, 'lastLoginAt' => null, 'activeSessions' => 0, 'projectCount' => 0]], 201);
    }

    if (preg_match('#^/users/([^/]+)/revoke-sessions$#', $route, $m) && $method === 'POST') {
        $stmt = $pdo->prepare('DELETE FROM sessions WHERE user_id = ?');
        $stmt->execute([$m[1]]);
        qrlav_json(['ok' => true, 'revokedCount' => $stmt->rowCount()]);
    }

    if (preg_match('#^/users/([^/]+)$#', $route, $m)) {
        $targetId = $m[1];
        $tStmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $tStmt->execute([$targetId]);
        $target = $tStmt->fetch();
        if (!$target) qrlav_json(['error' => 'Usuario no encontrado.'], 404);

        if ($method === 'PATCH') {
            $b = qrlav_read_json_body();
            $newU = trim((string)($b['username'] ?? $target['username']));
            $newStatus = in_array($b['status'] ?? '', ['active', 'suspended'], true) ? $b['status'] : $target['status'];
            $newRole = in_array($b['role'] ?? '', ['superadmin', 'user'], true) ? $b['role'] : $target['role'];
            $newPass = (string)($b['password'] ?? '');

            if ((int)$target['is_primary_superadmin'] === 1 && ($newStatus === 'suspended' || $newRole !== 'superadmin')) {
                qrlav_json(['error' => 'La cuenta principal de superadministrador está protegida.'], 403);
            }
            if (!preg_match('/^[a-zA-Z0-9._-]{3,40}$/', $newU)) {
                qrlav_json(['error' => 'Nombre de usuario inválido.'], 400);
            }
            if ($newPass !== '' && strlen($newPass) < 8) {
                qrlav_json(['error' => 'La contraseña debe tener al menos 8 caracteres.'], 400);
            }
            $now = date('Y-m-d H:i:s');
            if ($newPass !== '') {
                $pdo->prepare('UPDATE users SET username = ?, role = ?, status = ?, password_hash = ?, updated_at = ? WHERE id = ?')
                    ->execute([$newU, $newRole, $newStatus, password_hash($newPass, PASSWORD_DEFAULT), $now, $targetId]);
            } else {
                $pdo->prepare('UPDATE users SET username = ?, role = ?, status = ?, updated_at = ? WHERE id = ?')
                    ->execute([$newU, $newRole, $newStatus, $now, $targetId]);
            }
            if ($newStatus === 'suspended' || $newPass !== '') {
                $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$targetId]);
            }
            qrlav_json(['ok' => true]);
        }

        if ($method === 'DELETE') {
            if ((int)$target['is_primary_superadmin'] === 1 || $targetId === $session['uid']) {
                qrlav_json(['error' => 'No se puede eliminar la cuenta principal ni tu sesión activa.'], 403);
            }
            $primaryId = $pdo->query('SELECT id FROM users WHERE is_primary_superadmin = 1 LIMIT 1')->fetchColumn() ?: $session['uid'];
            $pdo->beginTransaction();
            try {
                $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$targetId]);
                $pdo->prepare("UPDATE projects SET owner_id = ?, name = CONCAT(name, ' [Recuperado de ', ?, ']') WHERE owner_id = ?")
                    ->execute([$primaryId, $target['username'], $targetId]);
                $pdo->prepare('UPDATE templates SET owner_id = ? WHERE owner_id = ?')->execute([$primaryId, $targetId]);
                $pdo->prepare('UPDATE files SET owner_id = ? WHERE owner_id = ?')->execute([$primaryId, $targetId]);
                $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$targetId]);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                qrlav_json(['error' => $e->getMessage()], 500);
            }
            qrlav_json(['ok' => true]);
        }
    }
}

// 4. Projects (Mis QR)
if ($method === 'GET' && $route === '/projects') {
    $q = trim(strtolower((string)($_GET['q'] ?? '')));
    $ownerFilter = ($session['role'] === 'superadmin' && !empty($_GET['ownerId']) && $_GET['ownerId'] !== 'all') ? (string)$_GET['ownerId'] : '';
    $sql = 'SELECT p.*, u.username AS owner_username FROM projects p JOIN users u ON u.id = p.owner_id';
    $where = [];
    $params = [];
    if ($session['role'] !== 'superadmin') {
        $where[] = 'p.owner_id = ?';
        $params[] = $session['uid'];
    } elseif ($ownerFilter !== '') {
        $where[] = 'p.owner_id = ?';
        $params[] = $ownerFilter;
    }
    if ($q !== '') {
        $where[] = '(LOWER(p.name) LIKE ? OR LOWER(p.qr_type) LIKE ?)';
        $params[] = "%{$q}%";
        $params[] = "%{$q}%";
    }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY p.updated_at DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $out = array_map(fn($r) => [
        'id' => $r['id'],
        'ownerId' => $r['owner_id'],
        'ownerUsername' => $r['owner_username'],
        'name' => $r['name'],
        'qrType' => $r['qr_type'],
        'data' => json_decode((string)$r['data_json'], true),
        'design' => json_decode((string)$r['design_json'], true),
        'exportConfig' => json_decode((string)$r['export_json'], true),
        'version' => (int)$r['version'],
        'createdAt' => $r['created_at'],
        'updatedAt' => $r['updated_at'],
    ], $rows);
    qrlav_json(['projects' => $out]);
}

if ($method === 'POST' && $route === '/projects') {
    $b = qrlav_read_json_body();
    $name = trim((string)($b['name'] ?? ''));
    $qrType = trim((string)($b['qrType'] ?? ''));
    if ($name === '' || $qrType === '' || !isset($b['data'], $b['design'], $b['exportConfig'])) {
        qrlav_json(['error' => 'Datos de proyecto incompletos.'], 400);
    }
    $id = qrlav_uuid('prj');
    $now = date('Y-m-d H:i:s');
    $designJson = json_encode($b['design'], JSON_UNESCAPED_UNICODE);
    $dataJson = json_encode($b['data'], JSON_UNESCAPED_UNICODE);
    $exportJson = json_encode($b['exportConfig'], JSON_UNESCAPED_UNICODE);
    $logoFileId = $b['design']['logo']['fileId'] ?? null;

    $pdo->beginTransaction();
    $pdo->prepare(
        'INSERT INTO projects (id, owner_id, name, qr_type, data_json, design_json, export_json, logo_file_id, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
    )->execute([$id, $session['uid'], $name, $qrType, $dataJson, $designJson, $exportJson, $logoFileId, $now, $now]);
    qrlav_sync_file_refs($pdo, $cfg, 'project', $id, $designJson);
    $pdo->commit();

    qrlav_json(['project' => ['id' => $id, 'ownerId' => $session['uid'], 'ownerUsername' => $session['username'], 'name' => $name, 'qrType' => $qrType, 'data' => $b['data'], 'design' => $b['design'], 'exportConfig' => $b['exportConfig'], 'version' => 1, 'createdAt' => $now, 'updatedAt' => $now]], 201);
}

if (preg_match('#^/projects/([^/]+)/duplicate$#', $route, $m) && $method === 'POST') {
    $stmt = $pdo->prepare('SELECT * FROM projects WHERE id = ?');
    $stmt->execute([$m[1]]);
    $ex = $stmt->fetch();
    if (!$ex) qrlav_json(['error' => 'Proyecto no encontrado.'], 404);
    if ($session['role'] !== 'superadmin' && $ex['owner_id'] !== $session['uid']) qrlav_json(['error' => 'Acceso denegado.'], 403);

    $b = qrlav_read_json_body();
    $copyName = trim((string)($b['name'] ?? '')) ?: ($ex['name'] . ' (Copia)');
    $newId = qrlav_uuid('prj');
    $now = date('Y-m-d H:i:s');
    $pdo->beginTransaction();
    $pdo->prepare(
        'INSERT INTO projects (id, owner_id, name, qr_type, data_json, design_json, export_json, logo_file_id, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
    )->execute([$newId, $session['uid'], $copyName, $ex['qr_type'], $ex['data_json'], $ex['design_json'], $ex['export_json'], $ex['logo_file_id'], $now, $now]);
    qrlav_sync_file_refs($pdo, $cfg, 'project', $newId, (string)$ex['design_json']);
    $pdo->commit();

    qrlav_json(['project' => ['id' => $newId, 'ownerId' => $session['uid'], 'name' => $copyName, 'qrType' => $ex['qr_type'], 'data' => json_decode((string)$ex['data_json'], true), 'design' => json_decode((string)$ex['design_json'], true), 'exportConfig' => json_decode((string)$ex['export_json'], true), 'version' => 1, 'createdAt' => $now, 'updatedAt' => $now]], 201);
}

if (preg_match('#^/projects/([^/]+)$#', $route, $m)) {
    $pid = $m[1];
    $stmt = $pdo->prepare('SELECT * FROM projects WHERE id = ?');
    $stmt->execute([$pid]);
    $ex = $stmt->fetch();
    if (!$ex) qrlav_json(['error' => 'Proyecto no encontrado.'], 404);
    if ($session['role'] !== 'superadmin' && $ex['owner_id'] !== $session['uid']) qrlav_json(['error' => 'Sin permiso.'], 403);

    if ($method === 'PUT') {
        $b = qrlav_read_json_body();
        $expectedVer = (int)($b['expectedVersion'] ?? 0);
        if ($expectedVer > 0 && $expectedVer !== (int)$ex['version']) {
            qrlav_json(['error' => 'Conflicto de versión: modificado en otro dispositivo.', 'conflict' => true, 'serverVersion' => (int)$ex['version']], 409);
        }
        $name = trim((string)($b['name'] ?? '')) ?: $ex['name'];
        $qrType = trim((string)($b['qrType'] ?? '')) ?: $ex['qr_type'];
        $designJson = isset($b['design']) ? json_encode($b['design'], JSON_UNESCAPED_UNICODE) : (string)$ex['design_json'];
        $dataJson = isset($b['data']) ? json_encode($b['data'], JSON_UNESCAPED_UNICODE) : (string)$ex['data_json'];
        $exportJson = isset($b['exportConfig']) ? json_encode($b['exportConfig'], JSON_UNESCAPED_UNICODE) : (string)$ex['export_json'];
        $newVer = (int)$ex['version'] + 1;
        $now = date('Y-m-d H:i:s');
        $logoFileId = $b['design']['logo']['fileId'] ?? $ex['logo_file_id'];

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE projects SET name = ?, qr_type = ?, data_json = ?, design_json = ?, export_json = ?, logo_file_id = ?, version = ?, updated_at = ? WHERE id = ?')
            ->execute([$name, $qrType, $dataJson, $designJson, $exportJson, $logoFileId, $newVer, $now, $pid]);
        qrlav_sync_file_refs($pdo, $cfg, 'project', $pid, $designJson);
        $pdo->commit();

        qrlav_json(['project' => ['id' => $pid, 'ownerId' => $ex['owner_id'], 'name' => $name, 'qrType' => $qrType, 'data' => json_decode($dataJson, true), 'design' => json_decode($designJson, true), 'exportConfig' => json_decode($exportJson, true), 'version' => $newVer, 'createdAt' => $ex['created_at'], 'updatedAt' => $now]]);
    }

    if ($method === 'DELETE') {
        $parsed = json_decode((string)$ex['design_json'], true);
        $fid = $parsed['logo']['fileId'] ?? null;
        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM file_references WHERE ref_type = 'project' AND ref_id = ?")->execute([$pid]);
        $pdo->prepare('DELETE FROM projects WHERE id = ?')->execute([$pid]);
        if (is_string($fid) && $fid !== '') qrlav_cleanup_file($pdo, $cfg, $fid);
        $pdo->commit();
        qrlav_json(['ok' => true]);
    }
}

// 5. Templates
if ($method === 'GET' && $route === '/templates') {
    $q = trim(strtolower((string)($_GET['q'] ?? '')));
    $sql = 'SELECT t.*, u.username AS owner_username FROM templates t JOIN users u ON u.id = t.owner_id';
    $where = [];
    $params = [];
    if ($session['role'] !== 'superadmin') {
        $where[] = 't.owner_id = ?';
        $params[] = $session['uid'];
    }
    if ($q !== '') {
        $where[] = 'LOWER(t.name) LIKE ?';
        $params[] = "%{$q}%";
    }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY t.updated_at DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $out = array_map(fn($r) => [
        'id' => $r['id'],
        'ownerId' => $r['owner_id'],
        'ownerUsername' => $r['owner_username'],
        'name' => $r['name'],
        'includeContent' => (bool)$r['include_content'],
        'qrType' => $r['qr_type'],
        'data' => $r['data_json'] ? json_decode((string)$r['data_json'], true) : null,
        'design' => json_decode((string)$r['design_json'], true),
        'exportConfig' => json_decode((string)$r['export_json'], true),
        'createdAt' => $r['created_at'],
        'updatedAt' => $r['updated_at'],
    ], $stmt->fetchAll());
    qrlav_json(['templates' => $out]);
}

if ($method === 'POST' && $route === '/templates') {
    $b = qrlav_read_json_body();
    $name = trim((string)($b['name'] ?? ''));
    if ($name === '' || !isset($b['design'], $b['exportConfig'])) {
        qrlav_json(['error' => 'Datos de plantilla incompletos.'], 400);
    }
    $inc = !empty($b['includeContent']);
    $id = qrlav_uuid('tpl');
    $now = date('Y-m-d H:i:s');
    $designJson = json_encode($b['design'], JSON_UNESCAPED_UNICODE);
    $exportJson = json_encode($b['exportConfig'], JSON_UNESCAPED_UNICODE);
    $dataJson = ($inc && isset($b['data'])) ? json_encode($b['data'], JSON_UNESCAPED_UNICODE) : null;
    $qrType = ($inc && !empty($b['qrType'])) ? (string)$b['qrType'] : null;
    $logoFileId = $b['design']['logo']['fileId'] ?? null;

    $pdo->beginTransaction();
    $pdo->prepare(
        'INSERT INTO templates (id, owner_id, name, include_content, qr_type, data_json, design_json, export_json, logo_file_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$id, $session['uid'], $name, $inc ? 1 : 0, $qrType, $dataJson, $designJson, $exportJson, $logoFileId, $now, $now]);
    qrlav_sync_file_refs($pdo, $cfg, 'template', $id, $designJson);
    $pdo->commit();
    qrlav_json(['template' => ['id' => $id, 'name' => $name, 'includeContent' => $inc, 'qrType' => $qrType, 'data' => $inc ? $b['data'] : null, 'design' => $b['design'], 'exportConfig' => $b['exportConfig'], 'createdAt' => $now, 'updatedAt' => $now]], 201);
}

if (preg_match('#^/templates/([^/]+)$#', $route, $m)) {
    $tid = $m[1];
    $stmt = $pdo->prepare('SELECT * FROM templates WHERE id = ?');
    $stmt->execute([$tid]);
    $ex = $stmt->fetch();
    if (!$ex) qrlav_json(['error' => 'Plantilla no encontrada.'], 404);
    if ($session['role'] !== 'superadmin' && $ex['owner_id'] !== $session['uid']) qrlav_json(['error' => 'Sin permiso.'], 403);

    if ($method === 'PATCH') {
        $b = qrlav_read_json_body();
        $name = trim((string)($b['name'] ?? ''));
        if ($name === '') qrlav_json(['error' => 'Nombre requerido.'], 400);
        $now = date('Y-m-d H:i:s');
        $pdo->prepare('UPDATE templates SET name = ?, updated_at = ? WHERE id = ?')->execute([$name, $now, $tid]);
        qrlav_json(['ok' => true, 'name' => $name, 'updatedAt' => $now]);
    }
    if ($method === 'DELETE') {
        $parsed = json_decode((string)$ex['design_json'], true);
        $fid = $parsed['logo']['fileId'] ?? null;
        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM file_references WHERE ref_type = 'template' AND ref_id = ?")->execute([$tid]);
        $pdo->prepare('DELETE FROM templates WHERE id = ?')->execute([$tid]);
        if (is_string($fid) && $fid !== '') qrlav_cleanup_file($pdo, $cfg, $fid);
        $pdo->commit();
        qrlav_json(['ok' => true]);
    }
}

// 6. Chunked Upload & Private File Serving
if ($method === 'POST' && $route === '/files/chunk/init') {
    $b = qrlav_read_json_body();
    $origName = trim((string)($b['originalName'] ?? 'imagen'));
    $mime = trim((string)($b['mimeType'] ?? 'application/octet-stream'));
    $totalSize = (int)($b['totalSize'] ?? 0);
    $totalChunks = (int)($b['totalChunks'] ?? 0);
    $sha = strtolower(trim((string)($b['sha256'] ?? '')));

    if ($totalSize <= 0 || $totalChunks <= 0 || $totalChunks > 2000) {
        qrlav_json(['error' => 'Parámetros de carga inválidos.'], 400);
    }

    $used = (int)$pdo->query('SELECT COALESCE(SUM(byte_size), 0) FROM files')->fetchColumn();
    $maxBytes = (int)($cfg['max_storage_bytes'] ?? 1073741824);
    if (($used + $totalSize) > $maxBytes) {
        qrlav_json(['error' => "Cuota de almacenamiento alcanzada al subir «{$origName}». Los proyectos guardados permanecen intactos.", 'quotaExceeded' => true], 507);
    }

    if ($sha !== '') {
        $ex = $pdo->prepare("SELECT id, uploaded_chunks, total_chunks FROM chunk_uploads WHERE owner_id = ? AND expected_sha256 = ? AND total_size = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1");
        $ex->execute([$session['uid'], $sha, $totalSize]);
        $row = $ex->fetch();
        if ($row && (int)$row['total_chunks'] === $totalChunks) {
            qrlav_json(['uploadId' => $row['id'], 'resumed' => true, 'uploadedChunks' => json_decode((string)$row['uploaded_chunks'], true) ?: []]);
        }
    }

    $uplId = qrlav_uuid('upl');
    $dir = rtrim($cfg['chunk_storage_dir'], '/') . '/' . $uplId;
    if (!is_dir($dir)) mkdir($dir, 0750, true);
    $pdo->prepare("INSERT INTO chunk_uploads (id, owner_id, original_name, mime_type, total_size, total_chunks, expected_sha256, uploaded_chunks, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'pending', ?)")
        ->execute([$uplId, $session['uid'], $origName, $mime, $totalSize, $totalChunks, $sha, date('Y-m-d H:i:s')]);
    qrlav_json(['uploadId' => $uplId, 'resumed' => false, 'uploadedChunks' => []], 201);
}

if (preg_match('#^/files/chunk/([^/]+)/(\d+)$#', $route, $m) && $method === 'PUT') {
    $uplId = $m[1];
    $idx = (int)$m[2];
    $stmt = $pdo->prepare('SELECT * FROM chunk_uploads WHERE id = ?');
    $stmt->execute([$uplId]);
    $u = $stmt->fetch();
    if (!$u) qrlav_json(['error' => 'Carga no encontrada.'], 404);
    if ($u['owner_id'] !== $session['uid'] && $session['role'] !== 'superadmin') qrlav_json(['error' => 'Sin permiso.'], 403);
    $bytes = file_get_contents('php://input');
    if ($bytes === false || $bytes === '') qrlav_json(['error' => 'Bloque vacío.'], 400);

    $dir = rtrim($cfg['chunk_storage_dir'], '/') . '/' . $uplId;
    if (!is_dir($dir)) mkdir($dir, 0750, true);
    file_put_contents($dir . '/' . $idx . '.part', $bytes);

    $set = json_decode((string)$u['uploaded_chunks'], true) ?: [];
    if (!in_array($idx, $set, true)) $set[] = $idx;
    sort($set);
    $pdo->prepare('UPDATE chunk_uploads SET uploaded_chunks = ? WHERE id = ?')->execute([json_encode($set), $uplId]);
    qrlav_json(['ok' => true, 'chunkIndex' => $idx, 'uploadedChunks' => $set]);
}

if (preg_match('#^/files/chunk/([^/]+)/complete$#', $route, $m) && $method === 'POST') {
    $uplId = $m[1];
    $stmt = $pdo->prepare('SELECT * FROM chunk_uploads WHERE id = ?');
    $stmt->execute([$uplId]);
    $u = $stmt->fetch();
    if (!$u) qrlav_json(['error' => 'Carga no encontrada.'], 404);
    if ($u['owner_id'] !== $session['uid'] && $session['role'] !== 'superadmin') qrlav_json(['error' => 'Sin permiso.'], 403);

    $dir = rtrim($cfg['chunk_storage_dir'], '/') . '/' . $uplId;
    $buf = '';
    for ($i = 0; $i < (int)$u['total_chunks']; $i++) {
        $p = $dir . '/' . $i . '.part';
        if (!is_file($p)) qrlav_json(['error' => "Falta el bloque {$i}."], 400);
        $buf .= file_get_contents($p);
    }
    if (strlen($buf) !== (int)$u['total_size']) {
        qrlav_json(['error' => 'El tamaño ensamblado no coincide con el original.'], 400);
    }
    if ($u['expected_sha256'] !== '' && hash('sha256', $buf) !== $u['expected_sha256']) {
        qrlav_json(['error' => 'La verificación de integridad SHA-256 falló.'], 400);
    }

    $b = qrlav_read_json_body();
    try {
        $info = qrlav_inspect_image($buf, (string)$u['mime_type'], (string)$u['original_name']);
        $finalBytes = $info['bytes'];
        $fileId = qrlav_uuid('fil');
        $storageName = $fileId . '.' . $info['ext'];
        $dest = rtrim($cfg['private_storage_dir'], '/') . '/' . $storageName;
        if (!is_dir($cfg['private_storage_dir'])) mkdir($cfg['private_storage_dir'], 0750, true);
        file_put_contents($dest, $finalBytes);

        $w = $info['width'] ?? ($b['width'] ?? null);
        $h = $info['height'] ?? ($b['height'] ?? null);
        $alpha = ($info['hasAlpha'] || !empty($b['hasAlpha'])) ? 1 : 0;
        $sha = hash('sha256', $finalBytes);
        $now = date('Y-m-d H:i:s');

        $pdo->prepare('INSERT INTO files (id, owner_id, storage_name, original_name, mime_type, byte_size, width, height, has_alpha, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$fileId, $session['uid'], $storageName, $u['original_name'], $info['mime'], strlen($finalBytes), $w, $h, $alpha, $sha, $now]);
        $pdo->prepare("UPDATE chunk_uploads SET status = 'completed' WHERE id = ?")->execute([$uplId]);

        for ($i = 0; $i < (int)$u['total_chunks']; $i++) @unlink($dir . '/' . $i . '.part');
        @rmdir($dir);

        qrlav_json(['file' => ['id' => $fileId, 'ownerId' => $session['uid'], 'originalName' => $u['original_name'], 'mimeType' => $info['mime'], 'byteSize' => strlen($finalBytes), 'width' => $w, 'height' => $h, 'hasAlpha' => (bool)$alpha, 'sha256' => $sha, 'createdAt' => $now]], 201);
    } catch (Throwable $e) {
        qrlav_json(['error' => $e->getMessage()], 400);
    }
}

if (preg_match('#^/files/([^/]+)$#', $route, $m) && $method === 'GET') {
    $fid = $m[1];
    $stmt = $pdo->prepare('SELECT * FROM files WHERE id = ?');
    $stmt->execute([$fid]);
    $f = $stmt->fetch();
    if (!$f) qrlav_json(['error' => 'Archivo no encontrado.'], 404);
    if ($session['role'] !== 'superadmin' && $f['owner_id'] !== $session['uid']) {
        qrlav_json(['error' => 'Acceso denegado a archivo privado.'], 403);
    }
    $path = rtrim($cfg['private_storage_dir'], '/') . '/' . $f['storage_name'];
    if (!is_file($path)) qrlav_json(['error' => 'Archivo físico ausente.'], 404);
    header('Content-Type: ' . $f['mime_type']);
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

qrlav_json(['error' => 'Ruta no encontrada.'], 404);
