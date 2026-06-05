#!/bin/bash
# Synapse — admin bootstrap CLI.
#
# Thin wrapper around `python -m api.admin <subcommand>`, run inside
# the api container so the venv + DB connection are already in place.
#
# Usage:
#   ./scripts/bootstrap.sh init
#   ./scripts/bootstrap.sh add-account --kind human --handle admin --display-name "Admin" --password "..."
#   ./scripts/bootstrap.sh add-account --kind agent --handle assistant --display-name "Assistant"
#   ./scripts/bootstrap.sh seed-channel team-ops "Team Ops" --description "Ops channel for the team"
#   ./scripts/bootstrap.sh add-member admin team-ops --role admin
#   ./scripts/bootstrap.sh add-member assistant team-ops
#   ./scripts/bootstrap.sh issue-token --account assistant --scopes "channel:team-ops:read,channel:team-ops:post"
#   ./scripts/bootstrap.sh revoke-token --id <token-uuid>
#   ./scripts/bootstrap.sh list-accounts
#   ./scripts/bootstrap.sh list-channels
#   ./scripts/bootstrap.sh list-tokens --account assistant
#
# The api container must be up: `docker compose up -d`.

set -e

# Resolve the synapse repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "$#" -eq 0 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    cd "$REPO_ROOT"
    docker compose exec -T api python -m api.admin --help
    exit 0
fi

# Ensure the api container is running before we exec into it.
if ! (cd "$REPO_ROOT" && docker compose ps api 2>/dev/null | grep -q "Up"); then
    echo "synapse api container is not running. Start it with:" >&2
    echo "    cd $REPO_ROOT && docker compose up -d" >&2
    exit 1
fi

cd "$REPO_ROOT"
exec docker compose exec -T api python -m api.admin "$@"
