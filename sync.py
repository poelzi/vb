#!/usr/env/bin python3

import urllib
import urllib.request
import urllib.error
import json
import os.path
import subprocess
from pprint import pprint

def jget(url):
    print("get url: " + url)
    rq = urllib.request.urlopen(url)
    return json.loads(rq.read().decode('utf-8'))

VALID_USERS = ['voxel_blue']

HOST = "https://api.mixcloud.com"
URL = HOST + "/voxel_blue/feed/?metadata=1"

template = """
---
{data}
---
{{{{<mixcloud>}}}}
{description}
"""
uploads = jget(URL)
while uploads:
    pprint(uploads)
    
    for rel in uploads['data']:
        if not 'cloudcasts' in rel:
            continue
        rel = rel['cloudcasts'][0]
        if not 'user' in rel or \
            rel['user']["username"] not in VALID_USERS:
            continue
        data = {}
        try:
            xd = jget(HOST + rel['key'])
        except urllib.error.HTTPError as e:
            print("error fetching: %s" %rel['key'])
            continue
        data['image'] = rel['pictures']['extra_large']
        data['tags'] = [x['name'] for x in rel['tags']
                        if x['type'] == 'tag']
        data['title'] = rel['name']
        data['date'] = rel['created_time']
        data['draft'] = False
        data['mixcloud'] = rel['slug']
        data['img_png'] = os.path.join( "static", "images", "mixes", "%s.%s" %(rel['slug'], "png"))
        data['img_svg'] = os.path.join("static", "images", "mixes", "%s.%s" %(rel['slug'], "svg"))
        
        pprint(data)
        output = template.format(
                    data=json.dumps(data, indent=2),
                    description=xd['description']
                    )
        if os.path.exists("content/mixes/%s.md" %rel['slug']):
            print("content exists, skipping.")
        else:
            with open('content/mixes/%s.md' %rel['slug'], 'w') as fp:
                fp.write(output)
        # print(output)
        # download cover
        if not os.path.exists(data['img_png']):
            rq = urllib.request.urlopen(rel['pictures']['extra_large'])
            with open(data['img_png'], "wb") as fp:
                fp.write(rq.read())
        if not os.path.exists(data['img_svg']):
            subprocess.call(["node_modules/.bin/sqip", "-n", "4", "-b", "12",
                             "-o", data['img_svg'], data['img_png']])

        
    if not 'paging' in uploads or \
       not 'next' in uploads['paging']:
        break
    
    uploads = jget(uploads['paging']['next'])
# IPython.embed()
