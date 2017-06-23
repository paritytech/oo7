#!/bin/bash

mode=$1

for pkg in `cat .deps`; do
	echo "flipping $pkg"
	../oo7/flip.sh $pkg $mode
done

