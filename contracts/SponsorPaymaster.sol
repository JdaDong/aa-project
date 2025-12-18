pragma solidity ^0.8.28;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/core/Helpers.sol";

import "hardhat/console.sol";

contract SponsorPaymaster is BasePaymaster {
    mapping(address => bool) public whiteList;

    uint256 public constant PAYMASTER_VALID_OFFSET = 64;

    constructor(IEntryPoint _entryPoint) BasePaymaster(_entryPoint) {
        console.log("SponsorPaymaster constructor tx.origin:", tx.origin);
        if (tx.origin != msg.sender) {
            _transferOwnership(msg.sender);
        }
    }

    // 接收 ETH 用于支付 gas
    receive() external payable {}

    function addToWhiteList(address _addr) external onlyOwner {
        whiteList[_addr] = true;
    }

    function removeWhiteList(address _addr) external onlyOwner {
        whiteList[_addr] = false;
    }


    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal override view returns (bytes memory context, uint256 validationData) {
        if (!whiteList[userOp.sender]) {
            revert("Not whiteList");
        }
        (uint48 validAfter, uint48 validUntil) = abi.decode(userOp.paymasterAndData[PAYMASTER_DATA_OFFSET:], (uint48, uint48));
        validationData = _packValidationData(false, validUntil, validAfter);
        context = "";
    }


    function _postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost, uint256 actualUserOpFeePerGas)
        internal
        override
    {
        if (mode == PostOpMode.opReverted) {
            // The operation was reverted, handle accordingly
        } else if (mode == PostOpMode.postOpReverted) {
            // The operation was successful, but postOp was reverted in the first call
        }
    }


}

