// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../ReverseSpecEscrow.sol";

interface Vm { function warp(uint256) external; }

contract MockUSDC is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount && allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ReverseSpecEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockUSDC private usdc;
    ReverseSpecEscrow private escrow;
    uint256 private constant UNIT = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new ReverseSpecEscrow(address(usdc), address(this));
        usdc.mint(address(this), 100 * UNIT);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function testUnacknowledgedFundsCannotBeSettled() public {
        escrow.fund(1, 5 * UNIT);
        address[] memory recipients = new address[](1);
        recipients[0] = address(this);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 * UNIT;
        (bool ok,) = address(escrow).call(
            abi.encodeCall(escrow.settle, (1, recipients, amounts))
        );
        require(!ok, "unacknowledged funds were allocatable");
    }

    function testAcknowledgedFundsSettleAndClaim() public {
        escrow.fund(1, 5 * UNIT);
        escrow.acknowledgeDeposit(1);
        address[] memory recipients = new address[](1);
        recipients[0] = address(this);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 * UNIT;
        escrow.settle(1, recipients, amounts);
        uint256 before = usdc.balanceOf(address(this));
        escrow.claim(1);
        require(usdc.balanceOf(address(this)) - before == 5 * UNIT, "wrong claim");
    }

    function testMistakenDepositRemainsRefundableAfterOtherFundsSettle() public {
        escrow.fund(1, 5 * UNIT); // deposit 1 remains unacknowledged
        escrow.fund(1, 5 * UNIT); // deposit 2 is valid
        escrow.acknowledgeDeposit(2);

        address[] memory recipients = new address[](1);
        recipients[0] = address(0xBEEF);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 * UNIT;
        escrow.settle(1, recipients, amounts);

        (bool withdrew,) = address(escrow).call(
            abi.encodeCall(escrow.withdrawUnallocated, (1, address(this), 5 * UNIT))
        );
        require(!withdrew, "owner withdrew a reserved refund");

        uint256 before = usdc.balanceOf(address(this));
        vm.warp(block.timestamp + escrow.REFUND_DELAY());
        escrow.refundUnacknowledged(1);
        require(usdc.balanceOf(address(this)) - before == 5 * UNIT, "refund failed");
    }
}
