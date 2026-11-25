// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LotiqRuleBook} from "../src/LotiqRuleBook.sol";
import {LotiqRuleMath as M} from "../src/LotiqRuleMath.sol";
import {LotiqAssetStub} from "./LotiqRuleBook.t.sol";

/// @dev Random owner and agent actions against one book. Tracks what a correct book must look like.
contract LotiqBookHandler is Test {
    LotiqRuleBook public book;
    uint256 public id;
    address public owner = address(0x0123);
    address public agent = address(0x0456);
    address public asset;
    uint64 public nextNonce = 1;
    uint256 public recorded; // successful recordOrder calls
    uint256 public maxSeenOverLimit; // spent above the active version's period limit, if ever (must stay 0)
    bool public recordedWhilePaused;
    bool public recordedWithBits;
    uint32 public lastApproved = 1;
    uint256 public approvedRecorded;

    constructor(LotiqRuleBook b, address a) {
        book = b;
        asset = a;
        vm.warp(1795446000);
        vm.startPrank(owner);
        id = book.openBook("inv", _rule(keccak256("v1"), 50e6, 120e6, 40e6));
        book.approve(id, 1, keccak256("v1"));
        vm.stopPrank();
    }

    function _rule(bytes32 h, uint128 order, uint128 period, uint128 approvalAbove)
        internal
        view
        returns (LotiqRuleBook.RuleInput memory)
    {
        return LotiqRuleBook.RuleInput({
            ruleHash: h,
            agent: agent,
            asset: asset,
            maxPerOrder: order,
            maxPerPeriod: period,
            approvalAbove: approvalAbove,
            period: 7 days,
            minGap: 0,
            days_: 0x7f,
            startHour: 0,
            endHour: 24,
            validFrom: 0,
            validUntil: uint40(block.timestamp + 700 days)
        });
    }

    function record(uint256 amount, bool reuseNonce) external {
        amount = bound(amount, 0, 300e6);
        uint64 nonce = reuseNonce && nextNonce > 1 ? nextNonce - 1 : nextNonce++;
        LotiqRuleBook.Book memory before = book.getBook(id);
        uint256 bits = book.checkOrder(id, agent, before.active, asset, amount, nonce, block.timestamp);
        vm.prank(agent);
        try book.recordOrder(id, before.active, asset, amount, nonce, "") {
            recorded++;
            if (before.paused) recordedWhilePaused = true;
            if (bits != 0) recordedWithBits = true;
            _track();
        } catch {}
    }

    function approveBig(uint256 amount) external {
        amount = bound(amount, 40e6 + 1, 300e6);
        LotiqRuleBook.Book memory b = book.getBook(id);
        bytes32 key = book.orderKey(id, b.active, asset, amount, nextNonce);
        vm.prank(owner);
        book.approveOrder(id, key);
        vm.prank(agent);
        try book.recordOrder(id, b.active, asset, amount, nextNonce, "") {
            recorded++;
            approvedRecorded++;
            if (b.paused) recordedWhilePaused = true;
            _track();
        } catch {}
        nextNonce++;
    }

    function newVersion(uint128 order, uint128 period) external {
        period = uint128(bound(period, 1e6, 500e6));
        order = uint128(bound(order, 1e6, period));
        LotiqRuleBook.Book memory b = book.getBook(id);
        bytes32 h = keccak256(abi.encode(b.versions + 1, order, period));
        vm.startPrank(owner);
        uint32 v = book.propose(id, _rule(h, order, period, order / 2), b.active);
        book.approve(id, v, h);
        vm.stopPrank();
        lastApproved = v;
    }

    function togglePause() external {
        LotiqRuleBook.Book memory b = book.getBook(id);
        vm.prank(owner);
        if (b.paused) book.unpause(id);
        else book.pause(id);
    }

    function warp(uint256 hoursAhead) external {
        vm.warp(block.timestamp + bound(hoursAhead, 1, 200));
    }

    function _track() internal {
        LotiqRuleBook.Book memory b = book.getBook(id);
        LotiqRuleBook.RuleVersion memory v = book.getVersion(id, b.active);
        // Called right after a successful record: what is spent in this window must fit the version it was recorded under.
        uint256 spent = M.spentAt(b.windowStart, b.spent, block.timestamp, v.period);
        if (spent > v.maxPerPeriod) maxSeenOverLimit = spent;
    }
}

contract LotiqRuleBookInvariant is Test {
    LotiqRuleBook book;
    LotiqBookHandler handler;

    function setUp() public {
        book = new LotiqRuleBook();
        handler = new LotiqBookHandler(book, address(new LotiqAssetStub()));
        targetContract(address(handler));
    }

    function invariant_neverOverPeriodWhenRecording() public view {
        assertEq(handler.maxSeenOverLimit(), 0);
    }

    function invariant_noRecordWhilePausedOrWithBits() public view {
        assertFalse(handler.recordedWhilePaused());
        assertFalse(handler.recordedWithBits());
    }

    function invariant_orderCountMatches() public view {
        assertEq(book.getBook(handler.id()).orders, handler.recorded());
    }

    function invariant_exactlyOneActiveVersion() public view {
        LotiqRuleBook.Book memory b = book.getBook(handler.id());
        uint256 active;
        for (uint32 v = 1; v <= b.versions; v++) {
            if (book.getVersion(handler.id(), v).status == book.STATUS_ACTIVE()) active++;
        }
        assertEq(active, 1);
        assertEq(b.active, handler.lastApproved());
    }

    function invariant_holdsNothing() public view {
        assertEq(address(book).balance, 0);
    }
}
