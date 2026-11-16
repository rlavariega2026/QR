# Instalación en Hostinger — Generador QR LAV

## Requisitos del servidor
- PHP 8.1 o superior (con extensiones `pdo_mysql`, `json`, `fileinfo`, `gd`).
- Base de datos MySQL 8 o MariaDB 10.4+.
- Certificado SSL activo (HTTPS).

## Pasos de instalación limpia
1. **Compilar el frontend**:
   En tu equipo local ejecuta:
   ```bash
   npm install
   npm run build
   ```
   Esto genera la carpeta `dist/` con `index.html` y `assets/`.

2. **Subir archivos a Hostinger**:
   - Sube el contenido de `dist/` a la carpeta autorizada (por ejemplo `public_html/` o `public_html/qr/`).
   - Sube el contenido de `hostinger-php/` (`api/`, `lib/`, `migrations/`, `.htaccess`, `install.php`) a esa misma carpeta.

3. **Configurar credenciales y almacenamiento privado**:
   - Recomendado: coloca `config.php` (copia de `config.example.php`) **fuera de `public_html`** (por ejemplo en `/home/uXXXXXXXXX/qrlav_config.php`), o dentro de la carpeta protegida por `.htaccess`.
   - Define `private_storage_dir` y `chunk_storage_dir` apuntando a una carpeta privada fuera de `public_html` (por ejemplo `/home/uXXXXXXXXX/qrlav_private/files` y `/home/uXXXXXXXXX/qrlav_private/chunks`).
   - Ingresa ahí los datos reales de tu base de datos MySQL/MariaDB creada desde el panel de Hostinger (`db_host`, `db_name`, `db_user`, `db_pass`). Nunca subas esos secretos al repositorio.

4. **Ejecutar el instalador único (`install.php`)**:
   - Abre `https://tudominio.com/install.php` en el navegador.
   - Define la contraseña del usuario superadministrador inicial **`lavariega`**.
   - El instalador ejecutará `migrations/001_initial_schema.sql`, guardará únicamente el hash (`password_hash()`) y creará `installed.lock`.
   - Por seguridad adicional, elimina `install.php` después de completar el paso.

## Actualización de una instalación existente (sin pérdida de datos)
1. Respalda tu base de datos y tu carpeta `private_files`.
2. Reemplaza los archivos compilados (`dist/`) y los archivos PHP (`api/`, `lib/`).
3. Ejecuta `migrations/002_safe_upgrade.sql` en phpMyAdmin o MySQL CLI. Esta migración es compatible y conserva todas las cuentas, proyectos, logotipos y plantillas existentes.
