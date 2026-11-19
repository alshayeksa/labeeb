"""Opt-in diagnostic. Reads .github/.env locally; prints no secrets or response bodies."""
import json
import re
import sys
from pathlib import Path
import urllib.request
import urllib.error

values = {}
raw = (Path(__file__).resolve().parents[1] / '.github/.env').read_text(encoding='utf-8-sig')
for line in raw.splitlines():
    name, sep, value = line.strip().removeprefix('export ').partition('=')
    if sep and name.strip() in {'OPENAI_API_KEY', 'API_KEY', 'OPENAI_KEY'}:
        values[name.strip()] = value.strip().strip('\"\'')
key = values.get('OPENAI_API_KEY') or values.get('OPENAI_KEY') or values.get('API_KEY')
if not key and raw.strip().startswith('sk-') and not any(c.isspace() for c in raw.strip()):
    key = raw.strip()
if not key:
    candidates = re.findall(r'\bsk-[A-Za-z0-9_-]{20,}', raw)
    if len(candidates) == 1:
        key = candidates[0]
if not key:
    print('PROBE: NAMED_KEY_NOT_FOUND')
    raise SystemExit(1)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
body = {'model': 'gpt-6-luna', 'messages': [{'role':'user','content':'Reply only OK.'}], 'max_completion_tokens':64, 'reasoning_effort':'none'}
if '--legacy' in sys.argv:
    body.pop('max_completion_tokens')
    body.pop('reasoning_effort')
    body['max_tokens'] = 64
request = urllib.request.Request('https://api.openai.com/v1/chat/completions', data=json.dumps(body).encode(), headers={'Content-Type':'application/json', 'Authorization':'Bearer '+key})
try:
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
        result = json.loads(response.read(65536))
        print('PROBE: HTTP', response.status)
        print('PROBE: VISIBLE_TEXT', bool(result.get('choices', [{}])[0].get('message', {}).get('content')))
except urllib.error.HTTPError as error:
    print('PROBE: HTTP', error.code)
    try:
        details = json.loads(error.read(65536)).get('error', {})
        for field, allowed in [('code', {'model_not_found','invalid_api_key','insufficient_quota','unsupported_parameter','unsupported_value'}), ('param', {'model','max_tokens','max_completion_tokens','reasoning_effort'})]:
            if details.get(field) in allowed:
                print('PROBE:', field, details[field])
    except Exception:
        pass
except Exception as error:
    print('PROBE: NETWORK_FAILURE', type(error).__name__)
    reason = getattr(error, 'reason', None)
    print('PROBE: REASON_CLASS', type(reason).__name__, 'ERRNO', getattr(reason, 'errno', None))
