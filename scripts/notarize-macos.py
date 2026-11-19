"""Submit a signed DMG once, then poll that submission through network failures."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def notarize(dmg):
    auth = ['--apple-id', os.environ['APPLE_ID'], '--password',
            os.environ['APPLE_PASSWORD'], '--team-id', os.environ['APPLE_TEAM_ID']]
    def request(action, *args):
        result = subprocess.run(['xcrun', 'notarytool', action, *args, *auth,
                                 '--output-format', 'json'], capture_output=True,
                                text=True, timeout=600 if action == 'submit' else 120)
        if result.returncode:
            # Do not include the command or credentials in error output.
            raise RuntimeError(f'Apple {action} request failed (exit {result.returncode})')
        return json.loads(result.stdout)

    receipt = request('submit', str(dmg))
    submission_id = receipt['id']
    dmg.with_suffix('.notarization.json').write_text(json.dumps(receipt, indent=2))
    print(f'Submitted {dmg.name}: {submission_id}', flush=True)
    deadline = time.monotonic() + 2400
    while time.monotonic() < deadline:
        try:
            info = request('info', submission_id)
        except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
            print(f'Temporary status lookup failure: {type(error).__name__}; retrying the same submission.', flush=True)
            time.sleep(30)
            continue
        status = info.get('status')
        print(f'Apple status: {status}', flush=True)
        if status == 'Accepted':
            for attempt in range(5):
                result = subprocess.run(['xcrun', 'stapler', 'staple', str(dmg)])
                if result.returncode == 0:
                    return
                time.sleep(15)
            raise RuntimeError('Apple accepted the DMG, but ticket stapling failed')
        if status != 'In Progress':
            raise RuntimeError(f'Apple returned {status}; inspect submission {submission_id}')
        time.sleep(30)
    raise RuntimeError(f'Apple is still processing {submission_id}; the pending artifact is preserved')


if __name__ == '__main__':
    try:
        for name in sys.argv[1:]:
            notarize(Path(name))
        if len(sys.argv) < 2:
            raise RuntimeError('Provide a signed DMG path')
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Apple request timed out; check notarization history before resubmitting', file=sys.stderr)
        sys.exit(1)
