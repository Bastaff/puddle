import json, re, os, sys

def parse(p):
    if not os.path.exists(p): return {}
    t = open(p, encoding='utf-8').read()
    return json.loads(t) if t.strip() else {}

def ours(v): return isinstance(v, str) and ('puddle' in v.lower() or 'joule' in v.lower())

def main(a):
    cmd, f = a[0], a[1]
    if cmd == 'get':
        print(str(parse(f).get('env', {}).get(a[2], '') or '')); return 0
    backup, arg = a[2], a[3]
    if cmd in ('statusline-on', 'statusline-off'):
        wrapper, prev, s = backup, arg, parse(f)
        def ours_sl(sl): return isinstance(sl, dict) and isinstance(sl.get('command'), str) and (wrapper in sl['command'] or re.search(r'/\.(puddle|joule)(-dev)?/statusline\.sh', sl['command']) is not None)
        def rm(p):
            if os.path.exists(p): os.remove(p)
        if cmd == 'statusline-on':
            cur = s.get('statusLine')
            if not ours_sl(cur):
                if isinstance(cur, dict) and isinstance(cur.get('command'), str):
                    open(prev + '.json', 'w', encoding='utf-8').write(json.dumps(cur, ensure_ascii=False) + '\n')
                    open(prev + '.sh', 'w', encoding='utf-8').write(cur['command'] + '\n')
                else: rm(prev + '.json'); rm(prev + '.sh')
            base = cur if ours_sl(cur) else {}
            s['statusLine'] = {**base, 'type': 'command', 'command': '"' + wrapper + '"'}
            if os.path.exists(prev + '.json'):
                p = json.loads(open(prev + '.json', encoding='utf-8').read())
                if p.get('padding') is not None: s['statusLine']['padding'] = p['padding']
            open(f, 'w', encoding='utf-8').write(json.dumps(s, indent=2, ensure_ascii=False) + '\n'); return 0
        if ours_sl(s.get('statusLine')):
            if os.path.exists(prev + '.json'): s['statusLine'] = json.loads(open(prev + '.json', encoding='utf-8').read())
            else: s.pop('statusLine', None)
            open(f, 'w', encoding='utf-8').write(json.dumps(s, indent=2, ensure_ascii=False) + '\n')
        rm(prev + '.json'); rm(prev + '.sh'); return 0
    if cmd == 'on':
        env = json.loads(arg); s = parse(f); cur = s.get('env', {})
        ep = cur.get('OTEL_EXPORTER_OTLP_ENDPOINT') or cur.get('OTEL_EXPORTER_OTLP_LOGS_ENDPOINT')
        if ep and ep != env.get('OTEL_EXPORTER_OTLP_ENDPOINT') and not ours(cur.get('PUDDLE')) and not ours(cur.get('JOULE')):
            print('PUDDLE3:' + ep); return 3
        if not os.path.exists(backup):
            open(backup, 'w', encoding='utf-8').write(open(f, encoding='utf-8').read() if os.path.exists(f) else '')
        s['env'] = {**cur, **env}
        if 'PUDDLE' in env: s['env'].pop('JOULE', None)
        open(f, 'w', encoding='utf-8').write(json.dumps(s, indent=2, ensure_ascii=False) + '\n'); return 0
    if cmd == 'off':
        keys = json.loads(arg)
        if not os.path.exists(f): return 0
        s = parse(f)
        if 'env' in s:
            for k in keys: s['env'].pop(k, None)
            if not s['env']: del s['env']
        if os.path.exists(backup):
            orig = open(backup, encoding='utf-8').read()
            before = json.loads(orig) if orig.strip() else {}
            os.remove(backup)
            if s == before:
                if orig == '': os.remove(f)
                else: open(f, 'w', encoding='utf-8').write(orig)
                return 0
        open(f, 'w', encoding='utf-8').write(json.dumps(s, indent=2, ensure_ascii=False) + '\n'); return 0
    print('usage: merge on|off|get'); return 2

sys.exit(main(sys.argv[1:]))
