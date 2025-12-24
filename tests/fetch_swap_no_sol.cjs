const fs = require('fs');
const path = require('path');

const API_KEY = '906da665-33d5-46cb-99ca-4d77960f9005'; // Using the key from previous context if available, or I'll need to find one. 
// Wait, I should check if I have a fetch script that already has the key or uses an env var.
// Looking at previous file list, there is `tests/fetch_claim_fees.cjs`. I'll check its content to see how it fetches.

const fetchTransaction = async () => {
    const signature = '3q9FugiepxxMRKNTuw3489SjgLzqEZQDLBrHC4zCGo9KHTcj8HF55B53ddsPLYCdvKVTcSeGr8LontSCh6jxgBjE';
    const url = `https://api.helius.xyz/v0/transactions/?api-key=${API_KEY}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                transactions: [signature]
            })
        });
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            fs.writeFileSync(
                path.join(__dirname, 'issue_swap_no_sol.json'), 
                JSON.stringify(data[0], null, 2)
            );
            console.log('Transaction saved to issue_swap_no_sol.json');
        } else {
            console.log('No transaction found');
        }
    } catch (error) {
        console.error('Error fetching transaction:', error);
    }
};

fetchTransaction();
