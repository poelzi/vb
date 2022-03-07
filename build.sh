#!/usr/bin/env bash
export PATH=~/bin:$PATH
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR
set -e

if [ ! -e node_modules/.bin/sqip ]; then
    npm install sqip
fi

git reset --hard
git clean -f content/*
git clean -f static/images/mixes/*
git pull origin master
python3 sync.py
hugo --renderToMemory
hugo 
