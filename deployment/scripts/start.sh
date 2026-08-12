#!/bin/bash
set -e

MODE=${1:-normal}
PORT=${2:-9000}

case $MODE in
  bootstrap)
    zhixia online --mode bootstrap --port $PORT
    ;;
  storage)
    zhixia online --storage --port $PORT
    ;;
  relay)
    zhixia online --relay --port $PORT
    ;;
  normal|*)
    zhixia online --port $PORT
    ;;
esac
