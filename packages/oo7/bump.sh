#!/bin/bash

patch=$(grep version package.json | sed 's/.*: ".*\..*\.\(.*\)",/\1/')
patch=$((patch + 1))
sed "s/\(\"version\": \".*\..*\.\)[0-9]*/\\1$patch/" <package.json >package.json.new & mv -f package.json.new package.json
