#!/usr/bin/env bash
export PATH=~/bin:$PATH
set -e
git reset --hard
git pull origin master
python3 sync.py
hugo check
hugo 
