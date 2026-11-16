from ftplib import FTP, error_perm
from io import BytesIO
import os
from pathlib import Path
import secrets

parent = '/domains/lavdigitalagency.com/public_html'
with FTP() as ftp:
    ftp.connect(os.environ['FTP_SERVER'].removeprefix('ftp://'), int(os.environ['FTP_PORT']), timeout=30)
    ftp.login(os.environ['FTP_USERNAME'], os.environ['FTP_PASSWORD'])
    # Confirm the existing domain root before creating the requested Qr folder.
    ftp.cwd(parent)
    try:
        ftp.cwd('Qr')
    except error_perm as error:
        if not str(error).startswith('550'):
            raise
        ftp.mkd('Qr')
        ftp.cwd('Qr')
    target = f'{parent}/Qr'
    if ftp.pwd().rstrip('/') != target:
        raise RuntimeError('El destino FTP no coincide con la carpeta autorizada de QR')
    directories = {target}
    files = sorted(p for p in Path('dist').rglob('*') if p.is_file())
    files.sort(key=lambda p: (p.name == 'index.html', p.name != '.htaccess'))
    for file in files:
        path = file.relative_to('dist')
        ftp.cwd(target)
        for part in path.parts[:-1]:
            folder = ftp.pwd().rstrip('/') + '/' + part
            if folder not in directories:
                try:
                    ftp.cwd(part)
                except error_perm as error:
                    if not str(error).startswith('550'):
                        raise
                    ftp.mkd(part)
                    ftp.cwd(part)
                directories.add(folder)
            else:
                ftp.cwd(part)
        tmp = '.qr-upload-' + secrets.token_hex(8) + '.php'
        with file.open('rb') as stream:
            ftp.storbinary(f'STOR {tmp}', stream)
        try:
            ftp.rename(tmp, path.name)
        except error_perm as error:
            if not str(error).startswith('550') or path.name not in ftp.nlst():
                raise
            backup = '.qr-replace-' + secrets.token_hex(8) + '.php'
            ftp.rename(path.name, backup)
            try:
                ftp.rename(tmp, path.name)
            except Exception:
                ftp.rename(backup, path.name)
                raise
            ftp.delete(backup)
    ftp.cwd(target)
    index = BytesIO()
    ftp.retrbinary('RETR index.html', index.write)
    if index.getvalue() != Path('dist/index.html').read_bytes():
        raise RuntimeError('El archivo publicado por FTP difiere del compilado')
    print('FTP verificado:', target)
