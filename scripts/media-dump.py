"""一次性探测：dump 真实 nitter feed 中含图 item 的 description（用完即删）"""
import re
import subprocess
import sys
import time

UA = 'FreshRSS/1.24.0 (Linux; https://freshrss.org)'

for user in ['levelsio', 'steipete', 'karpathy']:
    print(f'================ @{user} ================')
    body = subprocess.run(
        ['curl', '-s', '-m', '20', '-H', f'User-Agent: {UA}',
         f'https://nitter.net/{user}/rss'],
        capture_output=True, text=True).stdout
    items = re.findall(r'<item>([\s\S]*?)</item>', body)
    print(f'total items: {len(items)}')
    shown = 0
    for it in items:
        desc = re.search(r'<description>([\s\S]*?)</description>', it)
        d = desc.group(1) if desc else ''
        if '<img' in d or '/pic/' in d:
            title = re.search(r'<title>([\s\S]*?)</title>', it)
            print('--- title:', (title.group(1)[:60] if title else '?'))
            print('DESC:', d[:900])
            shown += 1
            if shown >= 3:
                break
    if shown == 0:
        print('NO items with <img> or /pic/ in description!')
        if items:
            desc = re.search(r'<description>([\s\S]*?)</description>', items[0])
            print('first item desc sample:', (desc.group(1)[:400] if desc else 'none'))
    time.sleep(2)
