# Move+ MiniPay Marketplace

Move+ is a gamified fitness app where users walk, run, and cycle to earn Energy rewards.

This repository contains the public proof-of-ship implementation for the Move+ real-item marketplace, MiniPay/Celo checkout integration, and Celo mainnet payment proof contract.

## Links

**MiniPay Marketplace URL**  
https://amayatoken.online/moveplus/marketplace/?v=20260708-submit-1

**Celo Mainnet Payment Contract**  
MovePlusMarketplacePayments  
0x5A49DA3337bBd589065cbd5d89090BDb06b51A18

**cUSD Token on Celo Mainnet**  
0x765DE816845861e75A25fCA122bb6898B8B1282a

**Network**  
Celo Mainnet

## MiniPay Submission

Move+ Marketplace has been submitted for MiniPay Explore review.

The submission version focuses on real fitness items, cart checkout, delivery details, and cUSD payment support through MiniPay.

## Concept

Move+ connects real-world fitness activity to real-world commerce.

Users earn off-chain Energy through the Move+ fitness app. They can use Energy inside the main Move+ app marketplace or pay with cUSD through MiniPay for real marketplace items.

## Current Marketplace Flow

1. User browses real fitness products
2. Product price is displayed in Energy Points and cUSD
3. User adds item to cart
4. User enters delivery details
5. User can open Move+ app to redeem with Energy
6. User can pay with cUSD through MiniPay when opened inside MiniPay
7. Backend verifies the Celo transaction
8. Order is marked paid and pending fulfillment

## MiniPay Checkout Flow

Move+ Marketplace  
→ Add item to cart  
→ Checkout  
→ Pay with cUSD through MiniPay  
→ MiniPay wallet signs Celo payment  
→ Backend verifies transaction  
→ Order marked paid  
→ Optional on-chain receipt proof through MovePlusMarketplacePayments

If the checkout page is opened outside MiniPay, the app shows that wallet signing is unavailable and asks the user to open the marketplace inside MiniPay.

## Celo Mainnet Contract

**MovePlusMarketplacePayments**

Contract: `0x5A49DA3337bBd589065cbd5d89090BDb06b51A18`

Purpose:

- On-chain payment proof for Move+ MiniPay marketplace checkout
- Records verified marketplace payment receipts
- Emits `OrderPaid`
- Keeps products, delivery, Energy, and fulfillment off-chain

The contract allows cUSD as a supported token:

`0x765DE816845861e75A25fCA122bb6898B8B1282a`

## Digital Gear

Move+ Digital Gear is currently preview-only in the web marketplace.

Digital Gear includes Move+ Genesis Gear, Shoeboxes, and Founder Gear previews. Purchase and management of Digital Gear happen inside the main Move+ app.

MiniPay checkout currently applies only to real items.

## Scope

- Real-item marketplace
- Philippines delivery only
- Energy Points display
- cUSD checkout through MiniPay
- Off-chain product catalog and delivery details
- Backend transaction verification
- Celo mainnet payment proof contract
- Admin-managed marketplace products
- Limited-time offer / discount expiry support

## What Stays Off-Chain

- Product catalog
- Delivery details
- User Energy balance
- Order fulfillment
- Admin marketplace management
- Digital Gear ownership and management
- Customer personal information

## What Goes On-Chain

- cUSD payment transaction
- Optional payment receipt proof
- `OrderPaid` event from the Celo mainnet contract

No customer name, phone number, email, delivery address, or comments are stored on-chain.

## Payment Methods

Current:

- Energy Points inside the main Move+ app
- cUSD through MiniPay on Celo

Future:

- Energy voucher + MiniPay
- Ronin payment adapter
- Base payment adapter

## Delivery

The marketplace is currently designed for **Philippines delivery only**.

International delivery may be added later after logistics and payment rules are reviewed.

## Security Notes

- No private keys are stored in this repository
- No seed phrases or deployer keys are included
- No Supabase service role key is exposed to frontend code
- MiniPay checkout uses backend transaction verification
- Energy Points are separate from crypto checkout
- MiniPay payment does not deduct Energy Points
- Customer delivery information stays off-chain
- Digital Gear preview has no MiniPay payment or signing flow

## Proof of Ship Links

### MiniPay Submission

Move+ Marketplace has been submitted for MiniPay Explore review.

Marketplace URL:  
https://amayatoken.online/moveplus/marketplace/?v=20260708-submit-1

### Celo Mainnet Contract

MovePlusMarketplacePayments  
0x5A49DA3337bBd589065cbd5d89090BDb06b51A18

Explorer:  
https://celoscan.io/address/0x5A49DA3337bBd589065cbd5d89090BDb06b51A18

### cUSD Token

cUSD on Celo Mainnet  
0x765DE816845861e75A25fCA122bb6898B8B1282a

### Network Manifest

See:  
NETWORK_MANIFEST.md

## Sample Transactions

### Contract Setup

cUSD was enabled on the MovePlusMarketplacePayments contract using:

`setAllowedToken(cUSD, true)`

Transaction:  
Pending link / add tx hash here

### Marketplace Payment Receipt

User-facing MiniPay/cUSD checkout receipt method:

`recordDirectPayment(orderIdHash, payer, token, amount, paymentTxHash)`

Sample receipt transaction:  
Pending first live MiniPay/cUSD test.

After the first verified cUSD marketplace payment, this section will be updated with:

- cUSD payment transaction hash
- MovePlusMarketplacePayments receipt transaction hash
- OrderPaid event link
