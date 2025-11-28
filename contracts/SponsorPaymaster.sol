pragma solidity ^0.8.20;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

contract SponsorPaymaster is BasePaymaster {
    constructor(IEntryPoint _entrypoint) BasePaymaster(_entrypoint) {}

    // 接收 ETH 用于支付 gas
    receive() external payable {}

    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal override view returns (bytes memory context, uint256 validationData) {
        address sender = userOp.sender;
        console.log("_validatePaymasterUserOp sender:", sender);
        require(sender != address(0), "SponsorPaymaster: sender is zero address");
        require(address(sender).balance >= maxCost, "SponsorPaymaster: not enough balance");
       // PaymasterAndData = address + abi.encode(maxCost)
        // bytes memory pm = userOp.paymasterAndData[20:];
        // require(pm.length >= 32, "ETHPaymaster: pmData too short");
        // uint256 maxCost = abi.decode(pm, (uint256));

        // You can add “user balance >= maxCost” simulation here if needed.
        // But simplest version: always allow.

        // return (abi.encode(sender, maxCost), 0);  // context
        return (abi.encode(sender), 0);
    }


    function _postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost, uint256 actualUserOpFeePerGas)
        internal
        override
    {
        // 把 context 解码回 sender（和 validate 中一致）
        address sender = abi.decode(context, (address));
        console.log("_postOp sender:", sender);
        console.log("_postOp actualGasCost:", actualGasCost);
        console.log("_postOp actualUserOpFeePerGas:", actualUserOpFeePerGas);
        // 简单记录（生产中你可能要把 actualGasCost 按 USD 换算、收 token等）
        // emit PostOpHandled(sender, actualGasCost, mode)
        require(msg.sender == address(entryPoint), "not entrypoint");
    }
    
        


}

