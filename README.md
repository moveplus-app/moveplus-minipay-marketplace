# Move+ MiniPay Marketplace
   - MiniPay submission
   - marketplace URL
   - Celo contract address
   - cUSD token address

Move+ is a gamified fitness app where users walk, run, and cycle to earn Energy rewards.

This repository contains the public proof-of-ship implementation for the Move+ real-item marketplace, MiniPay/Celo checkout integration, and Celo mainnet payment proof contract.

## Concept

Move+ connects real-world fitness activity to real-world commerce.

Users earn off-chain Energy through movement, redeem Energy for marketplace rewards, and complete checkout through either Energy Points or MiniPay stablecoin payments on Celo.

## Current Marketplace Flow

1. User browses real fitness products and Move+ merch
2. Product price is displayed in Energy Points
3. User fills delivery details
4. User chooses a payment method
5. User can pay with Energy Points
6. User can choose MiniPay/Celo checkout for stablecoin payment
7. Backend verifies the Celo transaction
8. Order is marked paid and pending fulfillment

## MiniPay Checkout Flow

Move+ Marketplace
→ Choose Payment Method
→ Pay with MiniPay
→ Open Move+ MiniPay Marketplace Mini App
→ MiniPay wallet signs Celo stablecoin payment
→ Backend verifies transaction
→ Success receipt


If the checkout page is opened outside MiniPay, the app shows:


MiniPay wallet not detected. Open this checkout inside MiniPay to continue.


## Celo Mainnet Contract

**MovePlusMarketplacePayments**


Network: Celo Mainnet
Contract: 0x5A49DA3337bBd589065cbd5d89090BDb06b51A18


Purpose:

* On-chain payment proof for Move+ MiniPay marketplace checkout
* Records verified marketplace payment receipts
* Emits `OrderPaid`
* Keeps products, delivery, Energy, and fulfillment off-chain

## Scope

* Real-item marketplace
* Philippines delivery only
* Energy Points payment
* MiniPay/Celo stablecoin checkout
* Off-chain product catalog and delivery details
* Backend transaction verification
* On-chain payment proof contract

## What Stays Off-Chain

* Product catalog
* Delivery details
* User Energy balance
* Order fulfillment
* Admin marketplace management

## What Goes On-Chain

* Stablecoin payment transaction
* Payment receipt proof
* `OrderPaid` event from the Celo mainnet contract

## Not Included

* No bank payment
* No GCash/Maya payment
* No international delivery yet
* No mixed Energy + MiniPay payment yet
* No private production keys
* No seed phrases or deployer keys

## Payment Methods

Current:

* Energy Points
* MiniPay on Celo

Future:

* Energy voucher + MiniPay
* Ronin payment adapter
* Base payment adapter

## Delivery

The marketplace is currently designed for **Philippines delivery only**.

International delivery may be added later after logistics and payment rules are reviewed.

## Security Notes

* No private keys are stored in this repository
* No Supabase service role key is exposed to frontend code
* MiniPay checkout uses backend transaction verification
* Energy Points are separate from crypto checkout
* MiniPay payment does not deduct Energy Points

