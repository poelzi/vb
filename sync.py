#!/usr/env/bin python3

import urllib
import urllib.request
import json
import os.path
from pprint import pprint

def jget(url):
    rq = urllib.request.urlopen(url)
    return json.loads(rq.read().decode('utf-8'))


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
        rel = rel['cloudcasts'][0]
        if os.path.exists("content/mixes/%s.md" %rel['slug']):
            print("content exists, skipping.")
            continue
        data = {}
        xd = jget(HOST + rel['key'])
        data['image'] = rel['pictures']['extra_large']
        data['tags'] = [x['name'] for x in rel['tags']
                        if x['type'] == 'tag']
        data['title'] = rel['name']
        data['date'] = rel['created_time']
        data['draft'] = False
        data['mixcloud'] = rel['slug']
        
        pprint(data)
        output = template.format(
                    data=json.dumps(data, indent=2),
                    description=xd['description']
                    )
        with open('content/mixes/%s.md' %rel['slug'], 'w') as fp:
            fp.write(output)
        print(output)

    if not 'paging' in uploads:
        break
    
    uploads = jget(uploads['paging']['previous'])
# IPython.embed()
