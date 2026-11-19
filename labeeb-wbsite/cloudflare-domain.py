import os, json, tomllib, urllib.request, urllib.error, sys
from pathlib import Path
config=Path(os.environ['APPDATA'])/'xdg.config/.wrangler/config/default.toml'
token=tomllib.loads(config.read_text(encoding='utf-8'))['oauth_token']
def api(path,method='GET',body=None):
    req=urllib.request.Request('https://api.cloudflare.com/client/v4/'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method)
    try:
        with urllib.request.urlopen(req,timeout=30) as r: data=json.load(r)
    except urllib.error.HTTPError as e:
        print(json.dumps({'http':e.code,'response':json.loads(e.read())}));sys.exit(1)
    if not data.get('success'): raise RuntimeError(data.get('errors'))
    return data['result']
user=api('user')
assert user['email'].lower()=='alshayeksa@gmail.com', 'Wrong Cloudflare user'
account='df48308e0348751b70b2ff4aae28a833'
base=f'accounts/{account}/pages/projects/labeeb'
mode=sys.argv[1] if len(sys.argv)>1 else 'inspect'
if mode=='inspect':
    zones=api('zones?name=alshaye.ai')
    print(json.dumps({'email':user['email'],'zones':[{'id':z['id'],'name':z['name'],'account':z['account']['id']} for z in zones]}))
    for z in zones:
        print(json.dumps({'dns':api(f"zones/{z['id']}/dns_records?name=labeeb.alshaye.ai")}))
elif mode=='attach':
    print(json.dumps(api(base+'/domains','POST',{'name':'labeeb.alshaye.ai'})))
elif mode=='status':
    print(json.dumps({'project':api(base),'domains':api(base+'/domains')}))
