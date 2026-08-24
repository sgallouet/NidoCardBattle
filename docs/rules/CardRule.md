# CardRule.md

This file owns deck, hand, card-type, faction, and summoning rules.

## Deck
- **CRD1** - Prototype faction deck size is **10 cards**.
- **CRD2** - A deck may contain at most 2 copies of the same card.
- **CRD3** - When the deck is empty, shuffle the discard pile into a new deck.
- **CRD4** - At New Game, the local player chooses the **Human** or **Undead** faction and the AI uses the other faction; each player draws from that faction's prebuilt deck, which may also contain Shared Tactic Cards under `CRD6`.
- **CRD5** - A faction-specific card may only be played by a player of that faction.
- **CRD6** - A **Shared** Tactic Card may be included in either faction's deck and played by either faction.

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
- **CRU2** - A summoned unit must be placed on an eligible spawn destination.
- **CRU3** - Eligible spawn destinations are an empty controlled Home Keep, controlled Fort, or Garrison linked to a controlled Fort, plus any free passable hex adjacent to a friendly unit with the **Invoker** trait. Grave Locked hexes are never eligible spawn destinations.
- **CRU4** - A summoned unit enters **Exhausted**.

## Tactic Cards
- **CRC1** - Tactic effects should resolve immediately unless the card explicitly says otherwise.
- **CRC2** - Avoid effects that require remembering state across many turns.
- **CRC3** - Prefer Tactic effects that change board possibilities in ways normal unit actions cannot.
- **CRC4** - **Grave Lock** is an Undead Tactic costing **3 mana**. Choose one currently passable hex that is not already Grave Locked. Until the start of the caster's next turn, no unit may enter or leave that hex through movement, summoning, or displacement. Attacks and ranged effects are not blocked by Grave Lock.
- **CRC5** - **Build Bridge** is a Shared Tactic costing **2 mana**. Choose one empty Water hex; it permanently becomes a Bridge and follows `MPT6`.
- **CRC6** - **Scorch** is a Human Tactic costing **1 mana**. Choose one Forest hex; it permanently becomes Plain and thereafter follows `MPT1` instead of the Forest rules.
- **CRC7** - **Raise Fort** is a Human Tactic costing **4 mana**. Choose one empty Plain or Hill hex with no existing or pending site; create a Human-controlled Fort there. That Fort follows `CRU3` and is captured normally under `MPC1`-`MPC3`.
- **CRC8** - **Profane Well** is an Undead Tactic costing **2 mana**. Sacrifice one friendly non-Commander unit standing on a Plain, Forest, or Hill hex with no existing or pending site. After the end of that player's next 3 turns, create an Undead-controlled Mana Well on that hex; its income then follows `ECM3`.
