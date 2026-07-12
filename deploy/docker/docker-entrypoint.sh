#!/bin/sh
set -eu

node /usr/local/lib/wmux/docker-bind-host.mjs --validate-publish
WMUX_HOST="$(node /usr/local/lib/wmux/docker-bind-host.mjs)"
export WMUX_HOST

exec "$@"
