// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Base Sepolia USDC custody for Reverse Spec Bounties v1. GenLayer
/// judges submissions and decides payouts (see contracts/reverse_spec_bounties.py);
/// this contract only holds funding deposits and exposes pull-based claims.
/// It never itself decides who gets paid — that decision is relayed in from
/// GenLayer's `get_base_payouts` view by the trusted relayer.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ReverseSpecEscrow {
    struct BountyPool { uint256 deposited; uint256 allocated; bool settled; }
    struct Deposit { uint256 bountyId; address funder; uint256 amount; uint64 refundableAt; bool acknowledged; bool refunded; }

    uint256 public constant REFUND_DELAY = 7 days;

    IERC20 public immutable usdc;
    address public owner;
    address public relayer;
    bool private locked;
    mapping(uint256 => BountyPool) public pools;
    mapping(uint256 => mapping(address => uint256)) public claimable;
    mapping(uint256 => Deposit) public deposits;
    mapping(uint256 => uint256) public unacknowledgedTotal;
    uint256 public depositSeq;

    event Funded(uint256 indexed bountyId, address indexed funder, uint256 amount, uint256 indexed depositId);
    event DepositAcknowledged(uint256 indexed depositId);
    event DepositRefunded(uint256 indexed depositId, address indexed funder, uint256 amount);
    event Settled(uint256 indexed bountyId, uint256 recipientCount, uint256 allocated);
    event Claimed(uint256 indexed bountyId, address indexed recipient, uint256 amount);
    event RelayerUpdated(address indexed relayer);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyRelayer() { require(msg.sender == relayer, "not relayer"); _; }
    modifier nonReentrant() { require(!locked, "reentrant"); locked = true; _; locked = false; }

    constructor(address usdc_, address relayer_) {
        require(usdc_ != address(0) && relayer_ != address(0), "zero address");
        usdc = IERC20(usdc_);
        owner = msg.sender;
        relayer = relayer_;
    }

    /// @dev Wallet must approve this contract first. Amount is USDC base
    /// units (6 decimals). `bountyId` must match the id returned by
    /// `create_bounty` on the GenLayer contract — the off-chain relayer
    /// (backend/relayer/fundingRelay.js) reads this event and confirms the
    /// deposit on GenLayer via `record_funding`, which is what actually
    /// opens the bounty to submissions.
    function fund(uint256 bountyId, uint256 amount) external nonReentrant {
        require(amount > 0 && !pools[bountyId].settled, "invalid funding");
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transferFrom failed");
        pools[bountyId].deposited += amount;
        unacknowledgedTotal[bountyId] += amount;
        uint256 depositId = ++depositSeq;
        deposits[depositId] = Deposit(bountyId, msg.sender, amount, uint64(block.timestamp + REFUND_DELAY), false, false);
        emit Funded(bountyId, msg.sender, amount, depositId);
    }

    function acknowledgeDeposit(uint256 depositId) external onlyRelayer {
        Deposit storage deposit = deposits[depositId];
        require(deposit.funder != address(0), "unknown deposit");
        if (deposit.acknowledged) return;
        require(!deposit.refunded, "deposit refunded");
        deposit.acknowledged = true;
        unacknowledgedTotal[deposit.bountyId] -= deposit.amount;
        emit DepositAcknowledged(depositId);
    }

    /// @notice Recover a mistaken or permanently unacknowledged deposit.
    function refundUnacknowledged(uint256 depositId) external nonReentrant {
        Deposit storage deposit = deposits[depositId];
        require(msg.sender == deposit.funder, "not funder");
        require(!deposit.acknowledged && !deposit.refunded, "not refundable");
        require(block.timestamp >= deposit.refundableAt, "refund delay active");
        BountyPool storage pool = pools[deposit.bountyId];
        require(pool.deposited - pool.allocated >= deposit.amount, "funds already allocated");
        deposit.refunded = true;
        unacknowledgedTotal[deposit.bountyId] -= deposit.amount;
        pool.deposited -= deposit.amount;
        require(usdc.transfer(deposit.funder, deposit.amount), "USDC transfer failed");
        emit DepositRefunded(depositId, deposit.funder, deposit.amount);
    }

    /// @notice Idempotency is enforced on-chain: one finalized payout list
    /// per bounty. `recipients`/`amounts` come from GenLayer's
    /// `get_base_payouts(bountyId)` view, which only returns non-empty
    /// once consensus has finalized (or cancelled/reclaimed) the bounty.
    function settle(uint256 bountyId, address[] calldata recipients, uint256[] calldata amounts) external onlyRelayer {
        require(recipients.length == amounts.length && recipients.length > 0, "invalid allocations");
        BountyPool storage pool = pools[bountyId];
        require(!pool.settled, "already settled");
        uint256 total;
        for (uint256 i; i < amounts.length; ++i) {
            require(recipients[i] != address(0), "zero recipient");
            total += amounts[i];
        }
        require(total <= pool.deposited - unacknowledgedTotal[bountyId], "allocation exceeds acknowledged pool");
        pool.settled = true;
        pool.allocated = total;
        for (uint256 i; i < amounts.length; ++i) claimable[bountyId][recipients[i]] += amounts[i];
        emit Settled(bountyId, recipients.length, total);
    }

    function claim(uint256 bountyId) external nonReentrant {
        uint256 amount = claimable[bountyId][msg.sender];
        require(amount > 0, "nothing claimable");
        claimable[bountyId][msg.sender] = 0;
        require(usdc.transfer(msg.sender, amount), "USDC transfer failed");
        emit Claimed(bountyId, msg.sender, amount);
    }

    function setRelayer(address relayer_) external onlyOwner {
        require(relayer_ != address(0), "zero relayer"); relayer = relayer_; emit RelayerUpdated(relayer_);
    }

    /// @notice Recover post-settlement dust only. Before settlement,
    /// unacknowledged deposits remain reserved for their funders' timeout
    /// recovery and acknowledged deposits remain reserved for adjudication.
    function withdrawUnallocated(uint256 bountyId, address to, uint256 amount) external onlyOwner nonReentrant {
        BountyPool storage pool = pools[bountyId];
        require(pool.settled, "bounty not settled");
        require(to != address(0) && amount <= pool.deposited - pool.allocated - unacknowledgedTotal[bountyId], "invalid withdrawal");
        pool.deposited -= amount;
        require(usdc.transfer(to, amount), "USDC transfer failed");
    }
}
