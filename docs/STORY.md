# Namma Bengaluru: Story

> **Disclaimer.** The story is fiction. It borrows the *shape* of the rise-and-exile arc
> that Bengaluru's underworld lore is full of, but every character, gang, business and
> event here is invented. Any resemblance to real people is coincidental.

Working title: **"Majestic"**. It's set in the present day, across the whole map.

## Premise

**Raghu** (Raghavendra) is 24 and comes from a small town near Puttur on the coast. He
arrived in Bengaluru with a degree nobody wanted and a borrowed scooter. He rides food
deliveries out of Gandhinagar and sleeps in a lodge room behind the Majestic bus stand.

He's quick on a bike, calm in a fight and good with people, and that combination gets
noticed. The game follows him across four acts:

1. **Rise.** He goes from running errands for a market rowdy to owning Majestic.
2. **Empire.** He moves into land, contracts and politics, and the city starts to fear him.
3. **Exile.** He runs everything from Dubai while the police hunt his people.
4. **Return.** He comes home a "reformed man" with a charitable trust and a smile, and the
   past comes for him anyway.

Throughout, the player chooses how ruthless Raghu becomes. The city reacts: shopkeepers,
the police and the newspapers all remember.

## Cast (all fictional)

| Character | Who they are |
|---|---|
| **Raghu** | The protagonist. Delivery rider turned underworld boss. Speaks Kannada, Tulu and enough Hindi and English to get by. |
| **Kotte Kumar** | An old-school rowdy-sheeter who runs collections in Chickpete and Avenue Road from a room above a lodge. Raghu's first boss and his first betrayal. |
| **Chikka** | A mechanic in Gandhinagar and Raghu's oldest friend in the city. Loyal, nervous, and the one who keeps a revolver wrapped in a towel. |
| **Seenu "Sickle" Srinivas** | Runs the K.R. Market loading bays. He's Kumar's rival, and later Raghu's. |
| **Lakshmi Akka** | Owns a chain of darshinis. She lends money, knows everyone and becomes Raghu's conscience and banker. |
| **Hanumanthappa ("Hanu Anna")** | A corporator who becomes an MLA. He needs muscle for land deals in Act 2 and needs Raghu gone in Act 3. |
| **ACP Shalini Rao** | A crime-branch officer who builds a case against Raghu over the whole game. |
| **Faizal Bhai** | A fixer in Dubai who shelters Raghu in Act 3, and owns him for it. |
| **Vinay** | A young delivery rider who idolises Raghu. He's the player character in parts of Act 3. |

## Act I: Majestic (playable now)

Raghu is a rider for a food app. One "parcel" delivery for Kumar's man Babu pulls him
into Chickpete's protection racket. He collects hafta, defends Kumar's turf at K.R.
Market against Seenu, and drives a lorry of "goods" out of the Yeshwanthpur APMC yard
past the Hoysalas. Kumar decides the new boy is getting too popular and sets up an
ambush at a half-built site off Magadi Road. Raghu walks out of it, and Majestic is his.

| # | Mission | Where | What happens |
|---|---|---|---|
| 1 | **Fast Delivery** | Gandhinagar to Chickpete | Pick up a parcel and get it to Kumar's lodge before the timer runs out. Meet Kotte Kumar. |
| 2 | **Collection Day** | Chickpete and Avenue Road | Collect hafta from four shops. At the last one the owner's nephew and his friends object, and you settle it with fists or a lathi. |
| 3 | **Market Turf** | K.R. Market | Seenu's boys are taking over the loading bays. Take them out (Kumar lends you a machete), then lose the police. |
| 4 | **The Lorry** | Yeshwanthpur APMC to Peenya | Take a lorry of "goods" from the yard to a Peenya godown. The Hoysalas are waiting. Don't wreck it. |
| 5 | **Majestic Is Mine** | Magadi Road, at night | Kumar calls a meeting, and it's a trap. Chikka brings the revolver. Survive the ambush and finish Kumar. |

When Act I ends, Raghu owns the Majestic collections. Money comes in passively, and
rival crews start turning up in the markets.

## Act II: Empire (planned)

- **Land.** Help Hanu Anna clear "encroachments" on the city's edge: Kengeri, Peenya,
  the lake beds. You choose between persuading people, paying them off or burning them out,
  and the choices change how neighbourhoods treat you.
- **War with Seenu.** A street war across K.R. Market, Mysore Road and the Nayandahalli
  junction, fought with chases, ambushes and a raid on his godowns.
- **Lakshmi Akka's ledger.** Laundering through darshinis, a cinema and a fleet of taxis.
  This is the first business-management layer.
- **ACP Shalini Rao** appears. Her missions pressure Raghu: tails, raids and informers in
  his crew.
- **The act ends** with Hanu Anna, now an MLA, cutting Raghu loose. With a warrant out,
  Raghu leaves the country from the airport road before dawn.

## Act III: Exile (planned)

- In Dubai (cutscenes, phone calls and a small playable area), Faizal Bhai shelters Raghu.
- Back home, the player controls **Vinay**, carrying out Raghu's orders by phone.
  The missions are extortion calls, protecting the business, and a Majestic that is
  slipping away.
- Seenu and Hanu Anna move on Raghu's people, and Shalini Rao closes in on Vinay.
- **The act ends** with Raghu negotiating his return: a deal, a surrender and a trial that
  goes nowhere.

## Act IV: Return (planned)

- Raghu comes back as a **reformed man**. He starts a trust, hands out school bags in
  Gandhinagar and talks about a political career. The city is half charmed and half afraid.
- Old debts come due: Seenu, Hanu Anna, Faizal Bhai's people, and Vinay, who has
  learned too well.
- **Ending choices.** The ending depends on choices made across all four acts: real
  reform, a quiet retirement, or a final war. Shalini Rao is the last person Raghu speaks
  to in every ending.

## Systems the story uses

- **Story missions** (`src/systems/story.js`). Missions are scripts of steps: go to a
  place, talk, fight a crew, lose the police, collect, steal and deliver a vehicle, or
  survive. Each has a giver marker on the map and a reward.
- **Saving.** Finished missions and money are saved to `localStorage` and restored when
  you load the game.
- **Gangs** (`src/entities/gangs.js`). Missions spawn named crews with weapons, and crews
  alert together.
- **Gigs** (delivery and auto fares) keep running between missions and pause during one.
