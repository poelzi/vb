#!/usr/bin/env bash
export PATH=~/bin:$PATH
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR
set -e
git reset --hard
git clean -f content/*
git pull origin master
python3 sync.py
hugo check
hugo 
