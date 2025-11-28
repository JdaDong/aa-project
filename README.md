# AA-Project-Demo

这是一个基于 EIP-4337 实现账户抽象（Account Abstraction）的简化版演示项目。

## 合约介绍

项目中包含三个核心合约：

-   `contracts/SimpleSmartAccount.sol`: 一个基础的智能合约账户。它由一个外部账户（EOA）作为拥有者，负责验证交易签名和执行操作。
-   `contracts/MinimalEntryPoint.sol`: 一个简化的入口点合约。它是整个 AA 流程的协调者，负责接收和执行由 Bundler 提交的 `UserOperation`。
-   `contracts/SponsorPaymaster.sol`: 一个用于赞助 Gas 费用的 Paymaster 合约。它可以为指定的 `UserOperation` 支付交易费用，实现 Gas 代付。

## 如何运行测试

你可以使用以下命令来运行本项目的测试：

```bash
npx hardhat test
```

该命令会执行 `test/deployAndSendOp.ts` 脚本，这个脚本完整地模拟了整个账户抽象流程：

1.  创建并部署所有核心合约。
2.  构造一个 `UserOperation`，请求 `SponsorPaymaster` 来赞助 Gas。
3.  由模拟的 Bundler 调用 `MinimalEntryPoint` 的 `handleOps` 函数来执行该操作。
4.  验证 `SimpleSmartAccount` 的转账操作是否成功，以及 Gas 费用是否由 Paymaster 正确支付。


使用命令

```bash
npx hardhat test test/deployAndSendOp.ts --network localhost
```
