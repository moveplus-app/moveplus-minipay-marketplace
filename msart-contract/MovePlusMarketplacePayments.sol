// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
    MovePlusMarketplacePayments

    Purpose:
    - Minimal Celo mainnet contract for Move+ real-item marketplace payment proof.
    - Products, delivery, Energy, and fulfillment remain off-chain.
    - MiniPay/Celo stablecoin payments can be recorded on-chain after backend verification.
    - Optional direct contract payment is available, but ERC20 payOrder requires allowance first.

    Notes:
    - recordDirectPayment() is best for current MiniPay flow:
      user pays stablecoin directly to treasury, backend verifies tx, owner records receipt.
    - payOrder() is optional future flow:
      user approves this contract, then calls payOrder().
*/

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract MovePlusMarketplacePayments is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum PaymentMode {
        Unknown,
        ContractPull,
        DirectTreasuryTransfer
    }

    struct Payment {
        address payer;
        address token;
        uint256 amount;
        uint64 paidAt;
        bytes32 paymentTxHash;
        PaymentMode mode;
    }

    address public treasury;

    mapping(address => bool) public allowedTokens;
    mapping(bytes32 => Payment) private payments;

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event AllowedTokenUpdated(address indexed token, bool allowed);

    event OrderPaid(
        bytes32 indexed orderIdHash,
        address indexed payer,
        address indexed token,
        uint256 amount,
        address treasury,
        bytes32 paymentTxHash,
        PaymentMode mode
    );

    error ZeroAddress();
    error ZeroAmount();
    error ZeroOrderId();
    error TokenNotAllowed();
    error OrderAlreadyPaid();
    error InvalidPaymentTxHash();

    constructor(
        address initialTreasury,
        address[] memory initialAllowedTokens
    ) Ownable(msg.sender) {
        _setTreasury(initialTreasury);

        for (uint256 i = 0; i < initialAllowedTokens.length; i++) {
            _setAllowedToken(initialAllowedTokens[i], true);
        }
    }

    /*
        Optional future direct contract payment.

        IMPORTANT:
        ERC20 transferFrom requires allowance.
        User must approve this contract first before calling payOrder().
        For MiniPay v1, current direct-to-treasury flow is simpler.
    */
    function payOrder(
        bytes32 orderIdHash,
        address token,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (orderIdHash == bytes32(0)) revert ZeroOrderId();
        if (amount == 0) revert ZeroAmount();
        if (!allowedTokens[token]) revert TokenNotAllowed();
        if (payments[orderIdHash].paidAt != 0) revert OrderAlreadyPaid();

        IERC20(token).safeTransferFrom(msg.sender, treasury, amount);

        _recordPayment({
            orderIdHash: orderIdHash,
            payer: msg.sender,
            token: token,
            amount: amount,
            paymentTxHash: bytes32(0),
            mode: PaymentMode.ContractPull
        });
    }

    /*
        Best for current MiniPay flow.

        Flow:
        1. User pays USDC directly to treasury from MiniPay.
        2. Backend verifies tx_hash, token, amount, payer, and treasury.
        3. Owner records the verified payment on-chain using this function.
    */
    function recordDirectPayment(
        bytes32 orderIdHash,
        address payer,
        address token,
        uint256 amount,
        bytes32 paymentTxHash
    ) external onlyOwner whenNotPaused {
        if (orderIdHash == bytes32(0)) revert ZeroOrderId();
        if (payer == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (paymentTxHash == bytes32(0)) revert InvalidPaymentTxHash();
        if (!allowedTokens[token]) revert TokenNotAllowed();
        if (payments[orderIdHash].paidAt != 0) revert OrderAlreadyPaid();

        _recordPayment({
            orderIdHash: orderIdHash,
            payer: payer,
            token: token,
            amount: amount,
            paymentTxHash: paymentTxHash,
            mode: PaymentMode.DirectTreasuryTransfer
        });
    }

    function _recordPayment(
        bytes32 orderIdHash,
        address payer,
        address token,
        uint256 amount,
        bytes32 paymentTxHash,
        PaymentMode mode
    ) internal {
        payments[orderIdHash] = Payment({
            payer: payer,
            token: token,
            amount: amount,
            paidAt: uint64(block.timestamp),
            paymentTxHash: paymentTxHash,
            mode: mode
        });

        emit OrderPaid(
            orderIdHash,
            payer,
            token,
            amount,
            treasury,
            paymentTxHash,
            mode
        );
    }

    function getPayment(bytes32 orderIdHash)
        external
        view
        returns (
            address payer,
            address token,
            uint256 amount,
            uint64 paidAt,
            bytes32 paymentTxHash,
            PaymentMode mode
        )
    {
        Payment memory payment = payments[orderIdHash];

        return (
            payment.payer,
            payment.token,
            payment.amount,
            payment.paidAt,
            payment.paymentTxHash,
            payment.mode
        );
    }

    function isPaid(bytes32 orderIdHash) external view returns (bool) {
        return payments[orderIdHash].paidAt != 0;
    }

    function hashOrderId(string calldata orderId) external pure returns (bytes32) {
        return keccak256(bytes(orderId));
    }

    function setTreasury(address newTreasury) external onlyOwner {
        _setTreasury(newTreasury);
    }

    function _setTreasury(address newTreasury) internal {
        if (newTreasury == address(0)) revert ZeroAddress();

        address oldTreasury = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function setAllowedToken(address token, bool allowed) external onlyOwner {
        _setAllowedToken(token, allowed);
    }

    function _setAllowedToken(address token, bool allowed) internal {
        if (token == address(0)) revert ZeroAddress();

        allowedTokens[token] = allowed;

        emit AllowedTokenUpdated(token, allowed);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /*
        Safety rescue only.
        Contract normally should not hold funds because payOrder forwards directly to treasury.
    */
    function rescueToken(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(treasury, amount);
    }

    function rescueNative(uint256 amount) external onlyOwner {
        payable(treasury).transfer(amount);
    }

    receive() external payable {}
}
