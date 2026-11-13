#!/usr/bin/env python3
"""Verify real Obscura CDP against a deterministic local data fixture.
Requires Python websockets >= 15. Usage: python scripts/verify-obscura.py /path/to/obscura
This test never visits external websites or enables private-network/file access.
"""
import asyncio
import base64
import hashlib
import http.client as http_client
import datetime
import platform
import json
import os
import pathlib
import secrets
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error
import urllib.parse
import websockets

async def main(binary):
    binary = pathlib.Path(binary).resolve()
    report = {'checked_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'platform': platform.system()+' '+platform.machine(), 'websockets_version': websockets.__version__, 'binary_sha256': hashlib.sha256(binary.read_bytes()).hexdigest(), 'tests': {}}
    with tempfile.TemporaryDirectory(prefix='obscura-contract-') as tmp:
        ready = pathlib.Path(tmp)/'ready.json'
        env = {k:v for k,v in os.environ.items() if k.upper() in ('PATH','SYSTEMROOT','WINDIR','TEMP','TMP','HOME')}
        token = secrets.token_hex(32)
        env['OBSCURA_CDP_TOKEN'] = token
        proc = subprocess.Popen([str(binary),'serve','--host','127.0.0.1','--port','0','--workers','1','--max-connections','2','--ready-file',str(ready),'--quiet'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        try:
            for _ in range(300):
                if ready.exists(): break
                if proc.poll() is not None: raise RuntimeError('sidecar exited: '+proc.stderr.read().decode()[:1000])
                await asyncio.sleep(.1)
            meta=json.loads(ready.read_text())
            assert meta['host']=='127.0.0.1' and meta['pid']==proc.pid and meta['port']>0
            report['tests']['ready_loopback_pid']=True
            base=f"http://127.0.0.1:{meta['port']}"
            http=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            try:
                http.open(base+'/json/version',timeout=5)
                raise AssertionError('anonymous HTTP accepted')
            except urllib.error.HTTPError as e: assert e.code==401
            except (ConnectionResetError, http_client.RemoteDisconnected): pass
            report['tests']['anonymous_http_denied']=True
            try:
                http.open(urllib.request.Request(base+'/json/version',headers={'Authorization':'Bearer invalid-launch-token'}),timeout=5)
                raise AssertionError('wrong-token HTTP accepted')
            except urllib.error.HTTPError as e: assert e.code==401
            except (ConnectionResetError, http_client.RemoteDisconnected): pass
            report['tests']['wrong_token_http_denied']=True
            try:
                async with websockets.connect(base.replace('http:','ws:')+meta['websocket_path'],open_timeout=5,proxy=None):
                    raise AssertionError('anonymous WS accepted')
            except websockets.exceptions.InvalidStatus as e: assert e.response.status_code==401
            except (ConnectionResetError, websockets.exceptions.InvalidMessage): pass
            report['tests']['anonymous_ws_denied']=True
            req=urllib.request.Request(base+'/json/version',headers={'Authorization':'Bearer '+token})
            report['version']=json.load(http.open(req,timeout=5))
            async with websockets.connect(base.replace('http:','ws:')+meta['websocket_path'],additional_headers={'Authorization':'Bearer '+token},open_timeout=5,max_size=8*1024*1024,proxy=None) as ws:
                counter=0
                session=None
                frames=[]
                async def command(method,params=None,target=True):
                    nonlocal counter
                    counter+=1
                    ident=counter
                    payload={'id':ident,'method':method,'params':params or {}}
                    if target and session: payload['sessionId']=session
                    await ws.send(json.dumps(payload))
                    while True:
                        result=json.loads(await asyncio.wait_for(ws.recv(),10))
                        if result.get('method')=='Page.screencastFrame': frames.append(result)
                        if result.get('id')==ident:
                            if 'error' in result: raise RuntimeError(str(result['error']))
                            return result.get('result',{})
                target=(await command('Target.createTarget',{'url':'about:blank'},False))['targetId']
                session=(await command('Target.attachToTarget',{'targetId':target,'flatten':True},False))['sessionId']
                await command('Page.enable')
                await command('Emulation.setDeviceMetricsOverride',{'width':800,'height':600,'deviceScaleFactor':1,'mobile':False})
                html='<html><body style="margin:0;background:#ddd"><input id="field" style="position:fixed;left:20px;top:20px;width:200px;height:40px"><button id="button" onclick="window.clicked=1" style="position:fixed;left:20px;top:100px;width:200px;height:40px">Click</button></body></html>'
                await command('Page.navigate',{'url':'data:text/html,'+urllib.parse.quote(html)})
                tree=await command('Page.getFrameTree')
                assert tree['frameTree']['frame']['url'].startswith('data:text/html,')
                report['tests']['native_frame_identity']=True
                await command('Runtime.evaluate',{'expression':"document.getElementById('field').focus()"})
                await command('Input.insertText',{'text':'مرحبا'})
                out=await command('Runtime.evaluate',{'expression':"document.getElementById('field').value",'returnByValue':True})
                assert out['result']['value']=='مرحبا',out
                report['tests']['arabic_insertText']=True
                await command('Input.dispatchKeyEvent',{'type':'keyDown','key':'End','code':'End','windowsVirtualKeyCode':35})
                await command('Input.dispatchKeyEvent',{'type':'keyUp','key':'End','code':'End','windowsVirtualKeyCode':35})
                await command('Input.dispatchKeyEvent',{'type':'keyDown','key':'x','code':'KeyX','text':'x','windowsVirtualKeyCode':88})
                await command('Input.dispatchKeyEvent',{'type':'keyUp','key':'x','code':'KeyX','windowsVirtualKeyCode':88})
                out=await command('Runtime.evaluate',{'expression':"document.getElementById('field').value",'returnByValue':True})
                assert 'x' in out['result']['value'],out
                report['tests']['key_mutation']=True
                for typ in ('mousePressed','mouseReleased'):
                    await command('Input.dispatchMouseEvent',{'type':typ,'x':80,'y':120,'button':'left','clickCount':1})
                out=await command('Runtime.evaluate',{'expression':'window.clicked','returnByValue':True})
                assert out['result']['value']==1,out
                report['tests']['mouse_click_hit_test']=True
                await command('Page.startScreencast',{'format':'jpeg','quality':65,'maxWidth':800,'maxHeight':600,'everyNthFrame':1})
                if not frames:
                    while True:
                        event=json.loads(await asyncio.wait_for(ws.recv(),10))
                        if event.get('method')=='Page.screencastFrame': frames.append(event); break
                frame=frames[-1]['params']
                jpeg=base64.b64decode(frame['data'],validate=True)
                assert jpeg[:2]==b'\xff\xd8' and len(jpeg)>100
                await command('Page.screencastFrameAck',{'sessionId':frame['sessionId']})
                await command('Page.stopScreencast')
                report['tests']['jpeg_screencast_ack']=True
                report['frame_bytes']=len(jpeg)
                await command('Target.closeTarget',{'targetId':target},False)
        finally:
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait()
            if sys.exc_info()[0] is not None:
                print(proc.stderr.read().decode(errors='replace').replace(token, '[redacted]')[:2000],file=sys.stderr)
    print(json.dumps(report,indent=2,ensure_ascii=False))
if __name__=='__main__': asyncio.run(main(sys.argv[1]))
