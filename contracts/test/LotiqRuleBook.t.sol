// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LotiqRuleBook} from "../src/LotiqRuleBook.sol";
import {LotiqRuleMath as M} from "../src/LotiqRuleMath.sol";

/// @dev Any contract with code stands in for a stock token: the book only needs the address to have code.
contract LotiqAssetStub {
    function symbol() external pure returns (string memory) {
        return "STUB";
    }
}

contract LotiqRuleBookTest is Test {
    LotiqRuleBook book;
    address owner = address(0xA11CE);
    address agent = address(0xA6E7);
    address stranger = address(0xBAD);
    address asset;
    address otherAsset;

    // Monday 2026-11-23 15:00:00 UTC
    uint256 constant MON_15H = 1795446000;
    uint128 constant USD = 1e6;

    function setUp() public {
        book = new LotiqRuleBook();
        asset = address(new LotiqAssetStub());
        otherAsset = address(new LotiqAssetStub());
        vm.warp(MON_15H);
    }

    function rule() internal view returns (LotiqRuleBook.RuleInput memory r) {
        r = LotiqRuleBook.RuleInput({
            ruleHash: keccak256("weekly NVDA 50"),
            agent: agent,
            asset: asset,
            maxPerOrder: 50 * USD,
            maxPerPeriod: 120 * USD,
            approvalAbove: 40 * USD,
            period: 7 days,
            minGap: 0,
            days_: 0x01 | 0x04, // Monday + Wednesday
            startHour: 14,
            endHour: 20,
            validFrom: 0,
            validUntil: uint40(MON_15H + 90 days)
        });
    }

    function openApproved() internal returns (uint256 id) {
        LotiqRuleBook.RuleInput memory r = rule();
        vm.startPrank(owner);
        id = book.openBook("dca", r);
        book.approve(id, 1, r.ruleHash);
        vm.stopPrank();
    }

    function check(uint256 id, uint256 amount, uint64 nonce) internal view returns (uint256) {
        return book.checkOrder(id, agent, 1, asset, amount, nonce, block.timestamp);
    }

    // ---- calendar ----------------------------------------------------------------------------------------

    function test_weekdayKnownDates() public pure {
        assertEq(M.weekday(0), 3); // 1970-01-01 Thursday
        assertEq(M.weekday(4 days), 0); // 1970-01-05 Monday
        assertEq(M.weekday(MON_15H), 0);
        assertEq(M.weekday(MON_15H + 6 days), 6); // Sunday
        assertEq(M.hourOf(MON_15H), 15);
    }

    function test_windowStartWeekIsMonday() public pure {
        uint64 w = M.windowStart(MON_15H + 3 days, 7 days);
        assertEq(w, MON_15H - 15 hours);
        assertEq(M.weekday(w), 0);
        assertEq(M.windowStart(MON_15H, 1 days), MON_15H - 15 hours);
    }

    function testFuzz_windowContainsTs(uint64 ts, uint8 p) public pure {
        uint256 period = p % 3 == 0 ? 1 days : (p % 3 == 1 ? 7 days : 30 days);
        vm.assume(ts >= 4 days);
        uint64 w = M.windowStart(ts, period);
        assertLe(w, ts);
        assertLt(ts, uint256(w) + period);
        assertEq((uint256(w) - 4 days) % period, 0);
        if (period == 7 days) assertEq(M.weekday(w), 0);
        assertEq(M.hourOf(w), 0);
    }

    function testFuzz_amountBitsModel(uint128 amount, uint128 maxOrder, uint128 maxPeriod, uint128 spent) public pure {
        vm.assume(spent <= maxPeriod);
        uint256 bits = M.amountBits(amount, maxOrder, maxPeriod, spent);
        if (amount == 0) {
            assertEq(bits, M.R_ZERO_AMOUNT);
            return;
        }
        assertEq(bits & M.R_OVER_ORDER_MAX != 0, amount > maxOrder);
        assertEq(bits & M.R_OVER_PERIOD_MAX != 0, uint256(spent) + amount > maxPeriod);
    }

    function testFuzz_scheduleBits(uint8 days_, uint8 s, uint8 e, uint32 ts) public pure {
        uint256 bits = M.scheduleBits(days_, s, e, ts);
        bool dayOk = (days_ >> M.weekday(ts)) & 1 == 1;
        uint8 h = M.hourOf(ts);
        assertEq(bits & M.R_OFF_DAY == 0, dayOk);
        assertEq(bits & M.R_OFF_HOURS == 0, h >= s && h < e);
    }

    // ---- open / propose / approve ----------------------------------------------------------------------------

    function test_openProposesButNothingActive() public {
        vm.prank(owner);
        uint256 id = book.openBook("dca", rule());
        LotiqRuleBook.Book memory b = book.getBook(id);
        assertEq(b.owner, owner);
        assertEq(b.active, 0);
        assertEq(b.versions, 1);
        assertEq(book.getVersion(id, 1).status, book.STATUS_PROPOSED());
        assertEq(check(id, 10 * USD, 1), M.R_NO_ACTIVE_VERSION);
    }

    function test_approveNeedsExactHash() public {
        LotiqRuleBook.RuleInput memory r = rule();
        vm.startPrank(owner);
        uint256 id = book.openBook("dca", r);
        vm.expectRevert(LotiqRuleBook.HashMismatch.selector);
        book.approve(id, 1, keccak256("something else"));
        book.approve(id, 1, r.ruleHash);
        vm.expectRevert(LotiqRuleBook.WrongStatus.selector);
        book.approve(id, 1, r.ruleHash);
        vm.stopPrank();
        assertEq(book.getBook(id).active, 1);
        assertEq(book.booksOfAgent(agent).length, 1);
    }

    function test_onlyOwnerChangesBook() public {
        uint256 id = openApproved();
        LotiqRuleBook.RuleInput memory r = rule();
        r.maxPerOrder = 1000 * USD;
        r.maxPerPeriod = 1000 * USD;
        vm.startPrank(agent);
        vm.expectRevert(LotiqRuleBook.NotOwner.selector);
        book.propose(id, r, 1);
        vm.expectRevert(LotiqRuleBook.NotOwner.selector);
        book.approve(id, 1, r.ruleHash);
        vm.expectRevert(LotiqRuleBook.NotOwner.selector);
        book.unpause(id);
        vm.expectRevert(LotiqRuleBook.NotOwner.selector);
        book.approveOrder(id, bytes32(uint256(1)));
        vm.expectRevert(LotiqRuleBook.NotOwner.selector);
        book.revoke(id);
        vm.stopPrank();
        vm.prank(stranger);
        vm.expectRevert(LotiqRuleBook.NotOwner.selector);
        book.pause(id);
    }

    function test_badRules() public {
        LotiqRuleBook.RuleInput memory r = rule();
        vm.startPrank(owner);
        r.ruleHash = 0;
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(9)));
        book.openBook("x", r);
        r = rule();
        r.agent = address(0);
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(1)));
        book.openBook("x", r);
        r = rule();
        r.asset = address(0xdead); // no code
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(2)));
        book.openBook("x", r);
        r = rule();
        r.maxPerOrder = 200 * USD; // above the period limit
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(3)));
        book.openBook("x", r);
        r = rule();
        r.maxPerOrder = 0;
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(3)));
        book.openBook("x", r);
        r = rule();
        r.period = 2 days;
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(4)));
        book.openBook("x", r);
        r = rule();
        r.days_ = 0;
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(5)));
        book.openBook("x", r);
        r = rule();
        r.days_ = 0x80;
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(5)));
        book.openBook("x", r);
        r = rule();
        r.startHour = 20;
        r.endHour = 20;
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(6)));
        book.openBook("x", r);
        r = rule();
        r.endHour = 25;
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(6)));
        book.openBook("x", r);
        r = rule();
        r.validUntil = uint40(block.timestamp + 731 days);
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(7)));
        book.openBook("x", r);
        r = rule();
        r.validUntil = uint40(block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(7)));
        book.openBook("x", r);
        r = rule();
        r.minGap = 31 days;
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(8)));
        book.openBook("x", r);
        uint256 id = book.openBook("ok", rule());
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(10)));
        book.propose(id, rule(), 5);
        vm.stopPrank();
    }

    // ---- scenario lab: one test per scenario --------------------------------------------------------------

    function test_underLimitAccepted() public {
        uint256 id = openApproved();
        assertEq(check(id, 30 * USD, 1), 0);
        vm.prank(agent);
        book.recordOrder(id, 1, asset, 30 * USD, 1, "ref");
        LotiqRuleBook.Book memory b = book.getBook(id);
        assertEq(b.spent, 30 * USD);
        assertEq(b.orders, 1);
        assertEq(book.remainingInPeriod(id, block.timestamp), 90 * USD);
    }

    function test_overOrderMaxRefused() public {
        uint256 id = openApproved();
        uint256 bits = check(id, 60 * USD, 1);
        assertTrue(bits & M.R_OVER_ORDER_MAX != 0);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.Refused.selector, bits));
        book.recordOrder(id, 1, asset, 60 * USD, 1, "");
    }

    function test_overPeriodAfterSpending() public {
        uint256 id = openApproved();
        vm.startPrank(agent);
        book.recordOrder(id, 1, asset, 40 * USD, 1, "");
        book.recordOrder(id, 1, asset, 40 * USD, 2, "");
        vm.stopPrank();
        assertEq(check(id, 40 * USD, 3) & M.R_OVER_PERIOD_MAX, 0); // 120 exactly: allowed
        vm.prank(agent);
        book.recordOrder(id, 1, asset, 40 * USD, 3, "");
        assertEq(check(id, 1 * USD, 4), M.R_OVER_PERIOD_MAX);
        // next Monday the window resets
        vm.warp(MON_15H + 7 days);
        assertEq(check(id, 40 * USD, 4), 0);
        assertEq(book.remainingInPeriod(id, block.timestamp), 120 * USD);
    }

    function test_wrongAssetAndWrongAgent() public {
        uint256 id = openApproved();
        assertEq(book.checkOrder(id, agent, 1, otherAsset, 10 * USD, 1, block.timestamp), M.R_WRONG_ASSET);
        assertEq(book.checkOrder(id, stranger, 1, asset, 10 * USD, 1, block.timestamp), M.R_NOT_AGENT);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.Refused.selector, M.R_NOT_AGENT));
        book.recordOrder(id, 1, asset, 10 * USD, 1, "");
    }

    function test_outsideSchedule() public {
        uint256 id = openApproved();
        // Tuesday 15:00 = off day; Wednesday 09:00 = off hours; Wednesday 19:59 ok; Wednesday 20:00 off hours
        assertEq(book.checkOrder(id, agent, 1, asset, 10 * USD, 1, MON_15H + 1 days), M.R_OFF_DAY);
        assertEq(book.checkOrder(id, agent, 1, asset, 10 * USD, 1, MON_15H + 2 days - 6 hours), M.R_OFF_HOURS);
        // before the version's start (the proposal time) both bits add up
        assertEq(book.checkOrder(id, agent, 1, asset, 10 * USD, 1, MON_15H - 6 hours), M.R_OFF_HOURS | M.R_NOT_STARTED);
        assertEq(book.checkOrder(id, agent, 1, asset, 10 * USD, 1, MON_15H + 2 days + 4 hours + 59 minutes), 0);
        assertEq(book.checkOrder(id, agent, 1, asset, 10 * USD, 1, MON_15H + 2 days + 5 hours), M.R_OFF_HOURS);
        vm.warp(MON_15H + 1 days);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.Refused.selector, M.R_OFF_DAY));
        book.recordOrder(id, 1, asset, 10 * USD, 1, "");
    }

    function test_aboveThresholdNeedsOrderApproval() public {
        uint256 id = openApproved();
        uint256 amount = 45 * USD;
        assertEq(check(id, amount, 7), M.R_NEEDS_APPROVAL);
        bytes32 key = book.orderKey(id, 1, asset, amount, 7);
        vm.prank(owner);
        book.approveOrder(id, key);
        assertEq(check(id, amount, 7), 0);
        // the approval is for that exact order: another nonce or amount still needs one
        assertEq(check(id, amount, 8), M.R_NEEDS_APPROVAL);
        assertEq(check(id, 44 * USD, 7), M.R_NEEDS_APPROVAL);
        vm.prank(agent);
        book.recordOrder(id, 1, asset, amount, 7, "");
        assertFalse(book.orderApproved(id, key));
        assertEq(check(id, 40 * USD, 9), 0); // at the threshold: no approval needed
    }

    function test_cancelOrderApproval() public {
        uint256 id = openApproved();
        bytes32 key = book.orderKey(id, 1, asset, 45 * USD, 1);
        vm.startPrank(owner);
        book.approveOrder(id, key);
        book.cancelOrderApproval(id, key);
        vm.stopPrank();
        assertEq(check(id, 45 * USD, 1), M.R_NEEDS_APPROVAL);
    }

    function test_nonceSingleUse() public {
        uint256 id = openApproved();
        vm.prank(agent);
        book.recordOrder(id, 1, asset, 10 * USD, 42, "");
        assertEq(check(id, 10 * USD, 42), M.R_NONCE_USED);
        assertTrue(book.nonceUsed(id, 42));
    }

    function test_minGap() public {
        LotiqRuleBook.RuleInput memory r = rule();
        r.minGap = 2 hours;
        vm.startPrank(owner);
        uint256 id = book.openBook("gap", r);
        book.approve(id, 1, r.ruleHash);
        vm.stopPrank();
        vm.prank(agent);
        book.recordOrder(id, 1, asset, 10 * USD, 1, "");
        assertEq(check(id, 10 * USD, 2), M.R_TOO_SOON);
        vm.warp(block.timestamp + 2 hours);
        assertEq(check(id, 10 * USD, 2), 0);
    }

    function test_validityWindow() public {
        LotiqRuleBook.RuleInput memory r = rule();
        r.validFrom = uint40(MON_15H + 2 days);
        r.validUntil = uint40(MON_15H + 9 days);
        vm.startPrank(owner);
        uint256 id = book.openBook("window", r);
        book.approve(id, 1, r.ruleHash);
        vm.stopPrank();
        assertEq(check(id, 10 * USD, 1), M.R_NOT_STARTED);
        assertEq(book.checkOrder(id, agent, 1, asset, 10 * USD, 1, MON_15H + 2 days), 0);
        assertEq(book.checkOrder(id, agent, 1, asset, 10 * USD, 1, MON_15H + 9 days), M.R_EXPIRED);
    }

    function test_zeroAmount() public {
        uint256 id = openApproved();
        assertEq(check(id, 0, 1), M.R_ZERO_AMOUNT);
    }

    function test_unknownBook() public view {
        assertEq(book.checkOrder(99, agent, 1, asset, 10 * USD, 1, block.timestamp), M.R_UNKNOWN_BOOK);
    }

    // ---- versions --------------------------------------------------------------------------------------------

    function test_newVersionSupersedesAndOldVersionRefused() public {
        uint256 id = openApproved();
        LotiqRuleBook.RuleInput memory r = rule();
        r.ruleHash = keccak256("v2");
        r.maxPerOrder = 80 * USD;
        r.maxPerPeriod = 200 * USD;
        r.approvalAbove = 100 * USD;
        vm.prank(owner);
        uint32 v2 = book.propose(id, r, 1);
        assertEq(v2, 2);
        // proposing alone changes nothing
        assertEq(check(id, 60 * USD, 1), M.R_OVER_ORDER_MAX | M.R_NEEDS_APPROVAL);
        vm.prank(owner);
        book.approve(id, 2, r.ruleHash);
        assertEq(book.getVersion(id, 1).status, book.STATUS_SUPERSEDED());
        assertEq(book.getVersion(id, 2).status, book.STATUS_ACTIVE());
        assertEq(book.getVersion(id, 2).parent, 1);
        assertEq(check(id, 60 * USD, 1), M.R_VERSION_MISMATCH);
        assertEq(book.checkOrder(id, agent, 2, asset, 60 * USD, 1, block.timestamp), 0);
    }

    function test_spendCarriesAcrossVersions() public {
        uint256 id = openApproved();
        vm.prank(agent);
        book.recordOrder(id, 1, asset, 40 * USD, 1, "");
        LotiqRuleBook.RuleInput memory r = rule();
        r.ruleHash = keccak256("v2 lower");
        r.maxPerOrder = 30 * USD;
        r.maxPerPeriod = 50 * USD;
        vm.startPrank(owner);
        book.propose(id, r, 1);
        book.approve(id, 2, r.ruleHash);
        vm.stopPrank();
        assertEq(book.checkOrder(id, agent, 2, asset, 20 * USD, 2, block.timestamp), M.R_OVER_PERIOD_MAX);
        assertEq(book.checkOrder(id, agent, 2, asset, 10 * USD, 2, block.timestamp), 0);
    }

    function test_withdrawProposed() public {
        uint256 id = openApproved();
        LotiqRuleBook.RuleInput memory r = rule();
        r.ruleHash = keccak256("draft");
        vm.startPrank(owner);
        book.propose(id, r, 1);
        book.withdraw(id, 2);
        vm.expectRevert(LotiqRuleBook.WrongStatus.selector);
        book.approve(id, 2, r.ruleHash);
        vm.expectRevert(LotiqRuleBook.WrongStatus.selector);
        book.withdraw(id, 1); // active, not proposed
        vm.expectRevert(LotiqRuleBook.UnknownVersion.selector);
        book.withdraw(id, 3);
        vm.stopPrank();
    }

    function test_cannotApproveExpiredProposal() public {
        LotiqRuleBook.RuleInput memory r = rule();
        r.validUntil = uint40(block.timestamp + 1 days);
        vm.prank(owner);
        uint256 id = book.openBook("short", r);
        vm.warp(block.timestamp + 1 days);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.BadRule.selector, uint8(7)));
        book.approve(id, 1, r.ruleHash);
    }

    // ---- pause / halt / revoke -----------------------------------------------------------------------------

    function test_pauseSameBlock() public {
        uint256 id = openApproved();
        vm.prank(owner);
        book.pause(id);
        assertEq(check(id, 10 * USD, 1), M.R_PAUSED);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.Refused.selector, M.R_PAUSED));
        book.recordOrder(id, 1, asset, 10 * USD, 1, "");
        vm.prank(owner);
        book.unpause(id);
        assertEq(check(id, 10 * USD, 1), 0);
    }

    function test_agentCanHaltButNotUnpause() public {
        uint256 id = openApproved();
        vm.prank(stranger);
        vm.expectRevert(LotiqRuleBook.NotAgent.selector);
        book.halt(id);
        vm.prank(agent);
        book.halt(id);
        assertTrue(book.getBook(id).paused);
        vm.prank(agent);
        vm.expectRevert(LotiqRuleBook.NotOwner.selector);
        book.unpause(id);
        vm.prank(agent);
        vm.expectRevert(LotiqRuleBook.AlreadyPaused.selector);
        book.halt(id);
    }

    function test_revokeIsFinal() public {
        uint256 id = openApproved();
        vm.prank(owner);
        book.revoke(id);
        assertEq(check(id, 10 * USD, 1), M.R_REVOKED);
        vm.startPrank(owner);
        vm.expectRevert(LotiqRuleBook.BookRevokedError.selector);
        book.unpause(id);
        vm.expectRevert(LotiqRuleBook.BookRevokedError.selector);
        book.propose(id, rule(), 1);
        vm.expectRevert(LotiqRuleBook.BookRevokedError.selector);
        book.revoke(id);
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(LotiqRuleBook.BookRevokedError.selector);
        book.halt(id);
    }

    function test_booksPerOwnerCapped() public {
        vm.startPrank(owner);
        for (uint256 i = 0; i < 64; i++) book.openBook(bytes32(i), rule());
        vm.expectRevert(LotiqRuleBook.TooManyBooks.selector);
        book.openBook("65", rule());
        vm.stopPrank();
        assertEq(book.booksOf(owner).length, 64);
    }

    function test_noEtherAccepted() public {
        (bool ok,) = address(book).call{value: 1 wei}("");
        assertFalse(ok);
    }

    function testFuzz_recordedNeverExceedsPeriod(uint128[8] memory amounts, uint8[8] memory gapsH) public {
        uint256 id = openApproved();
        LotiqRuleBook.RuleInput memory r = rule();
        for (uint256 i = 0; i < 8; i++) {
            uint256 amount = bound(amounts[i], 1, 200 * USD);
            vm.warp(block.timestamp + uint256(gapsH[i]) * 1 hours);
            uint256 bits = check(id, amount, uint64(i + 1));
            vm.prank(agent);
            if (bits == 0) {
                book.recordOrder(id, 1, asset, amount, uint64(i + 1), "");
            } else {
                vm.expectRevert(abi.encodeWithSelector(LotiqRuleBook.Refused.selector, bits));
                book.recordOrder(id, 1, asset, amount, uint64(i + 1), "");
            }
            assertLe(book.getBook(id).spent, r.maxPerPeriod);
        }
    }
}
