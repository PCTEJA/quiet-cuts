"""Publish validated static assets only when different from the live deployment."""
import hashlib
import io
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    token = os.environ['NETLIFY_AUTH_TOKEN']
    site_id = os.environ['NETLIFY_SITE_ID']

    def api(path, data=None, content_type='application/json'):
        req = urllib.request.Request('https://api.netlify.com/api/v1/' + path, data=data,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': content_type})
        with urllib.request.urlopen(req, timeout=120) as response:
            return json.load(response)

    files = sorted(p for p in (ROOT / 'dist').rglob('*') if p.is_file() and p.name != 'deployment.json')
    digest = hashlib.sha256()
    for p in files:
        digest.update(p.relative_to(ROOT / 'dist').as_posix().encode())
        digest.update(hashlib.sha256(p.read_bytes()).digest())
    content_hash = digest.hexdigest()
    site = api('sites/' + site_id)
    url = site.get('ssl_url') or site['url']
    try:
        req = urllib.request.Request(url + '/deployment.json', headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=30) as response:
            live = json.load(response)
        if live.get('contentHash') == content_hash:
            print('Live site already has the validated assets; no deployment needed.')
            return
    except (urllib.error.URLError, ValueError):
        pass  # Initial deployment or older site without a manifest.
    manifest = json.dumps({'contentHash': content_hash, 'commit': os.environ.get('DEPLOY_COMMIT', '')})
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in files: z.write(p, p.relative_to(ROOT / 'dist').as_posix())
        z.writestr('deployment.json', manifest)
    deployed = api('sites/' + site_id + '/deploys', archive.getvalue(), 'application/zip')
    print('Deployment submitted: ' + deployed['id'], flush=True)
    for _ in range(60):
        status = api('deploys/' + deployed['id'])
        if status['state'] == 'ready':
            print('Published: ' + url)
            return
        if status['state'] in ('error', 'failed', 'rejected'):
            raise RuntimeError('Netlify deployment failed: ' + status['state'])
        time.sleep(5)
    raise TimeoutError('Netlify did not confirm readiness within five minutes')


if __name__ == '__main__': main()
