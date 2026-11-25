// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LotiqRuleBook} from "../src/LotiqRuleBook.sol";
import {LotiqRuleMath as M} from "../src/LotiqRuleMath.sol";

interface ILotiqFeed {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
    function decimals() external view returns (uint8);
}

interface ILotiqToken {
    function symbol() external view returns (string memory);
    function totalSupply() external view returns (uint256);
}

/// @notice Runs against a Robinhood Chain fork:
///         forge test --match-contract Fork --fork-url <rpc> --evm-version cancun
///         Skips itself when not on chain 4663.
contract LotiqForkTest is Test {
    // Robinhood stock tokens (beacon proxies; identity proven by code hash + beacon slot + minted supply, see /method).
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address constant NVDA_FEED = 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15;
    bytes32 constant STOCK_PROXY_CODEHASH = 0x6c1fdd40002dcb440c7fff6a84171404d279ccb057803b65826f7546acd65630;
    bytes32 constant BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;
    address constant STOCK_BEACON = 0xe10b6f6B275de231345c20D14Ab812db62151b00;

    LotiqRuleBook book;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");

    function setUp() public {
        if (block.chainid != 4663) return;
        book = new LotiqRuleBook();
    }

    modifier onFork() {
        if (block.chainid != 4663) {
            vm.skip(true);
            return;
        }
        _;
    }

    function _rule(address asset) internal view returns (LotiqRuleBook.RuleInput memory) {
        return LotiqRuleBook.RuleInput({
            ruleHash: keccak256("fork rule"),
            agent: agent,
            asset: asset,
            maxPerOrder: 50e6,
            maxPerPeriod: 200e6,
            approvalAbove: 40e6,
            period: 7 days,
            minGap: 0,
            days_: M.ALL_DAYS,
            startHour: 0,
            endHour: 24,
            validFrom: 0,
            validUntil: uint40(block.timestamp + 30 days)
        });
    }

    function test_realStockTokenIdentity() public onFork {
        assertEq(NVDA.codehash, STOCK_PROXY_CODEHASH);
        assertEq(address(uint160(uint256(vm.load(NVDA, BEACON_SLOT)))), STOCK_BEACON);
        assertGt(ILotiqToken(NVDA).totalSupply(), 0);
        assertEq(keccak256(bytes(ILotiqToken(NVDA).symbol())), keccak256("NVDA"));
    }

    function test_bookOnRealToken() public onFork {
        vm.startPrank(owner);
        uint256 id = book.openBook("nvda weekly", _rule(NVDA));
        book.approve(id, 1, keccak256("fork rule"));
        vm.stopPrank();
        assertEq(book.checkOrder(id, agent, 1, NVDA, 30e6, 1, block.timestamp), 0);
        assertEq(book.checkOrder(id, agent, 1, TSLA, 30e6, 1, block.timestamp), M.R_WRONG_ASSET);
        vm.prank(agent);
        book.recordOrder(id, 1, NVDA, 30e6, 1, "fork");
        assertEq(book.getBook(id).spent, 30e6);
    }

    function test_feedPricesAnOrder() public onFork {
        (, int256 answer,, uint256 updatedAt,) = ILotiqFeed(NVDA_FEED).latestRoundData();
        assertGt(answer, 0);
        assertGt(updatedAt, 0);
        assertEq(ILotiqFeed(NVDA_FEED).decimals(), 8);
        // 0.25 NVDA token in USD (6 dec), as the site computes it: qty * price / 10^(8 + 18 - 6)
        uint256 usd = (0.25e18 * uint256(answer)) / 1e20;
        assertGt(usd, 0);
    }

    function test_deployGas() public onFork {
        uint256 g = gasleft();
        new LotiqRuleBook();
        emit log_named_uint("deploy gas (fork)", g - gasleft());
    }
}
