# Cosmetic Marketplace

LevelUpX supports a lightweight user-to-user cosmetic marketplace.

## Behavior

- Users can list owned cosmetics for a coin price.
- Active listings are visible from the profile page marketplace panel.
- Buyers purchase listings with coins.
- The cosmetic ownership transfers to the buyer.
- Buyer and seller coin balances are updated in the same transaction.
- Buyer and seller coin ledger entries are recorded.
- If the seller had the sold cosmetic selected, it is unequipped automatically.

## API

- `GET /api/users/marketplace/listings`
- `POST /api/users/marketplace/listings`
- `POST /api/users/marketplace/listings/:listingId/buy`
- `POST /api/users/marketplace/listings/:listingId/cancel`

## Notes

PostgreSQL remains the source of truth. The database migration uses a partial unique index so a user can only have one active listing for the same cosmetic, while still allowing future relisting after cancellation or sale.
