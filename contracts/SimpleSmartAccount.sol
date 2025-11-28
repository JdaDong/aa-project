pragma solidity ^0.8.19;

import "@account-abstraction/contracts/core/BaseAccount.sol";
import "@account-abstraction/contracts/core/Helpers.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from '@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol';

import "hardhat/console.sol";


contract SimpleSmartAccount is BaseAccount {
    // using ECDSA for bytes32;
    


    address public owner;
    IEntryPoint private immutable _entrypoint; 

    constructor(address _owner, IEntryPoint entrypoint) {
        owner = _owner;
        _entrypoint = entrypoint;
    }

    function entryPoint() public override view returns(IEntryPoint) {
        return _entrypoint;
    }

    receive() external payable {}

    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal override virtual returns (uint256 validationData) {
        bytes32 ethSignedMessageHash=MessageHashUtils.toEthSignedMessageHash(userOpHash);
        address signer = ECDSA.recover(ethSignedMessageHash, userOp.signature);
        console.logBytes( userOp.signature);
        console.log("signer: ", signer);
        console.log("owner: ", owner);
        require(signer == owner, "SimpleSmartAccount: invalid signer");
        return 0;
    }
    


    function execute(address target, uint256 value, bytes calldata data) override external {
        _requireFromEntryPoint();
        (bool success, ) = target.call{value: value}(data);
        require(success, "execute failed");
    }


}
