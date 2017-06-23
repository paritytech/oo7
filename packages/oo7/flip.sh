#!/bin/bash

pkg=$1
mode=$2

depversion=$(grep version ../$pkg/package.json | sed 's/.*: "\(.*\)",/\1/')
if [[ $mode == "local" || $mode == "l" ]] ; then
	new="file:..\\/$pkg"
else
	new="^$depversion"
fi
cp -f package.json package.json.old
cmd="s/\"$pkg\": \".*\"/\"$pkg\": \"$new\"/"
sed "$cmd" <package.json.old >package.json

