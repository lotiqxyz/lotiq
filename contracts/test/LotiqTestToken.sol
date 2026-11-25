// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Test-only ERC-20 for the holder-tier E2E on a local devnet. Never deployed to a public chain.
contract LotiqTestToken {
    string public constant name = "Lotiq Test";
    string public constant symbol = "TLOTIQ";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(uint256 supply) {
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
        emit Transfer(address(0), msg.sender, supply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }
}
