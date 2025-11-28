pragma solidity ^0.8.20;

import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/IStakeManager.sol";
import "@account-abstraction/contracts/core/BaseAccount.sol";
import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/interfaces/INonceManager.sol";
import "@account-abstraction/contracts/core/UserOperationLib.sol";
import "@account-abstraction/contracts/core/Eip7702Support.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "hardhat/console.sol";

contract MinimalEntryPoint is IEntryPoint, ERC165 {
    using UserOperationLib for PackedUserOperation; 

    mapping(address => uint256) private _balances;


    constructor() {}

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IEntryPoint).interfaceId ||
            interfaceId == type(IStakeManager).interfaceId ||
            interfaceId == type(INonceManager).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    receive() external payable {}

    function handleOps(PackedUserOperation[] calldata userops, address payable beneficiary) external {
        uint256 gasBefore = gasleft();
        for (uint256 i = 0; i < userops.length; i++) {
            _handleSingleOp(userops[i], beneficiary);
        }
        uint256 gasAfter = gasleft();
        uint256 gasUsed = gasBefore - gasAfter;
        console.log("gasUsed: ", gasUsed * tx.gasprice);
        // In a real EP, you'd transfer gasUsed * tx.gasprice to beneficiary
        // For simplicity, we'll handle reimbursement inside _handleSingleOp
    }

    function _handleSingleOp(PackedUserOperation calldata userOp, address payable beneficiary) internal {
        // --- 1. Basic Validation & Setup ---
        // uint256 gasBeforeOp = gasleft();
        // 1) Account validation
        address sender = userOp.sender;
        BaseAccount account = BaseAccount(sender);
        console.log("sender: ", sender);
        console.log("beneficiary: ", beneficiary);
        bytes32 userOpHash = _getUserOpHash(userOp);
        // missingAccountFunds 在这里我们简单传 0（真实场景 EntryPoint 会计算）
        uint256 missingFunds = 0;
        uint256 validationData = account.validateUserOp(userOp, userOpHash, missingFunds);

        console.log("validationData: ", validationData);
        require(validationData == 0, "SimpleSmartAccount: invalid validationData");

        // ---------------------------
        // 2. Paymaster 预验证（validatePaymasterUserOp）
        // ---------------------------

        // 2) parse paymaster & pmData
        (address paymaster, ) = _parsePaymaster(userOp.paymasterAndData);
        // Enforce paymaster present in this minimal design — avoids bundler risk
        require(paymaster != address(0), "EntryPoint: no paymaster");

        // --- 3) Calculate maxCost estimate and check paymaster deposit ---
        uint256 maxCost = _estimatePreFund(userOp);
        require(_balances[paymaster] >= maxCost, "Paymaster deposit too low");

        // --- 4) Call paymaster.validatePaymasterUserOp (allow it to return context) ---
        bytes memory context;
        {
            // 调用 Paymaster.validatePaymasterUserOp
            (bool ok, bytes memory ret) =
                paymaster.call(
                    abi.encodeWithSelector(
                        BasePaymaster.validatePaymasterUserOp.selector,
                        userOp,
                        userOpHash,
                        maxCost // maxCost: 你可以按需要算，这里直接传 0，与 OZ version 兼容
                    )
                );

            require(ok, "Paymaster: validatePaymasterUserOp reverted");
            (context, validationData) = abi.decode(ret, (bytes, uint256));
            require(validationData == 0, "Paymaster: invalid validationData");
        }

         // --- 5) Execute the user's requested call via account.execute ---
        // we'll measure gas around the execution to compute actual cost
        uint256 gasBefore = gasleft();

        (address target, uint256 value, bytes memory data) = abi.decode(userOp.callData[4:],(address, uint256, bytes));
        account.execute(target, value, data);
        // 6) compute approximate actual gas used and cost in wei
        // approximate actual gas used for user execution (includes some overhead)
        // include preVerificationGas to reflect fees paid outside execution

        // compute actual cost in wei using tx.gasprice (simple approach)
        uint256 actualCost = (gasBefore - gasleft() + userOp.preVerificationGas) * tx.gasprice;
        // ---------------------------
        // Paymaster 后置处理（postOp）
        // ---------------------------
        // console.log("actualGasCost: ", actualGasCost);
        // 7) call paymaster.postOp(mode, context, actualCost
        {
            // OpenZeppelin 的 postOp 签名：
            paymaster.call(
                abi.encodeWithSelector(
                    BasePaymaster.postOp.selector,
                    IPaymaster.PostOpMode.opSucceeded,
                    context,
                    actualCost, // actualGasCost
                    tx.gasprice
                )
            );
            // ## Payment ##
            // Charge the paymaster and reimburse the beneficiary (bundler)
            // address payable bene = beneficiary;
            // _process_paymaster_payment(paymaster, actualCost, bene);
        }
        console.log("postOp done");

        // --- 7) Settle: deduct actualCost from paymaster deposit, pay to beneficiary (bundler) ---
        // Ensure paymaster has enough deposit (double-check)
        uint256 paymasterBal = _balances[paymaster];
        require(paymasterBal >= actualCost, "Paymaster deposit insufficient at settlement");
        _balances[paymaster] = paymasterBal - actualCost;

        // pay beneficiary
        (bool sent, ) = beneficiary.call{value: actualCost}("");
        require(sent, "transfer to beneficiary failed");

    }

    function _process_paymaster_payment(
        address paymaster,
        uint256 actualGasCost,
        address payable beneficiary
    ) internal {
        require(_balances[paymaster] >= actualGasCost, "Paymaster deposit too low");
        _balances[address(paymaster)] -= actualGasCost;
        uint256 be_balance = address(beneficiary).balance;
        _balances[beneficiary] += actualGasCost;
        (bool sent, ) = beneficiary.call{value: actualGasCost}("");
        require(sent, "AA: failed to reimburse beneficiary");
        console.log("get: ", address(beneficiary).balance - be_balance);

    }

    function _getUserOpHash(PackedUserOperation calldata op) internal view returns (bytes32) {
        bytes32 overrideInitCodeHash = Eip7702Support._getEip7702InitCodeHashOverride(op);
        return keccak256(abi.encode(op.hash(overrideInitCodeHash), address(this), block.chainid));
    }

    // --- IEntryPoint functions ---
    function getUserOpHash(PackedUserOperation calldata userOp) external view returns (bytes32) {
        return _getUserOpHash(userOp);
    }

    function handleAggregatedOps(
        UserOpsPerAggregator[] calldata opsPerAggregator,
        address payable beneficiary
    ) external {
        revert("handleAggregatedOps not implemented");
    }

    function getSenderAddress(bytes memory initCode) external {
        revert("getSenderAddress not implemented");
    }

    function delegateAndRevert(address target, bytes calldata data) external {
        revert("delegateAndRevert not implemented");
    }

    function senderCreator() external view returns (ISenderCreator) {
        revert("senderCreator not implemented");
    }

    // --- IStakeManager functions ---
    function addStake(uint32 unstakeDelaySec) external payable {}

    function unlockStake() external {}

    function withdrawStake(address payable withdrawAddress) external {}

    function depositTo(address account) external payable {
        _balances[account] += msg.value;
    }

    function withdrawTo(address payable withdrawAddress, uint256 amount) external {
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        _balances[msg.sender] -= amount;
        (bool success, ) = withdrawAddress.call{value: amount}("");
        require(success, "Withdraw failed");
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function getDepositInfo(address account) external view returns (DepositInfo memory info) {
        info.deposit = _balances[account];
        info.stake = 0;
        info.unstakeDelaySec = 0;
        return info;
    }

    // --- INonceManager functions ---
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce) {
        return 0; // Simplified: real implementation needed
    }

    function incrementNonce(uint192 key) external {
        // Simplified: real implementation needed
    }

    // very simple pre-fund estimator:
    // (preVerificationGas + verificationGasLimit + callGasLimit) * maxFeePerGas
    function _estimatePreFund(PackedUserOperation calldata op) internal pure returns (uint256) {
        // be careful about overflow; in tests this is fine
        uint256 gasSum = uint256(op.preVerificationGas) + uint256(op.accountGasLimits) + uint256(op.gasFees);
        // uint256 maxFee = uint256(op.maxFeePerGas);
        // return gasSum * maxFee;
        return gasSum;
    }

    // ------------------------
    // Helpers
    // ------------------------
    function _parsePaymaster(bytes calldata paymasterAndData) internal pure returns (address paymaster, bytes memory pmData) {
        if (paymasterAndData.length < 20) return (address(0), bytes(""));
        paymaster = address(bytes20(paymasterAndData[0:20]));
        pmData = paymasterAndData[20:];
    }

}