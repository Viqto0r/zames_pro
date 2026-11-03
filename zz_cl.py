p = 'CHANGELOG.md'
s = open(p, encoding='utf-8').read()
bad = '- **loop:** do not dump or nudge a stale  poll'
i = s.index(bad)
j = s.index('
', i) + 1
line = (
    '- **loop:** do not dump or nudge a stale `BashOutput` poll - a finished
'
    '  background process is polled by the model and the tool answers "no
'
    '  background process", which is not a stall (the dev dump filled up with
'
    '  these instead of real unparsed calls)
'
)
s = s[:i] + line + s[j:]
open(p, 'w', encoding='utf-8').write(s)
print('ok')
