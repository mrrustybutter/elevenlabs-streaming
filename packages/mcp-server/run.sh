#!/bin/bash
cd "$(dirname "$0")"
export NODE_PATH="./node_modules:$NODE_PATH"
exec node ./dist/index.js "$@"