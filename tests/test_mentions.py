"""Unit tests for mention extraction + broadcast/alias expansion (Synapse#1).

These are pure-Python; no DB or FastAPI dependencies. They cover the
expand_mentions logic in isolation. The DB-resolution path
(resolve_handles) is exercised by integration tests separately.
"""

from __future__ import annotations

from api.mentions import BROADCAST_TOKENS, expand_mentions, extract_handles


# --- Baseline: extract_handles still works (regression guard) -----------


def test_extract_handles_explicit_only() -> None:
    assert extract_handles("hi @agent-1 and @agent-2") == ["agent-1", "agent-2"]


def test_extract_handles_dedups_in_order() -> None:
    assert extract_handles("@agent-1 @agent-2 @agent-1") == ["agent-1", "agent-2"]


def test_extract_handles_skips_email() -> None:
    assert extract_handles("ping foo@bar.com") == []


def test_extract_handles_picks_up_broadcast_tokens() -> None:
    # Broadcast tokens come back through extract_handles unchanged —
    # the caller (expand_mentions) is responsible for resolving them.
    assert "channel" in extract_handles("yo @channel")
    assert "everyone" in extract_handles("hey @everyone")


# --- Broadcast expansion ------------------------------------------------


def test_at_channel_expands_to_all_members() -> None:
    out = expand_mentions(
        "fyi @channel",
        channel_member_handles=["agent-1", "agent-2", "assistant", "agent-4"],
    )
    assert set(out) == {"agent-1", "agent-2", "assistant", "agent-4"}


def test_at_everyone_is_alias_for_at_channel() -> None:
    out = expand_mentions(
        "fyi @everyone",
        channel_member_handles=["agent-1", "agent-2"],
    )
    assert set(out) == {"agent-1", "agent-2"}


def test_broadcast_excludes_sender() -> None:
    out = expand_mentions(
        "fyi @channel",
        channel_member_handles=["agent-1", "agent-2", "assistant"],
        sender_handle="assistant",
    )
    assert out == ["agent-1", "agent-2"]
    assert "assistant" not in out


def test_broadcast_with_sender_unspecified_keeps_all() -> None:
    # When sender_handle is None (e.g. server-internal post), don't filter.
    out = expand_mentions(
        "fyi @channel",
        channel_member_handles=["agent-1", "agent-2", "assistant"],
    )
    assert set(out) == {"agent-1", "agent-2", "assistant"}


# --- Named aliases ------------------------------------------------------


def test_named_alias_expands_to_curated_list() -> None:
    out = expand_mentions(
        "@team — heads up",
        channel_member_handles=["agent-1", "agent-2", "assistant", "agent-4", "guest1", "guest2"],
        named_aliases={"team": ["agent-1", "agent-2", "assistant", "agent-4"]},
    )
    assert set(out) == {"agent-1", "agent-2", "assistant", "agent-4"}
    assert "guest1" not in out  # Channel has more members than the alias.


def test_named_alias_excludes_sender() -> None:
    out = expand_mentions(
        "@team — quick note",
        channel_member_handles=["agent-1", "agent-2", "assistant", "agent-4"],
        named_aliases={"team": ["agent-1", "agent-2", "assistant", "agent-4"]},
        sender_handle="agent-4",
    )
    assert out == ["agent-1", "agent-2", "assistant"]


def test_unknown_alias_passes_through_unchanged() -> None:
    # If `@foo` isn't a broadcast token AND isn't in named_aliases,
    # treat it as an explicit handle and let DB resolution handle it.
    out = expand_mentions(
        "@nonexistent ping",
        channel_member_handles=["agent-1"],
        named_aliases={"team": ["agent-1"]},
    )
    assert out == ["nonexistent"]


# --- Composition --------------------------------------------------------


def test_explicit_plus_broadcast_unioned() -> None:
    out = expand_mentions(
        "@agent-2 — and also @channel",
        channel_member_handles=["agent-1", "agent-2", "assistant"],
        sender_handle="agent-4",
    )
    # agent-2 appears explicitly first, then expanded from @channel (dedup'd).
    # agent-1, assistant come from @channel expansion.
    assert out[0] == "agent-2"
    assert set(out) == {"agent-2", "agent-1", "assistant"}


def test_order_preserved_explicit_before_alias() -> None:
    out = expand_mentions(
        "@agent-2 @team ack",
        channel_member_handles=["agent-1", "agent-2", "assistant", "agent-4"],
        named_aliases={"team": ["agent-1", "agent-2", "assistant", "agent-4"]},
        sender_handle="agent-4",
    )
    # agent-2 (explicit) appears first, then alias expansion in order.
    assert out[0] == "agent-2"
    # agent-2 should NOT appear twice (dedup).
    assert out.count("agent-2") == 1
    assert set(out) == {"agent-2", "agent-1", "assistant"}


def test_sender_explicit_self_mention_still_kept() -> None:
    # Sender exclusion only applies to broadcast/alias expansion. If you
    # genuinely type your own handle, that's intentional — keep it.
    out = expand_mentions(
        "@assistant note to self",
        channel_member_handles=["agent-1", "agent-2", "assistant"],
        sender_handle="assistant",
    )
    assert out == ["assistant"]


def test_case_insensitive_handles() -> None:
    out = expand_mentions(
        "@AGENT-1",
        channel_member_handles=["Agent-1"],
    )
    assert out == ["agent-1"]


def test_broadcast_tokens_constant_is_lowercased() -> None:
    # Sanity guard — if someone adds an upper-case token, the matcher (which
    # lower-cases) will silently miss it.
    for tok in BROADCAST_TOKENS:
        assert tok == tok.lower(), f"{tok!r} should be lowercase"


def test_empty_body_returns_empty() -> None:
    assert expand_mentions("", channel_member_handles=["agent-1"]) == []


def test_no_mentions_returns_empty() -> None:
    assert expand_mentions("just text", channel_member_handles=["agent-1"]) == []
