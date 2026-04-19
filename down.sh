#!/bin/bash
set -e

docker compose down --remove-orphans

docker container prune -f

docker image prune -f
