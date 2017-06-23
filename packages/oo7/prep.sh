#!/bin/bash

deps=(`cat deps`)
mode=$1

for pkg in $deps; do
	../oo7/flip.sh $pkg $mode
done

