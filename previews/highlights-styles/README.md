# Highlight Styles (look-only preview)

A clickable preview of highlight styles for PhilFreela freelancer profiles. It is **not part of the website**: nothing in `client/` loads it, and nothing is saved anywhere.

Open `index.html` through a local web server, or use the published preview link. Retro's pixel pictures don't work when the file is opened straight from the disk. Pick one of the four sample freelancers and a style, then press **Play with sound**.

## What it shows

- **Six styles.** The Director's Cut is for every freelancer. The five others come with **Premium**:
  - **Papercut:** cut paper in stop motion.
  - **Retro:** an 8-bit game.
  - **Cartoony:** thick outlines and bouncy movement.
  - **Kinetic type:** big words on the beat.
  - **Comic book:** panels, halftone dots and POW!
- **Without Premium:** the sample freelancer Bea has no Premium, so her highlight plays in the Director's Cut. The Premium styles show as locked, but **Hear it** still plays their music.
- **Each style is complete.** It has its own look, card draw, changes between parts, sound effects and music.
- **Everything grows with the level.** Beginner is the calmest and Advanced the biggest: the opening, the effects and the music.
- **The Premium bundle.** It lists Premium's perks as the site's Premium page shows them to freelancers, with "Highlight styles" added. This is the preview only: on the site the line is added when the styles are built in.
- **One color.** Every style uses PhilFreela orange. There is no color choice.

| Style | Music (made live in the page, no sound files) |
|---|---|
| Director's Cut | Lo-fi up to festival beats |
| Papercut | Handmade folk: ukulele, glockenspiel, hand claps, a whistled tune |
| Retro | Chiptune: square waves, a triangle bass, noise drums |
| Cartoony | A cartoon band: tuba, banjo chords, xylophone, clarinet, slide whistle |
| Kinetic type | An electro beat: kick, claps, a bouncing bass, short vocal chops |
| Comic book | A superhero theme: strings, brass, timpani, snare |

## Files

- `index.html`: the Director's Cut film (from `../highlights-directors-cut/`), plus the hooks the styles use, the launch page and the style cards.
- `styles.js` and `styles.css`: the style kit (the music sequencer and the drawing helpers) and the launch page's style cards and Premium bundle.
- `st-paper`, `st-retro`, `st-toon`, `st-kinetic`, `st-comic` (`.js` + `.css`): one style each.
- `img/` and `vid/`: the same sample pictures and clips as the Director's Cut.

Sample data only: the four freelancers are made up, the profile pictures are drawn, the photos are stock samples, and the short video clips were made from those photos.
