// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title HitKoin — HITMANS VIP After Spot's member reward token.
/// @notice A loyalty currency, not an investment: minted to a member's
/// wallet the moment they pay for something (membership, bingo, perks),
/// redeemable for real venue perks. The owner (the venue's backend wallet)
/// is the only address that can mint or change who's allowed to mint —
/// members can hold, spend, and send it like any ERC-20, but never mint it
/// themselves.
contract HitKoin is ERC20, Ownable {
    // Lets the backend rotate its own signing key without redeploying the
    // contract or losing the minting history already on-chain.
    address public minter;

    event MinterUpdated(address indexed oldMinter, address indexed newMinter);

    error NotMinter();
    error ZeroAddress();

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    constructor(address initialMinter) ERC20("HitKoin", "HITK") Ownable(msg.sender) {
        if (initialMinter == address(0)) revert ZeroAddress();
        minter = initialMinter;
        emit MinterUpdated(address(0), initialMinter);
    }

    /// @notice Mint HitKoin to a member's wallet. Called by the venue
    /// backend right after a payment (cash/Zelle/PayPal/crypto) confirms.
    function mint(address to, uint256 amount) external onlyMinter {
        if (to == address(0)) revert ZeroAddress();
        _mint(to, amount);
    }

    /// @notice Mint to several members in one transaction (e.g. a bingo
    /// night payout to every winner) — cheaper than one tx per member.
    function mintBatch(address[] calldata to, uint256[] calldata amounts) external onlyMinter {
        uint256 len = to.length;
        require(len == amounts.length, "length mismatch");
        for (uint256 i = 0; i < len; i++) {
            if (to[i] == address(0)) revert ZeroAddress();
            _mint(to[i], amounts[i]);
        }
    }

    function setMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) revert ZeroAddress();
        emit MinterUpdated(minter, newMinter);
        minter = newMinter;
    }
}
