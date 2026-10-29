#!/bin/zsh
set -eu
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
exec node scripts/reset-task.mjs "$@"
