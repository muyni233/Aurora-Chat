// Tailwind v4 already handles vendor prefixing internally via lightningcss.
// Adding autoprefixer on top duplicates work AND — critically — autoprefixer
// removes non-prefixed `backdrop-filter` when it sees `-webkit-backdrop-filter`
// (it thinks the unprefixed version is the duplicate). That breaks the glass
// effect entirely in Chrome/Edge, which require the unprefixed property.
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
