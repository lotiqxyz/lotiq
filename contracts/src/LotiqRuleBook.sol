// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LotiqRuleMath as M} from "./LotiqRuleMath.sol";

/// @title LotiqRuleBook
/// @notice Versioned rule sets for stock-token agents on Robinhood Chain.
///
///         An owner opens a rule book. Each change to the rules is a new VERSION: a commitment (the keccak256 hash of
///         the full rule text the owner reviewed) plus the key limits in plain fields: one asset, one agent address,
///         a maximum per order, a maximum per period (1, 7 or 30 days), an approval threshold, the weekdays and UTC
///         hours the agent may act in, a minimum gap between orders and a validity window. A version starts as
///         Proposed; nothing changes until the owner approves that exact version (by number AND hash). Approving binds
///         the version's agent and supersedes the previous version in the same transaction. Every step is an event, so
///         the full history of a book can be rebuilt from logs.
///
///         The agent asks `checkOrder` before acting; it answers a reason bitmask (zero = allowed), the same bits the
///         site shows. `recordOrder` is the agent's on-chain order journal: it re-runs the check at the current block,
///         reverts with the bits when anything fails, and otherwise counts the order against the period limit, uses
///         the nonce and consumes a per-order approval when one was needed.
///
///         This contract never moves or holds tokens or ETH: recording an order is a journal entry and a limit
///         counter, not a trade. Executing trades through a router is not part of this contract (Concept).
///         No admin, no fee, no upgrade. Only a book's owner can change it; the agent can never raise its own limits
///         (it can only halt the book). Pause and revoke apply to the very next call, in the same block.
contract LotiqRuleBook {
    // ---- types --------------------------------------------------------------------------------------------

    /// @notice What the owner submits for a new version.
    struct RuleInput {
        bytes32 ruleHash; // keccak256 of the canonical rule text shown to the owner
        address agent;
        address asset;
        uint128 maxPerOrder; // USD, 6 decimals
        uint128 maxPerPeriod; // USD, 6 decimals
        uint128 approvalAbove; // orders strictly above need an owner-approved order key
        uint32 period; // 1, 7 or 30 days in seconds
        uint32 minGap; // seconds between recorded orders, 0 = none
        uint8 days_; // bit 0 Monday ... bit 6 Sunday (UTC)
        uint8 startHour; // UTC, inclusive
        uint8 endHour; // UTC, exclusive, <= 24
        uint40 validFrom; // 0 = from the proposal time
        uint40 validUntil;
    }

    struct RuleVersion {
        bytes32 ruleHash;
        address agent;
        address asset;
        uint128 maxPerOrder;
        uint128 maxPerPeriod;
        uint128 approvalAbove;
        uint32 period;
        uint32 minGap;
        uint8 days_;
        uint8 startHour;
        uint8 endHour;
        uint8 status;
        uint40 validFrom;
        uint40 validUntil;
        uint40 proposedAt;
        uint40 approvedAt;
        uint32 parent;
    }

    struct Book {
        address owner;
        uint32 active; // approved version, 0 = none yet
        uint32 versions; // number of versions proposed
        bool paused;
        bool revoked;
        uint40 openedAt;
        bytes32 label;
        uint64 windowStart; // spending window of `spent`
        uint128 spent; // USD 6 dec spent in that window
        uint40 lastOrderAt;
        uint32 orders; // recorded orders, all time
    }

    /// @dev One order question, packed to keep the stack small.
    struct Query {
        address agent;
        uint32 version;
        address asset;
        uint256 amount;
        uint64 nonce;
        bool approved;
        uint256 at;
    }

    uint8 public constant STATUS_PROPOSED = 1;
    uint8 public constant STATUS_ACTIVE = 2;
    uint8 public constant STATUS_SUPERSEDED = 3;
    uint8 public constant STATUS_WITHDRAWN = 4;

    uint256 public constant MAX_VALIDITY = 730 days;
    uint256 public constant MAX_BOOKS_PER_OWNER = 64;
    uint256 public constant MAX_VERSIONS = 1000;
    uint256 public constant MAX_GAP = 30 days;

    // ---- storage ------------------------------------------------------------------------------------------

    uint256 public bookCount;
    mapping(uint256 => Book) private _books;
    mapping(uint256 => mapping(uint256 => RuleVersion)) private _versions;
    mapping(uint256 => mapping(uint64 => bool)) private _nonceUsed;
    mapping(uint256 => mapping(bytes32 => bool)) private _orderApproved;
    mapping(address => uint256[]) private _byOwner;
    mapping(address => uint256[]) private _byAgent;
    mapping(address => mapping(uint256 => bool)) private _agentListed;

    // ---- events -------------------------------------------------------------------------------------------

    event BookOpened(uint256 indexed bookId, address indexed owner, bytes32 label);
    /// @notice Every field of the new version, so the full history can be rebuilt (and diffed) from logs alone.
    event VersionProposed(uint256 indexed bookId, uint32 indexed version, RuleVersion rule);
    event VersionApproved(uint256 indexed bookId, uint32 indexed version, uint32 previous, bytes32 ruleHash, address indexed agent);
    event VersionWithdrawn(uint256 indexed bookId, uint32 indexed version);
    event BookPaused(uint256 indexed bookId, address indexed by);
    event BookUnpaused(uint256 indexed bookId);
    event BookRevoked(uint256 indexed bookId);
    event OrderApproved(uint256 indexed bookId, bytes32 indexed orderKey);
    event OrderApprovalCancelled(uint256 indexed bookId, bytes32 indexed orderKey);
    /// @notice A refusal the bound agent chose to put on the record (submitOrder). A reverted recordOrder leaves no log; this does,
    ///         so the owner can be alerted that the agent tried something the rules refuse.
    event OrderRefused(
        uint256 indexed bookId, uint32 indexed version, address indexed agent, address asset, uint256 amount, uint64 nonce, uint256 bits
    );
    event OrderRecorded(
        uint256 indexed bookId,
        uint32 indexed version,
        address indexed agent,
        address asset,
        uint256 amount,
        uint64 nonce,
        bytes32 ref,
        uint256 spentInWindow,
        bool usedApproval
    );

    // ---- errors -------------------------------------------------------------------------------------------

    error NotOwner();
    error UnknownBook();
    error UnknownVersion();
    error BookRevokedError();
    error BadRule(uint8 field);
    error WrongStatus();
    error HashMismatch();
    error TooManyBooks();
    error TooManyVersions();
    error NotAgent();
    error AlreadyPaused();
    error NotPaused();
    error Refused(uint256 bits);

    // BadRule field codes
    uint8 internal constant F_AGENT = 1;
    uint8 internal constant F_ASSET = 2;
    uint8 internal constant F_LIMITS = 3;
    uint8 internal constant F_PERIOD = 4;
    uint8 internal constant F_DAYS = 5;
    uint8 internal constant F_HOURS = 6;
    uint8 internal constant F_WINDOW = 7;
    uint8 internal constant F_GAP = 8;
    uint8 internal constant F_HASH = 9;
    uint8 internal constant F_PARENT = 10;

    // ---- owner: books and versions --------------------------------------------------------------------------

    /// @notice Opens a book and proposes its first version. Nothing is active until `approve`.
    function openBook(bytes32 label, RuleInput calldata r) external returns (uint256 bookId) {
        if (_byOwner[msg.sender].length >= MAX_BOOKS_PER_OWNER) revert TooManyBooks();
        bookId = ++bookCount;
        Book storage b = _books[bookId];
        b.owner = msg.sender;
        b.label = label;
        b.openedAt = uint40(block.timestamp);
        _byOwner[msg.sender].push(bookId);
        emit BookOpened(bookId, msg.sender, label);
        _propose(bookId, b, r, 0);
    }

    /// @notice Proposes a new version, usually an edit of `parent` (0 = written from scratch). Not active until approved.
    function propose(uint256 bookId, RuleInput calldata r, uint32 parent) external returns (uint32 version) {
        Book storage b = _ownedLive(bookId);
        if (parent > b.versions) revert BadRule(F_PARENT);
        return _propose(bookId, b, r, parent);
    }

    /// @notice Approves exactly `version` whose hash must equal `expectedHash`. Supersedes the active version and binds
    ///         the version's agent, effective from this transaction on.
    function approve(uint256 bookId, uint32 version, bytes32 expectedHash) external {
        Book storage b = _ownedLive(bookId);
        RuleVersion storage v = _version(bookId, b, version);
        if (v.status != STATUS_PROPOSED) revert WrongStatus();
        if (v.ruleHash != expectedHash) revert HashMismatch();
        // A version must still be usable when it is approved.
        if (block.timestamp >= v.validUntil) revert BadRule(F_WINDOW);
        uint32 previous = b.active;
        if (previous != 0) _versions[bookId][previous].status = STATUS_SUPERSEDED;
        v.status = STATUS_ACTIVE;
        v.approvedAt = uint40(block.timestamp);
        b.active = version;
        if (!_agentListed[v.agent][bookId]) {
            _agentListed[v.agent][bookId] = true;
            _byAgent[v.agent].push(bookId);
        }
        emit VersionApproved(bookId, version, previous, v.ruleHash, v.agent);
    }

    /// @notice Withdraws a proposed version that was never approved.
    function withdraw(uint256 bookId, uint32 version) external {
        Book storage b = _owned(bookId);
        RuleVersion storage v = _version(bookId, b, version);
        if (v.status != STATUS_PROPOSED) revert WrongStatus();
        v.status = STATUS_WITHDRAWN;
        emit VersionWithdrawn(bookId, version);
    }

    function pause(uint256 bookId) external {
        Book storage b = _ownedLive(bookId);
        if (b.paused) revert AlreadyPaused();
        b.paused = true;
        emit BookPaused(bookId, msg.sender);
    }

    function unpause(uint256 bookId) external {
        Book storage b = _ownedLive(bookId);
        if (!b.paused) revert NotPaused();
        b.paused = false;
        emit BookUnpaused(bookId);
    }

    /// @notice Permanent: the book refuses every order from now on and can no longer be changed.
    function revoke(uint256 bookId) external {
        Book storage b = _ownedLive(bookId);
        b.revoked = true;
        emit BookRevoked(bookId);
    }

    /// @notice The agent bound to the active version may halt the book. Only the owner can unpause it.
    function halt(uint256 bookId) external {
        Book storage b = _books[bookId];
        if (b.owner == address(0)) revert UnknownBook();
        if (b.revoked) revert BookRevokedError();
        if (b.active == 0 || _versions[bookId][b.active].agent != msg.sender) revert NotAgent();
        if (b.paused) revert AlreadyPaused();
        b.paused = true;
        emit BookPaused(bookId, msg.sender);
    }

    /// @notice Approves one specific order above the version's approval threshold. See `orderKey`.
    function approveOrder(uint256 bookId, bytes32 key) external {
        _ownedLive(bookId);
        _orderApproved[bookId][key] = true;
        emit OrderApproved(bookId, key);
    }

    function cancelOrderApproval(uint256 bookId, bytes32 key) external {
        _owned(bookId);
        _orderApproved[bookId][key] = false;
        emit OrderApprovalCancelled(bookId, key);
    }

    // ---- agent: order journal -------------------------------------------------------------------------------

    /// @notice Records one order of the agent against the active version. Reverts with `Refused(bits)` when any rule
    ///         fails at this block. Moves no tokens.
    function recordOrder(uint256 bookId, uint32 version, address asset, uint256 amount, uint64 nonce, bytes32 ref)
        external
    {
        Book storage b = _books[bookId];
        bytes32 key = orderKey(bookId, version, asset, amount, nonce);
        uint256 bits = _check(
            bookId, Query(msg.sender, version, asset, amount, nonce, _orderApproved[bookId][key], block.timestamp)
        );
        if (bits != 0) revert Refused(bits);
        (uint256 spent, bool used) = _count(bookId, b, version, key, amount, nonce);
        emit OrderRecorded(bookId, version, msg.sender, asset, amount, nonce, ref, spent, used);
    }

    /// @notice Like recordOrder, but a refusal does not revert: it is logged as OrderRefused (nothing else changes) and the bits
    ///         are returned. Only the agent bound to the active version may submit, so nobody else can fill a book's log.
    function submitOrder(uint256 bookId, address asset, uint256 amount, uint64 nonce, bytes32 ref) external returns (uint256 bits) {
        Book storage b = _books[bookId];
        if (b.owner == address(0)) revert UnknownBook();
        uint32 version = b.active;
        if (version == 0 || _versions[bookId][version].agent != msg.sender) revert NotAgent();
        bytes32 key = orderKey(bookId, version, asset, amount, nonce);
        bits = _check(bookId, Query(msg.sender, version, asset, amount, nonce, _orderApproved[bookId][key], block.timestamp));
        if (bits != 0) {
            emit OrderRefused(bookId, version, msg.sender, asset, amount, nonce, bits);
            return bits;
        }
        (uint256 spent, bool used) = _count(bookId, b, version, key, amount, nonce);
        emit OrderRecorded(bookId, version, msg.sender, asset, amount, nonce, ref, spent, used);
    }

    /// @dev Effects of a recorded order (all checks already passed).
    function _count(uint256 bookId, Book storage b, uint32 version, bytes32 key, uint256 amount, uint64 nonce)
        internal
        returns (uint256 spent, bool used)
    {
        RuleVersion storage v = _versions[bookId][version];
        uint64 w = M.windowStart(block.timestamp, v.period);
        spent = (b.windowStart == w ? uint256(b.spent) : 0) + amount;
        b.windowStart = w;
        b.spent = uint128(spent); // <= maxPerPeriod (uint128), checked above
        b.lastOrderAt = uint40(block.timestamp);
        b.orders += 1;
        _nonceUsed[bookId][nonce] = true;
        used = amount > v.approvalAbove;
        if (used) _orderApproved[bookId][key] = false;
    }

    // ---- views --------------------------------------------------------------------------------------------

    /// @notice Reason bits for an order as if it were recorded at time `at` (use the current time for a live check).
    ///         Zero means every rule passes. The spending window state is the book's current one.
    function checkOrder(
        uint256 bookId,
        address agent,
        uint32 version,
        address asset,
        uint256 amount,
        uint64 nonce,
        uint256 at
    ) external view returns (uint256) {
        bool approved = _orderApproved[bookId][orderKey(bookId, version, asset, amount, nonce)];
        return _check(bookId, Query(agent, version, asset, amount, nonce, approved, at));
    }

    /// @notice The key an owner approves for one order above the threshold.
    function orderKey(uint256 bookId, uint32 version, address asset, uint256 amount, uint64 nonce)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(bookId, version, asset, amount, nonce));
    }

    function getBook(uint256 bookId) external view returns (Book memory) {
        return _books[bookId];
    }

    function getVersion(uint256 bookId, uint32 version) external view returns (RuleVersion memory) {
        return _versions[bookId][version];
    }

    /// @notice USD (6 dec) still allowed in the window that contains `at` under the active version.
    function remainingInPeriod(uint256 bookId, uint256 at) external view returns (uint256) {
        Book storage b = _books[bookId];
        if (b.active == 0) return 0;
        RuleVersion storage v = _versions[bookId][b.active];
        uint256 spent = M.spentAt(b.windowStart, b.spent, at, v.period);
        return spent >= v.maxPerPeriod ? 0 : v.maxPerPeriod - spent;
    }

    function nonceUsed(uint256 bookId, uint64 nonce) external view returns (bool) {
        return _nonceUsed[bookId][nonce];
    }

    function orderApproved(uint256 bookId, bytes32 key) external view returns (bool) {
        return _orderApproved[bookId][key];
    }

    function booksOf(address owner) external view returns (uint256[] memory) {
        return _byOwner[owner];
    }

    /// @notice Books whose approved versions have ever named `agent` (it may no longer be the active agent).
    function booksOfAgent(address agent) external view returns (uint256[] memory) {
        return _byAgent[agent];
    }

    // ---- internals ----------------------------------------------------------------------------------------

    function _check(uint256 bookId, Query memory q) internal view returns (uint256 bits) {
        Book storage b = _books[bookId];
        if (b.owner == address(0)) return M.R_UNKNOWN_BOOK;
        if (b.revoked) bits |= M.R_REVOKED;
        if (b.paused) bits |= M.R_PAUSED;
        if (b.active == 0) return bits | M.R_NO_ACTIVE_VERSION;
        if (q.version != b.active) bits |= M.R_VERSION_MISMATCH;
        RuleVersion storage v = _versions[bookId][b.active];
        if (q.agent != v.agent) bits |= M.R_NOT_AGENT;
        if (q.asset != v.asset) bits |= M.R_WRONG_ASSET;
        bits |= M.amountBits(q.amount, v.maxPerOrder, v.maxPerPeriod, M.spentAt(b.windowStart, b.spent, q.at, v.period));
        bits |= M.scheduleBits(v.days_, v.startHour, v.endHour, q.at);
        bits |= M.timeBits(v.validFrom, v.validUntil, b.lastOrderAt, v.minGap, q.at);
        if (q.amount != 0) bits |= M.approvalBits(q.amount, v.approvalAbove, q.approved);
        if (_nonceUsed[bookId][q.nonce]) bits |= M.R_NONCE_USED;
    }

    function _propose(uint256 bookId, Book storage b, RuleInput calldata r, uint32 parent) internal returns (uint32 version) {
        if (b.versions >= MAX_VERSIONS) revert TooManyVersions();
        if (r.ruleHash == bytes32(0)) revert BadRule(F_HASH);
        if (r.agent == address(0)) revert BadRule(F_AGENT);
        if (r.asset == address(0) || r.asset.code.length == 0) revert BadRule(F_ASSET);
        if (r.maxPerOrder == 0 || r.maxPerOrder > r.maxPerPeriod) revert BadRule(F_LIMITS);
        if (!M.validPeriod(r.period)) revert BadRule(F_PERIOD);
        if (r.days_ == 0 || r.days_ > M.ALL_DAYS) revert BadRule(F_DAYS);
        if (r.startHour >= r.endHour || r.endHour > 24) revert BadRule(F_HOURS);
        if (r.minGap > MAX_GAP) revert BadRule(F_GAP);
        uint40 from = r.validFrom == 0 ? uint40(block.timestamp) : r.validFrom;
        if (r.validUntil <= from || r.validUntil <= block.timestamp || r.validUntil > block.timestamp + MAX_VALIDITY) {
            revert BadRule(F_WINDOW);
        }
        version = ++b.versions;
        _versions[bookId][version] = RuleVersion({
            ruleHash: r.ruleHash,
            agent: r.agent,
            asset: r.asset,
            maxPerOrder: r.maxPerOrder,
            maxPerPeriod: r.maxPerPeriod,
            approvalAbove: r.approvalAbove,
            period: r.period,
            minGap: r.minGap,
            days_: r.days_,
            startHour: r.startHour,
            endHour: r.endHour,
            status: STATUS_PROPOSED,
            validFrom: from,
            validUntil: r.validUntil,
            proposedAt: uint40(block.timestamp),
            approvedAt: 0,
            parent: parent
        });
        emit VersionProposed(bookId, version, _versions[bookId][version]);
    }

    function _owned(uint256 bookId) internal view returns (Book storage b) {
        b = _books[bookId];
        if (b.owner == address(0)) revert UnknownBook();
        if (b.owner != msg.sender) revert NotOwner();
    }

    function _ownedLive(uint256 bookId) internal view returns (Book storage b) {
        b = _owned(bookId);
        if (b.revoked) revert BookRevokedError();
    }

    function _version(uint256 bookId, Book storage b, uint32 version) internal view returns (RuleVersion storage v) {
        if (version == 0 || version > b.versions) revert UnknownVersion();
        v = _versions[bookId][version];
    }
}
