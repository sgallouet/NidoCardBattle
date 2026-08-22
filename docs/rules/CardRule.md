# CardRule.md

This file owns deck, hand, card-type, faction, and summoning rules.

## Deck
- **CRD1** - Prototype faction deck size is **8 cards**.
- **CRD2** - A deck may contain at most 2 copies of the same card.
- **CRD3** - When the deck is empty, shuffle the discard pile into a new deck.
- **CRD4** - The current prototype assigns Player 1 the **Human** faction and Player 2 the **Undead** faction, and each player draws only from that faction's prebuilt deck.
- **CRD5** - Every card belongs to exactly one faction and may only be played by a player of that faction.

## Hand
- **CRH1** - Start the match with 4 cards.
- **CRH2** - Maximum hand size is 6 cards.
- **CRH3** - Cards drawn above the hand limit are discarded.

## Card Types
- **CRT1** - The MVP has only 2 card types: **Unit** and **Tactic**.
- **CRT2** - A Unit Card summons a unit.
- **CRT3** - A Tactic Card resolves one immediate effect, then goes to discard.

## Unit Cards
- **CRU1** - Unit Cards cost mana to play.
- **CRU2** - A summoned unit must be placed on a free hex adjacent to a friendly spawn source.
- **CRU3** - Friendly spawn sources are a controlled Home Keep, a controlled Fort, or a friendly unit with the **Invoker** trait.
- **CRU4** - A summoned unit enters **Exhausted** unless `UNT6` applies.

## Tactic Cards
- **CRC1** - Tactic effects should resolve immediately unless the card explicitly says otherwise.
- **CRC2** - Avoid effects that require remembering state across many turns.
- **CRC3** - Prefer short tactical effects such as damage, healing, repositioning, temporary attack bonuses, or draw/discard.
