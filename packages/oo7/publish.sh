#!/bin/bash

../oo7/prep.sh remote
npm publish
../oo7/prep.sh local

../oo7/bump.sh


