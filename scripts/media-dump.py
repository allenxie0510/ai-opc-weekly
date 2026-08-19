"""一次性探测：提取真实 nitter feed 中所有 <img> 标签和 /pic/ 引用（用完即删）"""
import re
import subprocess
import time

UA = 'FreshRSS/1.24.0 (Linux; https://freshrss.org)'

for user in ['levelsio', 'steipete', 'karpathy', 'soltwagner', 'FonsMans']:
    print(f'================ @{user} ================')
    body = subprocess.run(
        ['curl', '-s', '-m', '20', '-H', f'User-Agent: {UA}',
         f'https://nitter.net/{user}/rss'],
        capture_output=True, text=True).stdout
    items = re.findall(r'<item>([\s\S]*?)</item>', body)
    n_img = 0
    for it in items:
        desc_m = re.search(r'<description>([\s\S]*?)</description>', it)
        d = desc_m.group(1) if desc_m else ''
        imgs = re.findall(r'<img[^>]*>', d)
        if imgs:
            n_img += 1
            for g in imgs:
                print('IMG:', g[:300])
        # <a href> 里的图片链接也看看
        for a in re.findall(r'<a[^>]*href="([^"]*pic[^"]*)"[^>]*>', d):
            print('A-HREF:', a[:200])
    print(f'items={len(items)}, items_with_img={n_img}')
    time.sleep(2)
