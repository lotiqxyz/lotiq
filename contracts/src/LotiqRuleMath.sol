// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title LotiqRuleMath
/// @notice Reason bits and calendar arithmetic shared by LotiqRuleBook and its tests. The site's TypeScript engine
///         (src/lib/rules/bits.ts and src/lib/rules/engine.ts) uses the same bit positions and the same calendar; a
///         unit test reads this file so the two cannot drift apart.
/// @dev Time is UTC. Weekdays run Monday = bit 0 ... Sunday = bit 6. Spending periods are fixed windows that start on a
///      Monday 00:00 UTC boundary (1970-01-05 is the first Monday after the epoch), so a 1-day period resets at 00:00
///      UTC, a 7-day period at Monday 00:00 UTC, and a 30-day period every 30 days counted from that Monday.
library LotiqRuleMath {
    // ---- reason bits ----------------------------------------------------------------------------------------
    uint256 internal constant R_UNKNOWN_BOOK = 1 << 0;
    uint256 internal constant R_REVOKED = 1 << 1;
    uint256 internal constant R_PAUSED = 1 << 2;
    uint256 internal constant R_NO_ACTIVE_VERSION = 1 << 3;
    uint256 internal constant R_VERSION_MISMATCH = 1 << 4;
    uint256 internal constant R_NOT_AGENT = 1 << 5;
    uint256 internal constant R_WRONG_ASSET = 1 << 6;
    uint256 internal constant R_ZERO_AMOUNT = 1 << 7;
    uint256 internal constant R_OVER_ORDER_MAX = 1 << 8;
    uint256 internal constant R_OVER_PERIOD_MAX = 1 << 9;
    uint256 internal constant R_OFF_DAY = 1 << 10;
    uint256 internal constant R_OFF_HOURS = 1 << 11;
    uint256 internal constant R_NOT_STARTED = 1 << 12;
    uint256 internal constant R_EXPIRED = 1 << 13;
    uint256 internal constant R_TOO_SOON = 1 << 14;
    uint256 internal constant R_NEEDS_APPROVAL = 1 << 15;
    uint256 internal constant R_NONCE_USED = 1 << 16;

    /// @notice Highest bit in use; bits above it are always zero.
    uint256 internal constant R_LAST = R_NONCE_USED;

    uint256 internal constant DAY = 1 days;
    uint256 internal constant WEEK = 7 days;
    uint256 internal constant MONTH30 = 30 days;
    /// @notice 1970-01-05 00:00 UTC, the first Monday after the Unix epoch.
    uint256 internal constant MONDAY_ZERO = 4 days;
    /// @notice All seven weekdays.
    uint8 internal constant ALL_DAYS = 0x7f;

    /// @notice True for the three supported period lengths.
    function validPeriod(uint256 period) internal pure returns (bool) {
        return period == DAY || period == WEEK || period == MONTH30;
    }

    /// @notice Start of the spending window that contains `ts`. Timestamps before the first Monday fall in window 0.
    function windowStart(uint256 ts, uint256 period) internal pure returns (uint64) {
        if (ts < MONDAY_ZERO) return 0;
        return uint64(((ts - MONDAY_ZERO) / period) * period + MONDAY_ZERO);
    }

    /// @notice What was spent in the window that contains `ts`, given the stored (windowStart, spent) pair.
    function spentAt(uint64 storedWindow, uint256 storedSpent, uint256 ts, uint256 period) internal pure returns (uint256) {
        return storedWindow == windowStart(ts, period) ? storedSpent : 0;
    }

    /// @notice Weekday of `ts`: Monday = 0 ... Sunday = 6 (1970-01-01 was a Thursday).
    function weekday(uint256 ts) internal pure returns (uint8) {
        return uint8(((ts / DAY) + 3) % 7);
    }

    /// @notice Hour of day of `ts`, 0-23 UTC.
    function hourOf(uint256 ts) internal pure returns (uint8) {
        return uint8((ts % DAY) / 1 hours);
    }

    /// @notice Bits for the weekly schedule: the weekday must be in `days` and the hour in [startHour, endHour).
    function scheduleBits(uint8 days_, uint8 startHour, uint8 endHour, uint256 ts) internal pure returns (uint256 bits) {
        if ((days_ >> weekday(ts)) & 1 == 0) bits |= R_OFF_DAY;
        uint8 h = hourOf(ts);
        if (h < startHour || h >= endHour) bits |= R_OFF_HOURS;
    }

    /// @notice Bits for the amount limits. Amounts are USD with 6 decimals.
    /// @dev `spent + amount` cannot overflow: limits are uint128 and spent never exceeds the period limit.
    function amountBits(uint256 amount, uint256 maxPerOrder, uint256 maxPerPeriod, uint256 spentInWindow)
        internal
        pure
        returns (uint256 bits)
    {
        if (amount == 0) return R_ZERO_AMOUNT;
        if (amount > maxPerOrder) bits |= R_OVER_ORDER_MAX;
        if (amount > maxPerPeriod || spentInWindow + amount > maxPerPeriod) bits |= R_OVER_PERIOD_MAX;
    }

    /// @notice Bits for the validity window and the minimum gap between recorded orders.
    function timeBits(uint256 validFrom, uint256 validUntil, uint256 lastOrderAt, uint256 minGap, uint256 ts)
        internal
        pure
        returns (uint256 bits)
    {
        if (ts < validFrom) bits |= R_NOT_STARTED;
        if (ts >= validUntil) bits |= R_EXPIRED;
        if (minGap != 0 && lastOrderAt != 0 && ts < lastOrderAt + minGap) bits |= R_TOO_SOON;
    }

    /// @notice Bit for the per-order approval threshold: an order strictly above `approvalAbove` needs an
    ///         owner-approved order key.
    function approvalBits(uint256 amount, uint256 approvalAbove, bool approved) internal pure returns (uint256) {
        return amount > approvalAbove && !approved ? R_NEEDS_APPROVAL : 0;
    }
}
