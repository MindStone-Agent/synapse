#!/bin/bash
# Synapse — one-shot first-run setup.
#
# Interactive helper that seeds your first human admin, a channel, and an
# agent account with a bearer token — wrapping scripts/bootstrap.sh. Safe to
# re-run; bootstrap subcommands no-op or error harmlessly on existing handles.
#
# Prereqs: the stack is up — `docker compose up -d --build`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP="$SCRIPT_DIR/bootstrap.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Ensure the api container is running before we try to seed anything.
if ! (cd "$REPO_ROOT" && docker compose ps api 2>/dev/null | grep -q "Up"); then
    echo "The Synapse api container isn't running. Start it first:" >&2
    echo "    docker compose up -d --build" >&2
    exit 1
fi

echo "Synapse quickstart — first-run setup"
echo "(press Enter to accept the [default] for any prompt)"
echo

read -rp "Admin handle [admin]: " ADMIN_HANDLE
ADMIN_HANDLE="${ADMIN_HANDLE:-admin}"
read -rp "Admin display name [Admin]: " ADMIN_NAME
ADMIN_NAME="${ADMIN_NAME:-Admin}"
read -rsp "Admin password: " ADMIN_PW; echo
if [ -z "$ADMIN_PW" ]; then
    echo "Password is required." >&2
    exit 1
fi

read -rp "Channel slug [team-ops]: " CH_SLUG
CH_SLUG="${CH_SLUG:-team-ops}"
read -rp "Channel display name [Team Ops]: " CH_NAME
CH_NAME="${CH_NAME:-Team Ops}"

read -rp "First agent handle [assistant]: " AGENT_HANDLE
AGENT_HANDLE="${AGENT_HANDLE:-assistant}"

echo
echo "→ Creating admin account '$ADMIN_HANDLE'…"
"$BOOTSTRAP" add-account --kind human --handle "$ADMIN_HANDLE" \
    --display-name "$ADMIN_NAME" --password "$ADMIN_PW"

echo "→ Creating agent account '$AGENT_HANDLE'…"
"$BOOTSTRAP" add-account --kind agent --handle "$AGENT_HANDLE" \
    --display-name "$AGENT_HANDLE"

echo "→ Seeding channel '$CH_SLUG'…"
"$BOOTSTRAP" seed-channel "$CH_SLUG" "$CH_NAME" --description "Created by quickstart"

echo "→ Adding members…"
"$BOOTSTRAP" add-member "$ADMIN_HANDLE" "$CH_SLUG" --role admin
"$BOOTSTRAP" add-member "$AGENT_HANDLE" "$CH_SLUG"

echo "→ Issuing a bearer token for '$AGENT_HANDLE' (shown once — copy it now)…"
"$BOOTSTRAP" issue-token --account "$AGENT_HANDLE" \
    --scopes "channel:$CH_SLUG:read,channel:$CH_SLUG:post"

# Grant the new admin actual admin access: ensure their handle is in
# SYNAPSE_ADMIN_HANDLES in .env (the API gate reads this — without it the admin
# UI stays hidden). This is the #1 first-run footgun, so we wire it for you.
ENV_FILE="$REPO_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$REPO_ROOT/.env.example" ]; then cp "$REPO_ROOT/.env.example" "$ENV_FILE"; else touch "$ENV_FILE"; fi
fi
if grep -q '^SYNAPSE_ADMIN_HANDLES=' "$ENV_FILE"; then
    CURRENT="$(grep '^SYNAPSE_ADMIN_HANDLES=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
    case ",$CURRENT," in
        *",$ADMIN_HANDLE,"*) : ;;  # already present
        *) sed -i.bak "s|^SYNAPSE_ADMIN_HANDLES=.*|SYNAPSE_ADMIN_HANDLES=${CURRENT:+$CURRENT,}$ADMIN_HANDLE|" "$ENV_FILE"; rm -f "$ENV_FILE.bak" ;;
    esac
else
    echo "SYNAPSE_ADMIN_HANDLES=$ADMIN_HANDLE" >> "$ENV_FILE"
fi
echo "→ Ensured SYNAPSE_ADMIN_HANDLES in .env includes '$ADMIN_HANDLE'."
echo "→ Reloading env (recreating api)…"
(cd "$REPO_ROOT" && docker compose up -d) >/dev/null 2>&1 || \
    echo "  (couldn't auto-recreate — run 'docker compose up -d' yourself to apply)"

echo
echo "Done."
echo "  • Open http://localhost:8080 and sign in as '$ADMIN_HANDLE' — the Admin section will be visible."
echo "  • Hand the agent token above to your agent client."
