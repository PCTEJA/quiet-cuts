"""Stage, validate and publish an all-or-nothing source refresh. Standard library only."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import date

ROOT = Path(__file__).resolve().parents[1]
STATES = ('CA', 'NY', 'WA')


def validate(payload, previous=None):
    events, meta = payload['events'], payload['metadata']
    if not events or len({e['id'] for e in events}) != len(events):
        raise ValueError('Empty dataset or duplicate source IDs')
    for state in STATES:
        count = sum(e['state'] == state for e in events)
        if not count or count != meta['counts'][state]:
            raise ValueError(f'{state}: missing source or inconsistent count')
        # Large losses may be a pagination/schema problem or fiscal rollover.
        # Fail closed and require review rather than quietly dropping records.
        if previous and count < previous['metadata']['counts'][state] * 0.7:
            raise ValueError(f'{state}: record count fell over 30%; source review required')
    if meta['totalRecords'] != len(events):
        raise ValueError('Total record count does not match data')
    for e in events:
        if e['state'] not in STATES or not e['company'].strip():
            raise ValueError('Invalid state or blank company')
        if type(e['workers']) is not int or e['workers'] < 0:
            raise ValueError('Invalid affected worker count')
        if not e['sourceUrl'].startswith('https://'):
            raise ValueError('Missing HTTPS source evidence')
        for key in ('noticeDate', 'receivedDate', 'processedDate', 'effectiveDate', 'listedPostedDate'):
            if e.get(key): date.fromisoformat(e[key])
        if not any(e.get(k) for k in ('noticeDate', 'receivedDate', 'processedDate', 'listedPostedDate')):
            raise ValueError('Missing agency record date')
        if e.get('newsStatus') != 'unreviewed' or any(e.get(k) is not None for k in ('postedDate', 'newsUrl', 'firstNewsDate', 'latencyDays')):
            raise ValueError('Collector must not invent publication dates or news evidence')
        for key, bound in (('lat', 90), ('lon', 180)):
            if e.get(key) is not None and not -bound <= e[key] <= bound:
                raise ValueError(f'Invalid {key}')


def fingerprint(payload):
    # Row reordering and retrieval times alone are not new underlying records.
    rows = [{k: v for k, v in e.items() if k not in ('id', 'sourceRow')} for e in payload['events']]
    canonical = sorted(json.dumps(e, sort_keys=True, ensure_ascii=False) for e in rows)
    return hashlib.sha256(json.dumps(canonical).encode()).hexdigest()


def main():
    previous = json.loads((ROOT / 'data/events.json').read_text(encoding='utf8'))
    with tempfile.TemporaryDirectory(prefix='quiet-cuts-') as folder:
        staged = Path(folder) / 'data'
        shutil.copytree(ROOT / 'data', staged)
        env = dict(os.environ, QUIET_CUTS_DATA_DIR=str(staged))
        subprocess.run([sys.executable, str(ROOT / 'scripts/data_build.py'), '--refresh'], env=env, check=True)
        candidate = json.loads((staged / 'events.json').read_text(encoding='utf8'))
        validate(candidate, previous)
        changed = fingerprint(candidate) != fingerprint(previous)
        print(json.dumps({'checkedAt': candidate['metadata']['retrievedAt'], 'changed': changed, 'counts': candidate['metadata']['counts']}))
        output = os.environ.get('GITHUB_OUTPUT')
        if output:
            with open(output, 'a', encoding='utf8') as f:
                f.write(f'changed={str(changed).lower()}\n')
        # Establish a precise retrieval timestamp on first verified collection.
        if changed or not previous['metadata'].get('retrievedAt'):
            candidate['metadata']['collectionFingerprint'] = fingerprint(candidate)
            (staged / 'events.json').write_text(json.dumps(candidate, indent=2, ensure_ascii=False), encoding='utf8')
            for name in ('events.json', 'sources.json'):
                shutil.copy2(staged / name, ROOT / 'data' / name)
                shutil.copy2(staged / name, ROOT / 'dist/data' / name)
            for name in ('ca.xlsx', 'ny-csv.txt', 'wa-db.txt'):
                shutil.copy2(staged / 'snapshots' / name, ROOT / 'data/snapshots' / name)


if __name__ == '__main__':
    main()
