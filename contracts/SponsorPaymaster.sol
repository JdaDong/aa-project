pragma solidity ^0.8.28;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/core/Helpers.sol";

import "hardhat/console.sol";

contract SponsorPaymaster is BasePaymaster {
    using UserOperationLib for PackedUserOperation;
    mapping(address => bool) public whiteList;
    mapping(address => uint256) public sponsorGasUsed;

    uint256 public constant PAYMASTER_VALID_OFFSET = 64;

    constructor(IEntryPoint _entryPoint) BasePaymaster(_entryPoint) {
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

        (uint48 validAfter, uint48 validUntil) = _parsePaymasterAndData(userOp.paymasterAndData);
        console.log("validUntil:", validUntil);
        console.log("validAfter:", validAfter);
        
        validationData = _packValidationData(false, validUntil, validAfter);
        context = abi.encode(userOp.sender);
    }


    function _postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost, uint256 actualUserOpFeePerGas)
        internal
        override
    {
        address sender = abi.decode(context, (address));
        console.log("actualGasCost: ", actualGasCost);
        if (mode != PostOpMode.opSucceeded) {
            return;
        } 
        sponsorGasUsed[sender] += actualGasCost;
    }

    function _parsePaymasterAndData(bytes calldata paymasterAndData)
        internal
        pure
        returns (uint48 validAfter, uint48 validUntil)
    {
        validAfter = uint48(bytes6(paymasterAndData[PAYMASTER_DATA_OFFSET:PAYMASTER_DATA_OFFSET+6]));
        validUntil = uint48(bytes6(paymasterAndData[PAYMASTER_DATA_OFFSET+6:PAYMASTER_DATA_OFFSET+12]));
    }

    // function _packContextData(PackedUserOperation calldata userOp, uint32 spentKey, bool allowAnyBundler) internal pure returns (bytes memory) {
    //     return abi.encode(userOp.gas, userOp.maxPriorityFeePerGas, spentKey, allowAnyBundler);
    // }



}

