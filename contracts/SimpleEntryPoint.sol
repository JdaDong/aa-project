pragma solidity ^0.8.28;

import "@account-abstraction/contracts/core/EntryPoint.sol";


contract SimpleEntryPoint is EntryPoint {
    constructor() EntryPoint() {}
}