pragma solidity ^0.8.28;

import "@account-abstraction/contracts/accounts/Simple7702Account.sol";

import "hardhat/console.sol";


contract SimpleSmartAccount is Simple7702Account {
    constructor() Simple7702Account() {}
}
