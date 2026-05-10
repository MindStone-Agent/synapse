"""Unit tests for mention extraction + broadcast/alias expansion (Synapse#1).

These are pure-Python; no DB or FastAPI dependencies. They cover the
expand_mentions logic in isolation. The DB-resolution path
(resolve_handles) is exercised by integration tests separately.
"""

from __future__ import annotations

from api.mentions import BROADCAST_TOKENS, expand_mentions, extract_handles


# --- Baseline: extract_handles still works (regression guard) -----------


def test_extract_handles_explicit_only() -> None:
    assert extract_handles("hi @mira and @cairn") == ["mira", "cairn"]


def test_extract_handles_dedups_in_order() -> None:
    assert extract_handles("@mira @cairn @mira") == ["mira", "cairn"]


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
        channel_member_handles=["mira", "cairn", "hearth", "lux"],
    )
    assert set(out) == {"mira", "cairn", "hearth", "lux"}


def test_at_everyone_is_alias_for_at_channel() -> None:
    out = expand_mentions(
        "fyi @everyone",
        channel_member_handles=["mira", "cairn"],
    )
    assert set(out) == {"mira", "cairn"}


def test_broadcast_excludes_sender() -> None:
    out = expand_mentions(
        "fyi @channel",
        channel_member_handles=["mira", "cairn", "hearth"],
        sender_handle="hearth",
    )
    assert out == ["mira", "cairn"]
    assert "hearth" not in out


def test_broadcast_with_sender_unspecified_keeps_all() -> None:
    # When sender_handle is None (e.g. server-internal post), don't filter.
    out = expand_mentions(
        "fyi @channel",
        channel_member_handles=["mira", "cairn", "hearth"],
    )
    assert set(out) == {"mira", "cairn", "hearth"}


# --- Named aliases ------------------------------------------------------


def test_named_alias_expands_to_curated_list() -> None:
    out = expand_mentions(
        "@family — heads up",
        channel_member_handles=["mira", "cairn", "hearth", "lux", "guest1", "guest2"],
        named_aliases={"family": ["mira", "cairn", "hearth", "lux"]},
    )
    assert set(out) == {"mira", "cairn", "hearth", "lux"}
    assert "guest1" not in out  # Channel has more members than the alias.


def test_named_alias_excludes_sender() -> None:
    out = expand_mentions(
        "@family — quick note",
        channel_member_handles=["mira", "cairn", "hearth", "lux"],
        named_aliases={"family": ["mira", "cairn", "hearth", "lux"]},
        sender_handle="lux",
    )
    assert out == ["mira", "cairn", "hearth"]


def test_unknown_alias_passes_through_unchanged() -> None:
    # If `@foo` isn't a broadcast token AND isn't in named_aliases,
    # treat it as an explicit handle and let DB resolution handle it.
    out = expand_mentions(
        "@nonexistent ping",
        channel_member_handles=["mira"],
        named_aliases={"family": ["mira"]},
    )
    assert out == ["nonexistent"]


# --- Composition --------------------------------------------------------


def test_explicit_plus_broadcast_unioned() -> None:
    out = expand_mentions(
        "@cairn — and also @channel",
        channel_member_handles=["mira", "cairn", "hearth"],
        sender_handle="lux",
    )
    # cairn appears explicitly first, then expanded from @channel (dedup'd).
    # mira, hearth come from @channel expansion.
    assert out[0] == "cairn"
    assert set(out) == {"cairn", "mira", "hearth"}


def test_order_preserved_explicit_before_alias() -> None:
    out = expand_mentions(
        "@cairn @family ack",
        channel_member_handles=["mira", "cairn", "hearth", "lux"],
        named_aliases={"family": ["mira", "cairn", "hearth", "lux"]},
        sender_handle="lux",
    )
    # cairn (explicit) appears first, then alias expansion in order.
    assert out[0] == "cairn"
    # cairn should NOT appear twice (dedup).
    assert out.count("cairn") == 1
    assert set(out) == {"cairn", "mira", "hearth"}


def test_sender_explicit_self_mention_still_kept() -> None:
    # Sender exclusion only applies to broadcast/alias expansion. If you
    # genuinely type your own handle, that's intentional — keep it.
    out = expand_mentions(
        "@hearth note to self",
        channel_member_handles=["mira", "cairn", "hearth"],
        sender_handle="hearth",
    )
    assert out == ["hearth"]


def test_case_insensitive_handles() -> None:
    out = expand_mentions(
        "@MIRA",
        channel_member_handles=["Mira"],
    )
    assert out == ["mira"]


def test_broadcast_tokens_constant_is_lowercased() -> None:
    # Sanity guard — if someone adds an upper-case token, the matcher (which
    # lower-cases) will silently miss it.
    for tok in BROADCAST_TOKENS:
        assert tok == tok.lower(), f"{tok!r} should be lowercase"


def test_empty_body_returns_empty() -> None:
    assert expand_mentions("", channel_member_handles=["mira"]) == []


def test_no_mentions_returns_empty() -> None:
    assert expand_mentions("just text", channel_member_handles=["mira"]) == []
