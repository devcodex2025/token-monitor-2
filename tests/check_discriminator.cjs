const crypto = require('crypto');

function getDiscriminator(name) {
    const hash = crypto.createHash('sha256').update(`global:${name}`).digest();
    return hash.slice(0, 8).toString('hex');
}

const instructions = [
    'add_liquidity',
    'add_liquidity_by_strategy',
    'add_liquidity_one_side',
    'add_liquidity_by_weight',
    'remove_liquidity',
    'remove_liquidity_by_range',
    'remove_all_liquidity',
    'claim_fee',
    'swap',
    'initialize_position',
    'add_liquidity_by_strategy_one_side',
    'add_liquidity_one_side_strategy',
    'add_liquidity_single_side_strategy',
    'add_liquidity_strategy_one_side'
];

instructions.forEach(ix => {
    console.log(`${ix}: ${getDiscriminator(ix)}`);
});
