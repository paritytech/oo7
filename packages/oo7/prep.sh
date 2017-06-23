#!/bin/bash

mode=$1

for pkg in `cat .deps`; do
	../oo7/flip.sh $pkg $mode
done

