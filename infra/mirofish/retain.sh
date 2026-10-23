#!/bin/sh
set -eu

usage() {
  echo "usage: RETAIN_DAYS=7 $0 <uploads-dir> | $0 --self-test" >&2
  exit 2
}

retain() {
  uploads=$1
  days=$2
  for sub in projects simulations reports; do
    [ -d "$uploads/$sub" ] || continue
    find "$uploads/$sub" -mindepth 1 -maxdepth 1 -type d -mtime "+$days" -print -exec rm -rf {} +
  done
}

self_test() {
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT INT TERM
  for sub in projects simulations reports; do
    mkdir -p "$tmp/$sub/old_run" "$tmp/$sub/new_run"
    touch "$tmp/$sub/old_run/state.json"
    touch -t 200001010000 "$tmp/$sub/old_run"
  done
  touch -t 200001010000 "$tmp/simulations/old_file.txt"

  retain "$tmp" 7 >/dev/null

  failed=0
  for sub in projects simulations reports; do
    if [ -e "$tmp/$sub/old_run" ]; then
      echo "FAIL $sub/old_run was not deleted"
      failed=1
    fi
    if [ ! -d "$tmp/$sub/new_run" ]; then
      echo "FAIL $sub/new_run was deleted"
      failed=1
    fi
  done
  if [ ! -f "$tmp/simulations/old_file.txt" ]; then
    echo "FAIL simulations/old_file.txt was deleted"
    failed=1
  fi
  [ "$failed" -eq 0 ] && echo "ok   retain.sh self-test"
  return "$failed"
}

[ $# -eq 1 ] || usage

if [ "$1" = "--self-test" ]; then
  self_test
  exit $?
fi

days=${RETAIN_DAYS:-7}
case $days in
  ''|*[!0-9]*) echo "RETAIN_DAYS must be a non-negative integer, got: $days" >&2; exit 2 ;;
esac
[ -d "$1" ] || { echo "not a directory: $1" >&2; exit 2; }

retain "$1" "$days"
